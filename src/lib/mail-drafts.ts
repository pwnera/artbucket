import type { Draft, Section } from "@/lib/branding";
import type { Digest } from "@/lib/core/digest";

/**
 * What each email says, before it is branded (lib/branding.ts render) and sent (lib/core/mail.ts sendAs): plain
 * functions of what happened, so Storybook draws the real ones (App/Emails) and artbucket.io frames them.
 */
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

/**
 * The weekly digest (lib/core/digest.ts): the week's counts across the top, then a part per kind of news that has
 * something, each row linking where to act on it. Plain words, nothing to decode.
 */
export function digestEmail(
  to: string,
  w: { project: string; url: string; projectId: string; start: Date; digest: Digest; unsubscribe: string },
): Draft {
  const { digest: d } = w;
  const at = (path: string) => `${w.url}${path}${path.includes("?") ? "&" : "?"}project=${w.projectId}`;
  const library = at("/library");
  const files = (names: string[], meta: string, max = 4): Section => ({
    title: "",
    rows: names.slice(0, max).map((text) => ({ text, url: library, meta })),
    ...(names.length > max ? { more: { text: `And ${names.length - max} more in the library`, url: library } } : {}),
  });
  const sections: Section[] = [];
  if (d.releases.length) sections.push({ title: "Brand releases", rows: d.releases.map((r) => ({ text: `${r.brand} @${r.version}`, url: at(`/brands/${r.slug}`), meta: "Released", note: r.note ?? undefined })) });
  if (d.added.length) sections.push({ ...files(d.added, "New"), title: `New assets (${d.added.length})` });
  if (d.replaced.length) sections.push({ ...files(d.replaced, "New version"), title: `New versions (${d.replaced.length})` });
  if (d.expiringTotal)
    sections.push({
      title: "Licenses ending in the next two weeks",
      rows: d.expiring.map((e) => ({ text: e.title, url: at(`/assets/${e.id}`), meta: `Last day ${day(e.expires)}`, note: e.replacement ? `Replaced by ${e.replacement}` : undefined })),
      ...(d.expiringTotal > d.expiring.length ? { more: { text: `And ${d.expiringTotal - d.expiring.length} more`, url: library } } : {}),
    });
  if (d.gaps.length) sections.push({ title: "Searches that found nothing", rows: d.gaps.map((q) => ({ text: `"${q}"`, url: at("/insights"), meta: "No results" })) });
  if (d.review) sections.push({ title: "Waiting for review", rows: [{ text: plural(d.review, "asset waits", "assets wait") + " for a decision", url: at("/review"), meta: "Review" }] });
  const stats = [
    { value: String(d.releases.length), label: d.releases.length === 1 ? "release" : "releases" },
    { value: String(d.added.length + d.replaced.length), label: "new or updated" },
    { value: String(d.expiringTotal), label: d.expiringTotal === 1 ? "license ending" : "licenses ending" },
    { value: String(d.review), label: "to review" },
  ];
  const end = new Date(w.start.getTime() + 6 * 86_400_000);
  return {
    to,
    subject: `Your week in ${w.project}`,
    heading: { title: `Your week in ${w.project}`, sub: `${day(w.start)} to ${day(end)}` },
    stats,
    sections,
    lines: [`You get this on Mondays as an editor of ${w.project}. Turn it off in Settings, under Notifications, or unsubscribe below.`],
    action: { label: `Open ${w.project}`, url: at("/") },
    unsubscribe: w.unsubscribe,
  };
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
