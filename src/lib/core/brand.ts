import { and, asc, desc, eq, inArray, isNotNull, isNull, max, ne, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { assets, brandRuleAssets, brandRules, brands, brandSources, brandVersions, portalBrands } from "@/lib/db/schema";
import { hiddenIn, workspaceById, type Caller } from "@/lib/core/access";
import { NO_OFF, NONE } from "@/lib/access";
import { hubOf, present, resolveBrand, slugify } from "@/lib/core/brands";
import { recordAudit } from "@/lib/core/audit";
import { AssetError } from "@/lib/core/errors";
import { importGoogleFont } from "@/lib/core/fonts";
import { checkLimit } from "@/lib/core/usage";
import { bareGoogleFamily, fontFiles, withFontFiles } from "@/lib/font";
import { hasPreview } from "@/lib/preview";
import { renameThemeKey, type ThemeSettings } from "@/lib/brand-theme";
import { diffRules, extendsLatest, summarize, updatesOf, type SnapRule, type VersionKind } from "@/lib/history";
import { canon, changedPages, isLive, samePages, type SnapPage } from "@/lib/pages";
import { can, needs } from "@/lib/permissions";
import {
  renameInSpec,
  resolve,
  RULE_SPEC,
  RULE_VALUE,
  ruleContext,
  specAssets,
  specKeys,
  type RuleAsset,
  type RuleInput,
  type RuleSpec,
  type RuleType,
} from "@/lib/rules";
import { pageSnapshot, renameKeyInPages, writePages } from "@/lib/core/page-store";

type Row = typeof brandRules.$inferSelect;
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Db = Tx | typeof db;

const toRule = (r: Row, brand: string, ruleAssets: RuleAsset[]) => ({
  id: r.id,
  brand,
  key: r.key,
  label: r.label,
  context: r.context,
  type: r.type,
  value: r.value,
  spec: r.spec,
  usage: r.usage,
  assets: ruleAssets,
  updatedAt: r.updatedAt,
});
export type BrandRule = ReturnType<typeof toRule>;

const where = (brandId: string, key: string, context: string | null) =>
  and(
    eq(brandRules.brandId, brandId),
    eq(brandRules.key, key),
    context === null ? sql`${brandRules.context} is null` : eq(brandRules.context, context),
  );
const label = (key: string, context: string | null) => (context ? `${key} (${context})` : key);

/** A write's problems, all of them, as one error an agent can act on: joined for MCP, a list in REST's detail. */
export function refuse(errors: string[]) {
  if (errors.length) throw new AssetError("invalid", errors.join("\n"), { errors });
}

function checkValue(type: RuleType, raw: unknown) {
  const parsed = RULE_VALUE[type].safeParse(raw);
  if (!parsed.success) throw new AssetError("invalid", `Not a valid ${type} value`, parsed.error.issues);
  return parsed.data;
}

/** A spec checked against the rule's type, like a value. Null clears it, and so does an empty one: nothing set is no spec. */
function checkSpec(type: RuleType, raw: unknown): RuleSpec | null {
  if (raw === null) return null;
  if (!(type in RULE_SPEC)) throw new AssetError("invalid", `A ${type} rule takes no spec`);
  const parsed = RULE_SPEC[type as keyof typeof RULE_SPEC].safeParse(raw);
  if (!parsed.success) throw new AssetError("invalid", `Not a valid ${type} spec`, parsed.error.issues);
  return Object.keys(parsed.data).length ? parsed.data : null;
}

/**
 * What written specs name must be there once the write is done: their pair and
 * gradient stops color rules of the brand, their texture an asset. Checked
 * after a whole batch, so colors and the gradient naming them can arrive together.
 */
async function checkSpecRefs(tx: Tx, ws: string, brandId: string, written: { at: string; spec: RuleSpec | null }[]) {
  const named = written.filter((w) => specKeys(w.spec).length || specAssets(w.spec).length);
  if (!named.length) return;
  const colors = new Set(
    (await tx.select({ key: brandRules.key }).from(brandRules).where(and(eq(brandRules.brandId, brandId), eq(brandRules.type, "color")))).map((r) => r.key),
  );
  const ids = [...new Set(named.flatMap((w) => specAssets(w.spec)))];
  const live = new Set(
    ids.length
      ? (await tx.select({ id: assets.id }).from(assets).where(and(eq(assets.workspaceId, ws), isNull(assets.deletedAt), inArray(assets.id, ids)))).map((a) => a.id)
      : [],
  );
  const errors = named.flatMap((w) => [
    ...specKeys(w.spec)
      .filter((k) => !colors.has(k))
      .map((k) => `${w.at}: names ${k}, which is not a color rule of this brand`),
    ...specAssets(w.spec)
      .filter((id) => !live.has(id))
      .map((id) => `${w.at}.texture: no asset ${id}`),
  ]);
  refuse(errors);
}

/**
 * Each rule's assets, in order, with what a reader needs to tell them apart
 * (title, size, type) so nobody has to look each one up.
 */
async function assetsOf(ruleIds: string[], tx: Db = db) {
  const out = new Map<string, Required<Omit<RuleAsset, "kept">>[]>(ruleIds.map((id) => [id, []]));
  if (!ruleIds.length) return out;
  const rows = await tx
    .select({
      ruleId: brandRuleAssets.ruleId,
      id: brandRuleAssets.assetId,
      rendition: brandRuleAssets.rendition,
      title: sql<string | null>`${assets.metadata} ->> 'title'`,
      filename: assets.filename,
      mime: assets.mime,
      width: assets.width,
      height: assets.height,
      probe: assets.probe,
    })
    .from(brandRuleAssets)
    .innerJoin(assets, and(eq(assets.id, brandRuleAssets.assetId), isNull(assets.deletedAt)))
    .where(inArray(brandRuleAssets.ruleId, ruleIds))
    .orderBy(asc(brandRuleAssets.position));
  for (const { ruleId, probe, ...a } of rows) out.get(ruleId)!.push({ ...a, preview: hasPreview({ mime: a.mime, probe }) });
  return out;
}

/**
 * Replace a rule's assets. Every id must be a real asset, and a rendition
 * needs one that can be rendered: a typo is a 422, not a silent gap.
 */
async function setAssets(tx: Tx, ws: string, ruleId: string, list: RuleAsset[]) {
  if (list.length) {
    const found = await tx
      .select({ id: assets.id, mime: assets.mime, filename: assets.filename, probe: assets.probe })
      .from(assets)
      .where(and(eq(assets.workspaceId, ws), isNull(assets.deletedAt), inArray(assets.id, list.map((a) => a.id))));
    const missing = list.filter((a) => !found.some((f) => f.id === a.id));
    if (missing.length) throw new AssetError("invalid", `No such asset: ${missing.map((a) => a.id).join(", ")}`);
    const flat = found.find((f) => !hasPreview(f) && list.some((a) => a.id === f.id && a.rendition));
    if (flat) throw new AssetError("invalid", `${flat.filename} (${flat.mime}) has no renditions; use the original`);
  }
  await tx.delete(brandRuleAssets).where(eq(brandRuleAssets.ruleId, ruleId));
  if (list.length) {
    await tx
      .insert(brandRuleAssets)
      .values(list.map((a, position) => ({ ruleId, assetId: a.id, rendition: a.rendition, position })));
  }
}

const ORDER = [asc(brandRules.position), asc(brandRules.key), sql`${brandRules.context} asc nulls first`];

// ---- history ----------------------------------------------------------------

/** The brand's rule set as history keeps it. A label or spec is kept only when set (D5). */
export async function snapshot(tx: Db, brandId: string): Promise<SnapRule[]> {
  const rows = await tx.select().from(brandRules).where(eq(brandRules.brandId, brandId)).orderBy(...ORDER);
  const refs = await assetsOf(
    rows.map((r) => r.id),
    tx,
  );
  return rows.map((r) => ({
    key: r.key,
    context: r.context,
    type: r.type,
    value: r.value,
    usage: r.usage,
    position: r.position,
    // History keeps references only: a later retitle is not a rule change.
    assets: refs.get(r.id)!.map(({ id, rendition }) => ({ id, rendition })),
    ...(r.label && { label: r.label }),
    ...(r.spec && { spec: r.spec }),
  }));
}

export async function themeOf(tx: Db, brandId: string): Promise<ThemeSettings> {
  const [b] = await tx.select({ theme: brands.theme }).from(brands).where(eq(brands.id, brandId));
  return b.theme;
}

export async function latestVersion(tx: Db, brandId: string) {
  const [v] = await tx
    .select()
    .from(brandVersions)
    .where(eq(brandVersions.brandId, brandId))
    .orderBy(desc(brandVersions.number))
    .limit(1);
  return v;
}

/** What portals show (D15): the brand's latest publish, or the publish `number` names (BrandHub's name@3). */
export async function publishedVersion(tx: Db, brandId: string, number?: number) {
  const [v] = await tx
    .select()
    .from(brandVersions)
    .where(and(eq(brandVersions.brandId, brandId), isNotNull(brandVersions.publishedAt), number === undefined ? undefined : eq(brandVersions.number, number)))
    .orderBy(desc(brandVersions.number))
    .limit(1);
  return v;
}

/** Who publishes for nobody in particular: the migration, and a carried brand's first baseline. */
const SYSTEM = "artbucket";

/**
 * The latest `limit` publishes, newest first, each with what it changed
 * since the publish before it (lib/history.ts updatesOf): What's new.
 */
export async function listUpdates(brandId: string, limit = 20) {
  const rows = await db
    .select({
      number: brandVersions.number,
      rules: brandVersions.snapshot,
      pages: brandVersions.pages,
      publishedAt: brandVersions.publishedAt,
      publishedBy: brandVersions.publishedBy,
      note: brandVersions.note,
      noteImage: brandVersions.noteImage,
    })
    .from(brandVersions)
    .where(and(eq(brandVersions.brandId, brandId), isNotNull(brandVersions.publishedAt)))
    .orderBy(desc(brandVersions.number))
    .limit(limit + 1);
  return updatesOf(rows, limit);
}

async function addVersion(
  tx: Tx,
  brandId: string,
  v: {
    kind: VersionKind;
    actor: string;
    changed: string[];
    snapshot: SnapRule[];
    pages: SnapPage[];
    theme: ThemeSettings;
    restoredFrom?: number;
    publishedAt?: SQL;
    publishedBy?: string;
  },
) {
  const latest = await latestVersion(tx, brandId);
  await tx.insert(brandVersions).values({ brandId, number: (latest?.number ?? 0) + 1, ...v });
}

/**
 * A brand's turn for a change (an advisory lock), and its row held against a
 * delete until the change is in: one deleted while this waited is a 404.
 */
async function lockBrand(tx: Tx, brandId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${brandId}))`);
  const [b] = await tx.select({ id: brands.id }).from(brands).where(eq(brands.id, brandId)).for("key share");
  if (!b) throw new AssetError("not_found", "This brand was just deleted");
}

/**
 * Run a change to a brand's rules, pages or theme and record it in the brand's
 * history, in one transaction. Changes to one brand take turns (an advisory
 * lock), so version numbers never collide and a snapshot is never of a
 * half-made change.
 *
 * The first change to a brand with no history records the state before it,
 * so even that change has something to diff against and restore to. When a
 * portal carries the brand, that baseline is written as published: it is what
 * visitors saw, live, and they keep seeing it rather than the edit (D15). Pages
 * changed are named in `changed` by themselves ("page:logo"), and so is the theme.
 */
export async function tracked<T>(brandId: string, actor: string, changed: string[], fn: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await lockBrand(tx, brandId);
    if (!(await latestVersion(tx, brandId))) {
      const [carried] = await tx.select({ id: portalBrands.portalId }).from(portalBrands).where(eq(portalBrands.brandId, brandId)).limit(1);
      await addVersion(tx, brandId, {
        kind: "baseline",
        actor: SYSTEM,
        changed: [],
        snapshot: await snapshot(tx, brandId),
        pages: await pageSnapshot(tx, brandId),
        theme: await themeOf(tx, brandId),
        ...(carried && { publishedAt: sql`now()`, publishedBy: SYSTEM }),
      });
    }
    const out = await fn(tx);
    const after = await snapshot(tx, brandId);
    const pages = await pageSnapshot(tx, brandId);
    const theme = await themeOf(tx, brandId);
    const latest = (await latestVersion(tx, brandId))!;
    // Compared as rules, pages and settings, not as JSON: jsonb gives keys back in its own order.
    // A version from before themes has none, which reads as the empty theme every brand starts with.
    const themed = canon(latest.theme ?? {}) !== canon(theme);
    if (!diffRules(latest.snapshot, after).length && samePages(latest.pages, pages) && !themed) return out;
    const all = [...new Set([...changed, ...changedPages(latest.pages, pages), ...(themed ? ["theme"] : [])])];
    if (extendsLatest(latest, actor, new Date())) {
      await tx
        .update(brandVersions)
        .set({ snapshot: after, pages, theme, changed: [...new Set([...latest.changed, ...all])], updatedAt: sql`now()` })
        .where(eq(brandVersions.id, latest.id));
    } else {
      await addVersion(tx, brandId, { kind: "edit", actor, changed: all, snapshot: after, pages, theme });
    }
    return out;
  });
}

// ---- rules ------------------------------------------------------------------

/**
 * A brand's rules in page order, defaults before their context versions.
 * With a context, one per key: see lib/rules.ts. A context nobody defined
 * just gets the defaults. With an asset, only the rules that point at it,
 * across every brand unless one is named.
 */
export async function listRules(ws: string, opts: { brand?: string; context?: string; asset?: string } = {}) {
  const { context, asset } = opts;
  if (context !== undefined && !ruleContext.safeParse(context).success) {
    throw new AssetError("invalid", `Not a context: "${context}". Contexts are slugs, e.g. dark-background`);
  }
  if (asset !== undefined && !z.uuid().safeParse(asset).success) throw new AssetError("invalid", `Not an asset id: "${asset}"`);
  const brand = asset !== undefined && opts.brand === undefined ? null : await resolveBrand(ws, opts.brand);
  const rows = await db
    .select({ rule: brandRules, brand: brands.slug })
    .from(brandRules)
    .innerJoin(brands, eq(brands.id, brandRules.brandId))
    .where(
      and(
        eq(brands.workspaceId, ws),
        brand ? eq(brandRules.brandId, brand.id) : undefined,
        asset === undefined
          ? undefined
          : inArray(
              brandRules.id,
              db.select({ id: brandRuleAssets.ruleId }).from(brandRuleAssets).where(eq(brandRuleAssets.assetId, asset)),
            ),
      ),
    )
    .orderBy(...ORDER);
  const picked = context === undefined ? rows : resolve(rows.map((r) => ({ ...r, ...r.rule })), context);
  const refs = await assetsOf(picked.map((r) => r.rule.id));
  return picked.map((r) => toRule(r.rule, r.brand, refs.get(r.rule.id)!));
}

/** Every context some rule of the brand is scoped to. */
export async function listContexts(ws: string, slug?: string): Promise<string[]> {
  const brand = await resolveBrand(ws, slug);
  const rows = await db
    .selectDistinct({ context: brandRules.context })
    .from(brandRules)
    .where(and(eq(brandRules.brandId, brand.id), isNotNull(brandRules.context)))
    .orderBy(asc(brandRules.context));
  return rows.map((r) => r.context!);
}

/**
 * Put these keys in this order. Positions are only compared within a section,
 * so a section can be ordered on its own; a key's context versions move with it.
 */
export async function orderRules(caller: Caller, slug: string | undefined, keys: string[]) {
  const brand = await resolveBrand(caller.workspace.id, slug);
  return tracked(brand.id, caller.actor, keys, async (tx) => {
    const found = await tx
      .selectDistinct({ key: brandRules.key })
      .from(brandRules)
      .where(and(eq(brandRules.brandId, brand.id), inArray(brandRules.key, keys)));
    const missing = keys.filter((k) => !found.some((f) => f.key === k));
    if (missing.length) throw new AssetError("invalid", `No such rule: ${missing.join(", ")}`);
    for (const [position, key] of keys.entries()) {
      await tx
        .update(brandRules)
        .set({ position })
        .where(and(eq(brandRules.brandId, brand.id), eq(brandRules.key, key)));
    }
  });
}

export async function createRule(caller: Caller, slug: string | undefined, input: RuleInput) {
  const brand = await resolveBrand(caller.workspace.id, slug);
  const context = input.context ?? null;
  const value = checkValue(input.type, input.value);
  const spec = checkSpec(input.type, ("spec" in input && input.spec) || null);
  const made = await tracked(brand.id, caller.actor, [input.key], async (tx) => {
    // A new version of a key sits with it; a new key goes to the end.
    const inBrand = eq(brandRules.brandId, brand.id);
    const [same] = await tx
      .select({ position: brandRules.position })
      .from(brandRules)
      .where(and(inBrand, eq(brandRules.key, input.key)))
      .limit(1);
    const [last] = await tx.select({ n: max(brandRules.position) }).from(brandRules).where(inBrand);
    const position = same?.position ?? (last?.n ?? -1) + 1;
    const [row] = await tx
      .insert(brandRules)
      .values({ brandId: brand.id, key: input.key, label: input.label ?? null, context, type: input.type, value, spec, usage: input.usage || null, position })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new AssetError("conflict", `${label(input.key, context)} already exists; edit it instead`);
    await setAssets(tx, caller.workspace.id, row.id, input.assets ?? []);
    await checkSpecRefs(tx, caller.workspace.id, brand.id, [{ at: "spec", spec }]);
    return toRule(row, brand.slug, (await assetsOf([row.id], tx)).get(row.id)!);
  });
  return (await hostGoogleFonts(caller, brand.id, [made.key])) ? { ...made, assets: (await assetsOf([made.id])).get(made.id)! } : made;
}

async function ruleWithBrand(ws: string, id: string) {
  const [r] = await db
    .select({ rule: brandRules, brand: brands.slug })
    .from(brandRules)
    .innerJoin(brands, eq(brands.id, brandRules.brandId))
    .where(and(eq(brandRules.id, id), eq(brands.workspaceId, ws)));
  return r;
}

export async function updateRule(
  caller: Caller,
  id: string,
  patch: {
    key?: string;
    label?: string | null;
    value?: unknown;
    spec?: unknown;
    usage?: string | null;
    context?: string | null;
    assets?: RuleAsset[];
  },
) {
  const found = await ruleWithBrand(caller.workspace.id, id);
  if (!found) return null;
  const { rule: current, brand } = found;
  const changed = [...new Set([current.key, ...(patch.key ? [patch.key] : [])])];
  const out = await tracked(current.brandId, caller.actor, changed, async (tx) => {
    const set: Partial<Row> = {};
    if (patch.label !== undefined) set.label = patch.label || null;
    if (patch.value !== undefined) set.value = checkValue(current.type, patch.value);
    if (patch.spec !== undefined) set.spec = checkSpec(current.type, patch.spec);
    if (patch.usage !== undefined) set.usage = patch.usage || null;
    if (patch.context !== undefined && patch.context !== current.context) {
      const [taken] = await tx
        .select({ id: brandRules.id })
        .from(brandRules)
        .where(and(where(current.brandId, current.key, patch.context), ne(brandRules.id, id)));
      if (taken) throw new AssetError("conflict", `${label(current.key, patch.context)} already exists`);
      set.context = patch.context;
    }
    if (patch.assets) await setAssets(tx, caller.workspace.id, id, patch.assets);
    // A key is shared by a rule's context versions: renaming one renames them all.
    if (patch.key !== undefined && patch.key !== current.key) {
      const [taken] = await tx
        .select({ id: brandRules.id })
        .from(brandRules)
        .where(and(eq(brandRules.brandId, current.brandId), eq(brandRules.key, patch.key)))
        .limit(1);
      if (taken) throw new AssetError("conflict", `${patch.key} already exists`);
      await tx
        .update(brandRules)
        .set({ key: patch.key, updatedAt: sql`now()` })
        .where(and(eq(brandRules.brandId, current.brandId), eq(brandRules.key, current.key), ne(brandRules.id, id)));
      // Pages, other rules' specs and the theme name rules by key: they follow the rename.
      await renameKeyInPages(tx, current.brandId, current.key, patch.key);
      await renameInSpecs(tx, current.brandId, current.key, patch.key);
      const theme = renameThemeKey(await themeOf(tx, current.brandId), current.key, patch.key);
      if (theme) await tx.update(brands).set({ theme }).where(eq(brands.id, current.brandId));
      set.key = patch.key;
    }
    const [row] =
      Object.keys(set).length || patch.assets
        ? await tx
            .update(brandRules)
            .set({ ...set, updatedAt: sql`now()` })
            .where(eq(brandRules.id, id))
            .returning()
        : [current];
    // Deleted since it was read.
    if (!row) return null;
    if (set.spec) await checkSpecRefs(tx, caller.workspace.id, current.brandId, [{ at: "spec", spec: set.spec }]);
    return toRule(row, brand, (await assetsOf([id], tx)).get(id)!);
  });
  return out && (await hostGoogleFonts(caller, current.brandId, [out.key])) ? { ...out, assets: (await assetsOf([id])).get(id)! } : out;
}

/**
 * A Google Fonts face is served from here, like any font, so no page sends its
 * readers to Google: a font rule whose spec.source is google and that has no
 * font file gets its family's files (lib/core/fonts.ts), after the write that
 * made or changed it (`keys`), and before a publish (every font rule), which
 * catches rules written before the core did this. A brand kept in Git is left
 * alone: its files are its repository's to hold. Google out of reach, or a
 * caller who can't upload: the rule stays without, and pages set it in its
 * fallback. True when it attached any.
 */
async function hostGoogleFonts(caller: Caller, brandId: string, keys?: string[]) {
  if (keys?.length === 0) return false;
  const [git] = await db.select({ id: brandSources.brandId }).from(brandSources).where(eq(brandSources.brandId, brandId));
  if (git) return false;
  const rows = await db
    .select({ id: brandRules.id, key: brandRules.key, type: brandRules.type, value: brandRules.value, spec: brandRules.spec })
    .from(brandRules)
    .where(and(eq(brandRules.brandId, brandId), eq(brandRules.type, "font"), sql`${brandRules.spec} ->> 'source' = 'google'`, keys && inArray(brandRules.key, keys)));
  const files = await assetsOf(rows.map((r) => r.id));
  const bare = rows.flatMap((r) => {
    const family = bareGoogleFamily({ ...r, assets: files.get(r.id)! }, fontIn(files.get(r.id)!));
    return family ? [{ ...r, family }] : [];
  });
  const imported = await familyFiles(caller, bare.map((r) => r.family));
  const add = bare.flatMap((r) => {
    const ids = imported.get(r.family.toLowerCase());
    return ids?.length ? [{ rule: r.id, key: r.key, ids }] : [];
  });
  if (!add.length) return false;
  try {
    await tracked(brandId, caller.actor, [...new Set(add.map((a) => a.key))], (tx) => attachFiles(tx, add));
  } catch (err) {
    // The write it follows is done: a brand or file deleted meanwhile only leaves the rule as it was.
    console.warn("[artbucket] Couldn't attach Google Fonts files:", (err as Error).message);
    return false;
  }
  return true;
}

/** Which of these assets are font files, by their type and name. */
const fontIn = (list: { id: string; mime?: string | null; filename?: string | null }[]) => {
  const fonts = new Set(fontFiles({ assets: list }).map((a) => a.id));
  return (id: string) => fonts.has(id);
};

/**
 * Each family's files from Google Fonts, imported once, keyed by lowercase
 * family; one that won't import is left out, and logged.
 */
async function familyFiles(caller: Caller, families: string[]) {
  const out = new Map<string, string[]>();
  for (const family of families) {
    const name = family.toLowerCase();
    if (out.has(name)) continue;
    try {
      out.set(name, (await importGoogleFont(caller, { family })).assets.map((a) => a.id));
    } catch (err) {
      console.warn(`[artbucket] ${family} from Google Fonts stays unhosted:`, (err as Error).message);
      out.set(name, []);
    }
  }
  return out;
}

/** Files after a rule's own, in order; a rule removed since it was read takes nothing. */
async function attachFiles(tx: Tx, add: { rule: string; ids: string[] }[]) {
  for (const { rule, ids } of add) {
    const [live] = await tx.select({ id: brandRules.id }).from(brandRules).where(eq(brandRules.id, rule));
    if (!live) continue;
    const [last] = await tx.select({ n: max(brandRuleAssets.position) }).from(brandRuleAssets).where(eq(brandRuleAssets.ruleId, rule));
    const from = (last?.n ?? -1) + 1;
    await tx.insert(brandRuleAssets).values(ids.map((assetId, i) => ({ ruleId: rule, assetId, rendition: null, position: from + i }))).onConflictDoNothing();
  }
}

/** Brands the font backfill takes a run. */
const FONT_BATCH = 20;

const IS_FONT = sql.raw(`(a.deleted_at is null and (a.mime like 'font/%' or a.filename ~* '\\.(woff2?|[ot]tf)$'))`);

/**
 * Brands from before the core hosted Google faces itself (hostGoogleFonts)
 * get their files, so what they published keeps its look: up to `limit`
 * brands a run, from the sweep (lib/core/sweep.ts), whose draft rules or any
 * version hold a Google face with no font file. Each family is imported
 * once a run, as the workspace's own; its files go onto the draft's rules,
 * and into every version's stored rules, so releases (portals, BrandHub,
 * brand.json) and history read the same as the draft: no version is made,
 * and none changes its number, note or publish. A brand kept in Git keeps
 * its draft (its files are the repository's), but its releases are patched:
 * nothing goes back to the repository from them, and its next push releases
 * what the repository holds. Picked at random, so a family Google doesn't
 * have (tried again each run, and logged) never holds up the rest.
 */
export async function hostFontsBackfill(limit = FONT_BATCH) {
  const picked = await db.execute<{ id: string; workspace_id: string; git: boolean }>(sql`
    select b.id, b.workspace_id, exists (select 1 from brand_sources s where s.brand_id = b.id) as git
    from brands b
    where exists (
      select 1 from brand_rules r
      where r.brand_id = b.id and r.type = 'font' and r.spec ->> 'source' = 'google'
        and not exists (select 1 from brand_sources s where s.brand_id = b.id)
        and not exists (select 1 from brand_rule_assets ra join assets a on a.id = ra.asset_id where ra.rule_id = r.id and ${IS_FONT})
    ) or exists (
      select 1 from brand_versions v, jsonb_array_elements(v.snapshot) x
      where v.brand_id = b.id and x ->> 'type' = 'font' and x -> 'spec' ->> 'source' = 'google'
        and not exists (select 1 from jsonb_array_elements(x -> 'assets') e join assets a on a.id = (e ->> 'id')::uuid where ${IS_FONT})
    )
    order by random()
    limit ${limit}`);
  let hosted = 0;
  for (const b of picked) {
    try {
      if (await backfillBrand(b.id, b.workspace_id, b.git)) hosted++;
    } catch (err) {
      console.warn(`[artbucket] Brand ${b.id}'s Google faces stay unhosted this run:`, (err as Error).message);
    }
  }
  return hosted;
}

