import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, brands, domains, portalRequests, portals, sessions, siteComponents, siteDeployments, siteTickets } from "@/lib/db/schema";
import { findObject } from "@/lib/core/catalog";
import { projectById, type Caller } from "@/lib/core/access";
import { visible } from "@/lib/core/assets";
import { recordAudit } from "@/lib/core/audit";
import { checkLimit, claimStorage, limitsOf } from "@/lib/core/usage";
import { AssetError } from "@/lib/core/errors";
import { appUrlFor, buildsAt, hostTarget, portalHome, portalNamed, previewAt } from "@/lib/core/domains";
import { adminsOf, digest, enterPortal, reader, readerOf, type Pass } from "@/lib/core/portals";
import { sendAs, siteHeldEmail, siteProblemsEmail } from "@/lib/core/mail";
import { env } from "@/lib/env";
import { signAsset, signedUntil } from "@/lib/signed";
import { can } from "@/lib/permissions";
import { assetAddresses, BUILD_KINDS, ENTER_PATH, PREVIEW_NAME, contentTypeOf, MANIFEST, MAX_SITE_BYTES, MAX_SITE_FILES, mountPath, readsLinks, siteFiles, STORYBOOK_INDEX, storybookComponents, type BuildKind, type SiteComponent, type SiteUse } from "@/lib/sites";
import { rightsReasons, today, type Rights } from "@/lib/rights";
import { signLines, signsIn, type Sign } from "@/lib/site-safety";
import { HEADERS, parseHeaders, parseRedirects, REDIRECTS, type SiteRules } from "@/lib/site-rules";
import { resolveSitePath, type Mount, type SiteAnswer } from "@/lib/site-serve";
import { localPath } from "@/lib/markdown";
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

