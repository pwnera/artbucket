import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { catalogObjects, portals, siteComponents, siteDeployments } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { findObject, lineage } from "@/lib/core/catalog";
import { buildsAddress, portalHome, previewAt } from "@/lib/core/domains";
import { keptName } from "@/lib/core/sites";
import { formatAddress, type CatalogStatus } from "@/lib/catalog";

/**
 * The Components page (GET /api/v1/components): what a project's Storybooks
 * document, each component at its current version, and one component's
 * versions, each with where its story can be seen and what is built with it.
 * Its stories answer on the site's own address, never the app's: the page
 * frames them from there (lib/site-serve.ts lets the app frame a build), its
 * BUILD_DOMAIN address even when it has a domain of its own, which the app
 * can't know to frame (src/proxy.ts answers a framed build there).
 */

/** A story, as Storybook shows it alone (`iframe.html`, framed from `framed`), and in its own UI, at the site's own address. */
const storyAt = (framed: string | null, home: string | null, path: string, story: string) => {
  const at = (base: string | null) => base && `${base}${path === "/" ? "" : path}`;
  const id = encodeURIComponent(story);
  return { preview: framed && `${at(framed)}/iframe.html?id=${id}&viewMode=story`, storybook: (home ?? framed) && `${at(home ?? framed)}/?path=/story/${id}` };
};

const columns = {
  id: siteComponents.id,
  slug: siteComponents.slug,
  name: siteComponents.name,
  title: siteComponents.title,
  version: siteComponents.version,
  story: siteComponents.story,
  stories: siteComponents.stories,
  files: siteComponents.files,
  tags: siteComponents.tags,
  path: siteComponents.path,
  createdAt: siteComponents.createdAt,
  createdBy: siteComponents.createdBy,
  status: catalogObjects.status,
  site: { id: portals.id, slug: portals.slug, name: portals.name },
};

/** Every component live in the project's Storybooks, by site then title, with how many versions each has had. */
export async function componentsOf(caller: Caller) {
  const rows = await db
    .select({
      ...columns,
      versions: sql<number>`(select count(*)::int from ${siteComponents} v where v.site_id = ${siteComponents.siteId} and v.path = ${siteComponents.path} and v.slug = ${siteComponents.slug})`,
    })
    .from(siteComponents)
    .innerJoin(catalogObjects, eq(catalogObjects.id, siteComponents.id))
    .innerJoin(portals, eq(portals.id, siteComponents.siteId))
    .where(and(eq(portals.projectId, caller.project.id), eq(catalogObjects.status, "current")))
    .orderBy(portals.name, siteComponents.path, siteComponents.title);
  const homes = new Map(await Promise.all([...new Set(rows.map((r) => r.site.slug))].map(async (s) => [s, (await portalHome(s))?.builds ?? null] as const)));
  const { organization, slug: project } = caller.project;
  return rows.map((r) => ({
    ...r,
    // Its address without @n: the version current when something is built with it.
    address: formatAddress({ org: organization.slug, project, type: "component", slug: r.slug, parent: { type: "site", slug: r.site.slug } }),
    ...storyAt(buildsAddress(r.site), homes.get(r.site.slug) ?? null, r.path, r.story),
  }));
}
export type ComponentRow = Awaited<ReturnType<typeof componentsOf>>[number];

/**
 * One component (any version, by id or address): every version at its mount,
 * newest first, each with its status, its story's preview while a deployment
 * holding it is kept (the live one, else a kept one at keptName's address),
 * and the sites built with it. Null when the caller can't reach it.
 */
export async function componentOf(caller: Caller, ref: string) {
  const item = await findObject(caller, ref);
  if (item?.type !== "component") return null;
  const [one] = await db.select({ siteId: siteComponents.siteId, path: siteComponents.path, slug: siteComponents.slug }).from(siteComponents).where(eq(siteComponents.id, item.id));
  if (!one) return null;
  const rows = await db
    .select(columns)
    .from(siteComponents)
    .innerJoin(catalogObjects, eq(catalogObjects.id, siteComponents.id))
    .innerJoin(portals, eq(portals.id, siteComponents.siteId))
    .where(and(eq(siteComponents.siteId, one.siteId), eq(siteComponents.path, one.path), eq(siteComponents.slug, one.slug)))
    .orderBy(desc(siteComponents.version));
  const site = rows[0]?.site;
  const home = site ? ((await portalHome(site.slug))?.builds ?? null) : null;
  // The deployments still holding each version, newest first: the live one serves at the site's address, a kept one at its own.
  const holders = await db
    .select({ id: siteDeployments.id, state: siteDeployments.state, components: siteDeployments.components })
    .from(siteDeployments)
    .where(and(eq(siteDeployments.siteId, one.siteId), eq(siteDeployments.path, one.path), sql`${siteDeployments.state} in ('live', 'replaced')`))
    .orderBy(desc(siteDeployments.createdAt));
  const versions = await Promise.all(
    rows.map(async (v) => {
      const held = holders.find((d) => d.state === "live" && d.components?.includes(v.id)) ?? holders.find((d) => d.components?.includes(v.id));
      // The live build at the site's BUILD_DOMAIN address, a kept one at its own preview address there.
      const framed = !held || !site ? null : held.state === "live" ? buildsAddress(site) : previewAt(site.slug, keptName(held.id));
      const down = await lineage(caller, v.id, { depth: 1, direction: ["down"] });
      const usedBy = (down?.nodes ?? []).filter((n) => n.type === "site" && down?.edges.some((e) => e.from === v.id && e.to === n.id && e.kind === "built"));
      return { ...v, status: v.status as CatalogStatus, ...storyAt(framed, held?.state === "live" ? home : framed, v.path, v.story), usedBy: usedBy.map((n) => ({ id: n.id, name: n.name, address: n.address, project: n.project })) };
    }),
  );
  return { id: item.id, address: item.address, name: item.name, title: rows[0]?.title ?? item.name, site, path: one.path, versions };
}
export type ComponentDetail = NonNullable<Awaited<ReturnType<typeof componentOf>>>;