async function backfillBrand(brandId: string, ws: string, git: boolean) {
  const [workspace, hidden] = await Promise.all([workspaceById(ws), hiddenIn(ws)]);
  if (!workspace) return false;
  const caller: Caller = { workspace, scope: "write", narrow: NONE, off: NO_OFF, hidden, orgScope: null, actor: SYSTEM, user: null, key: null, ip: null };
  // Read twice: once to know what to import (outside a transaction, it fetches), then under the brand's lock to write.
  const read = async (tx: Db) => {
    const rules = git ? [] : await tx.select().from(brandRules).where(and(eq(brandRules.brandId, brandId), eq(brandRules.type, "font")));
    const own = await assetsOf(rules.map((r) => r.id), tx);
    const versions = await tx.select({ id: brandVersions.id, snapshot: brandVersions.snapshot }).from(brandVersions).where(eq(brandVersions.brandId, brandId));
    const ids = [...new Set(versions.flatMap((v) => v.snapshot.flatMap((r) => r.assets.map((a) => a.id))))];
    const known = ids.length
      ? await tx.select({ id: assets.id, mime: assets.mime, filename: assets.filename }).from(assets).where(and(inArray(assets.id, ids), isNull(assets.deletedAt)))
      : [];
    const draft = rules.map((r) => ({ ...r, assets: own.get(r.id)! }));
    return { draft, versions, isFont: fontIn(known) };
  };
  const before = await read(db);
  const families = [
    ...before.draft.map((r) => bareGoogleFamily(r, fontIn(r.assets))),
    ...before.versions.flatMap((v) => v.snapshot.map((r) => bareGoogleFamily(r, before.isFont))),
  ].filter((f): f is string => !!f);
  const files = await familyFiles(caller, families);
  if (![...files.values()].some((ids) => ids.length)) return false;
  await db.transaction(async (tx) => {
    await lockBrand(tx, brandId);
    const now = await read(tx);
    await attachFiles(
      tx,
      now.draft.flatMap((r) => {
        const ids = files.get(bareGoogleFamily(r, fontIn(r.assets))?.toLowerCase() ?? "");
        return ids?.length ? [{ rule: r.id, ids }] : [];
      }),
    );
    for (const v of now.versions) {
      const snapshot = withFontFiles(v.snapshot, now.isFont, files);
      if (snapshot.some((r, i) => r !== v.snapshot[i])) await tx.update(brandVersions).set({ snapshot }).where(eq(brandVersions.id, v.id));
    }
  });
  return true;
}