/** `url`: where a preview answers (previewAt), given for a preview only. */
const present = (d: Deployment, url?: string | null) => ({
  id: d.id,
  path: d.path,
  kind: d.kind,
  state: d.state,
  preview: d.preview,
  ...(d.preview && { url: url ?? null }),
  files: d.files,
  bytes: d.bytes,
  commit: d.commit,
  ref: d.ref,
  error: d.error,
  manifest: d.manifest,
  uses: d.uses ?? [],
  componentUses: d.componentUses ?? [],
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
  const site = await siteOf(caller, siteId);
  if (!site) return null;
  const rows = await db.select().from(siteDeployments).where(eq(siteDeployments.siteId, siteId)).orderBy(desc(siteDeployments.createdAt)).limit(50);
  return rows.map((d) => present(d, previewUrl(site.slug, d)));
}

/**
 * artbucket.site.json. `components`: the component versions the build is made
 * with, by address or id (`acme/corporate/site/storybook/component/ui-button@3`;
 * without @n, the current one). `fingerprints`: a Storybook's own, each of its
 * components' code as the CLI hashed it, by Storybook id.
 */
type Manifest = { release?: number; assets?: string[]; rules?: string[]; components?: unknown; fingerprints?: unknown };

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

/** A preview's address, at its mount: null for anything else. */
const previewUrl = (slug: string, d: Pick<Deployment, "preview" | "path">) => {
  const at = d.preview ? previewAt(slug, d.preview) : null;
  return at && `${at}${d.path === "/" ? "/" : `${d.path}/`}`;
};

/**
 * A pull request's build kept as the preview of its name at its mount: an
 * earlier build of the same preview there goes (the sweep takes its files),
 * the live one stays as it is. Previews are swept PREVIEW_DAYS after they
 * were made.
 */
async function makePreview(tx: Tx, siteId: string, path: string, name: string, id: string, set: Partial<typeof siteDeployments.$inferInsert> = {}) {
  await tx
    .delete(siteDeployments)
    .where(and(eq(siteDeployments.siteId, siteId), eq(siteDeployments.path, path), eq(siteDeployments.preview, name), eq(siteDeployments.state, "preview")));
  return tx.update(siteDeployments).set({ ...set, state: "preview", preview: name }).where(eq(siteDeployments.id, id)).returning();
}
export const PREVIEW_DAYS = 30;

/** The brands' names in a project, which a build may look like without impersonating anyone. */
const brandNames = async (projectId: string) => (await db.select({ name: brands.name, slug: brands.slug }).from(brands).where(eq(brands.projectId, projectId))).flatMap((b) => [b.name, b.slug]);

/**
 * Deploy a zip to a site at a mount path: refused outright when it can't
 * serve (no index.html, a name outside the site, too big); otherwise
 * recorded, and failed with the reason when its manifest names an asset that
 * may not be used. Live once every file is stored.
 */
export async function deploy(
  caller: Caller,
  siteId: string,
  zip: Uint8Array,
  o: { path?: string | null; kind?: string | null; commit?: string | null; ref?: string | null; preview?: string | null } = {},
) {
  mayDeploy(caller);
  const site = await siteOf(caller, siteId);
  if (!site) return null;
  const path = mountPath(o.path ?? "/");
  if (!path) throw new AssetError("invalid", "path: / or lowercase segments, such as /docs");
  const preview = o.preview || null;
  if (preview !== null) {
    if (!PREVIEW_NAME.test(preview)) throw new AssetError("invalid", "preview: lowercase letters, digits and single dashes, 30 at most, such as pr-12");
    if (!previewAt(site.slug, preview)) throw new AssetError("invalid", env.BUILD_DOMAIN || env.PORTAL_DOMAIN ? `preview: ${preview}--${site.slug} is too long for an address: pick a shorter name` : "Previews answer at {name}--{site}.BUILD_DOMAIN or PORTAL_DOMAIN: this server has neither");
  }
  if (site.kind === "portal" && path === "/") throw new AssetError("invalid", "A brand portal's root is drawn by Artbucket: mount a build at a path, such as /docs");
  if (site.kind === "external") throw new AssetError("invalid", "An external site isn't deployed here: its CI records what it uses with artbucket site scan");
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
    let components: SiteComponent[] | null = null;
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
          if (kind === "storybook" && served === STORYBOOK_INDEX)
            try {
              components = storybookComponents(JSON.parse(new TextDecoder().decode(data)));
            } catch {
              // An index.json that isn't JSON lists no components; the Storybook is served all the same.
            }
          await putObject(prefix + served, Buffer.from(data), contentTypeOf(served));
        }),
      );
    }
    if (manifest) scan.declare(manifest);
    const componentUses = await usedComponents(caller, (manifest as Manifest | null)?.components);
    const { rules, errors: ruleErrors } = rulesOf(ruleTexts);
    if (ruleErrors.length) throw new AssetError("invalid", `Its rules can't be read: ${ruleErrors.join("; ")}`);
    const { uses, unknown } = await resolveUses(site.projectId, scan);
    const problems = [...unknown, ...(await problemsWith(uses))];
    if (problems.length) throw new AssetError("invalid", `It uses what may not be used: ${problems.join("; ")}`);
    const flags = signLines(scan.signs);
    const held = flags.length > 0 && limits.siteReview;
    // A preview is never held for the operator: one that looks like phishing isn't served at all.
    if (held && preview) throw new AssetError("invalid", `A preview isn't served when it looks like phishing: ${flags.join("; ")}. Deploy it to the site to have it looked at`);
    const kept = { files: files.size, bytes, manifest, uses, componentUses, rules, flags, problems: [], checkedAt: new Date() };
    const [row] = await db.transaction(async (tx) => {
      await claimStorage(tx, organizationId, bytes, limits);
      // A preview's components make no versions: only what goes to the site does.
      const found = components && !preview ? await versionComponents(tx, site.id, path, id, caller.actor, components, fingerprintsOf(components, manifest, scan)) : null;
      Object.assign(kept, { components: found });
      if (preview) return makePreview(tx, site.id, path, preview, id, kept);
      if (!held) return makeLive(tx, site.id, path, id, kept);
      const why = `Held for review: ${flags.join("; ")}. Whoever runs this server looks at it, and it goes live if it is what it seems`;
      return tx.update(siteDeployments).set({ ...kept, state: "held", error: why }).where(eq(siteDeployments.id, id)).returning();
    });
    await recordAudit(caller, held ? "site.held" : "site.deployed", site.slug, { path, kind, files: files.size, ...(preview ? { preview } : {}), ...(flags.length ? { flags } : {}) }, { projectId: site.projectId });
    if (held && env.SITE_REVIEW_EMAIL)
      await sendAs(null, siteHeldEmail(env.SITE_REVIEW_EMAIL, { organization: caller.project.organization.slug, site: site.slug, path, deployment: id, flags }), { capped: false });
    return present(row, previewUrl(site.slug, row));
  } catch (err) {
    const why = err instanceof Error ? err.message : "It could not be stored";
    await db.update(siteDeployments).set({ state: "failed", error: why }).where(eq(siteDeployments.id, id));
    throw err instanceof AssetError ? err : new AssetError("invalid", why);
  }
}

