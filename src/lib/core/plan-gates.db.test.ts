import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { eq } from "drizzle-orm";
import { plan, request, signUp } from "@/test/db";
import { db } from "@/lib/db";
import { automationRuns } from "@/lib/db/schema";
import { GET as cardGet } from "@/app/api/v1/brand/cards/[template]/route";
import { GET as officeGet } from "@/app/api/v1/brand/office/route";
import { GET as ownGet } from "@/app/api/v1/brand/office/templates/route";
import { brandReleased, createAutomation, deleteAutomation, deliverDue, listAutomations, testAutomation, UNPLANNED, updateAutomation } from "@/lib/core/automations";
import { createRule, publishBrand } from "@/lib/core/brand";
import { resolveBrand } from "@/lib/core/brands";
import { sendDigests } from "@/lib/core/digest";
import { fixesOf } from "@/lib/core/fixes";
import { notifyStale } from "@/lib/core/insights";
import { publishedSource } from "@/lib/core/page-view";
import { createPortal, portalOffice, viewPortalSite } from "@/lib/core/portals";
import { updateSetting } from "@/lib/core/settings";

/**
 * Automations, Fixes, templates and the digest are a plan's (lib/limits.ts):
 * an organization whose plan leaves them out (Artbucket Cloud's Free, as
 * beta/billing.js writes it) is refused or skipped; one whose plan has every
 * feature (`features: null`, every self-hosted install) gets them.
 */

const mails: string[] = [];
mock.method(console, "info", (s: unknown) => void (typeof s === "string" && s.startsWith("email to ") && mails.push(s)));

const FREE = { features: ["agents", "shares", "domains"] };
const DAY = 86_400_000;
const monday = (() => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + ((8 - d.getUTCDay()) % 7 || 7) * DAY + 6 * 3600_000);
})();

/** An organization with email, a released brand, a public portal showing it and an automation made while it had every feature. */
async function org(name: string) {
  const who = await signUp(name);
  await updateSetting(who.caller, "organization", "email", { enabled: true, provider: "console", from: "Test <test@example.com>" });
  await createRule(who.caller, "default", { key: "color.primary", type: "color", value: "#6d4aff" });
  await publishBrand(who.caller, "default", { note: "First" });
  const portal = `p-${name.toLowerCase()}-${Date.now().toString(36)}`;
  await createPortal(who.caller, { name, slug: portal, access: "public", brands: ["default"] });
  const automation = await createAutomation(who.caller, { name: "Tell us", trigger: "brand.released", brand: null, action: "email", emails: ["team@example.com"] });
  return { ...who, portal, automation };
}

const free = await org("Freda");
const paid = await org("Paula");
await plan(free.caller.project.organizationId, FREE);
await plan(paid.caller.project.organizationId, { features: null });

const brandOf = async (who: typeof free) => {
  const b = await resolveBrand(who.caller.project.id, "default");
  return { id: b.id, slug: b.slug, name: b.name, projectId: who.caller.project.id };
};
const runs = (id: string) => db.select().from(automationRuns).where(eq(automationRuns.automationId, id));

test("automations: without the plan they are kept and listed but never fire, and none is made, changed or tested", async () => {
  await assert.rejects(createAutomation(free.caller, { name: "More", trigger: "brand.released", brand: null, action: "email", emails: ["a@example.com"] }), /Running automations is off/);
  await assert.rejects(updateAutomation(free.caller, free.automation.id, { enabled: false }), /Running automations is off/);
  await assert.rejects(testAutomation(free.caller, free.automation.id), /Running automations is off/);
  assert.deepEqual((await listAutomations(free.caller)).map((a) => a.id), [free.automation.id]);
  await brandReleased(await brandOf(free), { number: 9 });
  assert.equal((await runs(free.automation.id)).length, 0);

  // A run left waiting from before goes nowhere, and says why.
  const [run] = await db.insert(automationRuns).values({ automationId: free.automation.id, key: "left", payload: { event: "brand.released" } }).returning();
  await deliverDue([run.id]);
  const [after] = await db.select().from(automationRuns).where(eq(automationRuns.id, run.id));
  assert.equal(after.status, "failed");
  assert.equal(after.attempts.at(-1)?.error, UNPLANNED);
  assert.ok(await deleteAutomation(free.caller, free.automation.id));

  // With every feature, the same release fires.
  await brandReleased(await brandOf(paid), { number: 9 });
  assert.equal((await runs(paid.automation.id))[0]?.status, "delivered");
  assert.equal((await testAutomation(paid.caller, paid.automation.id)).status, "delivered");
});

test("Fixes and Notify: refused without the plan", async () => {
  await assert.rejects(fixesOf(free.caller), /The Fixes list is off/);
  await assert.rejects(notifyStale(free.caller, { referrer: "example.com", assets: [] }), /The Fixes list is off/);
  assert.equal((await fixesOf(paid.caller)).open, 0);
});

test("templates: share cards and Office templates refused without the plan, on the API and on portals; the view offers none", async () => {
  const ask = (who: typeof free, path: string) => request({ cookie: who.cookie }, path);
  for (const [who, status] of [[free, 403], [paid, 200]] as const) {
    assert.equal((await officeGet(ask(who, "/api/v1/brand/office?format=potx"), { params: Promise.resolve({}) })).status, status);
    assert.equal((await ownGet(ask(who, "/api/v1/brand/office/templates"), { params: Promise.resolve({}) })).status, status);
  }
  const card = await cardGet(ask(free, "/api/v1/brand/cards/og?title=Hi"), { params: Promise.resolve({ template: "og" }) });
  assert.equal(card.status, 403);
  assert.equal(((await card.json()) as { error: { code: string } }).error.code, "limit_reached");

  await assert.rejects(portalOffice(free.portal, {}, "default", "potx"), /This portal has no Office templates/);
  assert.ok((await portalOffice(paid.portal, {}, "default", "potx")).bytes.length);
  assert.equal((await viewPortalSite(free.portal, {})).view?.office, false);
  assert.equal((await viewPortalSite(paid.portal, {})).view?.office, undefined);
  // What BrandHub draws its free share card from is still there.
  assert.ok(await publishedSource(free.caller.project.id, "default"));
});

test("the weekly digest skips an organization without the plan", async () => {
  mails.length = 0;
  await sendDigests(monday);
  assert.equal(mails.filter((m) => m.startsWith(`email to ${free.user.email} `)).length, 0);
  assert.equal(mails.filter((m) => m.startsWith(`email to ${paid.user.email} `)).length, 1);
});
