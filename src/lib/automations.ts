/**
 * What an automation's run says, apart from how it is sent: whether a
 * governance filter takes an action, the line a run is summed up in (the run
 * log, an email's subject, a chat message), and the bodies Slack and Teams
 * take. lib/core/automations.ts fires and delivers.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

/** What sets an automation off. */
export const AUTOMATION_TRIGGERS = ["brand.released", "asset.expiring", "governance", "check.refused", "fix.opened", "review.waiting"] as const;
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];
/** What it does then. */
export const AUTOMATION_ACTIONS = ["email", "webhook"] as const;

/** What Fixes lists that fires `fix.opened`: places on old versions, searches that found nothing. */
export const FIX_KINDS = ["stale", "gap"] as const;
export type FixKind = (typeof FIX_KINDS)[number];

/** How a webhook's body is shaped: Artbucket's own JSON, a Slack incoming webhook's, a Teams workflow's. */
export const WEBHOOK_FORMATS = ["json", "slack", "teams"] as const;
export type WebhookFormat = (typeof WEBHOOK_FORMATS)[number];

/**
 * The asset decisions in the activity that are governance, each fired as
 * `asset.{verb}`: what the library holds and what became of suggestions.
 * Adding and suggesting are not: they wait in review (`review.waiting`).
 */
export const GOVERNED_VERBS = [
  "approved",
  "rejected",
  "archived",
  "unarchived",
  "made_current",
  "deleted",
  "restored",
  "accepted_tags",
  "dismissed_tags",
  "accepted_fields",
  "dismissed_fields",
] as const;

/** Whether a governance automation's `actions` take `action`: exact names or `prefix.*`; none means all. */
export const takes = (actions: readonly string[], action: string) =>
  !actions.length || actions.some((a) => (a.endsWith(".*") ? action.startsWith(a.slice(0, -1)) : a === action));

/** An action filter as an API caller may write it: `share.*` or `grant.set`, lower case. */
export const ACTION_PATTERN = /^[a-z_]+(\.[a-z_]+|\.\*)$/;

type Named = { filename?: string; title?: string | null };
const nameOf = (a: unknown) => {
  const x = (a ?? {}) as Named;
  return x.title || x.filename || "An asset";
};
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** A run in one line, from what it posts. */
export function summaryOf(p: Record<string, unknown>): string {
  const line = ((): string => {
    switch (p.event) {
      case "brand.released":
        return `${(p.brand as { name: string }).name} release ${p.release} is out`;
      case "asset.expiring":
        return `${nameOf(p.asset)} may be used until ${p.expires}`;
      case "governance":
        return `${p.actor ?? "Someone"}: ${p.action}${p.target ? ` ${p.target}` : ""}`;
      case "check.refused":
        return `${nameOf(p.asset)} was refused ${plural(Number(p.refusals), "time")} in ${plural(Number(p.days), "day")}`;
      case "fix.opened":
        return p.kind === "gap"
          ? `Searched ${plural(Number(p.searches), "time")}, found nothing: "${p.q}"`
          : `${p.place ?? "A place"} still loads ${nameOf(p.asset)}, a replaced version`;
      case "review.waiting":
        return `${nameOf(p.asset)} has waited ${plural(Number(p.days), "day")} for review`;
      default:
        return String(p.event ?? "Something happened");
    }
  })();
  return p.test ? `Test: ${line}` : line;
}

/**
 * What a webhook posts in its format: the run's own JSON, or a chat
 * message of its summary and a link. Slack's incoming webhooks take `text`
 * with `<url|label>` links; a Teams workflow ("when a webhook request is
 * received") takes a message with an Adaptive Card, as Microsoft's own
 * example has it, whose buttons it doesn't draw.
 */
export function bodyIn(format: WebhookFormat, p: Record<string, unknown>): Record<string, unknown> {
  if (format === "json") return p;
  const text = summaryOf(p);
  const url = typeof p.url === "string" ? p.url : null;
  const from = (p.automation as { name?: string } | undefined)?.name;
  if (format === "slack") return { text: `${text}${url ? ` <${url}|Open>` : ""}${from ? `\n_${from}_` : ""}` };
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          // Workflows don't draw a card's buttons: the link is Markdown in its text, which they do.
          body: [
            { type: "TextBlock", text: url ? `${text} [Open](${url})` : text, wrap: true, weight: "Bolder" },
            ...(from ? [{ type: "TextBlock", text: from, wrap: true, isSubtle: true, size: "Small" }] : []),
          ],
        },
      },
    ],
  };
}

/**
 * Ready-made automations (the Automations page's recipes): what they fire
 * on and how they tell, without who to tell, which the person adds. Each is
 * an AutomationInput but for `emails` or `url`.
 */
export type Recipe = {
  id: string;
  name: string;
  says: string;
  trigger: AutomationTrigger;
  days?: number;
  times?: number;
  actions?: string[];
  kind?: FixKind;
  action: (typeof AUTOMATION_ACTIONS)[number];
  format?: WebhookFormat;
};

export const RECIPES: Recipe[] = [
  {
    id: "shares-to-slack",
    name: "New share links to Slack",
    says: "Post to a channel whenever someone shares a collection or a project outside it.",
    trigger: "governance",
    actions: ["share.created", "share.project", "asset.published"],
    action: "webhook",
    format: "slack",
  },
  {
    id: "access-to-admins",
    name: "Access changes to the admins",
    says: "Email when a grant, a group or an API key changes who may do what.",
    trigger: "governance",
    actions: ["grant.*", "group.members", "key.created", "key.revoked"],
    action: "email",
  },
  {
    id: "licenses-to-legal",
    name: "Licenses ending, to legal",
    says: "Email a month before an approved asset's last day of use.",
    trigger: "asset.expiring",
    days: 30,
    action: "email",
  },
  {
    id: "refusals-to-brand",
    name: "An asset the check keeps refusing",
    says: "Email the brand team when agents or people are refused the same asset three times in a week: the guidelines may have a gap.",
    trigger: "check.refused",
    times: 3,
    days: 7,
    action: "email",
  },
  {
    id: "fixes-to-teams",
    name: "New Fixes to Teams",
    says: "Post to a Teams channel when a place still loads an old version, or a search finds nothing.",
    trigger: "fix.opened",
    action: "webhook",
    format: "teams",
  },
  {
    id: "nudge-reviewers",
    name: "Nudge reviewers",
    says: "Email when a proposal has waited three days for review.",
    trigger: "review.waiting",
    days: 3,
    action: "email",
  },
  {
    id: "decisions-to-slack",
    name: "Approvals and rejections to Slack",
    says: "Post each review decision to a channel.",
    trigger: "governance",
    actions: ["asset.approved", "asset.rejected"],
    action: "webhook",
    format: "slack",
  },
  {
    id: "release-rebuilds",
    name: "Rebuild a site on each release",
    says: "Post a signed webhook to your CI when any brand is released.",
    trigger: "brand.released",
    action: "webhook",
    format: "json",
  },
];
