import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { catalogObjects, grants, projects } from "@/lib/db/schema";
import { accessIn, assetScope, brandScope, collectionScope } from "@/lib/access";
import { hiddenIn, projectsOf, type Caller } from "@/lib/core/access";
import { recordAudit } from "@/lib/core/audit";
import { findObject } from "@/lib/core/catalog";
import { AssetError } from "@/lib/core/errors";

/**
 * Shares between projects (PRD: Artbucket Catalog): a brand, a collection or
 * an asset made usable in another project of the organization, by
 * reference. It is a grant the receiving project holds, always read, which
 * each of its members has (lib/core/access.ts heldBy); the thing is kept and
 * edited once, at home. Whoever is admin on the thing shares it; admins of
 * either project take it back.
 */

const SHAREABLE = ["brand", "collection", "asset"] as const;
type Shareable = (typeof SHAREABLE)[number];

/** The caller's role on the thing, in its own project. */
async function roleOn(caller: Caller, o: { id: string; type: Shareable; projectId: string; private: boolean; collections: string[] }) {
  const a =
    o.projectId === caller.project.id
      ? caller
      : caller.user
        ? await (async () => {
            const { grants: mine, projects: open } = await projectsOf(caller.user!.id);
            const w = open.find((x) => x.id === o.projectId);
            return w ? accessIn(mine, w, await hiddenIn(w.id)) : null;
          })()
        : null;
  if (!a) return null;
  if (o.type === "brand") return brandScope(a, o);
  if (o.type === "collection") return collectionScope(a, o.id);
  return assetScope(a, o);
}

/** Share it into a project: Viewer for its members, its releases only where it has them. */
export async function shareObject(caller: Caller, ref: string, projectRef: string) {
  const item = await findObject(caller, ref);
  if (!item || !(SHAREABLE as readonly string[]).includes(item.type)) throw new AssetError("not_found", "Only a brand, a collection or an asset you can reach can be shared");
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.organizationId, caller.project.organizationId), /^[0-9a-f-]{36}$/i.test(projectRef) ? eq(projects.id, projectRef) : eq(projects.slug, projectRef)));
  if (!project) throw new AssetError("not_found", `No project "${projectRef}" in this organization`);
  if (project.id === item.project.id) throw new AssetError("invalid", `${item.name} is in ${project.name} already`);
  const [o] = await db.select({ private: catalogObjects.private, collections: catalogObjects.collections }).from(catalogObjects).where(eq(catalogObjects.id, item.id));
  const role = await roleOn(caller, { id: item.id, type: item.type as Shareable, projectId: item.project.id, ...o });
  if (role !== "admin") throw new AssetError("forbidden", `Sharing ${item.name} takes admin on it`);
  const [row] = await db
    .insert(grants)
    .values({
      holderProjectId: project.id,
      organizationId: caller.project.organizationId,
      projectId: item.project.id,
      resource: item.type as Shareable,
      resourceId: item.id,
      scope: "read",
    })
    .onConflictDoNothing()
    .returning();
  await recordAudit(caller, "share.project", item.name, { into: project.name, from: item.project.name }, { projectId: item.project.id });
  return { id: row?.id ?? null, object: item.address, project: { id: project.id, slug: project.slug, name: project.name }, role: "Viewer" };
}

/** Where it is shared: each receiving project, with the grant to take it back by. */
export async function sharesOf(objectId: string) {
  return db
    .select({ id: grants.id, project: { id: projects.id, slug: projects.slug, name: projects.name } })
    .from(grants)
    .innerJoin(projects, eq(projects.id, grants.holderProjectId))
    .where(and(eq(grants.resourceId, objectId), isNotNull(grants.holderProjectId)));
}

/** What is shared into these projects: object ids by receiving project. */
export async function sharedInto(projectIds: string[]) {
  if (!projectIds.length) return [];
  return db
    .select({ project: grants.holderProjectId, id: grants.resourceId })
    .from(grants)
    .where(inArray(grants.holderProjectId, projectIds)) as Promise<{ project: string; id: string }[]>;
}