/** A rule's key changed: other rules' pairs and gradient stops follow it. */
async function renameInSpecs(tx: Tx, brandId: string, from: string, to: string) {
  const rows = await tx
    .select({ id: brandRules.id, spec: brandRules.spec })
    .from(brandRules)
    .where(and(eq(brandRules.brandId, brandId), isNotNull(brandRules.spec)));
  for (const r of rows) {
    const spec = renameInSpec(r.spec!, from, to);
    if (spec) await tx.update(brandRules).set({ spec, updatedAt: sql`now()` }).where(eq(brandRules.id, r.id));
  }
}

export async function deleteRule(caller: Caller, id: string) {
  const found = await ruleWithBrand(caller.workspace.id, id);
  if (!found) return false;
  return tracked(found.rule.brandId, caller.actor, [found.rule.key], async (tx) => {
    const gone = await tx.delete(brandRules).where(eq(brandRules.id, id)).returning({ id: brandRules.id });
    return gone.length > 0;
  });
}

/**
 * Many rules at once, one version: each `set` rule is made, or changed if its
 * key and context exist (its type can't change: remove it first), and each
 * `remove` goes. A remove without a context takes the key with its context
 * versions. All or nothing: one bad rule and none are written.
 */
export async function setRules(
  caller: Caller,
  slug: string | undefined,
  input: { set?: RuleInput[]; remove?: { key: string; context?: string | null }[] },
) {
  const brand = await resolveBrand(caller.workspace.id, slug);
  const set = input.set ?? [];
  const remove = input.remove ?? [];
  const values = set.map((r) => checkValue(r.type, r.value));
  // undefined: left as it is; null: cleared.
  const specs = set.map((r) => ("spec" in r && r.spec !== undefined ? checkSpec(r.type, r.spec) : undefined));
  const out = { created: [] as string[], updated: [] as string[], removed: [] as string[] };
  await tracked(brand.id, caller.actor, [...new Set([...set, ...remove].map((r) => r.key))], async (tx) => {
    for (const r of remove) {
      const gone = await tx
        .delete(brandRules)
        .where(r.context === undefined ? and(eq(brandRules.brandId, brand.id), eq(brandRules.key, r.key)) : where(brand.id, r.key, r.context))
        .returning({ key: brandRules.key, context: brandRules.context });
      if (!gone.length) throw new AssetError("not_found", `No rule ${label(r.key, r.context ?? null)}`);
      out.removed.push(...gone.map((g) => label(g.key, g.context)));
    }
    for (const [i, r] of set.entries()) {
      const context = r.context ?? null;
      const [row] = await tx.select().from(brandRules).where(where(brand.id, r.key, context));
      if (row && row.type !== r.type) {
        throw new AssetError("invalid", `${label(r.key, context)} is a ${row.type} rule; its type can't change. Remove it first`);
      }
      let id = row?.id;
      if (row) {
        await tx
          .update(brandRules)
          .set({
            value: values[i],
            ...(r.label !== undefined && { label: r.label || null }),
            ...(specs[i] !== undefined && { spec: specs[i] }),
            ...(r.usage !== undefined && { usage: r.usage || null }),
            updatedAt: sql`now()`,
          })
          .where(eq(brandRules.id, row.id));
        out.updated.push(label(r.key, context));
      } else {
        const inBrand = eq(brandRules.brandId, brand.id);
        const [same] = await tx.select({ position: brandRules.position }).from(brandRules).where(and(inBrand, eq(brandRules.key, r.key))).limit(1);
        const [last] = await tx.select({ n: max(brandRules.position) }).from(brandRules).where(inBrand);
        const [made] = await tx
          .insert(brandRules)
          .values({
            brandId: brand.id,
            key: r.key,
            label: r.label ?? null,
            context,
            type: r.type,
            value: values[i],
            spec: specs[i] ?? null,
            usage: r.usage || null,
            position: same?.position ?? (last?.n ?? -1) + 1,
          })
          .returning({ id: brandRules.id });
        id = made.id;
        out.created.push(label(r.key, context));
      }
      if (r.assets || !row) await setAssets(tx, caller.workspace.id, id!, r.assets ?? []);
    }
    await checkSpecRefs(
      tx,
      caller.workspace.id,
      brand.id,
      specs.map((spec, i) => ({ at: `set[${i}].spec`, spec: spec ?? null })),
    );
  });
  await hostGoogleFonts(caller, brand.id, set.filter((r) => r.type === "font").map((r) => r.key));
  return { brand: brand.slug, ...out };
}

