import { and, asc, desc, eq, inArray, isNotNull, isNull, max, ne, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { assets, brandRuleAssets, brandRules, brands, brandVersions, portalBrands } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { hubOf, present, resolveBrand, slugify } from "@/lib/core/brands";
import { recordAudit } from "@/lib/core/audit";
import { AssetError } from "@/lib/core/errors";
import { checkLimit } from "@/lib/core/usage";
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
  const out = new Map<string, Required<RuleAsset>[]>(ruleIds.map((id) => [id, []]));
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
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${brandId}))`);
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
  return tracked(brand.id, caller.actor, [input.key], async (tx) => {
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
  return tracked(current.brandId, caller.actor, changed, async (tx) => {
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
    if (set.spec) await checkSpecRefs(tx, caller.workspace.id, current.brandId, [{ at: "spec", spec: set.spec }]);
    return toRule(row, brand, (await assetsOf([id], tx)).get(id)!);
  });
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
    await tx.delete(brandRules).where(eq(brandRules.id, id));
    return true;
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
  input: { name: string; slug?: string; from?: string },
  seed?: { rules: SnapRule[]; pages: SnapPage[]; theme: ThemeSettings; forkedFrom: string },
) {
  const ws = caller.workspace.id;
  const slug = input.slug ?? slugify(input.name);
  if (!slug) throw new AssetError("invalid", "Give the brand a name with a letter or a number in it");
  await checkLimit(caller.workspace.organizationId, "brands");
  const source = input.from && !seed ? await resolveBrand(ws, input.from) : null;
  return db.transaction(async (tx) => {
    const theme = seed?.theme ?? (source ? source.theme : {});
    const [row] = await tx
      .insert(brands)
      .values({ workspaceId: ws, slug, name: input.name, theme, forkedFrom: seed?.forkedFrom ?? null })
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
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${brand.id}))`);
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
  // An empty change through tracked: a brand with no history gets its baseline first.
  await tracked(brand.id, caller.actor, [], async () => {});
  const out = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${brand.id}))`);
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
