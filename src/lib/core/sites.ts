import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, portals, siteDeployments } from "@/lib/db/schema";
import { projectById, type Caller } from "@/lib/core/access";
import { recordAudit } from "@/lib/core/audit";
import { checkLimit, claimStorage, limitsOf } from "@/lib/core/usage";
import { AssetError } from "@/lib/core/errors";
import { appUrlFor, portalNamed } from "@/lib/core/domains";
import { adminsOf, enterPortal, type Pass } from "@/lib/core/portals";
import { sendAs, siteProblemsEmail } from "@/lib/core/mail";
import { env } from "@/lib/env";
import { signAsset, signedUntil } from "@/lib/signed";
import { can } from "@/lib/permissions";
import { assetAddresses, BUILD_KINDS, candidates, contentTypeOf, MANIFEST, MAX_SITE_BYTES, MAX_SITE_FILES, mountPath, readsLinks, siteFiles, type BuildKind, type SiteUse } from "@/lib/sites";
import { rightsReasons, today, type Rights } from "@/lib/rights";
import { putObject, sizeOf } from "@/lib/storage";
import { unzip } from "@/lib/zip";

/**
 * Sites' deployments (PRD part 2): a zip of static files, unpacked into
 * storage under its own prefix, checked, then live at its mount path, the one
 * live before it kept as `replaced` to restore. A brand portal's root stays
 * Artbucket's; builds mount beside it at a path (/docs, /storybook). The
 * files are served on the site's own address only (src/proxy.ts), never under
 * /p/ on the app's host, where customer JavaScript would run beside a
 * signed-in session.
 */

type Deployment = typeof siteDeployments.$inferSelect;

/** Replaced deployments kept per path, to restore: their files count as storage until a newer one pushes them out. */
export const KEEP_REPLACED = 3;

const present = (d: Deployment) => ({
  id: d.id,
  path: d.path,
  kind: d.kind,
  state: d.state,
  files: d.files,
  bytes: d.bytes,
  commit: d.commit,
  ref: d.ref,
  error: d.error,
  manifest: d.manifest,
  uses: d.uses ?? [],
  problems: d.problems,
  checkedAt: d.checkedAt,
  createdBy: d.createdBy,
  createdAt: d.createdAt,
});

function mayDeploy(caller: Caller) {
  if (!can(caller, "portal.manage")) throw new AssetError("forbidden", "Deploying a site takes write on the project");
}

async function siteOf(caller: Caller, id: string) {
  const [s] = await db.select().from(portals).where(and(eq(portals.id, id), eq(portals.projectId, caller.project.id)));
  return s ?? null;
}

/** The site's deployments, newest first. Null: no such site here. */
export async function listDeployments(caller: Caller, siteId: string) {
  mayDeploy(caller);
  if (!(await siteOf(caller, siteId))) return null;
  const rows = await db.select().from(siteDeployments).where(eq(siteDeployments.siteId, siteId)).orderBy(desc(siteDeployments.createdAt)).limit(50);
  return rows.map(present);
}