/**
 * The component versions a manifest says the build is made with, as ids;
 * null when it names none. Refused when one isn't a component the caller
 * reaches: a typo would otherwise drop out of its lineage unseen.
 */
async function usedComponents(caller: Caller, refs: unknown): Promise<string[] | null> {
  if (!Array.isArray(refs) || !refs.length) return null;
  const ids = new Set<string>();
  for (const item of refs) {
    // An address or id; or, from artbucket site scan, { component, fingerprint }: the version whose code that is, if one is.
    const { component: ref, fingerprint } = typeof item === "string" ? { component: item, fingerprint: null } : ((item ?? {}) as { component?: unknown; fingerprint?: unknown });
    const o = typeof ref === "string" ? await findObject(caller, ref) : null;
    if (o?.type !== "component") throw new AssetError("invalid", `${MANIFEST} names ${typeof ref === "string" ? ref : "something"} as a component: it isn't one this key reaches`);
    ids.add((typeof fingerprint === "string" && (await versionWithCode(o.id, fingerprint))) || o.id);
  }
  return [...ids];
}

/** The version of a component (at its mount) whose fingerprint this is, if one is. */
async function versionWithCode(id: string, fingerprint: string) {
  const [c] = await db.select({ siteId: siteComponents.siteId, path: siteComponents.path, slug: siteComponents.slug }).from(siteComponents).where(eq(siteComponents.id, id));
  if (!c) return null;
  const [v] = await db
    .select({ id: siteComponents.id })
    .from(siteComponents)
    .where(and(eq(siteComponents.siteId, c.siteId), eq(siteComponents.path, c.path), eq(siteComponents.slug, c.slug), eq(siteComponents.fingerprint, fingerprint)));
  return v?.id ?? null;
}

/**
 * Each component's fingerprint: its code, as the CLI hashed it into the
 * manifest; else what the build shows of it, its stories and their bundled
 * file (Vite's `button.stories-{hash}.js`), which changes when its stories
 * do but not always when its code does.
 */
function fingerprintsOf(components: SiteComponent[], manifest: Manifest | null, scan: BuildScan) {
  const declared = manifest?.fingerprints && typeof manifest.fingerprints === "object" ? (manifest.fingerprints as Record<string, unknown>) : {};
  const shaOf = new Map([...scan.hashes].flatMap(([sha, names]) => names.map((n) => [n, sha] as const)));
  const names = [...shaOf.keys()];
  return new Map(
    components.map((c) => {
      const own = declared[c.slug];
      if (typeof own === "string" && own) return [c.slug, own];
      const bases = c.files.filter((f) => /\.(stories|story)\./.test(f)).map((f) => f.split("/").pop()!.replace(/\.[jt]sx?$|\.mdx$/, ""));
      const chunks = names.filter((n) => bases.some((b) => n.split("/").pop()!.startsWith(`${b}-`) || n.split("/").pop()!.startsWith(`${b}.`))).map((n) => shaOf.get(n));
      return [c.slug, createHash("sha256").update(JSON.stringify([c.title, c.stories, chunks.sort()])).digest("hex")];
    }),
  );
}

/**
 * The version of each component this deployment holds, made when its
 * fingerprint is new at this mount: one seen before (a rollback, built
 * again) is that version again, so only a change makes a new one.
 */
