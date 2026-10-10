import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, shareLinks, projects } from "@/lib/db/schema";
import { portalNamed } from "@/lib/core/domains";
import { limitsOf } from "@/lib/core/usage";
import { memo } from "@/lib/memo";
import type { Suspendable } from "@/lib/suspension";

/**
 * Whether an organization is suspended by whoever runs the server
 * (lib/suspension.ts): as limitsOf reads it, so a minute late at most.
 */
export const suspended = async (organizationId: string) => !!(await limitsOf(organizationId)).suspended;

/** A project's organization, which never changes: kept, as every file served asks it. */
const orgOf = memo(10 * 60_000, async (projectId: string) => {
  const [w] = await db.select({ id: projects.organizationId }).from(projects).where(eq(projects.id, projectId));
  return w?.id ?? null;
});

/** Whether the organization a project is in is suspended: for its files and share links. */
export async function suspendedIn(projectId: string) {
  const org = await orgOf(projectId);
  return !!org && suspended(org);
}

/** Whether what a request names (lib/suspension.ts suspendable) is a suspended organization's; false when it names nothing. */
export async function suspendedAt(at: Suspendable | null) {
  if (!at) return false;
  if ("organizationId" in at) return suspended(at.organizationId);
  if ("portal" in at) {
    const named = await portalNamed(at.portal);
    return !!named && suspended(named.organizationId);
  }
  if ("share" in at) {
    const [link] = await db.select({ ws: shareLinks.projectId }).from(shareLinks).where(eq(shareLinks.token, at.share));
    return !!link && suspendedIn(link.ws);
  }
  const [o] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, at.org));
  return !!o && suspended(o.id);
}
