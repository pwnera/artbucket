import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { audit, grants } from "@/lib/db/schema";
import { AssetError } from "@/lib/core/errors";

/**
 * The audit log: who changed who may do what. Asset events are `activity`;
 * this is sign-ins, members, grants, invitations, keys, share links,
 * workspaces, settings, and what portals publish. Free, like OIDC: trust
 * shouldn't be a paid tier.
 */

export type AuditAction =
  | "user.signed_up"
  | "user.signed_in"
  | "organization.created"
  | "organization.renamed"
  | "organization.deleted"
  | "workspace.created"
  | "workspace.renamed"
  | "workspace.deleted"
  | "grant.set"
  | "grant.removed"
  | "invitation.created"
  | "invitation.resent"
  | "invitation.revoked"
  | "invitation.accepted"
  | "key.created"
  | "key.revoked"
  | "share.created"
  | "share.revoked"
  | "share.sent"
  | "asset.signed_url"
  | "asset.published"
  | "asset.unpublished"
  | "portal.created"
  | "portal.updated"
  | "portal.deleted"
  | "portal.request_approved"
  | "portal.request_denied"
  | "portal.request_removed"
  | "brand.published"
  | "brand.public"
  | "brand.private"
  | "brand.claimed"
  | "domain.added"
  | "domain.verified"
  | "domain.removed"
  | "domain.primary"
  | "github.added"
  | "github.verified"
  | "github.removed"
  | "sso.saved"
  | "sso.verified"
  | "sso.removed"
  | "sso.required"
  | "sso.optional"
  | "sso.joined"
  | "setting.changed"
  | "setting.reset"
  | "email.failed";

/** Who did it and where: a caller (lib/core/access.ts), or the parts a sign-in hook knows. */
export type AuditBy = {
  actor: string;
  user?: { id: string } | null;
  key?: string | null;
  ip?: string | null;
  workspace?: { id: string; organizationId: string } | null;
};

/** Write one entry. Never fails the change it describes. */
export async function recordAudit(
  by: AuditBy,
  action: AuditAction,
  target: string | null,
  detail?: Record<string, unknown>,
  where: { organizationId?: string | null; workspaceId?: string | null } = {},
) {
  await db
    .insert(audit)
    .values({
      organizationId: where.organizationId !== undefined ? where.organizationId : (by.workspace?.organizationId ?? null),
      workspaceId: where.workspaceId !== undefined ? where.workspaceId : (by.workspace?.id ?? null),
      actor: by.actor,
      userId: by.user?.id ?? null,
      keyId: by.key ?? null,
      action,
      target,
      detail: detail ?? null,
      ip: by.ip ?? null,
    })
    .catch((err) => console.error("audit not recorded", err));
}

/**
 * An organization's trail, newest first: what happened in it, and the
 * sign-ins of its members. A workspace admin who isn't an organization admin
 * sees that workspace's entries only. Page with `before`.
 */
export async function listAudit(
  scope: { organizationId: string; workspaceId?: string },
  { before, limit = 50 }: { before?: string; limit?: number } = {},
) {
  const until = before ? new Date(before) : undefined;
  if (until && Number.isNaN(until.getTime())) throw new AssetError("invalid", `Not a time: "${before}"`);
  const n = Math.min(Math.max(limit, 1), 200);
  const members = db.selectDistinct({ id: grants.userId }).from(grants).where(eq(grants.organizationId, scope.organizationId));
  const rows = await db
    .select()
    .from(audit)
    .where(
      and(
        scope.workspaceId
          ? eq(audit.workspaceId, scope.workspaceId)
          : or(
              eq(audit.organizationId, scope.organizationId),
              and(isNull(audit.organizationId), inArray(audit.userId, members)),
            ),
        until ? lt(audit.at, until) : undefined,
      ),
    )
    .orderBy(desc(audit.at), sql`${audit.id}`)
    .limit(n);
  return { data: rows, next: rows.length === n ? rows.at(-1)!.at.toISOString() : null };
}
