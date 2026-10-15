import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, ne, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { digestOptOuts, digestsSent, users } from "@/lib/db/schema";
import { hiddenIn, projectsOf, type Caller, type Project } from "@/lib/core/access";
import { listActivity, type ActivityItem } from "@/lib/core/activity";
import { getAsset, searchAssets } from "@/lib/core/assets";
import { appUrlFor } from "@/lib/core/domains";
import { featureOnIn } from "@/lib/core/features";
import { insightsOf } from "@/lib/core/insights";
import { AssetError } from "@/lib/core/errors";
import { canEmail, digestEmail, sendAs } from "@/lib/core/mail";
import { limitsOf } from "@/lib/core/usage";
import { accessIn, highest } from "@/lib/access";
import { planHas } from "@/lib/limits";
import { env } from "@/lib/env";
import { today } from "@/lib/rights";
import { allows } from "@/lib/scopes";

/**
 * The weekly digest (PRD item 9): on Mondays, each editor and admin of a
 * project gets what happened there the week before, in one short email.
 * Only what has something in it: brands released, assets new or replaced,
 * licenses ending in the next EXPIRING_DAYS days, searches that found nothing,
 * and what waits for review. Nothing in any of them, no email.
 *
 * Read through the same calls as the app, as that person: the activity
 * (lib/core/activity.ts), the library's search (lib/core/assets.ts) and
 * Insights (lib/core/insights.ts), so it shows nothing they couldn't open.
 * Viewers and contributors get none: Insights and review are editors'.
 * Anyone can turn it off, in Settings or from the email's own link.
 */

/** How far ahead a license's end is worth a line. */
export const EXPIRING_DAYS = 14;
/** How many names a section lists before "and N more". */
const NAMES = 5;
/** Pages of activity read back to the week's start: a week busier than this is summed from its newest. */
const PAGES = 10;

const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** The ISO week a moment is in, in UTC: `2026-W42`. */
export function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // The week's Thursday names its year, and how many Thursdays that year has had is the week.
  t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7));
  const week = Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / DAY + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** The week before the one `now` is in: Monday 00:00 UTC to the next. */
export function lastWeek(now: Date) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - ((now.getUTCDay() + 6) % 7) * DAY);
  const start = new Date(end.getTime() - 7 * DAY);
  return { start, end, week: isoWeek(start) };
}

// ---- the unsubscribe link -------------------------------------------------------

const mac = (userId: string) => createHmac("sha256", env.BETTER_AUTH_SECRET).update(`digest-off:${userId}`).digest("base64url").slice(0, 22);

/** The token in a person's unsubscribe link: their id, signed. It never expires: an old email's link still works. */
export const unsubscribeToken = (userId: string) => `${userId}.${mac(userId)}`;

/** Whose token this is, or null when it isn't one of ours. */
export function tokenUser(token: string) {
  const at = token.lastIndexOf(".");
  if (at < 1) return null;
  const [userId, got] = [token.slice(0, at), Buffer.from(token.slice(at + 1))];
  const want = Buffer.from(mac(userId));
  return want.length === got.length && timingSafeEqual(want, got) ? userId : null;
}

// ---- turning it off and on ------------------------------------------------------

/** Whether this person gets the weekly digest: on unless they turned it off. */
export async function digestOn(userId: string) {
  const [off] = await db.select({ userId: digestOptOuts.userId }).from(digestOptOuts).where(eq(digestOptOuts.userId, userId));
  return !off;
}

export async function setDigest(userId: string, on: boolean) {
  if (on) await db.delete(digestOptOuts).where(eq(digestOptOuts.userId, userId));
  else await db.insert(digestOptOuts).values({ userId }).onConflictDoNothing();
  return on;
}

/** The person calling: the digest is theirs, never a key's. */
function person(caller: Caller) {
  if (!caller.user) throw new AssetError("forbidden", "The weekly digest is a person's: sign in to change yours");
  return caller.user.id;
}

/** GET /api/v1/me/digest: whether you get it. */
export const myDigest = async (caller: Caller) => ({ weekly: await digestOn(person(caller)) });

/** PATCH /api/v1/me/digest: turn it on or off. */
export const setMyDigest = async (caller: Caller, weekly: boolean) => ({ weekly: await setDigest(person(caller), weekly) });

/** POST /api/v1/unsubscribe/{token}: the email's link, no sign-in. False when the token isn't one. */
export async function unsubscribe(token: string) {
  const userId = tokenUser(token);
  if (!userId) return false;
  const [known] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
  if (known) await setDigest(userId, false);
  return !!known;
}

// ---- what it says ---------------------------------------------------------------

export type Digest = {
  releases: { brand: string; slug: string; version: number; note: string | null }[];
  added: string[];
  replaced: string[];
  expiring: { id: string; title: string; expires: string; replacement: string | null }[];
  /** Every license ending in the window, beyond the ones listed. */
  expiringTotal: number;
  gaps: string[];
  review: number;
};

/** Whether a digest has anything to say. */
export const isEmpty = (d: Digest) => !d.releases.length && !d.added.length && !d.replaced.length && !d.expiringTotal && !d.gaps.length && !d.review;