type Manifest = { release?: number; assets?: string[]; rules?: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What a build's files point at in the library, gathered as they are read:
 * the hash of every file, the `/a/` and `/c/` addresses in its text, and
 * what its manifest names. Nothing is trusted to declare itself: a zip
 * downloaded from Lovable carries no manifest, and a logo copied into it is
 * still that logo.
 */
export function buildScan() {
  const hashes = new Map<string, string[]>();
  const pinned = new Map<string, string[]>();
  const current = new Map<string, string[]>();
  const declared: string[] = [];
  const note = (m: Map<string, string[]>, key: string, file: string) => m.set(key, [...(m.get(key) ?? []), file]);
  return {
    hashes,
    pinned,
    current,
    declared,
    /** A file of the build, by the name it is served at. */
    add(name: string, data: Uint8Array) {
      note(hashes, createHash("sha256").update(data).digest("hex"), name);
      if (!readsLinks(name, data.length)) return;
      const found = assetAddresses(new TextDecoder().decode(data));
      for (const id of found.pinned) note(pinned, id, name);
      for (const id of found.current) note(current, id, name);
    },
    /** What artbucket.site.json names. */
    declare(m: Manifest) {
      for (const id of Array.isArray(m.assets) ? m.assets : []) if (typeof id === "string" && UUID.test(id)) declared.push(id.toLowerCase());
    },
  };
}
export type BuildScan = ReturnType<typeof buildScan>;

const useColumns = {
  id: assets.id,
  name: assets.filename,
  sha256: assets.sha256,
  status: assets.status,
  supersededBy: assets.supersededBy,
  rights: assets.rights,
  deletedAt: assets.deletedAt,
};
type UseRow = { id: string; name: string; sha256: string; status: string; supersededBy: string | null; rights: Rights | null; deletedAt: Date | null };

/** The version a stack serves now, from any version of it: `/c/`'s answer. */
async function currentOf(row: UseRow) {
  let at = row;
  const seen = new Set([at.id]);
  while (at.supersededBy && !seen.has(at.supersededBy)) {
    const [next] = await db.select(useColumns).from(assets).where(eq(assets.id, at.supersededBy));
    if (!next) break;
    seen.add(next.id);
    at = next as UseRow;
  }
  return at;
}

/** Why a version may not be shown, as the use check would say it with no channel or territory; null when it may. */
function barred(a: UseRow, date: string) {
  if (a.deletedAt) return "was deleted";
  if (a.status === "archived") return "is archived";
  if (a.status !== "active") return "isn't approved";
  const r = rightsReasons(a.rights, { date }).find((x) => x.blocking);
  return r ? `can't be used: ${r.message}` : null;
}

/**
 * What a scanned build uses of this project's library, each found by its
 * bytes, its addresses or its manifest; and the ids its manifest names that
 * are no asset here. An address of another project's asset, or another
 * server's, is left alone: it may well be public.
 */
async function resolveUses(projectId: string, scan: BuildScan) {
  const ids = [...new Set([...scan.pinned.keys(), ...scan.current.keys(), ...scan.declared])];
  const shas = [...scan.hashes.keys()];
  const rows = (
    ids.length || shas.length
      ? await db
          .select(useColumns)
          .from(assets)
          .where(and(eq(assets.projectId, projectId), or(ids.length ? inArray(assets.id, ids) : sql`false`, shas.length ? inArray(assets.sha256, shas) : sql`false`)))
      : []
  ) as UseRow[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const uses: SiteUse[] = [];
  for (const r of rows) for (const file of scan.hashes.get(r.sha256) ?? []) uses.push({ asset: r.id, how: "copy", file });
  for (const [id, files] of scan.pinned) if (byId.has(id)) for (const file of files) uses.push({ asset: id, how: "link", file });
  for (const [id, files] of scan.current) {
    const r = byId.get(id);
    if (r) for (const file of files) uses.push({ asset: (await currentOf(r)).id, how: "current", file });
  }
  for (const id of new Set(scan.declared)) if (byId.has(id)) uses.push({ asset: id, how: "declared", file: null });
  const unknown = [...new Set(scan.declared)].filter((id) => !byId.has(id)).map((id) => `${id} is not an asset of this project`);
  return { uses, unknown };
}

const WHERE: Record<SiteUse["how"], (files: string) => string> = {
  copy: (f) => `${f} is a copy of it`,
  link: (f) => `${f} links it`,
  current: (f) => `${f} shows it through /c/`,
  declared: () => "artbucket.site.json names it",
};
const listed = (files: string[]) => (files.length > 3 ? `${files.slice(0, 3).join(", ")} and ${files.length - 3} more` : files.join(", "));

/**
 * Why what a build uses may not be shown on `date`, one line per asset and
 * way it is used, saying where: a copy or a pinned link of a replaced
 * version names its replacement; `/c/` is weighed on the version it serves
 * now. Empty: everything may be shown. Deploying and the daily re-check ask
 * the same question.
 */
export async function problemsWith(uses: SiteUse[], date = today()) {
  if (!uses.length) return [];
  const ids = [...new Set(uses.map((u) => u.asset))];
  const rows = new Map(((await db.select(useColumns).from(assets).where(inArray(assets.id, ids))) as UseRow[]).map((r) => [r.id, r]));
  const groups = new Map<string, { use: SiteUse; files: string[] }>();
  for (const u of uses) {
    const key = `${u.asset} ${u.how}`;
    const g = groups.get(key) ?? groups.set(key, { use: u, files: [] }).get(key)!;
    if (u.file) g.files.push(u.file);
  }
  const out: string[] = [];
  for (const { use, files } of groups.values()) {
    const a = rows.get(use.asset);
    const where = WHERE[use.how](listed(files));
    if (!a) {
      out.push(`An asset it used is gone from the library: ${where}`);
      continue;
    }
    if (use.how === "current") {
      const now = await currentOf(a);
      const no = barred(now, date);
      if (no) out.push(`${now.name} ${no}: ${where}`);
      continue;
    }
    if (a.supersededBy && !a.deletedAt) {
      const now = await currentOf(a);
      out.push(`${a.name} was replaced by ${now.name} (use ${now.id}): ${where}`);
      continue;
    }
    const no = barred(a, date);
    if (no) out.push(`${a.name} ${no}: ${where}`);
  }
  return out;
}

/**
 * Deploy a zip to a site at a mount path: refused outright when it can't
 * serve (no index.html, a name outside the site, too big); otherwise
 * recorded, and failed with the reason when its manifest names an asset that
 * may not be used. Live once every file is stored.
 */
export async function deploy(caller: Caller, siteId: string, zip: Uint8Array, o: { path?: string | null; kind?: string | null; commit?: string | null; ref?: string | null } = {}) {
  mayDeploy(caller);
  const site = await siteOf(caller, siteId);
  if (!site) return null;
  const path = mountPath(o.path ?? "/");
  if (!path) throw new AssetError("invalid", "path: / or lowercase segments, such as /docs");
  if (site.kind === "portal" && path === "/") throw new AssetError("invalid", "A brand portal's root is drawn by Artbucket: mount a build at a path, such as /docs");
  const kind = (o.kind ?? (site.kind === "portal" ? null : site.kind)) as BuildKind | null;
  if (!kind || !BUILD_KINDS.includes(kind)) throw new AssetError("invalid", `kind: one of ${BUILD_KINDS.join(", ")}`);
  if (zip.length > MAX_SITE_BYTES) throw new AssetError("too_large", `A deployment is ${MAX_SITE_BYTES / 1024 / 1024} MB at most`);
  let entries;
  try {
    entries = unzip(zip);
  } catch {
    throw new AssetError("invalid", "That isn't a zip");
  }
  if (!entries.length) throw new AssetError("invalid", "That isn't a zip, or it holds nothing");
  const files = siteFiles(entries.map((e) => e.name));
  if (!files) throw new AssetError("invalid", "A file in the zip names a path outside the site");
  if (files.size > MAX_SITE_FILES) throw new AssetError("invalid", `A deployment holds ${MAX_SITE_FILES} files at most`);
  if (!files.has("index.html")) throw new AssetError("invalid", "No index.html at the zip's root (or in the one folder it wraps)");
  const byName = new Map(entries.map((e) => [e.name, e]));
  // Its files count as storage, as an upload's do: the zip's size first, the files' own as it goes live.
  const organizationId = caller.project.organizationId;
  await checkLimit(organizationId, "storage", { adding: zip.length });
  const limits = await limitsOf(organizationId);

  const id = randomUUID();
  const prefix = `sites/${site.id}/${id}/`;
  await db.insert(siteDeployments).values({ id, siteId: site.id, path, kind, prefix, commit: o.commit ?? null, ref: o.ref ?? null, createdBy: caller.actor });
  try {
    let bytes = 0;
    let manifest: Manifest | null = null;
    const scan = buildScan();
    const list = [...files];
    // ponytail: 16 uploads at a time, the zip held in memory; a streaming unpack when deployments grow past MAX_SITE_BYTES.
    for (let i = 0; i < list.length; i += 16) {
      await Promise.all(
        list.slice(i, i + 16).map(async ([served, name]) => {
          const data = await byName.get(name)!.read();
          bytes += data.length;
          if (bytes > MAX_SITE_BYTES) throw new AssetError("too_large", `A deployment is ${MAX_SITE_BYTES / 1024 / 1024} MB unpacked at most`);
          if (served === MANIFEST) manifest = JSON.parse(new TextDecoder().decode(data)) as Manifest;
          else scan.add(served, data);
          await putObject(prefix + served, Buffer.from(data), contentTypeOf(served));
        }),
      );
    }
    if (manifest) scan.declare(manifest);
    const { uses, unknown } = await resolveUses(site.projectId, scan);
    const problems = [...unknown, ...(await problemsWith(uses))];
    if (problems.length) throw new AssetError("invalid", `It uses what may not be used: ${problems.join("; ")}`);
    const [live] = await db.transaction(async (tx) => {
      await claimStorage(tx, organizationId, bytes, limits);
      await tx
        .update(siteDeployments)
        .set({ state: "replaced" })
        .where(and(eq(siteDeployments.siteId, site.id), eq(siteDeployments.path, path), eq(siteDeployments.state, "live")));
      // A few replaced kept to restore; older ones go, and the sweep (lib/core/sweep.ts) takes their files.
      const old = await tx
        .select({ id: siteDeployments.id })
        .from(siteDeployments)
        .where(and(eq(siteDeployments.siteId, site.id), eq(siteDeployments.path, path), eq(siteDeployments.state, "replaced")))
        .orderBy(desc(siteDeployments.createdAt))
        .offset(KEEP_REPLACED);
      if (old.length) await tx.delete(siteDeployments).where(inArray(siteDeployments.id, old.map((o) => o.id)));
      return tx.update(siteDeployments).set({ state: "live", files: files.size, bytes, manifest, uses, problems: [], checkedAt: new Date() }).where(eq(siteDeployments.id, id)).returning();
    });
    await recordAudit(caller, "site.deployed", site.slug, { path, kind, files: files.size }, { projectId: site.projectId });
    return present(live);
  } catch (err) {
    const why = err instanceof Error ? err.message : "It could not be stored";
    await db.update(siteDeployments).set({ state: "failed", error: why }).where(eq(siteDeployments.id, id));
    throw err instanceof AssetError ? err : new AssetError("invalid", why);
  }
}

/**
 * Put a deployment kept as replaced back live at its path, the one live there
 * now replaced in turn: undoing a bad deploy without building again. Null: no
 * such site or deployment here, or one that never went live (failed).
 */
export async function restoreDeployment(caller: Caller, siteId: string, deploymentId: string) {
  mayDeploy(caller);
  const site = await siteOf(caller, siteId);
  if (!site) return null;
  const [d] = await db
    .select()
    .from(siteDeployments)
    .where(and(eq(siteDeployments.id, deploymentId), eq(siteDeployments.siteId, site.id), inArray(siteDeployments.state, ["live", "replaced"])));
  if (!d) return null;
  if (d.state === "live") return present(d);
  const [live] = await db.transaction(async (tx) => {
    await tx
      .update(siteDeployments)
      .set({ state: "replaced" })
      .where(and(eq(siteDeployments.siteId, site.id), eq(siteDeployments.path, d.path), eq(siteDeployments.state, "live")));
    return tx.update(siteDeployments).set({ state: "live" }).where(eq(siteDeployments.id, d.id)).returning();
  });
  await recordAudit(caller, "site.deployed", site.slug, { path: d.path, kind: d.kind, files: d.files, restored: d.id }, { projectId: site.projectId });
  return present(live);
}

/**
 * A password site's builds are pages a browser asks for, with no header to
 * carry the password the portal's own pages send: the door (app/sitefiles)
 * sets a cookie (lib/sites.ts unlockCookie), on the site's own host, for a
 * week. It names the password's hash, so a new password shuts every door
 * opened with the old.
 */
export const UNLOCK_DAYS = 7;
const unlockId = (p: { id: string; passwordHash: string | null }) => `site:${p.id}:${(p.passwordHash ?? "").slice(-16)}`;

/** The cookie for a site whose password was just given. */
export async function unlockValue(slug: string) {
  const p = (await portalNamed(slug))?.p;
  return p ? signAsset(env.BETTER_AUTH_SECRET, unlockId(p), new Date(Date.now() + UNLOCK_DAYS * 864e5)) : null;
}

/** Whether a cookie opens this password site. */
async function unlocked(slug: string, value: string | null | undefined) {
  if (!value) return false;
  const p = (await portalNamed(slug))?.p;
  return !!p && p.access === "password" && !!signedUntil(env.BETTER_AUTH_SECRET, unlockId(p), value);
}

/** Live deployments checked again per run of the sweep (every six hours), the longest unchecked first. */
const RECHECK_PER_RUN = 200;
const RECHECK_EVERY_MS = 20 * 60 * 60 * 1000;

/**
 * Live builds checked again for what they show, as a deployment is
 * (problemsWith): a license that ended since, a logo replaced since, an
 * asset unapproved or archived since. Each is checked about once a day.
 * Problems are kept on the deployment, shown in the app and the API, and
 * mailed to the site's admins when there is something new to say. The build
 * stays live: taking a page down is a person's call. How many were checked
 * and how many have problems.
 */
export async function recheckSites(date = today()) {
  const due = await db
    .select({ d: siteDeployments, site: { id: portals.id, name: portals.name, slug: portals.slug, projectId: portals.projectId } })
    .from(siteDeployments)
    .innerJoin(portals, eq(portals.id, siteDeployments.siteId))
    .where(and(eq(siteDeployments.state, "live"), or(isNull(siteDeployments.checkedAt), lt(siteDeployments.checkedAt, new Date(Date.now() - RECHECK_EVERY_MS)))))
    .orderBy(sql`${siteDeployments.checkedAt} asc nulls first`)
    .limit(RECHECK_PER_RUN);
  let troubled = 0;
  for (const { d, site } of due) {
    // Deployments from before uses were kept: what their manifest named.
    const uses = d.uses ?? (Array.isArray(d.manifest?.assets) ? (d.manifest.assets as unknown[]) : []).filter((id): id is string => typeof id === "string" && UUID.test(id)).map((asset) => ({ asset, how: "declared" as const, file: null }));
    const problems = await problemsWith(uses, date);
    await db.update(siteDeployments).set({ problems, checkedAt: new Date() }).where(eq(siteDeployments.id, d.id));
    if (!problems.length) continue;
    troubled++;
    const fresh = problems.filter((p) => !d.problems.includes(p));
    if (!fresh.length) continue;
    await recordAudit({ actor: "server" }, "site.problems", site.slug, { path: d.path, problems }, { projectId: site.projectId });
    const ws = await projectById(site.projectId);
    const url = `${await appUrlFor(ws?.organizationId ?? null)}/sites?open=${site.id}`;
    for (const to of await adminsOf(site)) await sendAs(ws?.organizationId ?? null, siteProblemsEmail(to, { site: site.name, path: d.path, problems, url }), { capped: false });
  }
  return { checked: due.length, troubled };
}

/** The live mount paths of a site, longest first: where its builds answer. For src/proxy.ts. */
export async function liveMounts(siteId: string) {
  const rows = await db.select({ path: siteDeployments.path }).from(siteDeployments).where(and(eq(siteDeployments.siteId, siteId), eq(siteDeployments.state, "live")));
  return rows.map((r) => r.path).sort((a, b) => b.length - a.length);
}

export const underMount = (rest: string, mount: string) => mount === "/" || rest === mount || rest.startsWith(`${mount}/`);

/**
 * The stored file a request to a site asks for, as this visitor may see it
 * (the portal's own gate: a password or members site refuses here), or null
 * when no live build holds the path. A miss answers the build's 404.html.
 */
export async function siteFile(slug: string, pass: Pass, rest: string, unlock?: string | null) {
  const { p } = await enterPortal(slug, pass).catch(async (err) => {
    // Its door's cookie stands for the password. Still the portal's own checks first: closed, suspended, gone.
    if (err instanceof AssetError && err.code === "password" && (await unlocked(slug, unlock))) return { p: (await portalNamed(slug))!.p };
    throw err;
  });
  const live = await db
    .select({ path: siteDeployments.path, prefix: siteDeployments.prefix })
    .from(siteDeployments)
    .where(and(eq(siteDeployments.siteId, p.id), eq(siteDeployments.state, "live")));
  const mount = live.sort((a, b) => b.path.length - a.path.length).find((m) => underMount(rest, m.path));
  if (!mount) return null;
  const inner = mount.path === "/" ? rest || "/" : rest.slice(mount.path.length);
  // A folder asked without its slash gets one, as static hosts do: its page's relative links resolve under it.
  if (!inner) return { slash: true as const };
  for (const name of candidates(inner)) {
    const key = mount.prefix + name;
    if ((await sizeOf(key)) === null) continue;
    if (name.endsWith("index.html") && !inner.endsWith("/")) return { slash: true as const };
    return { key, contentType: contentTypeOf(name), status: name === "404.html" && !inner.endsWith("404.html") ? 404 : 200, open: p.access === "public" };
  }
  return null;
}