/** Write a snapshot's rules into a brand, which has none. Assets deleted since are left out and counted. */
export async function writeRules(tx: Tx, ws: string, brandId: string, rules: SnapRule[]) {
  const ids = [...new Set(rules.flatMap((r) => r.assets.map((a) => a.id)))];
  const live = new Set(
    ids.length
      ? (await tx.select({ id: assets.id }).from(assets).where(and(eq(assets.workspaceId, ws), isNull(assets.deletedAt), inArray(assets.id, ids)))).map((a) => a.id)
      : [],
  );
  let dropped = 0;
  for (const r of rules) {
    const [row] = await tx
      .insert(brandRules)
      .values({
        brandId,
        key: r.key,
        label: r.label ?? null,
        context: r.context,
        type: r.type,
        value: r.value,
        spec: r.spec ?? null,
        usage: r.usage,
        position: r.position,
      })
      .returning({ id: brandRules.id });
    const keep = r.assets.filter((a) => live.has(a.id));
    dropped += r.assets.length - keep.length;
    if (keep.length) {
      await tx
        .insert(brandRuleAssets)
        .values(keep.map((a, position) => ({ ruleId: row.id, assetId: a.id, rendition: a.rendition, position })));
    }
  }
  return dropped;
}

// ---- brands and versions ----------------------------------------------------

