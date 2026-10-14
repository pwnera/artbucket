import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/lib/db";
import { assets, audit, automationRuns, automations, brands, brandVersions, eventCounts, projects } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { recordAudit } from "@/lib/core/audit";
import { resolveBrand } from "@/lib/core/brands";
import { AssetError } from "@/lib/core/errors";
import { signHook } from "@/lib/core/features";
import { gapsIn, staleIn } from "@/lib/core/insights";
import { automationEmail, expiringEmail, releasedEmail, sendAs } from "@/lib/core/mail";
import { bodyIn, summaryOf, takes, type AutomationTrigger } from "@/lib/automations";
import { env } from "@/lib/env";
import { postPublic } from "@/lib/fetch-public";
import { can, needs } from "@/lib/permissions";
import { today } from "@/lib/rights";
import type { AutomationInput, AutomationPatch } from "@/lib/schemas";
import { seal, unseal } from "@/lib/settings";

/**
 * Automations (PRD item 7): when a brand is released, an asset's license is
 * about to end, governance changes (the audit log, an asset decision), the
 * use check keeps refusing an asset, Fixes finds something new or a proposal
 * waits in review, tell someone, by email or by a webhook signed as
 * features' hooks are (signHook), as JSON or as a Slack or Teams message. Each thing that sets one off is a run, made once
 * (its `key`), and delivered at once; a failed delivery is tried again by
 * runAutomations, after BACKOFF, MAX_ATTEMPTS in all, each attempt kept as
 * the run log. The project's admins manage them.
 */

type Row = typeof automations.$inferSelect;
type Run = typeof automationRuns.$inferSelect;
type Attempt = Run["attempts"][number];

/** Attempts per run, the first included. */
export const MAX_ATTEMPTS = 3;
/** Minutes to wait after the first and the second failure. */
const BACKOFF = [5, 60];
/** How long a delivery may hold a run before another instance may take it. */
const LEASE = sql`now() + interval '10 minutes'`;
/** Assets taken per automation per sweep (expiring, refused, waiting): the rest come next time. */
const EXPIRING_BATCH = 200;
/** check.refused's window when it names none, in days. */
const REFUSED_DAYS = 7;
const DAY = 86_400_000;

/** What each trigger is narrowed or timed by: anything else sent is refused. */
const TAKES: Record<AutomationTrigger, readonly ("brand" | "days" | "actions" | "times" | "kind")[]> = {
  "brand.released": ["brand"],
  "asset.expiring": ["days"],
  governance: ["actions"],
  "check.refused": ["days", "times"],
  "fix.opened": ["kind"],
  "review.waiting": ["days"],
};
/** Runs the log shows. */
const RUNS_SHOWN = 50;

const manage = (caller: Caller) => {
  if (!can(caller, "automation.manage")) throw new AssetError("forbidden", `Automations take ${needs("automation.manage")}`);
};

const hostOf = (sealed: string | null) => {
  const url = sealed && unseal(sealed, env.BETTER_AUTH_SECRET);
  return url ? new URL(url).host : null;
};

async function present(rows: Row[]) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const brandIds = rows.flatMap((r) => (r.brandId ? [r.brandId] : []));
  const [slugs, last] = await Promise.all([
    brandIds.length ? db.select({ id: brands.id, slug: brands.slug }).from(brands).where(inArray(brands.id, brandIds)) : [],
    db
      .selectDistinctOn([automationRuns.automationId], { id: automationRuns.automationId, status: automationRuns.status, at: automationRuns.createdAt })
      .from(automationRuns)
      .where(inArray(automationRuns.automationId, ids))
      .orderBy(automationRuns.automationId, desc(automationRuns.createdAt)),
  ]);
  return rows.map((r) => {
    const l = last.find((x) => x.id === r.id);
    return {
      id: r.id,
      name: r.name,
      trigger: r.trigger,
      brand: slugs.find((b) => b.id === r.brandId)?.slug ?? null,
      days: r.days,
      actions: r.actions,
      times: r.times,
      kind: r.kind,
      action: r.action,
      emails: r.emails,
      host: hostOf(r.url),
      format: r.format,
      enabled: r.enabled,
      last: l ? { status: l.status, at: l.at } : null,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  });
}

async function automationOf(caller: Caller, id: string) {
  const [a] = await db.select().from(automations).where(and(eq(automations.id, id), eq(automations.projectId, caller.project.id)));
  if (!a) throw new AssetError("not_found", "No such automation in this project");
  return a;
}

