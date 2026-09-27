import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { grants, organizations, settings } from "@/lib/db/schema";
import { recordAudit } from "@/lib/core/audit";
import { effective } from "@/lib/core/settings";
import { deliver, layout, unusable, type Message } from "@/lib/email";
import { env } from "@/lib/env";
import { SETTINGS } from "@/lib/settings";

/**
 * What the app emails, and through whose settings: an organization's own,
 * else the server's (EMAIL_*). Email is a courtesy, never a step: whatever
 * sent it has already happened, and a link to copy is always shown too. So a
 * failure is logged and audited, not thrown.
 */

export type Sent = { sent: boolean; error?: string };

export async function sendAs(organizationId: string | null, message: Message): Promise<Sent> {
  const { value } = organizationId ? await effective("email", { organizationId }) : { value: SETTINGS.email.fromEnv(process.env) ?? SETTINGS.email.default };
  const no = unusable(value);
  if (no) return { sent: false, error: no };
  try {
    await deliver(value, message);
    return { sent: true };
  } catch (err) {
    const error = (err as Error).message;
    console.error("email not sent", error);
    await recordAudit({ actor: "artbucket" }, "email.failed", message.to, { subject: message.subject, error }, { organizationId, workspaceId: null });
    return { sent: false, error };
  }
}

/** Whether a password reset could reach anyone: the server's email works, or some organization's does. */
export async function canResetPasswords() {
  if (!unusable(SETTINGS.email.fromEnv(process.env) ?? SETTINGS.email.default)) return true;
  const [row] = await db
    .select({ id: settings.id })
    .from(settings)
    .where(and(eq(settings.key, "email"), sql`(${settings.value} ->> 'enabled')::boolean`))
    .limit(1);
  return !!row;
}

/** A reset link, through the first of the person's organizations that can send, or the server's email. */
export async function sendPasswordReset(user: { id: string; email: string; name: string }, url: string) {
  const orgs = await db
    .selectDistinct({ id: grants.organizationId, created: organizations.createdAt })
    .from(grants)
    .innerJoin(organizations, eq(organizations.id, grants.organizationId))
    .where(eq(grants.userId, user.id))
    .orderBy(organizations.createdAt);
  const message = layout({
    to: user.email,
    subject: "Reset your Artbucket password",
    lines: [`Hi ${user.name || user.email},`, "Someone asked to reset your password. If it was you, the link below works for an hour. If not, ignore this."],
    action: { label: "Choose a new password", url },
  });
  for (const o of orgs) {
    const { value } = await effective("email", { organizationId: o.id });
    if (!unusable(value)) return sendAs(o.id, message);
  }
  return sendAs(null, message);
}

export function invitationEmail(to: string, i: { invitedBy: string; organization: string; label: string | null; scope: string; url: string }) {
  return layout({
    to,
    subject: `${i.invitedBy} invited you to ${i.label ?? i.organization} on Artbucket`,
    lines: [
      `${i.invitedBy} invited you to ${i.label && i.label !== i.organization ? `${i.label} in ${i.organization}` : i.organization}, with ${i.scope} access.`,
      "The link works once, for a week.",
    ],
    action: { label: "Accept the invitation", url: i.url },
  });
}

export const testEmail = (to: string, organization: string) =>
  layout({
    to,
    subject: "Artbucket can send email",
    lines: [`This is a test from ${organization}'s settings. Invitations and password resets will arrive like this.`],
    action: { label: "Open Artbucket", url: env.APP_URL },
  });
