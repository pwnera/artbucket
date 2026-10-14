import { asc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { assetWhere } from "@/lib/core/assets";
import { AssetError } from "@/lib/core/errors";
import { describe, gapsIn, staleIn } from "@/lib/core/insights";
import { EXPIRING_DAYS } from "@/lib/catalog";
import { INSIGHT_DAYS } from "@/lib/insights";
import { can, needs } from "@/lib/permissions";
import { today } from "@/lib/rights";

/** Licenses listed at most: the soonest to end. */
const LICENSES = 100;
const DAY = 86_400_000;

/**
 * GET /api/v1/fixes: what needs doing in the project, from what Insights
 * and the library already know, each with whether it was done. Places still
 * loading a replaced version (Insights' stale, done once told), searches
 * that found nothing (its gaps, done once requested) and approved assets
 * whose license ends within EXPIRING_DAYS (done once something replaces
 * them; renewed or archived, they leave the list). `open` counts what isn't
 * done, for the sidebar. Insights' readers, as Insights.
 */
export async function fixesOf(caller: Caller) {
  if (!can(caller, "insights.read")) throw new AssetError("forbidden", `Fixes take ${needs("insights.read")}`);
  const day = today();
  const before = new Date(Date.parse(day) + (EXPIRING_DAYS + 1) * DAY).toISOString().slice(0, 10);
  const expires = sql<string>`${assets.rights} ->> 'expires'`;
  const [stale, gaps, ending] = await Promise.all([
    staleIn(caller.project.id),
    gapsIn(caller.project.id),
    // As the library reads a license: approved, the current version, not ended yet (status active), ending before `before`.
    db
      .select({ id: assets.id, expires })
      .from(assets)
      .where(assetWhere(caller, { status: ["active"], expiresBefore: before }))
      .orderBy(asc(sql`(${expires})::date`))
      .limit(LICENSES),
  ]);
  const described = await describe(ending.map((a) => a.id));
  const replacements = await describe(ending.flatMap((a) => described.get(a.id)?.supersededBy ?? []));
  const licenses = ending.flatMap((e) => {
    const a = described.get(e.id);
    return a
      ? [{ asset: a, expires: e.expires, days: Math.round((Date.parse(e.expires) - Date.parse(day)) / DAY), replacement: (a.supersededBy && replacements.get(a.supersededBy)) || null }]
      : [];
  });
  // A place is one thing to do however many versions it loads: told about all of them, it's done. One that named no place has nobody to tell.
  const placesOpen = new Set(stale.flatMap((s) => (!s.notified && (s.referrer ?? s.client)) || [])).size;
  return {
    days: INSIGHT_DAYS,
    licenseDays: EXPIRING_DAYS,
    open: placesOpen + gaps.filter((g) => !g.requested).length + licenses.filter((l) => !l.replacement).length,
    stale,
    gaps,
    licenses,
  };
}
