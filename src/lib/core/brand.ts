import { and, asc, desc, eq, inArray, isNotNull, max, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { assets, brandRuleAssets, brandRules, brands, brandVersions } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { present, resolveBrand, slugify } from "@/lib/core/brands";
import { AssetError } from "@/lib/core/errors";
import { hasPreview } from "@/lib/preview";
import { diffRules, extendsLatest, summarize, type SnapRule, type VersionKind } from "@/lib/history";
import { resolve, RULE_VALUE, ruleContext, type RuleAsset, type RuleInput, type RuleType } from "@/lib/rules";

type Row = typeof brandRules.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Db = Tx | typeof db;

const toRule = (r: Row, brand: string, ruleAssets: RuleAsset[]) => ({
  id: r.id,
  brand,
  key: r.key,
  context: r.context,
  type: r.type,
  value: r.value,
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

function checkValue(type: RuleType, raw: unknown) {
  const parsed = RULE_VALUE[type].safeParse(raw);
  if (!parsed.success) throw new AssetError("invalid", `Not a valid ${type} value`, parsed.error.issues);
  return parsed.data;
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
    .innerJoin(assets, eq(assets.id, brandRuleAssets.assetId))
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
      .where(and(eq(assets.workspaceId, ws), inArray(assets.id, list.map((a) => a.id))));
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

/** The brand's rule set as history keeps it. */
async function snapshot(tx: Db, brandId: string): Promise<SnapRule[]> {
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
  }));
}

async function latestVersion(tx: Db, brandId: string) {
  const [v] = await tx
    .select()
    .from(brandVersions)
    .where(eq(brandVersions.brandId, brandId))
    .orderBy(desc(brandVersions.number))
    .limit(1);
  return v;
}

async function addVersion(
  tx: Tx,
  brandId: string,
  v: { kind: VersionKind; actor: string; changed: string[]; snapshot: SnapRule[]; restoredFrom?: number },
) {
  const latest = await latestVersion(tx, brandId);
  await tx.insert(brandVersions).values({ brandId, number: (latest?.number ?? 0) + 1, ...v });
}

/**
 * Run a change to a brand's rules and record it in the brand's history, in
 * one transaction. Changes to one brand take turns (an advisory lock), so
 * version numbers never collide and a snapshot is never of a half-made change.
 *
 * The first change to a brand with no history records the state before it,
 * so even that change has something to diff against and restore to.
 */
async function tracked<T>(brandId: string, actor: string, changed: string[], fn: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${brandId}))`);
    if (!(await latestVersion(tx, brandId))) {
      await addVersion(tx, brandId, { kind: "baseline", actor: "artbucket", changed: [], snapshot: await snapshot(tx, brandId) });
    }
    const out = await fn(tx);
    const after = await snapshot(tx, brandId);
    const latest = (await latestVersion(tx, brandId))!;
    // Compared as rules, not as JSON: jsonb gives keys back in its own order.
    if (!diffRules(latest.snapshot, after).length) return out;
    if (extendsLatest(latest, actor, new Date())) {
      await tx
        .update(brandVersions)
        .set({ snapshot: after, changed: [...new Set([...latest.changed, ...changed])], updatedAt: sql`now()` })
        .where(eq(brandVersions.id, latest.id));
    } else {
      await addVersion(tx, brandId, { kind: "edit", actor, changed, snapshot: after });
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
      .values({ brandId: brand.id, key: input.key, context, type: input.type, value, usage: input.usage || null, position })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new AssetError("conflict", `${label(input.key, context)} already exists; edit it instead`);
    await setAssets(tx, caller.workspace.id, row.id, input.assets ?? []);
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
  patch: { key?: string; value?: unknown; usage?: string | null; context?: string | null; assets?: RuleAsset[] },
) {
  const found = await ruleWithBrand(caller.workspace.id, id);
  if (!found) return null;
  const { rule: current, brand } = found;
  const changed = [...new Set([current.key, ...(patch.key ? [patch.key] : [])])];
  return tracked(current.brandId, caller.actor, changed, async (tx) => {
    const set: Partial<Row> = {};
    if (patch.value !== undefined) set.value = checkValue(current.type, patch.value);
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
    return toRule(row, brand, (await assetsOf([id], tx)).get(id)!);
  });
}

export async function deleteRule(caller: Caller, id: string) {
  const found = await ruleWithBrand(caller.workspace.id, id);
  if (!found) return false;
  return tracked(found.rule.brandId, caller.actor, [found.rule.key], async (tx) => {
    await tx.delete(brandRules).where(eq(brandRules.id, id));
    return true;
  });
}

/** Write a snapshot's rules into a brand, which has none. Assets deleted since are left out and counted. */
async function writeRules(tx: Tx, ws: string, brandId: string, rules: SnapRule[]) {
  const ids = [...new Set(rules.flatMap((r) => r.assets.map((a) => a.id)))];
  const live = new Set(
    ids.length
      ? (await tx.select({ id: assets.id }).from(assets).where(and(eq(assets.workspaceId, ws), inArray(assets.id, ids)))).map((a) => a.id)
      : [],
  );
  let dropped = 0;
  for (const r of rules) {
    const [row] = await tx
      .insert(brandRules)
      .values({ brandId, key: r.key, context: r.context, type: r.type, value: r.value, usage: r.usage, position: r.position })
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
 * A new brand, empty or as a copy of another's current rules. Its history
 * starts with that state as version 1.
 */
export async function createBrand(caller: Caller, input: { name: string; slug?: string; from?: string }) {
  const ws = caller.workspace.id;
  const slug = input.slug ?? slugify(input.name);
  if (!slug) throw new AssetError("invalid", "Give the brand a name with a letter or a number in it");
  const source = input.from ? await resolveBrand(ws, input.from) : null;
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(brands).values({ workspaceId: ws, slug, name: input.name }).onConflictDoNothing().returning();
    if (!row) throw new AssetError("conflict", `A brand "${slug}" exists`);
    const rules = source ? await snapshot(tx, source.id) : [];
    await writeRules(tx, ws, row.id, rules);
    await tx.insert(brandVersions).values({
      brandId: row.id,
      number: 1,
      kind: "baseline",
      actor: caller.actor,
      changed: [],
      snapshot: await snapshot(tx, row.id),
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
  let baseLabel: number | "current" | null = null;
  if (against === "current") {
    base = await snapshot(db, brand.id);
    baseLabel = "current";
  } else {
    const n = against ?? number - 1;
    const other = n >= 1 ? await version(brand.id, n) : undefined;
    if (against !== undefined && !other) throw new AssetError("not_found", `No version ${against}`);
    base = other?.snapshot ?? [];
    baseLabel = other ? n : null;
  }
  // "current" reads as how to get from this version to now; a number, how this version came about.
  const diff = against === "current" ? diffRules(v.snapshot, base) : diffRules(base, v.snapshot);
  return { ...meta(v), rules: v.snapshot, against: baseLabel, diff };
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
 * Put a version's rules back. The brand's rules are replaced, and the restore
 * is itself a new version, so restoring can be undone the same way.
 */
export async function restoreVersion(caller: Caller, slug: string, number: number) {
  const brand = await resolveBrand(caller.workspace.id, slug);
  const v = await version(brand.id, number);
  if (!v) return null;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${brand.id}))`);
    const before = await snapshot(tx, brand.id);
    await tx.delete(brandRules).where(eq(brandRules.brandId, brand.id));
    const dropped = await writeRules(tx, caller.workspace.id, brand.id, v.snapshot);
    const after = await snapshot(tx, brand.id);
    await addVersion(tx, brand.id, {
      kind: "restore",
      restoredFrom: number,
      actor: caller.actor,
      changed: [...new Set(diffRules(before, after).map((c) => c.key))],
      snapshot: after,
    });
    const latest = (await latestVersion(tx, brand.id))!;
    return { restored: number, version: latest.number, droppedAssets: dropped };
  });
}
