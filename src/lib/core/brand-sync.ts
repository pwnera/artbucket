import { randomBytes } from "node:crypto";
import { and, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, brandPreviews, brandRules, brands, brandSources, brandVersions } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { latestVersion, publishBrand, snapshot, themeOf, tracked, writeRules, type Tx } from "@/lib/core/brand";
import { resolveBrand, type Brand } from "@/lib/core/brands";
import { AssetError } from "@/lib/core/errors";
import { pageSnapshot, writePages } from "@/lib/core/page-store";
import { viewPage } from "@/lib/core/page-view";
import { pageSig } from "@/lib/core/signing";
import { checkRefs } from "@/lib/core/pages";
import { ASSETS_DIR, assetIds, canonical, fromFiles, locate, MISSING_ASSET, sameState, toFiles, type BrandState, type Files, type Problem } from "@/lib/brand-files";
import { diffStates, merge, unchanged, type Conflict } from "@/lib/brand-merge";
import { env } from "@/lib/env";
import { canon, type SnapPage } from "@/lib/pages";
import { can, needs } from "@/lib/permissions";
import { DEFAULT_PRESETS } from "@/lib/portal";

/**
 * Brand as code: a brand kept as files in a Git repository as well as here,
 * changed on either side (lib/brand-files.ts for the files, lib/brand-merge.ts
 * for putting two sides' changes together). The core stores where the files
 * live and what both sides last agreed on (brand_sources), reads a brand
 * from files and writes it out, and shows a proposed change before it lands
 * (brand_previews). Talking to the Git host is left to whoever holds its
 * credentials: a host's app, a CI job, the CLI. They call the API.
 *
 *   export   the brand as files, keeping what the repository says the same way
 *   import   files from the repository, merged with what changed here since they last agreed
 *   source   where the files live, and what was last agreed (PUT with `synced` after a push)
 *   preview  a pull request's files as a site, at a link, before they land
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
/** How long a preview's link opens after its last update. */
const PREVIEW_DAYS = 30;

type Db = Tx | typeof db;
type Source = typeof brandSources.$inferSelect;

/** The brand as it stands now, as a version would hold it, with its pages' times. */
async function stateOf(tx: Db, brand: Brand): Promise<BrandState> {
  const [rules, pages, theme] = [await snapshot(tx, brand.id), await pageSnapshot(tx, brand.id), await themeOf(tx, brand.id)];
  const [row] = await tx.select({ name: brands.name }).from(brands).where(eq(brands.id, brand.id));
  return { name: row?.name ?? brand.name, theme, rules, pages };
}

async function sourceRow(brandId: string): Promise<Source | undefined> {
  const [row] = await db.select().from(brandSources).where(eq(brandSources.brandId, brandId));
  return row;
}

const presentSource = (row: Source, current: BrandState) => ({
  remote: row.remote,
  branch: row.branch,
  path: row.path,
  commit: row.commit,
  syncedAt: row.syncedAt,
  /** Changed here since the repository last agreed: an export is due. */
  pending: row.base ? !sameState(row.base, current) : true,
  /** Assets that are files in the repository. */
  files: Object.keys(row.paths).length,
});
export type BrandSource = ReturnType<typeof presentSource>;