/**
 * A new brand, empty or as a copy of another's current rules, pages and
 * theme. Its history starts with that state as version 1.
 */
/**
 * A new brand: empty, a copy of another of the workspace's (`from`), or
 * `seed`, what a BrandHub brand's release holds, its files already copied
 * here (lib/core/hub.ts startFrom).
 */
export async function createBrand(
  caller: Caller,
  input: { name: string; slug?: string; from?: string; domain?: string | null },
  seed?: { rules: SnapRule[]; pages: SnapPage[]; theme: ThemeSettings; forkedFrom: string },
) {
  const ws = caller.workspace.id;
  const slug = input.slug ?? slugify(input.name);
  if (!slug) throw new AssetError("invalid", "Give the brand a name with a letter or a number in it");
  await checkLimit(caller.workspace.organizationId, "brands");
  const source = input.from && !seed ? await resolveBrand(ws, input.from) : null;
  return db.transaction(async (tx) => {
    await checkLimit(caller.workspace.organizationId, "brands", { tx });
    const theme = seed?.theme ?? (source ? source.theme : {});
    const [row] = await tx
      .insert(brands)
      .values({ workspaceId: ws, slug, name: input.name, theme, forkedFrom: seed?.forkedFrom ?? null, domain: input.domain ?? null })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new AssetError("conflict", `A brand "${slug}" exists`);
    const rules = seed?.rules ?? (source ? await snapshot(tx, source.id) : []);
    await writeRules(tx, ws, row.id, rules);
    // Its pages too: they bind by key, and the keys came along.
    const pages = seed?.pages ?? (source ? await pageSnapshot(tx, source.id) : []);
    await writePages(tx, row.id, pages);
    await tx.insert(brandVersions).values({
      brandId: row.id,
      number: 1,
      kind: "baseline",
      actor: caller.actor,
      changed: [],
      snapshot: await snapshot(tx, row.id),
      pages,
      theme,
    });
    return { ...present(row), rules: rules.length };
  });
}

