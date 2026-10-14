import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { grants, organizations, settings } from "@/lib/db/schema";
import { recordAudit } from "@/lib/core/audit";
import { effective } from "@/lib/core/settings";
import { emailBrand } from "@/lib/core/branding";
import { render, type Draft, type Line } from "@/lib/branding";
import type { Digest } from "@/lib/core/digest";
import { deliver, unusable } from "@/lib/email";
import { limiter } from "@/lib/rate";
import { SETTINGS } from "@/lib/settings";
import { limitsOf } from "@/lib/core/usage";

/**
 * What the app emails, and through whose settings: an organization's own,
 * else the server's (EMAIL_*), in the organization's brand (lib/branding.ts):
 * `{product}` in a draft is its product name. Email is a courtesy, never a step: whatever
 * sent it has already happened, and a link to copy is always shown too. So a
 * failure is logged and audited, not thrown.
 */

/** `limited`: past the organization's emails for the day, so the caller can answer 429. */
export type Sent = { sent: boolean; error?: string; limited?: true };

/**
 * The organization's `emails` limit a day (lib/limits.ts), so one can't spend
 * the sender's reputation that everyone's sign-up codes and password resets
 * depend on. One counter per limit, as plans differ.
 *
 * ponytail: in memory, per process (lib/rate.ts): a restart forgets the day,
 * several instances each allow it, and a new plan starts its count over. A
 * table when that matters.
 */
const daily = new Map<number, ReturnType<typeof limiter>>();
const counter = (max: number) => daily.get(max) ?? daily.set(max, limiter(max, 24 * 60 * 60_000)).get(max)!;

/** `capped: false` for mail only to the person's own address (a password reset) or the organization's admins. */
export async function sendAs(organizationId: string | null, draft: Draft, { capped = true } = {}): Promise<Sent> {
  const { value } = organizationId ? await effective("email", { organizationId }) : { value: SETTINGS.email.fromEnv(process.env) ?? SETTINGS.email.default };
  const no = unusable(value);
  if (no) return { sent: false, error: no };
  const max = organizationId && capped ? (await limitsOf(organizationId)).emails : null;
  const wait = max === null ? 0 : counter(max).hit(organizationId!);
  if (wait) {
    const error = `This organization sent its ${max} emails for today: more can go out in ${Math.ceil(wait / 3600)} h`;
    return { sent: false, error, limited: true };
  }
  const message = render(draft, await emailBrand(organizationId));
  try {
    await deliver(value, message);
    return { sent: true };
  } catch (err) {
    const error = (err as Error).message;
    console.error("email not sent", error);
    await recordAudit({ actor: "server" }, "email.failed", message.to, { subject: message.subject, error }, { organizationId, projectId: null });
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
    if (!unusable(value)) return sendAs(o.id, message, { capped: false });
  }
  return sendAs(null, message);
}

/** The code a new account confirms its address with (lib/auth.ts): from the server's own email, as no organization is theirs yet. */
export const sendSignUpCode = (to: string, code: string) =>
  sendAs(null, {
    to,
    subject: `${code} is your {product} code`,
    lines: ["Enter this code to confirm your email address and finish making your account. It works for ten minutes.", "If you didn't ask for it, ignore this."],
    code,
  });

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

/** To a site's admins: something a live build shows may no longer be used (lib/core/sites.ts recheckSites). */
export function siteProblemsEmail(to: string, s: { site: string; path: string; problems: string[]; url: string }): Draft {
  return {
    to,
    subject: `${s.site} shows what may no longer be used`,
    lines: [
      `The build live at ${s.path} on ${s.site} was checked again today, and some of what it shows may no longer be used:`,
      ...s.problems.slice(0, 10),
      ...(s.problems.length > 10 ? [`And ${s.problems.length - 10} more.`] : []),
      "It stays live: deploy a build without them, or restore one that has none.",
    ],
    action: { label: "Open the site", url: s.url },
  };
}

/**
 * To whoever answers for a place that still loads replaced versions (lib/core/insights.ts notifyStale): what each is
 * now, at a link that always leads to the current version.
 */
export function staleVersionEmail(
  to: string,
  s: { by: string; organization: string; place: string; agent: boolean; assets: { title: string; version: number | null; current: { title: string; version: number | null; url: string } }[] },
): Draft {
  const v = (n: number | null) => (n === null ? "" : ` v${n}`);
  const [one] = s.assets;
  const where = s.agent ? `Your agent ${s.place}` : s.place;
  return {
    to,
    subject: s.assets.length === 1 ? `${where} still uses an old version of ${one.title}` : `${where} still uses old versions of ${s.assets.length} assets`,
    lines: [
      `${s.by} at ${s.organization} noticed that ${s.agent ? `the agent ${s.place}` : s.place} still loads ${s.assets.length === 1 ? "a version" : "versions"} replaced since:`,
      ...s.assets.map((a) => {
        const now = [a.current.title === a.title ? "" : a.current.title, v(a.current.version).trim()].filter(Boolean).join(" ") || "a new file";
        return `${a.title}${v(a.version)} is now ${now}: ${a.current.url}`;
      }),
      "Each link always leads to the current version: use it instead, and the next one reaches you without a change.",
    ],
    ...(s.assets.length === 1 && { action: { label: "Open the current version", url: one.current.url } }),
  };
}