async function versionComponents(tx: Tx, siteId: string, path: string, deploymentId: string, actor: string, components: SiteComponent[], prints: Map<string, string>) {
  const known = await tx.select().from(siteComponents).where(and(eq(siteComponents.siteId, siteId), eq(siteComponents.path, path)));
  const ids: string[] = [];
  for (const c of components) {
    const fingerprint = prints.get(c.slug)!;
    const same = known.find((k) => k.slug === c.slug && k.fingerprint === fingerprint);
    if (same) {
      ids.push(same.id);
      continue;
    }
    const version = Math.max(0, ...known.filter((k) => k.slug === c.slug).map((k) => k.version)) + 1;
    const [row] = await tx
      .insert(siteComponents)
      .values({ siteId, path, slug: c.slug, version, fingerprint, name: c.name, title: c.title, story: c.story, stories: c.stories, files: c.files, deploymentId, createdBy: actor })
      .returning({ id: siteComponents.id });
    ids.push(row.id);
  }
  return ids;
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
 * What an app hosted elsewhere uses, from its CI (`artbucket site scan`):
 * its files read as a build's are (copies of the library's files, `/a/` and
 * `/c/` links), and the components its code imports, as the manifest the CLI
 * adds says. Kept as the external site's live record, files not stored, so it
 * is in lineage, in Fixes and re-checked as a live build is; never refused
 * for what it uses, which is already out there: the answer says why.
 */
export async function recordUses(caller: Caller, siteId: string, zip: Uint8Array, o: { commit?: string | null; ref?: string | null } = {}) {
  mayDeploy(caller);
  const site = await siteOf(caller, siteId);
  if (!site) return null;
  if (site.kind !== "external") throw new AssetError("invalid", "Only an external site records what it uses: deploy this one's build instead");
  if (zip.length > MAX_SITE_BYTES) throw new AssetError("too_large", `A scan is ${MAX_SITE_BYTES / 1024 / 1024} MB at most`);
  let entries;
  try {
    entries = unzip(zip);
  } catch {
    throw new AssetError("invalid", "That isn't a zip");
  }
  const files = siteFiles(entries.map((e) => e.name));
  if (!files || !files.size) throw new AssetError("invalid", files ? "That zip holds no files" : "A file in the zip names a path outside the site");
  if (files.size > MAX_SITE_FILES) throw new AssetError("invalid", `A scan holds ${MAX_SITE_FILES} files at most`);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const scan = buildScan(await brandNames(site.projectId));
  let manifest: Manifest | null = null;
  for (const [served, name] of files) {
    const data = await byName.get(name)!.read();
    if (served !== MANIFEST) scan.add(served, data);
    else
      try {
        manifest = JSON.parse(new TextDecoder().decode(data)) as Manifest;
      } catch {
        throw new AssetError("invalid", `${MANIFEST} isn't JSON`);
      }
  }
  if (manifest) scan.declare(manifest);
  const componentUses = await usedComponents(caller, manifest?.components);
  const { uses, unknown } = await resolveUses(site.projectId, scan);
  const problems = [...unknown, ...(await problemsWith(uses))];
  const id = randomUUID();
  const [row] = await db.transaction(async (tx) => {
    // Its prefix holds nothing: the sweep of a replaced one takes nothing.
    await tx.insert(siteDeployments).values({ id, siteId: site.id, path: "/", kind: "external", prefix: `sites/${site.id}/${id}/`, commit: o.commit ?? null, ref: o.ref ?? null, createdBy: caller.actor });
    return makeLive(tx, site.id, "/", id, { files: files.size, bytes: 0, manifest, uses, componentUses, problems, flags: [], checkedAt: new Date() });
  });
  await recordAudit(caller, "site.scanned", site.slug, { files: files.size, assets: new Set(uses.map((u) => u.asset)).size, components: componentUses?.length ?? 0 }, { projectId: site.projectId });
  return present(row, null);
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

/**
 * A members site's builds answer on its own host, where the app's session
 * doesn't reach: a member asked there goes to the app (app/(app)/sites/enter,
 * membersDoor), which, once they are signed in and may read the project,
 * sends them back with a ticket good for ENTER_SECONDS and once (enterSite).
 * The site's host trades it for its door's cookie (letIn), which names them
 * and their session in the app: each file asked checks again that the
 * session stands and they may still read the project, so signing out of the
 * app, or being removed from the project, closes the site at once. It lasts
 * MEMBER_HOURS, then the trip to the app runs again, unseen while they are
 * still signed in there.
 *
 * Someone whose request to get in was approved has a key instead
 * (portal_requests): its link, `?key=`, is traded for a door cookie of its own
 * on any site that isn't public (keyDoor), checked against the request each
 * time, so a request revoked or past its end closes the site.
 */
export const MEMBER_HOURS = 12;
const ENTER_SECONDS = 120;
/** A ticket carries a nonce: two asked in the same second would otherwise be one, and the second already traded. */
type Door = { t: { u: string; s: string; n: string }; m: { u: string; s: string }; k: { r: string } };
/**
 * A door's value: `{kind}.{subject}.{exp}.{mac}`, the subject as base64url JSON and the MAC (lib/signed.ts) over the
 * site, the kind and the subject exactly as written, so no other spelling of it is the same door.
 */
const sealDoor = <K extends keyof Door>(kind: K, siteId: string, subject: Door[K], until: Date) => {
  const body = Buffer.from(JSON.stringify(subject)).toString("base64url");
  return `${kind}.${body}.${signAsset(env.BETTER_AUTH_SECRET, `site-${kind}:${siteId}:${body}`, until)}`;
};
function openDoor<K extends keyof Door>(kind: K, siteId: string, value: string): Door[K] | null {
  const [k, body, ...sig] = value.split(".");
  if (k !== kind || !body || sig.length !== 2 || !signedUntil(env.BETTER_AUTH_SECRET, `site-${kind}:${siteId}:${body}`, sig.join("."))) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Door[K];
  } catch {
    return null;
  }
}

