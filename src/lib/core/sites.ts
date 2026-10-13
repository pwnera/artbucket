import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, brands, portals, siteDeployments } from "@/lib/db/schema";
import { projectById, type Caller } from "@/lib/core/access";
import { visible } from "@/lib/core/assets";
import { recordAudit } from "@/lib/core/audit";
import { checkLimit, claimStorage, limitsOf } from "@/lib/core/usage";
import { AssetError } from "@/lib/core/errors";
import { appUrlFor, portalNamed } from "@/lib/core/domains";
import { adminsOf, enterPortal, type Pass } from "@/lib/core/portals";
import { sendAs, siteHeldEmail, siteProblemsEmail } from "@/lib/core/mail";
import { env } from "@/lib/env";
import { signAsset, signedUntil } from "@/lib/signed";
import { can } from "@/lib/permissions";
import { assetAddresses, BUILD_KINDS, candidates, contentTypeOf, MANIFEST, MAX_SITE_BYTES, MAX_SITE_FILES, mountPath, readsLinks, siteFiles, type BuildKind, type SiteUse } from "@/lib/sites";
import { rightsReasons, today, type Rights } from "@/lib/rights";
import { signLines, signsIn, type Sign } from "@/lib/site-safety";
import { headersFor, HEADERS, parseHeaders, parseRedirects, redirectFor, REDIRECTS, type SiteRules } from "@/lib/site-rules";
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
  flags: d.flags,
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
 * what its manifest names; and the signs it is phishing or malware
 * (lib/site-safety.ts), which its project's own brands don't count toward. Nothing is trusted to declare itself: a zip
 * downloaded from Lovable carries no manifest, and a logo copied into it is
 * still that logo.
 */