/** The week before `now` in the caller's project, as they may see it. */
export async function digestOf(caller: Caller, now = new Date()): Promise<Digest> {
  const { start, end } = lastWeek(now);
  const items: ActivityItem[] = [];
  let before: string | undefined = end.toISOString();
  for (let page = 0; page < PAGES && before; page++) {
    const { data, next } = await listActivity(caller, { before, limit: 100 });
    items.push(...data.filter((i) => i.at >= start));
    before = data.length && data.at(-1)!.at >= start ? (next ?? undefined) : undefined;
  }
  const names = (pick: (i: ActivityItem) => boolean) => [...new Map(items.filter(pick).map((i) => [i.assetId ?? i.id, i.label])).values()];

  // Licenses as the library reads them, from the server's today: approved, not ended yet, ending within EXPIRING_DAYS.
  const [expiring, review, insights] = await Promise.all([
    searchAssets(caller, { status: ["active"], expiresBefore: ymd(new Date(Date.parse(today()) + (EXPIRING_DAYS + 1) * DAY)), limit: 50 }),
    searchAssets(caller, { review: true, limit: 1 }),
    featureOnIn("insights", caller.project.id).then((on) => (on ? insightsOf(caller) : null)),
  ]);
  // ponytail: the 50 newest of those, soonest first; search would need an order by `expires` for a project with more in a fortnight.
  const soonest = expiring.data.sort((a, b) => a.rights!.expires!.localeCompare(b.rights!.expires!)).slice(0, NAMES);

  return {
    releases: items.flatMap((i) => (i.verb === "published" && i.brand ? [{ brand: i.brand.name, slug: i.brand.slug, version: i.brand.version, note: i.detail?.note ?? null }] : [])).reverse(),
    added: names((i) => (i.verb === "added" && !i.detail?.version) || i.verb === "approved"),
    replaced: names((i) => (i.verb === "added" && !!i.detail?.version) || i.verb === "made_current"),
    expiring: await Promise.all(
      soonest.map(async (a) => {
        const by = a.supersededBy ? await getAsset(caller, a.supersededBy) : null;
        return { id: a.id, title: a.metadata?.title || a.filename, expires: a.rights!.expires!, replacement: by && (by.metadata?.title || by.filename) };
      }),
    ),
    expiringTotal: expiring.total,
    gaps: (insights?.gaps ?? []).filter((g) => g.q && g.last >= ymd(start)).map((g) => g.q),
    review: review.total,
  };
}

// ---- sending --------------------------------------------------------------------

/** Who the digest goes to: people with an account who haven't turned it off. */
const readers = () =>
  db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(notInArray(users.id, db.select({ id: digestOptOuts.userId }).from(digestOptOuts)));

/**
 * With the sweep (lib/core/sweep.ts), on Mondays (UTC): last week's digest
 * to each editor and admin of each project, once. A run finds who is due,
 * builds what they see, and claims the week before sending, so two
 * instances sweeping at once send it once. Only where the organization can
 * email (lib/core/mail.ts canEmail), whose plan has the digest (lib/limits.ts
 * `digest`), and not to a read-only one. How many went.
 *
 * ponytail: every person's digest is built on its own, a handful of queries
 * each. Fine to some thousands of people; past that, build once per project
 * and access, and spread the sending over the day.
 */
export async function sendDigests(now = new Date()) {
  if (now.getUTCDay() !== 1) return 0;
  const { start, week } = lastWeek(now);
  const emails = new Map<string, Promise<boolean>>();
  const mayEmail = (organizationId: string) =>
    emails.get(organizationId) ??
    emails
      .set(
        organizationId,
        Promise.all([canEmail(organizationId), limitsOf(organizationId)]).then(([can, limits]) => can && !limits.readOnly && planHas(limits.features, "digest")),
      )
      .get(organizationId)!;
  let sent = 0;
  for (const user of await readers()) {
    const { grants: mine, projects } = await projectsOf(user.id);
    const done = new Map(
      (await db.select().from(digestsSent).where(eq(digestsSent.userId, user.id))).map((r) => [r.projectId, r.week]),
    );
    for (const project of projects) {
      if (done.get(project.id) === week || !(await mayEmail(project.organizationId))) continue;
      const access = accessIn(mine, project, await hiddenIn(project.id));
      if (!allows(access.scope, "write")) continue;
      const orgScope = highest(...mine.filter((g) => g.resource === "organization" && g.resourceId === project.organizationId).map((g) => g.scope));
      const caller: Caller = { project, ...access, orgScope, actor: user.name || user.email, user, key: null, ip: null };
      const digest = await digestOf(caller, now);
      if (isEmpty(digest)) continue;
      if (!(await claim(user.id, project.id, week))) continue;
      const url = await appUrlFor(project.organizationId);
      const r = await sendAs(project.organizationId, digestEmail(user.email, { project: projectName(project), url, projectId: project.id, start, digest, unsubscribe: `${url}/unsubscribe/${unsubscribeToken(user.id)}` }), { capped: false });
      if (r.sent) sent++;
    }
  }
  return sent;
}

/** The project as an email names it: with its organization, when they differ. */
const projectName = (p: Project) => (p.name === p.organization.name ? p.name : `${p.organization.name} ${p.name}`);

/** Takes the week for this person and project, unless an instance already has. */
async function claim(userId: string, projectId: string, week: string) {
  const [row] = await db
    .insert(digestsSent)
    .values({ userId, projectId, week })
    .onConflictDoUpdate({ target: [digestsSent.userId, digestsSent.projectId], set: { week }, setWhere: ne(digestsSent.week, week) })
    .returning({ week: digestsSent.week });
  return !!row;
}
