import { and, desc, eq, lt, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activity, assets, brands, brandVersions, type ActivityVerb } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { visible } from "@/lib/core/assets";
import { AssetError } from "@/lib/core/errors";
import { summarize } from "@/lib/history";

type Asset = { id: string; workspaceId: string; filename: string; metadata: { title?: string } | null };

/** Note that something happened to an asset. Never fails the change it describes. */
export async function record(
  by: { actor: string; key: string | null },
  verb: ActivityVerb,
  asset: Asset,
  detail?: { tags?: string[]; note?: string; version?: number },
) {
  await db
    .insert(activity)
    .values({
      workspaceId: asset.workspaceId,
      actor: by.actor,
      agent: !!by.key,
      verb,
      assetId: asset.id,
      label: asset.metadata?.title || asset.filename,
      detail: detail ?? null,
    })
    .catch((err) => console.error("activity not recorded", err));
}

export type ActivityItem = {
  id: string;
  at: Date;
  actor: string;
  /** An API key did it. */
  agent: boolean;
  verb: ActivityVerb | "edited_rules" | "restored_rules";
  /** What it happened to: an asset's title, or a brand's name. */
  label: string;
  assetId: string | null;
  brand: { slug: string; name: string; version: number } | null;
  /** Suggested tags, a rejection's reason, an asset's version, or the rules a brand version touched. */
  detail: { tags?: string[]; note?: string; version?: number; rules?: string[]; summary?: string } | null;
};

/**
 * Everything that happened, newest first: asset events, and brand versions
 * (which already group rule edits the way a person would describe them).
 * Page with `before`, the `at` of the last item seen. An asset the caller
 * can't see (a private one) leaves its events out.
 */
export async function listActivity(caller: Caller, { before, limit = 50 }: { before?: string; limit?: number } = {}) {
  const ws = caller.workspace.id;
  const until = before ? new Date(before) : undefined;
  if (until && Number.isNaN(until.getTime())) throw new AssetError("invalid", `Not a time: "${before}"`);
  const n = Math.min(Math.max(limit, 1), 100);
  const [events, versions] = await Promise.all([
    db
      .select({
        id: activity.id,
        at: activity.at,
        actor: activity.actor,
        agent: activity.agent,
        verb: activity.verb,
        assetId: activity.assetId,
        label: activity.label,
        detail: activity.detail,
      })
      .from(activity)
      .where(
        and(
          eq(activity.workspaceId, ws),
          until ? lt(activity.at, until) : undefined,
          sql`not exists (select 1 from ${assets} where ${assets.id} = ${activity.assetId} and not (${visible(caller)}))`,
        ),
      )
      .orderBy(desc(activity.at))
      .limit(n),
    db
      .select({ v: brandVersions, slug: brands.slug, name: brands.name })
      .from(brandVersions)
      .innerJoin(brands, eq(brands.id, brandVersions.brandId))
      .where(and(eq(brands.workspaceId, ws), ne(brandVersions.kind, "baseline"), until ? lt(brandVersions.updatedAt, until) : undefined))
      .orderBy(desc(brandVersions.updatedAt))
      .limit(n),
  ]);
  const items: ActivityItem[] = [
    ...events.map((e) => ({ ...e, brand: null })),
    ...versions.map(({ v, slug, name }) => ({
      id: v.id,
      at: v.updatedAt,
      actor: v.actor,
      agent: false,
      verb: v.kind === "restore" ? ("restored_rules" as const) : ("edited_rules" as const),
      label: name,
      assetId: null,
      brand: { slug, name, version: v.number },
      detail: { rules: v.changed, summary: v.kind === "restore" ? `Restored version ${v.restoredFrom ?? ""}`.trim() : summarize(v.changed) },
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, n);
  return { data: items, next: items.length === n ? items.at(-1)!.at.toISOString() : null };
}