const meta = (v: typeof brandVersions.$inferSelect) => ({
  number: v.number,
  kind: v.kind,
  name: v.name,
  actor: v.actor,
  changed: v.changed,
  restoredFrom: v.restoredFrom,
  summary:
    v.kind === "baseline"
      ? "Where the history starts"
      : v.kind === "restore"
        ? v.restoredFrom
          ? `Restored version ${v.restoredFrom}`
          : "Restored an earlier version"
        : summarize(v.changed),
  rules: v.snapshot.length,
  pages: v.pages?.length ?? null,
  publishedAt: v.publishedAt,
  publishedBy: v.publishedBy,
  note: v.note,
  noteImage: v.noteImage,
  createdAt: v.createdAt,
  updatedAt: v.updatedAt,
});

/** A brand's history, newest first, without the snapshots. */
export async function listVersions(ws: string, slug: string) {
  const brand = await resolveBrand(ws, slug);
  const rows = await db
    .select()
    .from(brandVersions)
    .where(eq(brandVersions.brandId, brand.id))
    .orderBy(desc(brandVersions.number));
  return rows.map(meta);
}

async function version(brandId: string, number: number) {
  const [v] = await db
    .select()
    .from(brandVersions)
    .where(and(eq(brandVersions.brandId, brandId), eq(brandVersions.number, number)));
  return v;
}