/** GET /api/v1/automations: the project's, oldest first. */
export async function listAutomations(caller: Caller) {
  manage(caller);
  return present(await db.select().from(automations).where(eq(automations.projectId, caller.project.id)).orderBy(asc(automations.createdAt)));
}

/**
 * The columns a create or a change writes, checked as a whole: what a trigger
 * and an action need, and nothing they don't. A webhook gets its secret the
 * first time it is one, given back once in `secret`.
 */
async function columns(caller: Caller, was: Row | null, input: z.infer<typeof AutomationPatch>) {
  const trigger = input.trigger ?? was?.trigger;
  const action = input.action ?? was?.action;
  if (!trigger || !action) throw new AssetError("invalid", "trigger and action are needed");
  const set: Partial<typeof automations.$inferInsert> = { trigger, action };
  if (input.name !== undefined) set.name = input.name;
  if (input.enabled !== undefined) set.enabled = input.enabled;

  const takes = TAKES[trigger];
  for (const k of ["brand", "days", "actions", "times", "kind"] as const) {
    if (input[k] != null && !takes.includes(k)) {
      const for_ = (Object.keys(TAKES) as AutomationTrigger[]).filter((t) => TAKES[t].includes(k));
      throw new AssetError("invalid", `${k} is for ${for_.join(" and ")}`);
    }
  }
  if (trigger !== "brand.released") set.brandId = null;
  else if (input.brand !== undefined) set.brandId = input.brand ? (await resolveBrand(caller.project.id, input.brand)).id : null;
  set.days = takes.includes("days") ? (input.days ?? was?.days ?? (trigger === "check.refused" ? REFUSED_DAYS : null)) : null;
  if (trigger === "asset.expiring" && set.days === null) throw new AssetError("invalid", "asset.expiring needs days: how many days before the license ends");
  if (trigger === "review.waiting" && set.days === null) throw new AssetError("invalid", "review.waiting needs days: how long a proposal may wait");
  if (trigger === "check.refused" && !set.days) throw new AssetError("invalid", "check.refused counts over at least a day");
  set.actions = trigger === "governance" ? [...new Set(input.actions ?? was?.actions ?? [])] : [];
  set.times = trigger === "check.refused" ? (input.times ?? was?.times ?? 1) : null;
  set.kind = trigger === "fix.opened" ? (input.kind !== undefined ? input.kind : (was?.kind ?? null)) : null;

  let secret: string | undefined;
  if (action === "email") {
    if (input.url !== undefined) throw new AssetError("invalid", "url is for webhook");
    set.emails = input.emails ? [...new Set(input.emails.map((e) => e.toLowerCase()))] : (was?.emails ?? []);
    if (!set.emails.length) throw new AssetError("invalid", "email needs emails: who it goes to");
    if (input.format !== undefined) throw new AssetError("invalid", "format is for webhook");
    set.url = null;
    set.secret = null;
    set.format = "json";
  } else {
    if (input.emails !== undefined) throw new AssetError("invalid", "emails is for email");
    set.emails = [];
    set.format = input.format ?? was?.format ?? "json";
    if (input.url) set.url = seal(input.url, env.BETTER_AUTH_SECRET);
    else if (!was?.url) throw new AssetError("invalid", "webhook needs url: where it is posted");
    if (!was?.secret) {
      secret = `whsec_${randomBytes(24).toString("base64url")}`;
      set.secret = seal(secret, env.BETTER_AUTH_SECRET);
    }
  }
  return { set, secret };
}

/** POST /api/v1/automations. A webhook's signing secret is in the answer, this once. */
export async function createAutomation(caller: Caller, input: z.infer<typeof AutomationInput>) {
  manage(caller);
  const { set, secret } = await columns(caller, null, input);
  const [row] = await db
    .insert(automations)
    .values({ ...set, projectId: caller.project.id, name: input.name, trigger: input.trigger, action: input.action, createdBy: caller.actor })
    .returning();
  await recordAudit(caller, "automation.created", row.name, { trigger: row.trigger, action: row.action });
  return { ...(await present([row]))[0], ...(secret && { secret }) };
}

