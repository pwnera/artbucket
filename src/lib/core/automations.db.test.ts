import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import https from "node:https";
import { mock, test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { signUp } from "@/test/db";
import { db } from "@/lib/db";
import { assets, automationRuns, automations } from "@/lib/db/schema";
import { brandReleased, createAutomation, deleteAutomation, deliverDue, listAutomations, listRuns, scanExpiring, updateAutomation } from "@/lib/core/automations";
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