/**
 * One version: its rules, and what changed to make it. Compared with the
 * version before it unless `against` names another version, or "current".
 */
export async function getVersion(ws: string, slug: string, number: number, against?: number | "current") {
  const brand = await resolveBrand(ws, slug);
  const v = await version(brand.id, number);
  if (!v) return null;
  let base: SnapRule[] = [];
  let basePages: SnapPage[] | null = null;
  let baseLabel: number | "current" | null = null;
  let themeChanged: boolean;
  if (against === "current") {
    base = await snapshot(db, brand.id);
    basePages = await pageSnapshot(db, brand.id);
    baseLabel = "current";
    // A version from before themes restores none, so it would change none.
    themeChanged = v.theme !== null && canon(v.theme) !== canon(await themeOf(db, brand.id));
  } else {
    const n = against ?? number - 1;
    const other = n >= 1 ? await version(brand.id, n) : undefined;
    if (against !== undefined && !other) throw new AssetError("not_found", `No version ${against}`);
    base = other?.snapshot ?? [];
    basePages = other?.pages ?? null;
    baseLabel = other ? n : null;
    // As tracked reads them: no theme is the empty one every brand starts with.
    themeChanged = canon(v.theme ?? {}) !== canon(other?.theme ?? {});
  }
  // "current" reads as how to get from this version to now; a number, how this version came about.
  const diff = against === "current" ? diffRules(v.snapshot, base) : diffRules(base, v.snapshot);
  // A version from before pages says nothing about them, so it changed none.
  const pageDiff = !v.pages ? [] : against === "current" ? changedPages(v.pages, basePages!) : changedPages(basePages, v.pages);
  return { ...meta(v), rules: v.snapshot, pages: v.pages, theme: v.theme, against: baseLabel, diff, pageDiff, themeChanged };
}