/** PATCH /api/v1/automations/{id}: what is sent leaves the rest as it is. Turned into a webhook, it gets a secret, given once. */
export async function updateAutomation(caller: Caller, id: string, input: z.infer<typeof AutomationPatch>) {
  manage(caller);
  const was = await automationOf(caller, id);
  const { set, secret } = await columns(caller, was, input);
  const [row] = await db
    .update(automations)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(automations.id, was.id))
    .returning();
  await recordAudit(caller, "automation.updated", row.name, { changed: Object.keys(input) });
  return { ...(await present([row]))[0], ...(secret && { secret }) };
}

/** DELETE /api/v1/automations/{id}, and its run log. */
export async function deleteAutomation(caller: Caller, id: string) {
  manage(caller);
  const a = await automationOf(caller, id);
  await db.delete(automations).where(eq(automations.id, a.id));
  await recordAudit(caller, "automation.deleted", a.name);
  return true;
}

/** GET /api/v1/automations/{id}/runs: its latest runs, newest first, each with its attempts. */
export async function listRuns(caller: Caller, id: string) {
  manage(caller);
  const a = await automationOf(caller, id);
  const rows = await db.select().from(automationRuns).where(eq(automationRuns.automationId, a.id)).orderBy(desc(automationRuns.createdAt)).limit(RUNS_SHOWN);
  return rows.map(presentRun);
}

const presentRun = ({ id, status, payload, attempts, nextAt, createdAt }: Run) => ({ id, status, payload, attempts, nextAt, createdAt, test: payload.test === true });

// ---- firing ---------------------------------------------------------------------

type Fired = { automation: Row; project: { id: string; slug: string; name: string } };

/** What a run posts: its id, so a receiver can tell a retry from a second event, then the event, the automation and the project. */
const bodyOf = (id: string, m: Fired & { payload: Record<string, unknown> }) => ({
  id,
  ...m.payload,
  automation: { id: m.automation.id, name: m.automation.name },
  project: m.project,
});

/** A run for each, once per `key`: what was already made for that key is left alone. Their ids. */
async function enqueue(made: (Fired & { key: string; payload: Record<string, unknown> })[]) {
  if (!made.length) return [];
  const rows = await db
    .insert(automationRuns)
    .values(
      made.map((m) => {
        const id = randomUUID();
        return { id, automationId: m.automation.id, key: m.key, payload: bodyOf(id, m) };
      }),
    )
    .onConflictDoNothing()
    .returning({ id: automationRuns.id });
  return rows.map((r) => r.id);
}

/** The enabled automations of `trigger`, in a project or (null) in every one, each with its project. */
const enabledIn = (projectId: string | null, trigger: Row["trigger"]) =>
  db
    .select({ automation: automations, project: { id: projects.id, slug: projects.slug, name: projects.name } })
    .from(automations)
    .innerJoin(projects, eq(projects.id, automations.projectId))
    .where(and(projectId ? eq(automations.projectId, projectId) : undefined, eq(automations.trigger, trigger), eq(automations.enabled, true)));

const assetName = { id: assets.id, filename: assets.filename, title: sql<string | null>`${assets.metadata} ->> 'title'` };

/**
 * A brand was released (lib/core/brand.ts publishBrand): its automations,
 * and those for any brand, fire, and are delivered now. Never in the
 * release's way: the caller doesn't wait, and a failure is logged.
 */
export async function brandReleased(brand: { id: string; slug: string; name: string; projectId: string }, release: { number: number; note?: string | null }) {
  const fired = (await enabledIn(brand.projectId, "brand.released")).filter((f) => !f.automation.brandId || f.automation.brandId === brand.id);
  const ids = await enqueue(fired.map((f) => ({ ...f, key: `release:${brand.id}:${release.number}`, payload: releasedPayload(brand, release) })));
  return deliverDue(ids);
}

const releasedPayload = (brand: { id: string; slug: string; name: string }, release: { number: number; note?: string | null }) => ({
  event: "brand.released",
  brand: { id: brand.id, slug: brand.slug, name: brand.name },
  release: release.number,
  note: release.note ?? null,
  url: `${env.APP_URL}/brands/${brand.slug}`,
  at: new Date().toISOString(),
});

const expiringPayload = (a: { id: string; filename: string; title: string | null; expires: string }, day = today()) => ({
  event: "asset.expiring",
  asset: { id: a.id, filename: a.filename, title: a.title ?? null },
  expires: a.expires,
  days: Math.round((Date.parse(a.expires) - Date.parse(day)) / 86_400_000),
  url: `${env.APP_URL}/assets/${a.id}`,
  at: new Date().toISOString(),
});

