import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { portals, projects, shareLinks } from "@/lib/db/schema";
import { featureOn } from "@/lib/core/features";
import { memo } from "@/lib/memo";

/**
 * Whether the portal or share link a signed URL names (lib/signed.ts `by`)
 * still hands out its files: it exists, hasn't closed or expired, and its
 * feature is on in its project (Settings, Features). Closed, revoked or
 * turned off, the URLs it handed out stop here, rather than when their
 * signature runs out a day later. Kept 30 seconds, as every file of a
 * portal page asks.
 */
export const signerOpen = memo(30_000, async (by: string): Promise<boolean> => {
  const id = by.slice(2);
  const now = new Date();
  if (by.startsWith("p-")) {
    const [p] = await db
      .select({ projectId: portals.projectId, expiresAt: portals.expiresAt, organizationId: projects.organizationId })
      .from(portals)
      .innerJoin(projects, eq(projects.id, portals.projectId))
      .where(eq(portals.id, id));
    return !!p && !(p.expiresAt && p.expiresAt <= now) && (await featureOn("portals", { organizationId: p.organizationId, projectId: p.projectId }));
  }
  if (by.startsWith("l-")) {
    const [l] = await db
      .select({ projectId: shareLinks.projectId, expiresAt: shareLinks.expiresAt, organizationId: projects.organizationId })
      .from(shareLinks)
      .innerJoin(projects, eq(projects.id, shareLinks.projectId))
      .where(eq(shareLinks.id, id));
    return !!l && !(l.expiresAt && l.expiresAt <= now) && (await featureOn("shares", { organizationId: l.organizationId, projectId: l.projectId }));
  }
  return false;
});