/** Name a version, to keep it as a checkpoint; null clears it. */
export async function nameVersion(ws: string, slug: string, number: number, name: string | null) {
  const brand = await resolveBrand(ws, slug);
  const [row] = await db
    .update(brandVersions)
    .set({ name })
    .where(and(eq(brandVersions.brandId, brand.id), eq(brandVersions.number, number)))
    .returning();
  return row ? meta(row) : null;
}

/**
 * Put a version's rules, pages and theme back. The brand's rules are replaced,
 * and the restore is itself a new version, so restoring can be undone the same way.
 */
export async function restoreVersion(caller: Caller, slug: string, number: number) {
  const brand = await resolveBrand(caller.workspace.id, slug);
  const v = await version(brand.id, number);
  if (!v) return null;
  return db.transaction(async (tx) => {
    await lockBrand(tx, brand.id);
    const before = await snapshot(tx, brand.id);
    const pagesBefore = await pageSnapshot(tx, brand.id);
    const themeBefore = await themeOf(tx, brand.id);
    await tx.delete(brandRules).where(eq(brandRules.brandId, brand.id));
    const dropped = await writeRules(tx, caller.workspace.id, brand.id, v.snapshot);
    // A version from before pages, or before themes, says nothing about them: they stay as they are.
    if (v.pages) await writePages(tx, brand.id, v.pages);
    if (v.theme !== null) await tx.update(brands).set({ theme: v.theme }).where(eq(brands.id, brand.id));
    const after = await snapshot(tx, brand.id);
    const pages = await pageSnapshot(tx, brand.id);
    const theme = await themeOf(tx, brand.id);
    await addVersion(tx, brand.id, {
      kind: "restore",
      restoredFrom: number,
      actor: caller.actor,
      changed: [
        ...new Set([
          ...diffRules(before, after).map((c) => c.key),
          ...changedPages(pagesBefore, pages),
          ...(canon(themeBefore) !== canon(theme) ? ["theme"] : []),
        ]),
      ],
      snapshot: after,
      pages,
      theme,
    });
    const latest = (await latestVersion(tx, brand.id))!;
    return { restored: number, version: latest.number, droppedAssets: dropped };
  });
}

/**
 * Publish the brand as it stands: its latest version becomes what portals
 * show, and the next edit starts a new version rather than changing it.
 * Publishing twice with nothing changed is the same publish, unless the first
 * was the system's (the migration, a carried brand's baseline): a person's
 * publish then takes it over, with its note. `note` says what changed, for
 * readers, with `image` (an asset) beside it. Every collection a section
 * shows must be one the publisher could share: publishing puts it in front
 * of portal visitors, and to BrandHub's: the answer's `hub` says who sees
 * it there, and where (lib/core/brands.ts hubOf).
 */
export async function publishBrand(caller: Caller, slug: string | undefined, { note, image }: { note?: string; image?: string | null } = {}) {
  const brand = await resolveBrand(caller.workspace.id, slug);
  if (image) {
    const [found] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.id, image), eq(assets.workspaceId, caller.workspace.id), isNull(assets.deletedAt)));
    if (!found) throw new AssetError("invalid", `image: no asset ${image}`);
  }
  // What goes out is served from here: Google faces still without files get them first.
  if (can(caller, "brand.edit")) await hostGoogleFonts(caller, brand.id);
  // An empty change through tracked: a brand with no history gets its baseline first.
  await tracked(brand.id, caller.actor, [], async () => {});
  const out = await db.transaction(async (tx) => {
    await lockBrand(tx, brand.id);
    const latest = (await latestVersion(tx, brand.id))!;
    if (latest.publishedAt && latest.publishedBy !== SYSTEM) return { brand: brand.slug, ...meta(latest), unchanged: true };
    const errors = (latest.pages ?? []).flatMap((p) =>
      p.sections.flatMap((s, i) => {
        const id = isLive(s.template) && (s.props as { collection?: string }).collection;
        if (!id || can(caller, "collection.share", { id })) return [];
        return [`pages.${p.slug}.sections[${i}].props.collection: collection ${id} goes to portal visitors, which takes ${needs("collection.share")}`];
      }),
    );
    if (errors.length) throw new AssetError("forbidden", errors.join("\n"), { errors });
    const [row] = await tx
      .update(brandVersions)
      .set({
        publishedAt: sql`now()`,
        publishedBy: caller.actor,
        note: note || null,
        noteImage: image || null,
        // v1 readers know the note as the version's name.
        ...(note && !latest.name && { name: note }),
      })
      .where(eq(brandVersions.id, latest.id))
      .returning();
    return { brand: brand.slug, ...meta(row), unchanged: false };
  });
  if (!out.unchanged) await recordAudit(caller, "brand.published", brand.name, { brand: brand.slug, version: out.number, ...(note && { note }) });
  const hub = await hubOf(brand);
  return { ...out, hub: hub && { visibility: hub.visibility, url: hub.url } };
}