const utcToday = sql`(now() at time zone 'utc')::date`;

/** A governance change, as an automation posts it. */
export type Governed = { action: string; target: string | null; actor: string; agent: boolean; detail?: Record<string, unknown> | null; asset?: string | null };

const governancePayload = (e: Governed) => ({
  event: "governance",
  action: e.action,
  target: e.target,
  actor: e.actor,
  agent: e.agent,
  detail: e.detail ?? null,
  // An asset's decision opens the asset; anything else, the project's audit log.
  url: e.asset ? `${env.APP_URL}/assets/${e.asset}` : `${env.APP_URL}/team`,
  at: new Date().toISOString(),
});

/**
 * A governance change in a project (lib/core/audit.ts recordAudit, an asset
 * decision in lib/core/activity.ts record), `id` its entry's: the project's
 * governance automations whose `actions` take it fire, delivered now. Its
 * callers don't wait.
 */
export async function governed(projectId: string, id: string, e: Governed) {
  const fired = (await enabledIn(projectId, "governance")).filter((f) => takes(f.automation.actions, e.action));
  const ids = await enqueue(fired.map((f) => ({ ...f, key: `governance:${id}`, payload: governancePayload(e) })));
  return deliverDue(ids);
}

const refusedPayload = (a: { id: string; filename: string; title: string | null }, refusals: number, days: number) => ({
  event: "check.refused",
  asset: { id: a.id, filename: a.filename, title: a.title ?? null },
  refusals,
  days,
  url: `${env.APP_URL}/assets/${a.id}`,
  at: new Date().toISOString(),
});

/**
 * Every enabled check.refused automation: assets the use check refused at
 * least `times` times within the last `days` days fire, at most once per
 * asset per `days` (the key names the window the count fell in). Reads
 * Insights' events, so nothing fires where usage insights are off.
 */
export async function scanRefused() {
  let made = 0;
  for (const f of await enabledIn(null, "check.refused")) {
    const days = f.automation.days || REFUSED_DAYS;
    const refusals = sql<number>`sum(${eventCounts.count})::int`;
    const due = await db
      .select({ id: eventCounts.assetId, refusals })
      .from(eventCounts)
      .where(
        and(
          eq(eventCounts.projectId, f.project.id),
          eq(eventCounts.kind, "check"),
          eq(eventCounts.verdict, "refused"),
          sql`${eventCounts.assetId} is not null`,
          sql`${eventCounts.day} > ${utcToday} - ${days}::int`,
        ),
      )
      .groupBy(eventCounts.assetId)
      .having(sql`${refusals} >= ${f.automation.times ?? 1}`)
      .limit(EXPIRING_BATCH);
    if (!due.length) continue;
    const named = await db.select(assetName).from(assets).where(inArray(assets.id, due.map((d) => d.id!)));
    const window = Math.floor(Date.parse(today()) / DAY / days);
    made += (
      await enqueue(
        due.flatMap((d) => {
          const a = named.find((n) => n.id === d.id);
          return a ? [{ ...f, key: `check:${a.id}:${window}`, payload: refusedPayload(a, d.refusals, days) }] : [];
        }),
      )
    ).length;
  }
  return made;
}

type Stale = Awaited<ReturnType<typeof staleIn>>[number];
type Gap = Awaited<ReturnType<typeof gapsIn>>[number];
const placeOf = (s: Stale) => s.referrer ?? s.client;

const stalePayload = (s: Stale) => ({
  event: "fix.opened",
  kind: "stale",
  asset: { id: s.asset.id, title: s.asset.title, version: s.asset.version },
  replacement: s.replacement ? { id: s.replacement.id, title: s.replacement.title, version: s.replacement.version } : null,
  place: placeOf(s),
  fetches: s.fetches,
  url: `${env.APP_URL}/fixes`,
  at: new Date().toISOString(),
});
const gapPayload = (g: Gap) => ({ event: "fix.opened", kind: "gap", q: g.q, searches: g.searches, url: `${env.APP_URL}/fixes`, at: new Date().toISOString() });

/**
 * Every enabled fix.opened automation: what Fixes lists and isn't done (a
 * place not told about a replaced version it loads, a search not asked
 * for), of its `kind`, fires once. Only what was first seen since the
 * automation was made, so making one doesn't post the whole backlog.
 *
 * ponytail: Fixes' queries per project each sweep, and `first` is the
 * earliest day in Insights' window, so a place that kept loading an old
 * version past the window may fire once late. Keep when each was first
 * seen if that shows up.
 */
