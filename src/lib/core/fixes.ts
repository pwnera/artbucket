import { asc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { assetWhere } from "@/lib/core/assets";
import { AssetError } from "@/lib/core/errors";
import { describe, gapsIn, staleIn } from "@/lib/core/insights";
import { checkFeature } from "@/lib/core/usage";
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
 * them; renewed or archived, they leave the list), and the project's sites
 * built with a component version that a newer one replaced (they leave the
 * list once deployed with the current one). `open` counts what isn't
 * done, for the sidebar. Insights' readers, as Insights, where the plan has
 * Fixes (lib/limits.ts `fixes`).
 */
export async function fixesOf(caller: Caller) {
  if (!can(caller, "insights.read")) throw new AssetError("forbidden", `Fixes take ${needs("insights.read")}`);
  await checkFeature(caller.project.organizationId, "fixes");
  const day = today();
  const before = new Date(Date.parse(day) + (EXPIRING_DAYS + 1) * DAY).toISOString().slice(0, 10);
  const expires = sql<string>`${assets.rights} ->> 'expires'`;
  const [stale, gaps, components, ending] = await Promise.all([
    staleIn(caller.project.id),
    gapsIn(caller.project.id),
    oldComponentsIn(caller.project.id),
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
    open: placesOpen + gaps.filter((g) => !g.requested).length + licenses.filter((l) => !l.replacement).length + components.length,
    stale,
    gaps,
    components,
    licenses,
  };
}

/** A project's live builds that name a component version no longer the one its Storybook shows, oldest replacement first. */
async function oldComponentsIn(projectId: string) {
  const rows = await db.execute<{
    site_id: string;
    site_name: string;
    site_slug: string;
    path: string;
    id: string;
    name: string;
    version: number;
    current_id: string;
    current_version: number;
    since: string;
  }>(sql`
    select d.site_id, p.name as site_name, p.slug as site_slug, d.path, c.id, c.name, c.version, n.id as current_id, n.version as current_version, n.created_at as since
    from site_deployments d
    join portals p on p.id = d.site_id
    cross join unnest(d.component_uses) u(id)
    join site_components c on c.id = u.id
    join site_deployments l on l.site_id = c.site_id and l.path = c.path and l.state = 'live'
    join site_components n on n.id = any(l.components) and n.slug = c.slug and n.id <> c.id
    where d.state = 'live' and p.project_id = ${projectId}
    order by n.created_at, p.name, c.name`);
  return [...rows].map((r) => ({
    site: { id: r.site_id, name: r.site_name, slug: r.site_slug },
    path: r.path,
    component: { id: r.id, name: r.name, version: r.version },
    current: { id: r.current_id, version: r.current_version },
    since: new Date(r.since).toISOString(),
  }));
}
