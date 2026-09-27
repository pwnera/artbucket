import { and, asc, eq, inArray, isNotNull, max, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { assets, brandRuleAssets, brandRules } from "@/lib/db/schema";
import { AssetError } from "@/lib/core/errors";
import { isRenderable } from "@/lib/core/renditions";
import { resolve, RULE_VALUE, ruleContext, type RuleAsset, type RuleInput, type RuleType } from "@/lib/rules";

type Row = typeof brandRules.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const toRule = (r: Row, ruleAssets: RuleAsset[]) => ({
  id: r.id,
  key: r.key,
  context: r.context,
  type: r.type,
  value: r.value,
  usage: r.usage,
  assets: ruleAssets,
  updatedAt: r.updatedAt,
});
export type BrandRule = ReturnType<typeof toRule>;

const where = (key: string, context: string | null) =>
  and(eq(brandRules.key, key), context === null ? sql`${brandRules.context} is null` : eq(brandRules.context, context));
const label = (key: string, context: string | null) => (context ? `${key} (${context})` : key);

function checkValue(type: RuleType, raw: unknown) {
  const parsed = RULE_VALUE[type].safeParse(raw);
  if (!parsed.success) throw new AssetError("invalid", `Not a valid ${type} value`, parsed.error.issues);
  return parsed.data;
}

/** Each rule's assets, in order. */
async function assetsOf(ruleIds: string[], tx: Tx | typeof db = db) {
  const out = new Map<string, RuleAsset[]>(ruleIds.map((id) => [id, []]));
  if (!ruleIds.length) return out;
  const rows = await tx
    .select()
    .from(brandRuleAssets)
    .where(inArray(brandRuleAssets.ruleId, ruleIds))
    .orderBy(asc(brandRuleAssets.position));
  for (const r of rows) out.get(r.ruleId)!.push({ id: r.assetId, rendition: r.rendition });
  return out;
}

/**
 * Replace a rule's assets. Every id must be a real asset, and a rendition
 * needs one that can be rendered: a typo is a 422, not a silent gap.
 */
async function setAssets(tx: Tx, ruleId: string, list: RuleAsset[]) {
  if (list.length) {
    const found = await tx
      .select({ id: assets.id, mime: assets.mime, filename: assets.filename })
      .from(assets)
      .where(inArray(assets.id, list.map((a) => a.id)));
    const missing = list.filter((a) => !found.some((f) => f.id === a.id));
    if (missing.length) throw new AssetError("invalid", `No such asset: ${missing.map((a) => a.id).join(", ")}`);
    const flat = found.find((f) => !isRenderable(f.mime) && list.some((a) => a.id === f.id && a.rendition));
    if (flat) throw new AssetError("invalid", `${flat.filename} (${flat.mime}) has no renditions; use the original`);
  }
  await tx.delete(brandRuleAssets).where(eq(brandRuleAssets.ruleId, ruleId));
  if (list.length) {
    await tx
      .insert(brandRuleAssets)
      .values(list.map((a, position) => ({ ruleId, assetId: a.id, rendition: a.rendition, position })));
  }
}

/**
 * Every rule in page order, defaults before their context variants. With a
 * context, one per key: see lib/rules.ts. A context nobody defined just gets
 * the defaults. With an asset, only the rules that point at it.
 */
export async function listRules(opts: { context?: string; asset?: string } = {}) {
  const { context, asset } = opts;
  if (context !== undefined && !ruleContext.safeParse(context).success) {
    throw new AssetError("invalid", `Not a context: "${context}". Contexts are slugs, e.g. dark-background`);
  }
  if (asset !== undefined && !z.uuid().safeParse(asset).success) throw new AssetError("invalid", `Not an asset id: "${asset}"`);
  const rows = await db
    .select()
    .from(brandRules)
    .where(
      asset === undefined
        ? undefined
        : inArray(
            brandRules.id,
            db.select({ id: brandRuleAssets.ruleId }).from(brandRuleAssets).where(eq(brandRuleAssets.assetId, asset)),
          ),
    )
    .orderBy(asc(brandRules.position), asc(brandRules.key), sql`${brandRules.context} asc nulls first`);
  const picked = context === undefined ? rows : resolve(rows, context);
  const refs = await assetsOf(picked.map((r) => r.id));
  return picked.map((r) => toRule(r, refs.get(r.id)!));
}

/**
 * Put these keys in this order. Positions are only compared within a section,
 * so a section can be ordered on its own; a key's context versions move with it.
 */
export async function orderRules(keys: string[]) {
  return db.transaction(async (tx) => {
    const found = await tx.selectDistinct({ key: brandRules.key }).from(brandRules).where(inArray(brandRules.key, keys));
    const missing = keys.filter((k) => !found.some((f) => f.key === k));
    if (missing.length) throw new AssetError("invalid", `No such rule: ${missing.join(", ")}`);
    for (const [position, key] of keys.entries()) {
      await tx.update(brandRules).set({ position }).where(eq(brandRules.key, key));
    }
  });
}

/** Every context some rule is scoped to. */
export async function listContexts(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ context: brandRules.context })
    .from(brandRules)
    .where(isNotNull(brandRules.context))
    .orderBy(asc(brandRules.context));
  return rows.map((r) => r.context!);
}