export async function scanFixes() {
  const list = await enabledIn(null, "fix.opened");
  const found = new Map<string, Promise<[Stale[], Gap[]]>>();
  let made = 0;
  for (const f of list) {
    if (!found.has(f.project.id)) found.set(f.project.id, Promise.all([staleIn(f.project.id), gapsIn(f.project.id)]));
    const [stale, gaps] = await found.get(f.project.id)!;
    const since = f.automation.createdAt.toISOString().slice(0, 10);
    const kind = f.automation.kind;
    made += (
      await enqueue([
        ...(kind === "gap" ? [] : stale.filter((s) => !s.notified && placeOf(s) && s.first >= since)).map((s) => ({ ...f, key: `stale:${s.asset.id}:${placeOf(s)}`, payload: stalePayload(s) })),
        ...(kind === "stale" ? [] : gaps.filter((g) => !g.requested && g.q && g.first >= since)).map((g) => ({ ...f, key: `gap:${g.q}`, payload: gapPayload(g) })),
      ])
    ).length;
  }
  return made;
}

const waitingPayload = (a: { id: string; filename: string; title: string | null; createdAt: Date }) => ({
  event: "review.waiting",
  asset: { id: a.id, filename: a.filename, title: a.title ?? null },
  days: Math.floor((Date.now() - a.createdAt.getTime()) / DAY),
  url: `${env.APP_URL}/review`,
  at: new Date().toISOString(),
});

/**
 * Every enabled review.waiting automation: assets in review for its `days`
 * or more fire, once each. Private assets don't: who manages automations
 * may not be among those who see them.
 */
export async function scanWaiting() {
  let made = 0;
  for (const f of await enabledIn(null, "review.waiting")) {
    const due = await db
      .select({ ...assetName, createdAt: assets.createdAt })
      .from(assets)
      .where(
        and(
          eq(assets.projectId, f.project.id),
          eq(assets.status, "proposed"),
          isNull(assets.deletedAt),
          eq(assets.private, false),
          sql`${assets.createdAt} <= now() - make_interval(days => ${f.automation.days ?? 0}::int)`,
          sql`not exists (select 1 from ${automationRuns} r where r.automation_id = ${f.automation.id} and r.key = 'review:' || ${assets.id})`,
        ),
      )
      .orderBy(asc(assets.createdAt))
      .limit(EXPIRING_BATCH);
    made += (await enqueue(due.map((a) => ({ ...f, key: `review:${a.id}`, payload: waitingPayload(a) })))).length;
  }
  return made;
}

/**
 * Every enabled asset.expiring automation: the project's approved assets (a
 * stack's current version) whose last day of use is within its `days`, from
 * today on, fire once per asset and last day. A new date is a new license,
 * and fires again when it nears.
 *
 * ponytail: a query per automation. One query over all of them when there
 * are thousands.
 */
export async function scanExpiring() {
  const list = await enabledIn(null, "asset.expiring");
  const day = today();
  let made = 0;
  for (const f of list) {
    const expires = sql<string>`${assets.rights} ->> 'expires'`;
    const due = await db
      .select({ id: assets.id, filename: assets.filename, title: sql<string | null>`${assets.metadata} ->> 'title'`, expires })
      .from(assets)
      .where(
        and(
          eq(assets.projectId, f.project.id),
          isNull(assets.deletedAt),
          eq(assets.status, "active"),
          or(isNull(assets.stackId), eq(assets.current, true)),
          sql`(${expires})::date between ${utcToday} and ${utcToday} + ${f.automation.days ?? 0}::int`,
          sql`not exists (select 1 from ${automationRuns} r where r.automation_id = ${f.automation.id} and r.key = 'asset:' || ${assets.id} || ':' || (${expires}))`,
        ),
      )
      .orderBy(sql`(${expires})::date`)
      .limit(EXPIRING_BATCH);
    made += (await enqueue(due.map((a) => ({ ...f, key: `asset:${a.id}:${a.expires}`, payload: expiringPayload(a, day) })))).length;
  }
  return made;
}

/**
 * Deliver the runs due now (`ids`: only those), each taken for LEASE so two
 * instances never send one twice at once. A run whose automation is off waits.
 */