/** To the operator (SITE_REVIEW_EMAIL): a build that looks like phishing or malware waits, not served, for a person to decide. */
export function siteHeldEmail(to: string, h: { organization: string; site: string; path: string; deployment: string; flags: string[] }): Draft {
  return {
    to,
    subject: `A build waits for review: ${h.organization}, ${h.site}`,
    lines: [
      `A build deployed by ${h.organization} to the site ${h.site}, at ${h.path}, looks like phishing or malware, and is held:`,
      ...h.flags,
      `Its deployment is ${h.deployment}. Release it, or refuse it, as the Sites guide says under "Held for review".`,
    ],
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

const day = (d: Date | string) => new Date(d).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "a, b, c and 2 more": the first `max` named. */
const listed = (names: string[], max = 5) => {
  const shown = names.slice(0, max);
  const more = names.length - shown.length;
  return more > 0 ? `${shown.join(", ")} and ${more} more` : shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}` : shown.join("");
};

/**
 * The weekly digest (lib/core/digest.ts): a line or two per section that has
 * something, each linking where to act on it. Plain words, nothing to decode.
 */
export function digestEmail(
  to: string,
  w: { project: string; url: string; projectId: string; start: Date; digest: Digest; unsubscribe: string },
): Draft {
  const { digest: d } = w;
  const at = (path: string) => `${w.url}${path}${path.includes("?") ? "&" : "?"}project=${w.projectId}`;
  const lines: Line[] = [`Here is your week in ${w.project}, from ${day(w.start)} to ${day(new Date(w.start.getTime() + 6 * 86_400_000))}.`];
  if (d.releases.length) {
    lines.push(`${plural(d.releases.length, "brand release")} went out:`);
    for (const r of d.releases) lines.push({ text: `${r.brand}, version ${r.version}${r.note ? `: ${r.note}` : ""}`, url: at(`/brands/${r.slug}`) });
  }
  if (d.added.length) lines.push({ text: `${plural(d.added.length, "new asset")}: ${listed(d.added)}.`, url: at("/library") });
  if (d.replaced.length) lines.push({ text: `${plural(d.replaced.length, "asset")} got a new version: ${listed(d.replaced)}.`, url: at("/library") });
  if (d.expiringTotal) {
    lines.push(`${plural(d.expiringTotal, "license")} ${d.expiringTotal === 1 ? "ends" : "end"} in the next two weeks:`);
    for (const e of d.expiring) lines.push({ text: `${e.title}, last day ${day(e.expires)}${e.replacement ? `. Replaced by ${e.replacement}` : ""}`, url: at(`/assets/${e.id}`) });
    if (d.expiringTotal > d.expiring.length) lines.push(`And ${d.expiringTotal - d.expiring.length} more.`);
  }
  if (d.gaps.length) lines.push({ text: `People searched for ${listed(d.gaps.map((q) => `"${q}"`))} and found nothing.`, url: at("/insights") });
  if (d.review) lines.push({ text: `${plural(d.review, "asset waits", "assets wait")} for review.`, url: at("/review") });
  lines.push(`You get this on Mondays as an editor of ${w.project}. Turn it off in Settings, under Notifications, or unsubscribe below.`);
  return { to, subject: `Your week in ${w.project}`, lines, action: { label: `Open ${w.project}`, url: at("/") }, unsubscribe: w.unsubscribe };
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

/** An automation's email (lib/core/automations.ts): a brand released. */
export function releasedEmail(to: string, r: { automation: string; brand: string; release: number; note: string | null; url: string }): Draft {
  return {
    to,
    subject: `${r.brand} release ${r.release} is out`,
    lines: [
      `The ${r.brand} guidelines were released as release ${r.release}.`,
      ...(r.note ? [`What changed: ${r.note}`] : []),
      `You get this from the automation "${r.automation}".`,
    ],
    action: { label: `Open ${r.brand}`, url: r.url },
  };
}

/** An automation's email: an asset's license ends soon, on `expires`, its last day of use. */
export function expiringEmail(to: string, e: { automation: string; asset: string; expires: string; days: number; url: string }): Draft {
  const when = e.days === 0 ? "today" : e.days === 1 ? "tomorrow" : `in ${e.days} days`;
  return {
    to,
    subject: `${e.asset} may be used until ${e.expires}`,
    lines: [
      `The license of ${e.asset} ends ${when}: ${e.expires} is its last day of use. After it, checks refuse it and it is no longer served.`,
      "Renew the license and set the new date, or replace it.",
      `You get this from the automation "${e.automation}".`,
    ],
    action: { label: "Open the asset", url: e.url },
  };
}

/** An automation's email for any other event: its summary (lib/automations.ts summaryOf) and where to look. */
export function automationEmail(to: string, e: { automation: string; summary: string; url: string }): Draft {
  return {
    to,
    subject: e.summary,
    lines: [`${e.summary}.`, `You get this from the automation "${e.automation}".`],
    action: { label: "Open it", url: e.url },
  };
}
