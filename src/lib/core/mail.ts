import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { grants, organizations, settings } from "@/lib/db/schema";
import { recordAudit } from "@/lib/core/audit";
import { effective } from "@/lib/core/settings";
import { emailBrand } from "@/lib/core/branding";
import { render, type Draft } from "@/lib/branding";
import { deliver, unusable } from "@/lib/email";
import { SETTINGS } from "@/lib/settings";

/**
 * What the app emails, and through whose settings: an organization's own,
 * else the server's (EMAIL_*), in the organization's brand (lib/branding.ts):
 * `{product}` in a draft is its product name. Email is a courtesy, never a step: whatever
 * sent it has already happened, and a link to copy is always shown too. So a
 * failure is logged and audited, not thrown.
 */

export type Sent = { sent: boolean; error?: string };

export async function sendAs(organizationId: string | null, draft: Draft): Promise<Sent> {
  const { value } = organizationId ? await effective("email", { organizationId }) : { value: SETTINGS.email.fromEnv(process.env) ?? SETTINGS.email.default };
  const no = unusable(value);
  if (no) return { sent: false, error: no };
  const message = render(draft, await emailBrand(organizationId));
  try {
    await deliver(value, message);
    return { sent: true };
  } catch (err) {
    const error = (err as Error).message;
    console.error("email not sent", error);
    await recordAudit({ actor: "server" }, "email.failed", message.to, { subject: message.subject, error }, { organizationId, workspaceId: null });
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
  const message: Draft = {
    to: user.email,
    subject: "Reset your {product} password",
    lines: [`Hi ${user.name || user.email},`, "Someone asked to reset your password. If it was you, the link below works for an hour. If not, ignore this."],
    action: { label: "Choose a new password", url },
  };
  for (const o of orgs) {
    const { value } = await effective("email", { organizationId: o.id });
    if (!unusable(value)) return sendAs(o.id, message);
  }
  return sendAs(null, message);
}

export function invitationEmail(to: string, i: { invitedBy: string; organization: string; label: string | null; scope: string; url: string }): Draft {
  return {
    to,
    subject: `${i.invitedBy} invited you to ${i.label ?? i.organization} on {product}`,
    lines: [
      `${i.invitedBy} invited you to ${i.label && i.label !== i.organization ? `${i.label} in ${i.organization}` : i.organization}, with ${i.scope} access.`,
      "The link works once, for a week.",
    ],
    action: { label: "Accept the invitation", url: i.url },
  };
}

/** A share link, sent to someone: to send files in, or to look and download. */
export function shareEmail(
  to: string,
  s: { by: string; organization: string; kind: "view" | "upload"; name: string; url: string; password: boolean; expiresAt: Date | null },
): Draft {
  const until = s.expiresAt ? ` It works until ${s.expiresAt.toISOString().slice(0, 10)}.` : "";
  const pw = s.password ? " It asks for a password; they'll send it to you separately." : "";
  return {
    to,
    subject: s.kind === "upload" ? `${s.by} asks you to send files: ${s.name}` : `${s.by} shared ${s.name} with you`,
    lines:
      s.kind === "upload"
        ? [`${s.by} at ${s.organization} asks you to send files for ${s.name}. No account needed: open the link and drop them in.${until}${pw}`]
        : [`${s.by} at ${s.organization} shared ${s.name} with you, to look at and download. No account needed.${until}${pw}`],
    action: { label: s.kind === "upload" ? "Send files" : "Open", url: s.url },
  };
}

/** To an admin: someone asks into a portal. */
export function portalRequestEmail(to: string, r: { portal: string; who: string; note: string | null; url: string }): Draft {
  return {
    to,
    subject: `${r.who} asks for access to ${r.portal}`,
    lines: [`${r.who} asks for access to the ${r.portal} portal.`, ...(r.note ? [`They say: "${r.note}"`] : [])],
    action: { label: "Review the request", url: r.url },
  };
}

/** To whoever asked: yes, and their own link. */
export function portalAccessEmail(to: string, a: { portal: string; organization: string; url: string; until: Date }): Draft {
  return {
    to,
    subject: `You have access to ${a.portal}`,
    lines: [
      `${a.organization} gave you access to ${a.portal}. The link below is yours: keep it to yourself.`,
      `It works until ${a.until.toISOString().slice(0, 10)}.`,
    ],
    action: { label: `Open ${a.portal}`, url: a.url },
  };
}

/** Whether this organization's email can go out now. */
export async function canEmail(organizationId: string) {
  return !unusable((await effective("email", { organizationId })).value);
}

export const testEmail = (to: string, organization: string, url: string): Draft => ({
  to,
  subject: "{product} can send email",
  lines: [`This is a test from ${organization}'s settings. Invitations and password resets will arrive like this.`],
  action: { label: "Open {product}", url },
});