export async function deliverDue(ids?: string[]) {
  if (ids && !ids.length) return { delivered: 0, failed: 0 };
  const taken = await db
    .update(automationRuns)
    .set({ nextAt: LEASE })
    .where(
      sql`${automationRuns.id} in (select r.id from ${automationRuns} r join ${automations} a on a.id = r.automation_id
        where r.status = 'pending' and r.next_at <= now() and a.enabled ${ids ? sql`and r.id = any(${sql.param(ids)}::uuid[])` : sql``}
        order by r.next_at limit 100 for update of r skip locked)`,
    )
    .returning();
  let delivered = 0;
  let failed = 0;
  for (const run of taken) {
    const [a] = await db
      .select({ automation: automations, organizationId: projects.organizationId })
      .from(automations)
      .innerJoin(projects, eq(projects.id, automations.projectId))
      .where(eq(automations.id, run.automationId));
    if (!a) continue;
    const attempt = await attemptRun(a.automation, a.organizationId, run.payload);
    const attempts = [...run.attempts, attempt];
    const status = attempt.ok ? "delivered" : attempts.length >= MAX_ATTEMPTS ? "failed" : "pending";
    const nextAt = status === "pending" ? new Date(Date.now() + BACKOFF[attempts.length - 1] * 60_000) : null;
    await db.update(automationRuns).set({ attempts, status, nextAt }).where(eq(automationRuns.id, run.id));
    if (attempt.ok) delivered++;
    else failed++;
  }
  return { delivered, failed };
}

/** One attempt at a run: a webhook answering 2xx, or every email sent. */
async function attemptRun(a: Row, organizationId: string, payload: Record<string, unknown>): Promise<Attempt> {
  const at = new Date().toISOString();
  if (a.action === "webhook") {
    const url = a.url && unseal(a.url, env.BETTER_AUTH_SECRET);
    const secret = a.secret && unseal(a.secret, env.BETTER_AUTH_SECRET);
    if (!url || !secret) return { at, ok: false, code: null, error: "The webhook can't be read: set its URL again" };
    try {
      const body = bodyIn(a.format, payload);
      const code = await postPublic(url, body, {
        headers: { "artbucket-signature": signHook(secret, JSON.stringify(body)), "artbucket-event": String(payload.event) },
      });
      return { at, ok: code >= 200 && code < 300, code, error: code >= 200 && code < 300 ? null : `It answered ${code}` };
    } catch (err) {
      return { at, ok: false, code: null, error: err instanceof Error ? err.message : "It could not be called" };
    }
  }
  // ponytail: a retry emails every address again, those it reached included. Keep who got it when partial failures show up.
  const errors: string[] = [];
  for (const to of a.emails) {
    const sent = await sendAs(organizationId, draftOf(to, a.name, payload));
    if (!sent.sent) errors.push(`${to}: ${sent.error ?? "not sent"}`);
  }
  return { at, ok: !errors.length, code: null, error: errors.join("; ") || null };
}

function draftOf(to: string, automation: string, p: Record<string, unknown>) {
  if (p.event === "brand.released") {
    const brand = p.brand as { name: string };
    return releasedEmail(to, { automation, brand: brand.name, release: p.release as number, note: (p.note as string | null) ?? null, url: p.url as string });
  }
  if (p.event === "asset.expiring") {
    const asset = p.asset as { filename: string; title: string | null };
    return expiringEmail(to, { automation, asset: asset.title ?? asset.filename, expires: p.expires as string, days: p.days as number, url: p.url as string });
  }
  return automationEmail(to, { automation, summary: summaryOf(p), url: p.url as string });
}

// ---- a test --------------------------------------------------------------------

/**
 * The event a test sends: for a release, its brand's latest (the default
 * brand's, for any brand), or release 1 of a brand never released; for an
 * expiry, the approved asset whose license ends soonest, else the newest
 * approved asset, as if it ended in `days`.
 */
