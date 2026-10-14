import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/lib/db";
import { assets, automationRuns, automations, brands, brandVersions, projects } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { recordAudit } from "@/lib/core/audit";
import { resolveBrand } from "@/lib/core/brands";
import { AssetError } from "@/lib/core/errors";
import { signHook } from "@/lib/core/features";
import { expiringEmail, releasedEmail, sendAs } from "@/lib/core/mail";
import { env } from "@/lib/env";
import { postPublic } from "@/lib/fetch-public";
import { can, needs } from "@/lib/permissions";
import { today } from "@/lib/rights";
import type { AutomationInput, AutomationPatch } from "@/lib/schemas";
import { seal, unseal } from "@/lib/settings";

/**
 * Automations (PRD item 7): when a brand is released, or an asset's license
 * is about to end, tell someone, by email or by a webhook signed as features'
 * hooks are (signHook). Each thing that sets one off is a run, made once
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
/** Expiring assets taken per automation per run: the rest come next time. */
const EXPIRING_BATCH = 200;
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
      action: r.action,
      emails: r.emails,
      host: hostOf(r.url),
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

  if (trigger === "brand.released") {
    if (input.days !== undefined) throw new AssetError("invalid", "days is for asset.expiring");
    set.days = null;
    if (input.brand !== undefined) set.brandId = input.brand ? (await resolveBrand(caller.project.id, input.brand)).id : null;
  } else {
    if (input.brand) throw new AssetError("invalid", "brand is for brand.released");
    set.brandId = null;
    set.days = input.days ?? was?.days ?? null;
    if (set.days === null) throw new AssetError("invalid", "asset.expiring needs days: how many days before the license ends");
  }

  let secret: string | undefined;
  if (action === "email") {
    if (input.url !== undefined) throw new AssetError("invalid", "url is for webhook");
    set.emails = input.emails ? [...new Set(input.emails.map((e) => e.toLowerCase()))] : (was?.emails ?? []);
    if (!set.emails.length) throw new AssetError("invalid", "email needs emails: who it goes to");
    set.url = null;
    set.secret = null;
  } else {
    if (input.emails !== undefined) throw new AssetError("invalid", "emails is for email");
    set.emails = [];
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

const enabledIn = (projectId: string, trigger: Row["trigger"]) =>
  db
    .select({ automation: automations, project: { id: projects.id, slug: projects.slug, name: projects.name } })
    .from(automations)
    .innerJoin(projects, eq(projects.id, automations.projectId))
    .where(and(eq(automations.projectId, projectId), eq(automations.trigger, trigger), eq(automations.enabled, true)));

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
  const list = await db
    .select({ automation: automations, project: { id: projects.id, slug: projects.slug, name: projects.name } })
    .from(automations)
    .innerJoin(projects, eq(projects.id, automations.projectId))
    .where(and(eq(automations.trigger, "asset.expiring"), eq(automations.enabled, true)));
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
      const code = await postPublic(url, payload, {
        headers: { "artbucket-signature": signHook(secret, JSON.stringify(payload)), "artbucket-event": String(payload.event) },
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
  const asset = p.asset as { filename: string; title: string | null };
  return expiringEmail(to, { automation, asset: asset.title ?? asset.filename, expires: p.expires as string, days: p.days as number, url: p.url as string });
}

// ---- a test --------------------------------------------------------------------

/**
 * The event a test sends: for a release, its brand's latest (the default
 * brand's, for any brand), or release 1 of a brand never released; for an
 * expiry, the approved asset whose license ends soonest, else the newest
 * approved asset, as if it ended in `days`.
 */
async function sampleOf(caller: Caller, a: Row) {
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

/** With the sweep, every few minutes (lib/core/sweep.ts): assets nearing their last day fire, and what is due goes out. */
export async function runAutomations() {
  const fired = await scanExpiring();
  return { fired, ...(await deliverDue()) };
}