export async function createRule(input: RuleInput) {
  const context = input.context ?? null;
  const value = checkValue(input.type, input.value);
  return db.transaction(async (tx) => {
    // A new version of a key sits with it; a new key goes to the end.
    const [same] = await tx.select({ position: brandRules.position }).from(brandRules).where(eq(brandRules.key, input.key)).limit(1);
    const [last] = await tx.select({ n: max(brandRules.position) }).from(brandRules);
    const position = same?.position ?? (last?.n ?? -1) + 1;
    const [row] = await tx
      .insert(brandRules)
      .values({ key: input.key, context, type: input.type, value, usage: input.usage || null, position })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new AssetError("conflict", `${label(input.key, context)} already exists; edit it instead`);
    await setAssets(tx, row.id, input.assets ?? []);
    return toRule(row, input.assets ?? []);
  });
}

export async function updateRule(
  id: string,
  patch: { key?: string; value?: unknown; usage?: string | null; context?: string | null; assets?: RuleAsset[] },
) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(brandRules).where(eq(brandRules.id, id));
    if (!current) return null;
    const set: Partial<Row> = {};
    if (patch.value !== undefined) set.value = checkValue(current.type, patch.value);
    if (patch.usage !== undefined) set.usage = patch.usage || null;
    if (patch.context !== undefined && patch.context !== current.context) {
      const [taken] = await tx
        .select({ id: brandRules.id })
        .from(brandRules)
        .where(and(where(current.key, patch.context), ne(brandRules.id, id)));
      if (taken) throw new AssetError("conflict", `${label(current.key, patch.context)} already exists`);
      set.context = patch.context;
    }
    if (patch.assets) await setAssets(tx, id, patch.assets);
    // A key is shared by a rule's context versions: renaming one renames them all.
    if (patch.key !== undefined && patch.key !== current.key) {
      const [taken] = await tx.select({ id: brandRules.id }).from(brandRules).where(eq(brandRules.key, patch.key)).limit(1);
      if (taken) throw new AssetError("conflict", `${patch.key} already exists`);
      await tx
        .update(brandRules)
        .set({ key: patch.key, updatedAt: sql`now()` })
        .where(and(eq(brandRules.key, current.key), ne(brandRules.id, id)));
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
    return toRule(row, (await assetsOf([id], tx)).get(id)!);
  });
}

export async function deleteRule(id: string) {
  const gone = await db.delete(brandRules).where(eq(brandRules.id, id)).returning();
  return gone.length > 0;
}