/** Paths to asset ids, by what the caller says each file is: its id, or the SHA-256 of its bytes. Unknown ones are to upload. */
async function resolveAssets(ws: string, given: Record<string, string>) {
  const entries = Object.entries(given).map(([p, v]) => [p.replace(/^\.\//, ""), v.toLowerCase()] as const);
  const bad = entries.filter(([, v]) => !UUID.test(v) && !SHA256.test(v));
  if (bad.length) throw new AssetError("invalid", `assets: ${bad.map(([p]) => p).join(", ")}: give each file's asset id or the SHA-256 of its bytes`);
  const ids = entries.filter(([, v]) => UUID.test(v)).map(([, v]) => v);
  const shas = entries.filter(([, v]) => SHA256.test(v)).map(([, v]) => v);
  const live = and(eq(assets.workspaceId, ws), isNull(assets.deletedAt));
  const rows = [
    ...(ids.length ? await db.select({ id: assets.id, sha256: assets.sha256 }).from(assets).where(and(live, inArray(assets.id, ids))) : []),
    ...(shas.length ? await db.select({ id: assets.id, sha256: assets.sha256 }).from(assets).where(and(live, inArray(assets.sha256, shas))) : []),
  ];
  const map: Record<string, string> = {};
  const unknown: string[] = [];
  for (const [p, v] of entries) {
    const found = rows.find((r) => r.id === v || r.sha256 === v);
    if (found) map[p] = found.id;
    else unknown.push(p);
  }
  return { map, unknown };
}

type Checked = { state: BrandState | null; used: Record<string, string>; errors: Problem[]; warnings: Problem[]; missing: string[] };

/**
 * Files read and checked as the API checks a write: lib/brand-files.ts for
 * what the files say, then the library for what they point at. `missing`:
 * files under assets/ the library does not have yet.
 */
async function check(caller: Caller, files: Files, given: Record<string, string>): Promise<Checked> {
  const ws = caller.workspace.id;
  const resolved = await resolveAssets(ws, given);
  const parsed = fromFiles(files, { assets: resolved.map });
  const missing = [...new Set([...parsed.missing, ...resolved.unknown.filter((p) => p.startsWith(ASSETS_DIR) && Object.values(files).some((t) => t.includes(p)))])].sort();
  const errors = [...parsed.errors];
  const s = parsed.state;
  if (s) {
    // Pages: collections, saved searches, queries and assets, as a page save checks them.
    for (const p of s.pages) {
      for (const message of await checkRefs(caller, p)) if (!message.includes(MISSING_ASSET)) errors.push(locate(files, { page: p.slug, message }));
    }
    // Rules and the theme: every asset they name is a live one here.
    const named = [
      ...s.rules.flatMap((r) => [...r.assets.map((a) => a.id), ...assetIds({ name: "", theme: {}, rules: [{ ...r, assets: [] }], pages: [] })]),
      ...(s.theme.device ? [s.theme.device] : []),
    ].filter((id) => id !== MISSING_ASSET);
    if (named.length) {
      const live = new Set(
        (await db.select({ id: assets.id }).from(assets).where(and(eq(assets.workspaceId, ws), isNull(assets.deletedAt), inArray(assets.id, [...new Set(named)])))).map((a) => a.id),
      );
      for (const id of new Set(named)) if (!live.has(id)) errors.push(locate(files, { value: id, message: `no asset ${id}` }));
    }
  }
  return { state: errors.length ? null : s, used: parsed.used, errors, warnings: parsed.warnings, missing };
}

/** Refuse files that don't check, with every problem at its file and line, and every file to upload. */
function refuseFiles(c: Checked) {
  if (!c.errors.length && !c.missing.length) return;
  const first = c.errors[0];
  const message = first
    ? `${first.file}${first.line ? `:${first.line}` : ""}: ${first.message}${c.errors.length > 1 ? ` (and ${c.errors.length - 1} more)` : ""}`
    : `Upload ${c.missing.length === 1 ? c.missing[0] : `${c.missing.length} files`} first, then send its SHA-256 in assets`;
  throw new AssetError("invalid", message, { errors: c.errors, warnings: c.warnings, missing: c.missing });
}

const invert = (used: Record<string, string>) => Object.fromEntries(Object.entries(used).map(([p, id]) => [id, p]));

// ---- export ---------------------------------------------------------------------

/** A file name fit for assets/: lowercase words, its extension kept. */
const fileName = (filename: string) => {
  const dot = filename.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [filename.slice(0, dot), filename.slice(dot + 1)] : [filename, ""];
  const clean = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (clean(stem) || "file") + (clean(ext) ? `.${clean(ext)}` : "");
};

/**
 * The brand as files (lib/brand-files.ts). Assets the repository holds are
 * written as their paths; with `assets: "files"`, every asset the brand
 * points at is given a path under assets/ too, for a first export that puts
 * them in the repository. `previous`: the repository's files as they are,
 * so a file that says the same is kept as it was written. `assets` in the
 * answer lists each path with its asset, to fetch or compare by SHA-256.
 */
export async function exportBrand(ws: string, slug: string | undefined, o: { previous?: Files; assets?: "ids" | "files" } = {}) {
  const brand = await resolveBrand(ws, slug);
  const [source, state] = [await sourceRow(brand.id), await stateOf(db, brand)];
  const ids = assetIds(state);
  const rows = ids.length
    ? await db
        .select({ id: assets.id, filename: assets.filename, mime: assets.mime, size: assets.size, sha256: assets.sha256 })
        .from(assets)
        .where(and(eq(assets.workspaceId, ws), isNull(assets.deletedAt), inArray(assets.id, ids)))
    : [];
  const paths: Record<string, string> = Object.fromEntries(Object.entries(source?.paths ?? {}).filter(([id]) => rows.some((r) => r.id === id)));
  if (o.assets === "files") {
    const taken = new Set(Object.values(paths));
    for (const r of rows) {
      if (paths[r.id]) continue;
      let path = `${ASSETS_DIR}${fileName(r.filename)}`;
      for (let n = 2; taken.has(path); n++) path = path.replace(/(-\d+)?(\.[a-z0-9]+)?$/, (_, _n, ext = "") => `-${n}${ext}`);
      taken.add(path);
      paths[r.id] = path;
    }
  }
  const files = toFiles(state, { paths, previous: o.previous });
  const listed = Object.fromEntries(
    rows
      .filter((r) => paths[r.id])
      .map((r) => [paths[r.id], { id: r.id, filename: r.filename, mime: r.mime, size: r.size, sha256: r.sha256, url: `${env.APP_URL}/a/${r.id}` }]),
  );
  return { brand: brand.slug, files, assets: listed, source: source ? presentSource(source, state) : null };
}

// ---- import ---------------------------------------------------------------------

/** Write a state over the brand's rules, pages, theme and name. A page that says what it said keeps its time. */
async function writeState(tx: Tx, ws: string, brand: Brand, before: BrandState, after: BrandState) {
  await tx.delete(brandRules).where(eq(brandRules.brandId, brand.id));
  await writeRules(tx, ws, brand.id, after.rules);
  const words = (p: SnapPage) => canon({ ...p, position: undefined, parent: undefined, updatedAt: undefined });
  const was = new Map(before.pages.map((p) => [p.slug, p]));
  const now = new Date().toISOString();
  await writePages(
    tx,
    brand.id,
    after.pages.map((p) => {
      const old = was.get(p.slug);
      return { ...p, updatedAt: old && words(old) === words(p) && old.updatedAt ? old.updatedAt : now };
    }),
  );
  await tx.update(brands).set({ theme: after.theme, ...(after.name !== before.name && { name: after.name }) }).where(eq(brands.id, brand.id));
}

export type ImportInput = {
  files: Files;
  /** The files under assets/ the brand's files point at: path to asset id, or to the SHA-256 of its bytes. */
  assets?: Record<string, string>;
  /** The commit the files are at: the source then records it as agreed. */
  commit?: string;
  /** What the commit says: names the version the import makes, so each sync stands as a checkpoint in the history. */
  message?: string;
  /** Check, merge and answer what would change, writing nothing. */
  dryRun?: boolean;
  /** Merge with what changed here since the source last agreed (the default); false takes the files whole. */
  merge?: boolean;
  /** Publish after, with this note (true: no note). Takes share on the workspace. */
  publish?: boolean | string;
};

/**
 * Take a brand from its files. With a source that remembers what both sides
 * last agreed, what changed here since is kept (lib/brand-merge.ts): the
 * files win only where both sides changed the same piece, and each such
 * piece comes back in `conflicts`. The write is one version in the brand's
 * history, so it can be undone like any edit. `pending` says the brand
 * still holds changes the files lack: export them back.
 */
export async function importBrand(caller: Caller, slug: string | undefined, input: ImportInput) {
  const ws = caller.workspace.id;
  const brand = await resolveBrand(ws, slug);
  if (input.publish && !can(caller, "brand.publish")) throw new AssetError("forbidden", `Publishing takes ${needs("brand.publish")}`);
  const checked = await check(caller, input.files, input.assets ?? {});
  refuseFiles(checked);
  const theirs = checked.state!;
  const source = await sourceRow(brand.id);
  const ours = await stateOf(db, brand);
  const base = input.merge === false ? null : (source?.base ?? null);
  let { state: merged, conflicts }: { state: BrandState; conflicts: Conflict[] } = base ? merge(base, ours, theirs) : { state: canonical(theirs), conflicts: [] };
  if (base) {
    // Two sound sides can make an unsound whole: a page here binding a rule the files removed. Then the files, whole.
    const whole = fromFiles(toFiles(merged));
    if (whole.errors.length) {
      conflicts = [...conflicts, { what: "brand", ours: whole.errors[0].message, theirs: "the files, whole" }];
      merged = canonical(theirs);
    }
  }
  const diff = diffStates(ours, merged);
  const pending = !sameState(merged, theirs);
  const out = { brand: brand.slug, diff, conflicts, warnings: checked.warnings, pending };
  if (input.dryRun) return { ...out, applied: false, version: null, published: null };

  const changed = !unchanged(diff);
  if (changed) {
    await tracked(brand.id, caller.actor, [...new Set(diff.rules.map((r) => r.key))], async (tx) => {
      await writeState(tx, ws, brand, ours, merged);
    });
    // Named, it is a checkpoint: the next import starts a version of its own rather than extending this one.
    const name = input.message?.split("\n")[0].trim().slice(0, 120);
    if (name) {
      const v = await latestVersion(db, brand.id);
      if (v && !v.name && !v.publishedAt) await db.update(brandVersions).set({ name }).where(eq(brandVersions.id, v.id));
    }
  }
  if (source) {
    await db
      .update(brandSources)
      .set({ base: canonical(theirs), paths: invert(checked.used), ...(input.commit && { commit: input.commit }), syncedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(brandSources.brandId, brand.id));
  }
  const published = input.publish ? await publishBrand(caller, brand.slug, { note: typeof input.publish === "string" ? input.publish : undefined }) : null;
  const latest = await latestVersion(db, brand.id);
  return { ...out, applied: changed, version: latest?.number ?? null, published: published && !published.unchanged ? published.number : null };
}

// ---- source ---------------------------------------------------------------------

export async function getSource(ws: string, slug: string | undefined) {
  const brand = await resolveBrand(ws, slug);
  const source = await sourceRow(brand.id);
  return source ? presentSource(source, await stateOf(db, brand)) : null;
}

export type SourceInput = {
  remote: string;
  branch?: string;
  path?: string;
  /** What the repository holds now, at `commit`, when the caller just pushed it: recorded as agreed. */
  synced?: { commit: string; files: Files; assets?: Record<string, string> };
};

/** A folder in a repository as stored: no leading or trailing slash, never outside the repository. */
function folder(path: string | undefined) {
  const p = (path ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (p.split("/").some((s) => s === ".." || s === ".")) throw new AssetError("invalid", "path: a folder inside the repository, e.g. brand");
  return p;
}

/**
 * Say where the brand's files live. Moving it to another repository, branch
 * or folder forgets what was agreed, so the next import takes the files
 * whole. With `synced`, the files the caller just pushed at `commit`: they
 * are what both sides agree on now, so nothing is merged or exported again.
 */
export async function setSource(caller: Caller, slug: string | undefined, input: SourceInput) {
  const ws = caller.workspace.id;
  const brand = await resolveBrand(ws, slug);
  const where = { remote: input.remote, branch: input.branch ?? "main", path: folder(input.path) };
  const old = await sourceRow(brand.id);
  const moved = !old || old.remote !== where.remote || old.branch !== where.branch || old.path !== where.path;
  let agreed: Partial<Source> = moved ? { base: null, commit: null, paths: {}, syncedAt: null } : {};
  if (input.synced) {
    const checked = await check(caller, input.synced.files, input.synced.assets ?? {});
    refuseFiles(checked);
    agreed = { base: canonical(checked.state!), commit: input.synced.commit, paths: invert(checked.used), syncedAt: new Date() };
  }
  await db
    .insert(brandSources)
    .values({ brandId: brand.id, ...where, ...agreed })
    .onConflictDoUpdate({ target: brandSources.brandId, set: { ...where, ...agreed, updatedAt: sql`now()` } });
  return presentSource((await sourceRow(brand.id))!, await stateOf(db, brand));
}

export async function deleteSource(caller: Caller, slug: string | undefined) {
  const brand = await resolveBrand(caller.workspace.id, slug);
  const gone = await db.delete(brandSources).where(eq(brandSources.brandId, brand.id)).returning({ id: brandSources.brandId });
  return gone.length > 0;
}

// ---- previews -------------------------------------------------------------------

const previewUrl = (token: string, page?: string) => `${env.APP_URL}/preview/${token}${page ? `/${page}` : ""}`;

export type PreviewInput = { ref: string; title?: string; commit?: string; files: Files; assets?: Record<string, string> };

/**
 * A proposed change's files as a site to read before it lands: checked as an
 * import is, then kept apart from the brand under `ref` (one per pull
 * request, its link the same as it changes), with what it would change of the
 * brand as it stands. Its link needs no account, like a share link: anyone
 * with it reads the preview, and nothing else.
 */
export async function savePreview(caller: Caller, slug: string | undefined, input: PreviewInput) {
  const brand = await resolveBrand(caller.workspace.id, slug);
  const checked = await check(caller, input.files, input.assets ?? {});
  refuseFiles(checked);
  const state = canonical(checked.state!);
  const expiresAt = new Date(Date.now() + PREVIEW_DAYS * 86_400_000);
  await db.delete(brandPreviews).where(lt(brandPreviews.expiresAt, sql`now()`));
  const [row] = await db
    .insert(brandPreviews)
    .values({ brandId: brand.id, ref: input.ref, title: input.title ?? null, commit: input.commit ?? null, token: randomBytes(18).toString("base64url"), state, actor: caller.actor, expiresAt })
    .onConflictDoUpdate({
      target: [brandPreviews.brandId, brandPreviews.ref],
      set: { title: input.title ?? null, commit: input.commit ?? null, state, actor: caller.actor, expiresAt, updatedAt: sql`now()` },
    })
    .returning();
  return {
    brand: brand.slug,
    ref: row.ref,
    url: previewUrl(row.token),
    pages: state.pages.filter((p) => !p.hidden).map((p) => ({ slug: p.slug, title: p.title, url: previewUrl(row.token, p.slug) })),
    expiresAt: row.expiresAt,
    diff: diffStates(await stateOf(db, brand), state),
    warnings: checked.warnings,
  };
}

export async function deletePreview(caller: Caller, slug: string | undefined, ref: string) {
  const brand = await resolveBrand(caller.workspace.id, slug);
  const gone = await db
    .delete(brandPreviews)
    .where(and(eq(brandPreviews.brandId, brand.id), eq(brandPreviews.ref, ref)))
    .returning({ id: brandPreviews.id });
  return gone.length > 0;
}

/** A preview by its link's token, while it opens: its state, and the brand and workspace it belongs to. */
export async function previewByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [row] = await db
    .select({ preview: brandPreviews, brand: brands })
    .from(brandPreviews)
    .innerJoin(brands, eq(brands.id, brandPreviews.brandId))
    .where(and(eq(brandPreviews.token, token), gt(brandPreviews.expiresAt, sql`now()`)));
  return row ?? null;
}

/**
 * A page of a preview, ready to read, for anyone with its link: the site as
 * the proposed files say it, every page open (members' too), its assets
 * signed for visitors without a session. Collections show what a portal
 * visitor would see.
 */
export async function viewPreview(token: string, page: string | null, o: { context?: string; lang?: string; find?: { section: string; q: string } } = {}) {
  const found = await previewByToken(token);
  if (!found) throw new AssetError("not_found", "This preview has closed, or never opened");
  const { preview: p, brand } = found;
  const src = {
    brand: { slug: brand.slug, name: p.state.name },
    rules: p.state.rules,
    pages: p.state.pages,
    theme: p.state.theme,
    version: null,
    brandId: brand.id,
    workspaceId: brand.workspaceId,
  };
  const view = await viewPage(brand.workspaceId, src, page, { ...o, level: "members", sign: (id) => pageSig(id), presets: DEFAULT_PRESETS });
  return {
    preview: { brand: brand.slug, name: p.state.name, ref: p.ref, title: p.title, commit: p.commit, updatedAt: p.updatedAt, expiresAt: p.expiresAt },
    view,
  };
}