/** Whether someone's session in the app still stands and they may still read the project. */
async function stillMember(projectId: string, { u, s }: { u: string; s: string }) {
  const [live] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, s), eq(sessions.userId, u), gt(sessions.expiresAt, new Date())));
  return !!live && (await (await readerOf({ id: u })).reads(projectId));
}

/** Where a visitor goes to be let into the members site `slug`: the app, which sends them back to `to` once they are in. */
export async function membersDoor(slug: string, to: string, preview?: string | null) {
  const named = await portalNamed(slug);
  return `${await appUrlFor(named?.organizationId ?? null)}/sites/enter?${new URLSearchParams({ site: slug, to, ...(preview && { preview }) })}`;
}

/**
 * For app/(app)/sites/enter, on the app's host: where someone signed in goes
 * to be let into the members site `slug`, with a ticket naming them and
 * their session, or why they can't (`name`: the site's, for asking in). `to`
 * is a path of the site; anything else goes to its home.
 */
export async function enterSite(
  slug: string,
  headers: Headers,
  to: string | null,
  preview?: string | null,
): Promise<{ url: string } | { signIn: true; name: string } | { refused: string; name?: string; email?: string }> {
  const named = await portalNamed(slug);
  const p = named?.p;
  if (!p || p.access !== "members") return { refused: "There is no members site at this address" };
  // Back to the preview's own host when one was asked: its door's cookie is that host's alone.
  const at =
    preview && PREVIEW_NAME.test(preview) ? previewAt(p.slug, preview) : buildsAt(p, (await db.select().from(domains).where(eq(domains.portalId, p.id)))[0] ?? null);
  if (!at) return { refused: "This site's builds have no address to answer at: give it a domain of its own" };
  const who = await reader(headers);
  if (!who) return { signIn: true, name: p.name };
  if (!(await who.reads(p.projectId))) return { refused: `${p.name} is for the people of its project, and ${who.user.email} isn't one of them.`, name: p.name, email: who.user.email };
  const ticket = sealDoor("t", p.id, { u: who.user.id, s: who.session, n: randomUUID() }, new Date(Date.now() + ENTER_SECONDS * 1000));
  return { url: `${at}${ENTER_PATH}?${new URLSearchParams({ t: ticket, to: localPath(to) ? to : "/" })}` };
}

