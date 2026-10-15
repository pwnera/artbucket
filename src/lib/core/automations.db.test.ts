import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import https from "node:https";
import { mock, test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { signUp } from "@/test/db";
import { db } from "@/lib/db";
import { setTimeout as sleep } from "node:timers/promises";
import { assets, automationRuns, automations, events } from "@/lib/db/schema";
import { record } from "@/lib/core/activity";
import { recordAudit } from "@/lib/core/audit";
import {
  brandReleased,
  createAutomation,
  deleteAutomation,
  deliverDue,
  listAutomations,
  listRuns,
  scanExpiring,
  scanFixes,
  scanRefused,
  scanWaiting,
  testAutomation,
  updateAutomation,
} from "@/lib/core/automations";
import { publishBrand } from "@/lib/core/brand";
import { resolveBrand } from "@/lib/core/brands";
import { signHook } from "@/lib/core/features";
import { updateSetting } from "@/lib/core/settings";

// The console provider prints each message: not in the test's output.
mock.method(console, "info", () => {});

const ada = await signUp("Automata");
await updateSetting(ada.caller, "organization", "email", { enabled: true, provider: "console", from: "Test <test@example.com>" });
const brand = await resolveBrand(ada.caller.project.id, "default");

/** Every POST the webhooks make, answered with `status()`. */
function hooked(t: { after: (fn: () => void) => void }, status: () => number) {
  const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
  const m = mock.method(https, "request", (url: URL, opts: { headers: Record<string, string> }, cb: (res: unknown) => void) =>
    Object.assign(new EventEmitter(), {
      end: (data: Buffer) => {
        calls.push({ url: url.toString(), headers: opts.headers, body: data.toString() });
        queueMicrotask(() => cb(Object.assign(new EventEmitter(), { statusCode: status(), resume() {} })));
      },
      destroy() {},
    }),
  );
  t.after(() => m.mock.restore());
  return calls;
}

const runsOf = (id: string) => db.select().from(automationRuns).where(eq(automationRuns.automationId, id));

test("a release posts to the webhook, signed with the secret given once, and fires once per release", async (t) => {
  const calls = hooked(t, () => 204);
  const hook = await createAutomation(ada.caller, { name: "Tell the site", trigger: "brand.released", brand: "default", action: "webhook", url: "https://hooks.example.com/in/tok123" });
  assert.ok(hook.secret?.startsWith("whsec_"));
  assert.equal(hook.host, "hooks.example.com");
  // Neither the secret nor the URL is shown again, nor kept in the clear.
  const listed = (await listAutomations(ada.caller)).find((a) => a.id === hook.id)!;
  assert.ok(!JSON.stringify(listed).includes("tok123") && !("secret" in listed));
  const [row] = await db.select().from(automations).where(eq(automations.id, hook.id));
  assert.ok(!row.url!.includes("tok123") && !row.secret!.includes(hook.secret!));

  assert.deepEqual(await brandReleased(brand, { number: 3, note: "Bluer" }), { delivered: 1, failed: 0 });
  assert.equal(calls.length, 1);
  const [{ url, headers, body }] = calls;
  assert.equal(url, "https://hooks.example.com/in/tok123");
  const t0 = Number(/^t=(\d+),/.exec(headers["artbucket-signature"])![1]);
  assert.equal(headers["artbucket-signature"], signHook(hook.secret!, body, t0));
  assert.equal(headers["artbucket-event"], "brand.released");
  const payload = JSON.parse(body);
  assert.equal(payload.event, "brand.released");
  assert.equal(payload.release, 3);
  assert.equal(payload.note, "Bluer");
  assert.equal(payload.brand.slug, "default");
  assert.equal(payload.automation.id, hook.id);

  // The same release again: nothing new.
  assert.deepEqual(await brandReleased(brand, { number: 3 }), { delivered: 0, failed: 0 });
  assert.equal(calls.length, 1);
  const [run] = await listRuns(ada.caller, hook.id);
  assert.equal(run.status, "delivered");
  assert.equal(run.id, payload.id);
  assert.deepEqual(
    run.attempts.map((a) => [a.ok, a.code]),
    [[true, 204]],
  );
  assert.equal((await listAutomations(ada.caller)).find((a) => a.id === hook.id)!.last?.status, "delivered");

  // Off: a release fires nothing.
  await updateAutomation(ada.caller, hook.id, { enabled: false });
  await brandReleased(brand, { number: 4 });
  assert.equal(calls.length, 1);
  await deleteAutomation(ada.caller, hook.id);
});

test("a failed delivery is tried again later, three attempts in all, each one logged", async (t) => {
  const calls = hooked(t, () => 500);
  const hook = await createAutomation(ada.caller, { name: "Flaky", trigger: "brand.released", action: "webhook", url: "https://down.example.com/hook" });
  assert.deepEqual(await brandReleased(brand, { number: 10 }), { delivered: 0, failed: 1 });
  let [run] = await runsOf(hook.id);
  assert.equal(run.status, "pending");
  assert.ok(run.nextAt! > new Date(Date.now() + 4 * 60_000));
  // Not due yet: nothing goes.
  assert.deepEqual(await deliverDue(), { delivered: 0, failed: 0 });

  const due = () => db.update(automationRuns).set({ nextAt: sql`now() - interval '1 second'` }).where(eq(automationRuns.id, run.id));
  await due();
  await deliverDue();
  [run] = await runsOf(hook.id);
  assert.equal(run.status, "pending");
  await due();
  await deliverDue();
  [run] = await runsOf(hook.id);
  assert.equal(run.status, "failed");
  assert.equal(run.nextAt, null);
  assert.deepEqual(
    run.attempts.map((a) => [a.ok, a.code, a.error]),
    Array(3).fill([false, 500, "It answered 500"]),
  );
  assert.equal(calls.length, 3);
  await deleteAutomation(ada.caller, hook.id);
});

test("an asset nearing its last day fires once, by email, and again for a new date", async () => {
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const rights = (expires: string) => ({ license: "RM", territories: [], channels: [], embargo: null, expires, modelRelease: null });
  const insert = (filename: string, expires: string) =>
    db
      .insert(assets)
      .values({ projectId: ada.caller.project.id, sha256: randomBytes(32).toString("hex"), filename, mime: "image/png", size: 1, rights: rights(expires) })
      .returning()
      .then((r) => r[0]);
  const soon = await insert("soon.png", day(5));
  await insert("later.png", day(60));
  await insert("gone.png", day(-2));

  const mail = await createAutomation(ada.caller, { name: "Licenses", trigger: "asset.expiring", days: 7, action: "email", emails: ["Legal@Example.com"] });
  assert.equal(mail.secret, undefined);
  assert.deepEqual(mail.emails, ["legal@example.com"]);
  assert.equal(await scanExpiring(), 1);
  assert.equal(await scanExpiring(), 0);
  assert.deepEqual(await deliverDue(), { delivered: 1, failed: 0 });
  const [run] = await listRuns(ada.caller, mail.id);
  assert.equal(run.status, "delivered");
  assert.deepEqual([(run.payload.asset as { id: string }).id, run.payload.expires, run.payload.days], [soon.id, day(5), 5]);

  // Renewed, then nearing its new date: once more.
  await db.update(assets).set({ rights: rights(day(6)) }).where(eq(assets.id, soon.id));
  assert.equal(await scanExpiring(), 1);
  await deleteAutomation(ada.caller, mail.id);
});

test("what a trigger and an action need is checked, and only the project's admins manage them", async () => {
  await assert.rejects(createAutomation(ada.caller, { name: "x", trigger: "brand.released", action: "email" }), /email needs emails/);
  await assert.rejects(createAutomation(ada.caller, { name: "x", trigger: "asset.expiring", action: "email", emails: ["a@example.com"] }), /needs days/);
  await assert.rejects(createAutomation(ada.caller, { name: "x", trigger: "brand.released", action: "webhook" }), /needs url/);
  await assert.rejects(createAutomation(ada.caller, { name: "x", trigger: "brand.released", brand: "nope", action: "email", emails: ["a@example.com"] }), /No brand "nope"/);
  await assert.rejects(listAutomations({ ...ada.caller, scope: "write" }), /admin on the project/);

  // Made a webhook, it gets a secret; made an email again, its URL and secret go.
  const a = await createAutomation(ada.caller, { name: "Switch", trigger: "brand.released", action: "email", emails: ["a@example.com"] });
  const hook = await updateAutomation(ada.caller, a.id, { action: "webhook", url: "https://hooks.example.com/x" });
  assert.ok(hook.secret);
  assert.deepEqual(hook.emails, []);
  const back = await updateAutomation(ada.caller, a.id, { action: "email", emails: ["b@example.com"] });
  assert.equal(back.host, null);
  const [row] = await db.select().from(automations).where(eq(automations.id, a.id));
  assert.equal(row.secret, null);
});

test("a test sends the brand's latest release now, off or on, marked as a test and never tried again", async (t) => {
  let status = 200;
  const calls = hooked(t, () => status);
  const hook = await createAutomation(ada.caller, { name: "Try me", trigger: "brand.released", brand: "default", action: "webhook", url: "https://hooks.example.com/try" });
  await updateAutomation(ada.caller, hook.id, { enabled: false });
  const { number } = await publishBrand(ada.caller, undefined, { note: "Warmer greys" });

  const run = await testAutomation(ada.caller, hook.id);
  assert.equal(run.status, "delivered");
  assert.equal(run.test, true);
  assert.equal(calls.length, 1);
  const payload = JSON.parse(calls[0].body);
  assert.deepEqual([payload.event, payload.release, payload.note, payload.test, payload.id], ["brand.released", number, "Warmer greys", true, run.id]);

  // A failure is logged, once: no retry waits.
  status = 500;
  const failed = await testAutomation(ada.caller, hook.id);
  assert.equal(failed.status, "failed");
  assert.equal(failed.nextAt, null);
  assert.equal(failed.attempts.length, 1);
  assert.deepEqual(await deliverDue(), { delivered: 0, failed: 0 });
  assert.deepEqual(
    (await listRuns(ada.caller, hook.id)).map((r) => [r.status, r.test]),
    [
      ["failed", true],
      ["delivered", true],
    ],
  );
  // The real release is still its own: tests took no key from it.
  await updateAutomation(ada.caller, hook.id, { enabled: true });
  status = 200;
  await brandReleased(brand, { number: number + 100 });
  assert.deepEqual(
    (await listRuns(ada.caller, hook.id)).map((r) => [r.status, r.test]),
    [
      ["delivered", false],
      ["failed", true],
      ["delivered", true],
    ],
  );
  await assert.rejects(testAutomation({ ...ada.caller, scope: "write" }, hook.id), /admin on the project/);
  await deleteAutomation(ada.caller, hook.id);
});

test("a test of an expiry sends the asset whose license ends soonest", async () => {
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const rights = (expires: string) => ({ license: "RM", territories: [], channels: [], embargo: null, expires, modelRelease: null });
  const [asset] = await db
    .insert(assets)
    .values({ projectId: ada.caller.project.id, sha256: randomBytes(32).toString("hex"), filename: "first-to-go.png", mime: "image/png", size: 1, rights: rights(day(1)) })
    .returning();
  const mail = await createAutomation(ada.caller, { name: "Legal", trigger: "asset.expiring", days: 30, action: "email", emails: ["legal@example.com"] });
  const run = await testAutomation(ada.caller, mail.id);
  assert.equal(run.status, "delivered");
  assert.deepEqual([(run.payload.asset as { id: string }).id, run.payload.expires, run.payload.days, run.payload.test], [asset.id, day(1), 1, true]);
  await deleteAutomation(ada.caller, mail.id);
});

const newAsset = (filename: string, values: Partial<typeof assets.$inferInsert> = {}) =>
  db
    .insert(assets)
    .values({ projectId: ada.caller.project.id, sha256: randomBytes(32).toString("hex"), filename, mime: "image/png", size: 1, ...values })
    .returning()
    .then((r) => r[0]);

/** Governance fires after the change, not waited for: wait for `n` runs. */
async function runsFor(id: string, n: number) {
  for (let i = 0; i < 100; i++) {
    const runs = await runsOf(id);
    if (runs.length >= n && runs.every((r) => r.status !== "pending" || r.attempts.length)) return runs;
    await sleep(20);
  }
  return runsOf(id);
}

test("a governance change in the project fires what takes it, as a Slack message, and none outside a project", async (t) => {
  const calls = hooked(t, () => 200);
  const hook = await createAutomation(ada.caller, { name: "Security", trigger: "governance", actions: ["share.*", "key.created"], action: "webhook", format: "slack", url: "https://hooks.slack.com/services/T/B/x" });
  assert.deepEqual([hook.actions, hook.format], [["share.*", "key.created"], "slack"]);
  await recordAudit(ada.caller, "share.created", "Press kit", { kind: "view" });
  await recordAudit(ada.caller, "grant.set", "Ada");
  await recordAudit(ada.caller, "share.revoked", "Press kit", undefined, { projectId: null });
  const runs = await runsFor(hook.id, 1);
  await sleep(50);
  assert.equal((await runsOf(hook.id)).length, 1);
  assert.deepEqual([runs[0].status, runs[0].payload.action, runs[0].payload.target], ["delivered", "share.created", "Press kit"]);
  const body = JSON.parse(calls[0].body);
  assert.deepEqual(Object.keys(body), ["text"]);
  assert.match(body.text, /^Automata: share\.created Press kit <.*\/team\|Open>/);
  // Signed as sent.
  assert.equal(calls[0].headers["artbucket-signature"], signHook(hook.secret!, calls[0].body, Number(/^t=(\d+),/.exec(calls[0].headers["artbucket-signature"])![1])));
  await deleteAutomation(ada.caller, hook.id);
});

test("an asset decision fires as asset.{verb}, never a private asset's", async () => {
  const mail = await createAutomation(ada.caller, { name: "Approvals", trigger: "governance", actions: ["asset.approved"], action: "email", emails: ["brand@example.com"] });
  const open = await newAsset("approved.png");
  const hidden = await newAsset("secret.png", { private: true });
  await record(ada.caller, "approved", open);
  await record(ada.caller, "approved", hidden);
  await record(ada.caller, "rejected", open);
  const runs = await runsFor(mail.id, 1);
  await sleep(50);
  assert.equal((await runsOf(mail.id)).length, 1);
  assert.equal(runs[0].status, "delivered");
  assert.deepEqual([runs[0].payload.action, runs[0].payload.target], ["asset.approved", "approved.png"]);
  assert.match(String(runs[0].payload.url), new RegExp(`/assets/${open.id}$`));
  await deleteAutomation(ada.caller, mail.id);
});

test("an asset refused often enough fires once per window", async () => {
  const logo = await newAsset("old-logo.png");
  const refused = { projectId: ada.caller.project.id, kind: "check" as const, surface: "api" as const, actor: "agent" as const, assetId: logo.id, verdict: "refused" };
  await db.insert(events).values([refused, refused, refused]);
  const strict = await createAutomation(ada.caller, { name: "Four", trigger: "check.refused", times: 4, action: "email", emails: ["brand@example.com"] });
  const hook = await createAutomation(ada.caller, { name: "Three", trigger: "check.refused", times: 3, action: "email", emails: ["brand@example.com"] });
  assert.deepEqual([hook.days, hook.times], [7, 3]);
  assert.equal(await scanRefused(), 1);
  assert.equal(await scanRefused(), 0);
  const [run] = await runsOf(hook.id);
  assert.deepEqual([(run.payload.asset as { id: string }).id, run.payload.refusals, run.payload.days], [logo.id, 3, 7]);
  assert.equal((await runsOf(strict.id)).length, 0);
  await deleteAutomation(ada.caller, strict.id);
  await deleteAutomation(ada.caller, hook.id);
});

test("something new in Fixes fires once, of its kind", async () => {
  const gaps = await createAutomation(ada.caller, { name: "Gaps", trigger: "fix.opened", kind: "gap", action: "email", emails: ["brand@example.com"] });
  const all = await createAutomation(ada.caller, { name: "All", trigger: "fix.opened", action: "email", emails: ["brand@example.com"] });
  const old = await newAsset("logo-v3.png");
  const now = await newAsset("logo-v5.png");
  await db.update(assets).set({ supersededBy: now.id }).where(eq(assets.id, old.id));
  const ws = ada.caller.project.id;
  await db.insert(events).values([
    { projectId: ws, kind: "search", surface: "app", actor: "person", subject: "night logo", verdict: "empty" },
    { projectId: ws, kind: "fetch", surface: "public", actor: "anonymous", assetId: old.id, verdict: "superseded", referrer: "partner.example.com" },
  ]);
  assert.equal(await scanFixes(), 3);
  assert.equal(await scanFixes(), 0);
  assert.deepEqual((await runsOf(gaps.id)).map((r) => [r.payload.kind, r.payload.q]), [["gap", "night logo"]]);
  const stale = (await runsOf(all.id)).find((r) => r.payload.kind === "stale")!;
  assert.deepEqual([stale.payload.place, (stale.payload.replacement as { id: string }).id], ["partner.example.com", now.id]);
  await deleteAutomation(ada.caller, gaps.id);
  await deleteAutomation(ada.caller, all.id);
});

test("a proposal waiting its days fires once, a private one never", async () => {
  const ago = (d: number) => new Date(Date.now() - d * 86_400_000);
  const waiting = await newAsset("waiting.png", { status: "proposed", createdAt: ago(5) });
  await newAsset("fresh.png", { status: "proposed" });
  await newAsset("hidden.png", { status: "proposed", private: true, createdAt: ago(5) });
  const mail = await createAutomation(ada.caller, { name: "Nudge", trigger: "review.waiting", days: 3, action: "email", emails: ["brand@example.com"] });
  assert.equal(await scanWaiting(), 1);
  assert.equal(await scanWaiting(), 0);
  const [run] = await runsOf(mail.id);
  assert.deepEqual([(run.payload.asset as { id: string }).id, run.payload.days], [waiting.id, 5]);
  await deleteAutomation(ada.caller, mail.id);
});

test("each new trigger takes only what it is narrowed by, and sends a test", async (t) => {
  hooked(t, () => 200);
  const mail = { action: "email" as const, emails: ["a@example.com"] };
  await assert.rejects(createAutomation(ada.caller, { name: "x", trigger: "governance", brand: "default", ...mail }), /brand is for brand.released/);
  await assert.rejects(createAutomation(ada.caller, { name: "x", trigger: "governance", times: 2, ...mail }), /times is for check.refused/);
  await assert.rejects(createAutomation(ada.caller, { name: "x", trigger: "check.refused", kind: "gap", ...mail }), /kind is for fix.opened/);
  await assert.rejects(createAutomation(ada.caller, { name: "x", trigger: "review.waiting", ...mail }), /needs days/);
  await assert.rejects(createAutomation(ada.caller, { name: "x", trigger: "check.refused", days: 0, ...mail }), /at least a day/);
  await assert.rejects(createAutomation(ada.caller, { name: "x", trigger: "governance", format: "slack", ...mail }), /format is for webhook/);
  // Changed to another trigger, what the old one was narrowed by goes.
  const a = await createAutomation(ada.caller, { name: "Shares", trigger: "governance", actions: ["share.*"], action: "webhook", format: "teams", url: "https://example.webhook.office.com/x" });
  const b = await updateAutomation(ada.caller, a.id, { trigger: "check.refused" });
  assert.deepEqual([b.actions, b.days, b.times, b.format], [[], 7, 1, "teams"]);
  await updateAutomation(ada.caller, a.id, { trigger: "governance", actions: ["share.*"] });
  const run = await testAutomation(ada.caller, a.id);
  assert.deepEqual([run.status, run.payload.event, run.test], ["delivered", "governance", true]);
  assert.match(String(run.payload.action), /^share\./);
  for (const trigger of ["fix.opened", "review.waiting"] as const) {
    await updateAutomation(ada.caller, a.id, { trigger, ...(trigger === "review.waiting" && { days: 2 }) });
    assert.equal((await testAutomation(ada.caller, a.id)).payload.event, trigger);
  }
  await deleteAutomation(ada.caller, a.id);
});