export function buildScan(ownBrands: string[] = []) {
  const signs: Sign[] = [];
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
    signs,
    /** A file of the build, by the name it is served at. */
    add(name: string, data: Uint8Array) {
      note(hashes, createHash("sha256").update(data).digest("hex"), name);
      let decoded: string | null = null;
      const content = () => (decoded ??= new TextDecoder().decode(data));
      signs.push(...signsIn(name, content, ownBrands));
      if (!readsLinks(name, data.length)) return;
      const found = assetAddresses(content());
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
 * server's, is left alone: it may well be public. `only` narrows the assets
 * matched to what a caller may see (checkBuild), so a check never names one
 * they may not.
 */
async function resolveUses(projectId: string, scan: BuildScan, only?: SQL) {
  const ids = [...new Set([...scan.pinned.keys(), ...scan.current.keys(), ...scan.declared])];
  const shas = [...scan.hashes.keys()];
  const rows = (
    ids.length || shas.length
      ? await db
          .select(useColumns)
          .from(assets)
          .where(and(eq(assets.projectId, projectId), only, or(ids.length ? inArray(assets.id, ids) : sql`false`, shas.length ? inArray(assets.sha256, shas) : sql`false`)))
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
    // A copy of a file someone has since put in the library as a draft or a proposal, or deleted, is
    // still the site's own: only a library that says "not this one" (replaced, refused, archived, out of
    // license) refuses it. A link or a name is the library's word, so any of it counts.
    if (use.how === "copy" && (a.deletedAt || a.status === "draft" || a.status === "proposed")) continue;
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

/** A build's _redirects and _headers, read as it deploys: its rules, or why they can't be (each error at its line). */
function rulesOf(texts: Map<string, string>): { rules: SiteRules | null; errors: string[] } {
  const r = texts.has(REDIRECTS) ? parseRedirects(texts.get(REDIRECTS)!) : { redirects: [], errors: [] };
  const h = texts.has(HEADERS) ? parseHeaders(texts.get(HEADERS)!) : { headers: [], errors: [] };
  const errors = [...r.errors, ...h.errors];
  return { rules: r.redirects.length || h.headers.length ? { redirects: r.redirects, headers: h.headers } : null, errors };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A deployment made the live one at its path: the one live there kept as replaced, the oldest replaced past KEEP_REPLACED gone. */
async function makeLive(tx: Tx, siteId: string, path: string, id: string, set: Partial<typeof siteDeployments.$inferInsert> = {}) {
  await tx
    .update(siteDeployments)
    .set({ state: "replaced" })
    .where(and(eq(siteDeployments.siteId, siteId), eq(siteDeployments.path, path), eq(siteDeployments.state, "live")));
  // A few replaced kept to restore; older ones go, and the sweep (lib/core/sweep.ts) takes their files.
  const old = await tx
    .select({ id: siteDeployments.id })
    .from(siteDeployments)
    .where(and(eq(siteDeployments.siteId, siteId), eq(siteDeployments.path, path), eq(siteDeployments.state, "replaced")))
    .orderBy(desc(siteDeployments.createdAt))
    .offset(KEEP_REPLACED);
  if (old.length) await tx.delete(siteDeployments).where(inArray(siteDeployments.id, old.map((o) => o.id)));
  return tx.update(siteDeployments).set({ ...set, state: "live" }).where(eq(siteDeployments.id, id)).returning();
}

/** The brands' names in a project, which a build may look like without impersonating anyone. */
const brandNames = async (projectId: string) => (await db.select({ name: brands.name, slug: brands.slug }).from(brands).where(eq(brands.projectId, projectId))).flatMap((b) => [b.name, b.slug]);

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
    const scan = buildScan(await brandNames(site.projectId));
    const ruleTexts = new Map<string, string>();
    const list = [...files];
    // ponytail: 16 uploads at a time, the zip held in memory; a streaming unpack when deployments grow past MAX_SITE_BYTES.
    for (let i = 0; i < list.length; i += 16) {
      await Promise.all(
        list.slice(i, i + 16).map(async ([served, name]) => {
          const data = await byName.get(name)!.read();
          bytes += data.length;
          if (bytes > MAX_SITE_BYTES) throw new AssetError("too_large", `A deployment is ${MAX_SITE_BYTES / 1024 / 1024} MB unpacked at most`);
          if (served === MANIFEST) manifest = JSON.parse(new TextDecoder().decode(data)) as Manifest;
          else if (served === REDIRECTS || served === HEADERS) ruleTexts.set(served, new TextDecoder().decode(data));
          else scan.add(served, data);
          await putObject(prefix + served, Buffer.from(data), contentTypeOf(served));
        }),
      );
    }
    if (manifest) scan.declare(manifest);
    const { rules, errors: ruleErrors } = rulesOf(ruleTexts);
    if (ruleErrors.length) throw new AssetError("invalid", `Its rules can't be read: ${ruleErrors.join("; ")}`);
    const { uses, unknown } = await resolveUses(site.projectId, scan);
    const problems = [...unknown, ...(await problemsWith(uses))];
    if (problems.length) throw new AssetError("invalid", `It uses what may not be used: ${problems.join("; ")}`);
    const flags = signLines(scan.signs);
    const held = flags.length > 0 && limits.siteReview;
    const kept = { files: files.size, bytes, manifest, uses, rules, flags, problems: [], checkedAt: new Date() };
    const [row] = await db.transaction(async (tx) => {
      await claimStorage(tx, organizationId, bytes, limits);
      if (!held) return makeLive(tx, site.id, path, id, kept);
      const why = `Held for review: ${flags.join("; ")}. Whoever runs this server looks at it, and it goes live if it is what it seems`;
      return tx.update(siteDeployments).set({ ...kept, state: "held", error: why }).where(eq(siteDeployments.id, id)).returning();
    });
    await recordAudit(caller, held ? "site.held" : "site.deployed", site.slug, { path, kind, files: files.size, ...(flags.length ? { flags } : {}) }, { projectId: site.projectId });
    if (held && env.SITE_REVIEW_EMAIL)
      await sendAs(null, siteHeldEmail(env.SITE_REVIEW_EMAIL, { organization: caller.project.organization.slug, site: site.slug, path, deployment: id, flags }), { capped: false });
    return present(row);
  } catch (err) {
    const why = err instanceof Error ? err.message : "It could not be stored";
    await db.update(siteDeployments).set({ state: "failed", error: why }).where(eq(siteDeployments.id, id));
    throw err instanceof AssetError ? err : new AssetError("invalid", why);
  }
}

/**
 * A build checked as a deployment is, without deploying it: for a site
 * hosted anywhere (Vercel, Netlify, GitHub Pages), from its CI. What it uses
 * of the project's library, and why any of it may not be shown. Nothing is
 * stored, and any folder of files will do: no index.html is asked for.
 */
export async function checkBuild(caller: Caller, zip: Uint8Array) {
  if (zip.length > MAX_SITE_BYTES) throw new AssetError("too_large", `A build is ${MAX_SITE_BYTES / 1024 / 1024} MB at most`);
  let entries;
  try {
    entries = unzip(zip);
  } catch {
    throw new AssetError("invalid", "That isn't a zip");
  }
  const files = siteFiles(entries.map((e) => e.name));
  if (!files || !files.size) throw new AssetError("invalid", files ? "That zip holds no files" : "A file in the zip names a path outside the site");
  if (files.size > MAX_SITE_FILES) throw new AssetError("invalid", `A build holds ${MAX_SITE_FILES} files at most`);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const scan = buildScan(await brandNames(caller.project.id));
  const ruleTexts = new Map<string, string>();
  let bytes = 0;
  for (const [served, name] of files) {
    const data = await byName
      .get(name)!
      .read()
      .catch(() => {
        throw new AssetError("invalid", `${served} can't be unpacked`);
      });
    bytes += data.length;
    if (bytes > MAX_SITE_BYTES) throw new AssetError("too_large", `A build is ${MAX_SITE_BYTES / 1024 / 1024} MB unpacked at most`);
    if (served === REDIRECTS || served === HEADERS) ruleTexts.set(served, new TextDecoder().decode(data));
    else if (served !== MANIFEST) scan.add(served, data);
    else
      try {
        scan.declare(JSON.parse(new TextDecoder().decode(data)) as Manifest);
      } catch {
        throw new AssetError("invalid", `${MANIFEST} isn't JSON`);
      }
  }
  const { uses, unknown } = await resolveUses(caller.project.id, scan, visible(caller));
  const problems = [...rulesOf(ruleTexts).errors, ...unknown, ...(await problemsWith(uses))];
  return { allowed: !problems.length, files: files.size, uses, problems, flags: signLines(scan.signs) };
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
  // Checked again as it comes back, so what may no longer be shown says so at once rather than at the next re-check.
  const problems = await problemsWith(usesOf(d));
  const [live] = await db.transaction(async (tx) => {
    await tx
      .update(siteDeployments)
      .set({ state: "replaced" })
      .where(and(eq(siteDeployments.siteId, site.id), eq(siteDeployments.path, d.path), eq(siteDeployments.state, "live")));
    return tx.update(siteDeployments).set({ state: "live", problems, checkedAt: new Date() }).where(eq(siteDeployments.id, d.id)).returning();
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
/** Days a held build waits for the operator before it is refused. */
export const HELD_DAYS = 14;

/** What a deployment uses, as kept; for one made before uses were kept, what its manifest named. */
const usesOf = (d: Deployment): SiteUse[] =>
  d.uses ??
  (Array.isArray(d.manifest?.assets) ? (d.manifest.assets as unknown[]) : [])
    .filter((id): id is string => typeof id === "string" && UUID.test(id))
    .map((asset) => ({ asset, how: "declared" as const, file: null }));

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
  // Claimed in one statement, the checked time moved on as they are taken: two instances sweeping at once (a deploy
  // boots several) never check, or mail about, the same build twice. What the rows held before comes back with them.
  const claimed = await db.execute<{ id: string }>(sql`
    update ${siteDeployments} set checked_at = now()
    where id in (
      select id from ${siteDeployments}
      where state = 'live' and (checked_at is null or checked_at < now() - make_interval(secs => ${RECHECK_EVERY_MS / 1000}))
      order by checked_at asc nulls first
      limit ${RECHECK_PER_RUN}
      for update skip locked
    )
    returning id`);
  const ids = claimed.map((r) => r.id);
  const due = ids.length
    ? await db
        .select({ d: siteDeployments, site: { id: portals.id, name: portals.name, slug: portals.slug, projectId: portals.projectId } })
        .from(siteDeployments)
        .innerJoin(portals, eq(portals.id, siteDeployments.siteId))
        .where(inArray(siteDeployments.id, ids))
    : [];
  let troubled = 0;
  for (const { d, site } of due) {
    const problems = await problemsWith(usesOf(d), date);
    await db.update(siteDeployments).set({ problems }).where(eq(siteDeployments.id, d.id));
    if (!problems.length) continue;
    troubled++;
    const fresh = problems.filter((p) => !d.problems.includes(p));
    if (!fresh.length) continue;
    await recordAudit({ actor: "server" }, "site.problems", site.slug, { path: d.path, problems }, { projectId: site.projectId });
    const ws = await projectById(site.projectId);
    const url = `${await appUrlFor(ws?.organizationId ?? null)}/sites?deployments=${site.id}`;
    for (const to of await adminsOf(site)) await sendAs(ws?.organizationId ?? null, siteProblemsEmail(to, { site: site.name, path: d.path, problems, url }), { capped: false });
  }
  // A build held for review that nobody released in HELD_DAYS is refused, so its files stop counting and the sweep takes them.
  await db
    .update(siteDeployments)
    .set({ state: "failed", error: `Not reviewed within ${HELD_DAYS} days: deploy it again, or ask whoever runs this server` })
    .where(and(eq(siteDeployments.state, "held"), lt(siteDeployments.createdAt, new Date(Date.now() - HELD_DAYS * 864e5))));
  return { checked: due.length, troubled };
}

/** The live mount paths of a site, longest first: where its builds answer. For src/proxy.ts. */
export async function liveMounts(siteId: string) {
  const rows = await db.select({ path: siteDeployments.path }).from(siteDeployments).where(and(eq(siteDeployments.siteId, siteId), eq(siteDeployments.state, "live")));
  return rows.map((r) => r.path).sort((a, b) => b.length - a.length);
}

export const underMount = (rest: string, mount: string) => mount === "/" || rest === mount || rest.startsWith(`${mount}/`);

/** What a request to a site's build gets: a folder's slash, a redirect, or a stored file with its status and the build's headers. */
export type SiteAnswer =
  | { slash: true }
  | { redirect: string; status: number; headers: [string, string][] }
  | { key: string; contentType: string; status: number; open: boolean; headers: [string, string][] };

/** A build's own files that are read, never served. */
const HIDDEN = new Set([MANIFEST, REDIRECTS, HEADERS]);

/**
 * The stored file a request to a site asks for, as this visitor may see it
 * (the portal's own gate: a password or members site refuses here), or null
 * when no live build holds the path: a folder's slash, a redirect of the
 * build's _redirects, or a file with its status and the build's _headers. A
 * file the path names wins over a redirect unless it is forced (!); a miss
 * answers the build's 404.html.
 */
export async function siteFile(slug: string, pass: Pass, rest: string, unlock?: string | null): Promise<SiteAnswer | null> {
  const { p } = await enterPortal(slug, pass).catch(async (err) => {
    // Its door's cookie stands for the password. Still the portal's own checks first: closed, suspended, gone.
    if (err instanceof AssetError && err.code === "password" && (await unlocked(slug, unlock))) return { p: (await portalNamed(slug))!.p };
    throw err;
  });
  const live = await db
    .select({ path: siteDeployments.path, prefix: siteDeployments.prefix, rules: siteDeployments.rules })
    .from(siteDeployments)
    .where(and(eq(siteDeployments.siteId, p.id), eq(siteDeployments.state, "live")));
  const mount = live.sort((a, b) => b.path.length - a.path.length).find((m) => underMount(rest, m.path));
  if (!mount) return null;
  const inner = mount.path === "/" ? rest || "/" : rest.slice(mount.path.length);
  // A folder asked without its slash gets one, as static hosts do: its page's relative links resolve under it.
  if (!inner) return { slash: true as const };
  const open = p.access === "public";
  const headers = headersFor(mount.rules?.headers ?? [], inner);
  // The file a path names, else none: what a redirect that isn't forced gives way to. Its rules files are never served.
  // A rewrite serves the file it names as it is: no slash added for a folder's index.
  const fileAt = async (path: string, rewrite = false): Promise<{ slash: true } | { key: string; contentType: string } | null> => {
    for (const name of candidates(path)) {
      if (name === "404.html" || HIDDEN.has(name)) continue;
      if ((await sizeOf(mount.prefix + name)) === null) continue;
      if (!rewrite && name.endsWith("index.html") && !path.endsWith("/")) return { slash: true as const };
      return { key: mount.prefix + name, contentType: contentTypeOf(name) };
    }
    return null;
  };
  const notFound = async (): Promise<SiteAnswer | null> => {
    const key = mount.prefix + "404.html";
    return (await sizeOf(key)) === null ? null : { key, contentType: contentTypeOf("404.html"), status: 404, open, headers };
  };
  const rule = redirectFor(mount.rules?.redirects ?? [], inner);
  const found = rule?.force ? null : await fileAt(inner);
  if (found) return "slash" in found ? found : { ...found, status: 200, open, headers };
  if (!rule) return notFound();
  if (rule.status === 200 || rule.status === 404) {
    // Served from the build itself: a single-page app's index for every path, or a page of its own for a miss.
    const target = await fileAt(rule.to, true);
    if (!target || "slash" in target) return notFound();
    return { ...target, status: rule.status, open, headers };
  }
  // A path of the build is under its mount; a URL goes where it says.
  const to = rule.to.startsWith("/") ? `${mount.path === "/" ? "" : mount.path}${rule.to}` : rule.to;
  return { redirect: to, status: rule.status, headers };
}