/**
 * On the site's own host: the door cookie for the person a ticket names, when
 * it is this site's, unexpired, never traded before (site_tickets, on every
 * instance), and they are still a member; null otherwise.
 */
export async function letIn(slug: string, ticket: string) {
  const p = (await portalNamed(slug))?.p;
  if (!p || p.access !== "members") return null;
  const who = openDoor("t", p.id, ticket);
  if (!who) return null;
  // The MAC is the one part a ticket can't be spelled another way in: lib/signed.ts compares it exactly.
  const mac = ticket.split(".").at(-1)!;
  await db.delete(siteTickets).where(lt(siteTickets.expiresAt, new Date()));
  const [fresh] = await db
    .insert(siteTickets)
    .values({ mac, expiresAt: new Date(Date.now() + ENTER_SECONDS * 1000) })
    .onConflictDoNothing()
    .returning();
  if (!fresh || !(await stillMember(p.projectId, who))) return null;
  return sealDoor("m", p.id, { u: who.u, s: who.s }, new Date(Date.now() + MEMBER_HOURS * 36e5));
}

/**
 * The door cookie for an approved request's key, on a site that isn't public:
 * the key's link opens its builds as it opens the portal's pages. Null when
 * the key opens nothing here.
 */
export async function keyDoor(slug: string, key: string) {
  const p = (await portalNamed(slug))?.p;
  if (!p || p.access === "public" || !key) return null;
  const [r] = await db
    .select({ id: portalRequests.id, expiresAt: portalRequests.expiresAt })
    .from(portalRequests)
    .where(and(eq(portalRequests.portalId, p.id), eq(portalRequests.keyHash, digest(key)), eq(portalRequests.status, "approved")));
  if (!r || (r.expiresAt && r.expiresAt <= new Date())) return null;
  const week = new Date(Date.now() + UNLOCK_DAYS * 864e5);
  return sealDoor("k", p.id, { r: r.id }, r.expiresAt && r.expiresAt < week ? r.expiresAt : week);
}

/**
 * Whether a door cookie opens this site: an approved request's while it
 * stands; a members site's for someone still a member; a password site's for
 * its password now.
 */
async function unlocked(p: typeof portals.$inferSelect, value: string | null | undefined) {
  if (!value) return false;
  const key = openDoor("k", p.id, value);
  if (key) {
    const [r] = await db
      .select({ id: portalRequests.id })
      .from(portalRequests)
      .where(
        and(
          eq(portalRequests.id, key.r),
          eq(portalRequests.portalId, p.id),
          eq(portalRequests.status, "approved"),
          sql`(${portalRequests.expiresAt} is null or ${portalRequests.expiresAt} > now())`,
        ),
      );
    return !!r;
  }
  if (p.access === "members") {
    const who = openDoor("m", p.id, value);
    return !!who && (await stillMember(p.projectId, who));
  }
  return p.access === "password" && !!signedUntil(env.BETTER_AUTH_SECRET, unlockId(p), value);
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
  // Previews past PREVIEW_DAYS go: their pull requests are long merged or closed, and the sweep takes their files.
  await db.delete(siteDeployments).where(and(eq(siteDeployments.state, "preview"), lt(siteDeployments.createdAt, new Date(Date.now() - PREVIEW_DAYS * 864e5))));
  // A build held for review that nobody released in HELD_DAYS is refused, so its files stop counting and the sweep takes them.
  await db
    .update(siteDeployments)
    .set({ state: "failed", error: `Not reviewed within ${HELD_DAYS} days: deploy it again, or ask whoever runs this server` })
    .where(and(eq(siteDeployments.state, "held"), lt(siteDeployments.createdAt, new Date(Date.now() - HELD_DAYS * 864e5))));
  return { checked: due.length, troubled };
}