async function sampleOf(caller: Caller, a: Row): Promise<Record<string, unknown>> {
  if (a.trigger === "governance") {
    // The latest entry of the audit log it takes, else one made up from its first action.
    const recent = await db.select().from(audit).where(eq(audit.projectId, caller.project.id)).orderBy(desc(audit.at)).limit(100);
    const e = recent.find((r) => takes(a.actions, r.action));
    if (e) return governancePayload({ action: e.action, target: e.target, actor: e.actor, agent: !!e.keyId, detail: e.detail });
    const action = a.actions.find((x) => !x.endsWith(".*")) ?? a.actions[0]?.replace(/\.\*$/, ".created") ?? "share.created";
    return governancePayload({ action, target: "Sample", actor: caller.actor, agent: false });
  }
  if (a.trigger === "fix.opened") {
    const [stale, gaps] = await Promise.all([a.kind === "gap" ? [] : staleIn(caller.project.id), a.kind === "stale" ? [] : gapsIn(caller.project.id)]);
    const s = stale.find((x) => placeOf(x));
    if (s) return stalePayload(s);
    return gapPayload(gaps[0] ?? { q: "sample search", searches: 3, first: today(), last: today(), requested: null });
  }
  if (a.trigger === "review.waiting") {
    const [w] = await db
      .select({ ...assetName, createdAt: assets.createdAt })
      .from(assets)
      .where(and(eq(assets.projectId, caller.project.id), isNull(assets.deletedAt), eq(assets.private, false)))
      .orderBy(sql`${assets.status} = 'proposed' desc`, asc(assets.createdAt))
      .limit(1);
    if (!w) throw new AssetError("invalid", "There is no asset to send as a sample: add one first");
    return { ...waitingPayload(w), days: a.days ?? 0 };
  }
  if (a.trigger === "brand.released") {
    const [b] = await db.select().from(brands).where(a.brandId ? eq(brands.id, a.brandId) : and(eq(brands.projectId, caller.project.id), eq(brands.isDefault, true)));
    if (!b) throw new AssetError("invalid", "There is no brand to send a release of: make one first");
    const [latest] = await db
      .select({ number: brandVersions.number, note: brandVersions.note })
      .from(brandVersions)
      .where(and(eq(brandVersions.brandId, b.id), sql`${brandVersions.publishedAt} is not null`))
      .orderBy(desc(brandVersions.number))
      .limit(1);
    return releasedPayload(b, latest ?? { number: 1, note: null });
  }
  const expires = sql<string | null>`${assets.rights} ->> 'expires'`;
  const [asset] = await db
    .select({ id: assets.id, filename: assets.filename, title: sql<string | null>`${assets.metadata} ->> 'title'`, expires })
    .from(assets)
    .where(and(eq(assets.projectId, caller.project.id), isNull(assets.deletedAt), eq(assets.status, "active"), or(isNull(assets.stackId), eq(assets.current, true))))
    // Ending soonest from today first, then the newest of the rest.
    .orderBy(sql`(${expires})::date >= ${utcToday} desc nulls last`, sql`(${expires})::date`, desc(assets.createdAt))
    .limit(1);
  if (!asset) throw new AssetError("invalid", "There is no approved asset to send as a sample: add one first");
  if (a.trigger === "check.refused") return refusedPayload(asset, a.times ?? 1, a.days || REFUSED_DAYS);
  const day = today();
  const ends = asset.expires && asset.expires >= day ? asset.expires : new Date(Date.parse(day) + (a.days ?? 0) * 86_400_000).toISOString().slice(0, 10);
  return expiringPayload({ ...asset, expires: ends }, day);
}

/**
 * POST /api/v1/automations/{id}/test: send it now, on or off, with a sample
 * event (sampleOf), marked `test: true` in what it sends. One attempt, kept
 * in the run log as a test and never tried again, so a webhook or an inbox
 * can be checked without releasing anything.
 */
export async function testAutomation(caller: Caller, id: string) {
  manage(caller);
  const a = await automationOf(caller, id);
  const runId = randomUUID();
  const payload = bodyOf(runId, { automation: a, project: { id: caller.project.id, slug: caller.project.slug, name: caller.project.name }, payload: { ...(await sampleOf(caller, a)), test: true } });
  const attempt = await attemptRun(a, caller.project.organizationId, payload);
  const [run] = await db
    .insert(automationRuns)
    .values({ id: runId, automationId: a.id, key: `test:${runId}`, payload, attempts: [attempt], status: attempt.ok ? "delivered" : "failed", nextAt: null })
    .returning();
  await recordAudit(caller, "automation.tested", a.name, { delivered: attempt.ok });
  return presentRun(run);
}

/** With the sweep, every few minutes (lib/core/sweep.ts): what the sweep finds fires (expiring licenses, refusals, Fixes, waiting proposals), and what is due goes out. */
export async function runAutomations() {
  let fired = 0;
  for (const scan of [scanExpiring, scanRefused, scanFixes, scanWaiting]) fired += await scan();
  return { fired, ...(await deliverDue()) };
}