/** The live mount paths of a site, longest first: where its builds answer. For src/proxy.ts. */
export async function liveMounts(siteId: string) {
  const rows = await db.select({ path: siteDeployments.path }).from(siteDeployments).where(and(eq(siteDeployments.siteId, siteId), eq(siteDeployments.state, "live"), served));
  return rows.map((r) => r.path).sort((a, b) => b.length - a.length);
}

export { underMount, type SiteAnswer } from "@/lib/site-serve";

/**
 * The stored file a request to a site asks for, as this visitor may see it
 * (the portal's own gate: a password or members site refuses here), or null
 * when no live build holds the path (lib/site-serve.ts resolveSitePath, which
 * an edge in front answers the same way).
 */
export async function siteFile(slug: string, pass: Pass, rest: string, unlock?: string | null, preview?: string | null): Promise<SiteAnswer | null> {
  const { p } = await enterPortal(slug, pass).catch(async (err) => {
    // Its door's cookie stands for the password. Still the portal's own checks first: closed, suspended, gone.
    const p = err instanceof AssetError && err.code === "password" ? (await portalNamed(slug))?.p : null;
    if (p && (await unlocked(p, unlock))) return { p };
    throw err;
  });
  return resolveSitePath(await mountsOf(p.id, preview), rest, p.access === "public", async (key) => (await sizeOf(key)) !== null);
}

/**
 * What an edge in front of the server needs to serve a host's builds from
 * storage itself (GET /api/v1/sites/edge, PRD part 2 "Serving"): the site,
 * the preview the host names if any, and its mounts, each with where its
 * files are stored and its rules, for lib/site-serve.ts. Only for a site open
 * to everyone, at the host its builds answer on; null for anything else
 * (behind a password or for members, closed, or another host, which the
 * server itself redirects or refuses), which the edge passes on. `ttl`: how
 * long the answer holds, at most a minute, never past the site's end.
 */
export async function edgeRoute(host: string): Promise<{ slug: string; preview: string | null; mounts: Mount[]; ttl: number } | null> {
  const target = await hostTarget(host).catch(() => null);
  if (!target?.portal) return null;
  const opened = await enterPortal(target.portal, {}).catch(() => null);
  if (!opened || opened.p.access !== "public") return null;
  const { p } = opened;
  if (!target.preview) {
    // Its builds' own host only: anywhere else the server redirects there, or serves the portal's pages.
    const home = await portalHome(p.slug);
    if (!home?.builds || p.slug !== target.portal || new URL(home.builds).host !== host) return null;
  }
  const left = p.expiresAt ? Math.floor((p.expiresAt.getTime() - Date.now()) / 1000) : 60;
  return { slug: p.slug, preview: target.preview ?? null, mounts: await mountsOf(p.id, target.preview), ttl: Math.max(0, Math.min(60, left)) };
}

/** A site's live deployments (or one preview's), as serving reads them. */
async function mountsOf(siteId: string, preview?: string | null): Promise<Mount[]> {
  const cols = { path: siteDeployments.path, prefix: siteDeployments.prefix, rules: siteDeployments.rules };
  const found = await db
    .select(cols)
    .from(siteDeployments)
    .where(and(eq(siteDeployments.siteId, siteId), served, preview ? and(eq(siteDeployments.state, "preview"), eq(siteDeployments.preview, preview)) : eq(siteDeployments.state, "live")));
  const kept = !found.length && preview ? KEPT_NAME.exec(preview)?.[1] : null;
  if (!kept) return found;
  // A kept deployment by its name (keptName): an older component version's preview, while its files are kept.
  return db
    .select(cols)
    .from(siteDeployments)
    .where(and(eq(siteDeployments.siteId, siteId), served, inArray(siteDeployments.state, ["live", "replaced"]), sql`replace(${siteDeployments.id}::text, '-', '') like ${`${kept}%`}`))
    .limit(1);
}

const KEPT_NAME = /^d-([0-9a-f]{10})$/;
/** What answers requests: a build, never an external site's record of what it uses. */
const served = ne(siteDeployments.kind, "external");
/** A live or kept deployment as a preview name, answering at {name}--{site} as a pull request's does. */
export const keptName = (deploymentId: string) => `d-${deploymentId.replaceAll("-", "").slice(0, 10)}`;
