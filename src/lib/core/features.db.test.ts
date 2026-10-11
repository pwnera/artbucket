import assert from "node:assert/strict";
import { test } from "node:test";
import { request, signUp } from "@/test/db";
import { callerFrom } from "@/lib/core/access";
import { featureOn, listFeatures, notSwitchedOff, switchFeature } from "@/lib/core/features";
import { record } from "@/lib/core/events";
import { createKey, listKeys } from "@/lib/core/keys";
import { createProject } from "@/lib/core/people";
import { createPortal, enterPortal } from "@/lib/core/portals";
import { db } from "@/lib/db";
import { events, organizations } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";

const ada = await signUp("Ada");
const main = ada.caller.project;
const place = (projectId: string) => ({ organizationId: main.organizationId, projectId });
const other = await createProject(ada.caller, { name: "Agency" });

test("the core's own start on in every project, left to each", async () => {
  assert.ok(await featureOn("agents", place(main.id)));
  const agents = (await listFeatures(ada.caller, "organization")).find((f) => f.id === "agents")!;
  assert.equal(agents.rule, "projects");
  assert.deepEqual(agents.projects, { on: 2, total: 2 });
});

test("a project turns one off for itself only", async () => {
  await switchFeature(ada.caller, "project", "shares", "off");
  assert.equal(await featureOn("shares", place(main.id)), false);
  assert.ok(await featureOn("shares", place(other.id)));
  await switchFeature(ada.caller, "project", "shares", "on");
});

test("off for the organization: a key is refused, by name, and no project can turn it back on", async () => {
  const key = await createKey(ada.caller, { name: "ci", scope: "read" });
  const asKey = () => callerFrom(request({ authorization: `Bearer ${key.secret}` }));
  assert.ok(await asKey());
  await switchFeature(ada.caller, "organization", "agents", "off");
  await assert.rejects(asKey(), (err: Error & { code?: string }) => err.code === "feature_off" && /turned off in this organization by Ada/.test(err.message));
  await assert.rejects(createKey(ada.caller, { name: "another", scope: "read" }), /are turned off/);
  await assert.rejects(switchFeature(ada.caller, "project", "agents", "on"), /for the whole organization by Ada/);
  const here = (await listFeatures(ada.caller, "project")).find((f) => f.id === "agents")!;
  assert.deepEqual([here.on, here.from, here.editable], [false, "organization", false]);
});

test("given back to each project, their own choices are as they were", async () => {
  await switchFeature(ada.caller, "organization", "agents", "projects");
  assert.ok(await featureOn("agents", place(main.id)));
  assert.ok((await listKeys(ada.caller)).some((k) => k.name === "ci"));
});

test("an unknown feature, or `projects` in a project, is refused", async () => {
  await assert.rejects(switchFeature(ada.caller, "organization", "nope", "on"), /No feature "nope"/);
  await assert.rejects(switchFeature(ada.caller, "project", "agents", "projects"), /can't be left to each project/);
});

test("portals off: a site closes to visitors, none can be made, and it opens again once back on", async () => {
  const site = await createPortal(ada.caller, { name: "Docs", slug: `docs-${Date.now().toString(36)}`, kind: "docs" });
  assert.ok(await enterPortal(site.slug, {}));
  await switchFeature(ada.caller, "project", "portals", "off");
  await assert.rejects(enterPortal(site.slug, {}), /This portal is closed/);
  await assert.rejects(createPortal(ada.caller, { name: "More", slug: `more-${Date.now().toString(36)}`, kind: "docs" }), /Portals and sites are turned off in this project/);
  await switchFeature(ada.caller, "project", "portals", "on");
  assert.ok(await enterPortal(site.slug, {}));
});

test("usage insights off: nothing more is counted there", async () => {
  const counted = async () =>
    (await db.select({ n: sql<number>`count(*)::int` }).from(events).where(and(eq(events.projectId, main.id), eq(events.subject, "switch-test"))))[0].n;
  const settle = () => new Promise((r) => setTimeout(r, 200));
  record({ projectId: main.id, kind: "search", surface: "app", actor: "person", subject: "switch-test", verdict: "found" });
  await settle();
  assert.equal(await counted(), 1);
  await switchFeature(ada.caller, "organization", "insights", "off");
  record({ projectId: main.id, kind: "search", surface: "app", actor: "person", subject: "switch-test", verdict: "found" });
  await settle();
  assert.equal(await counted(), 1);
  await switchFeature(ada.caller, "organization", "insights", "projects");
});

test("BrandHub off takes the organization's listings away, by SQL as the hub reads them", async () => {
  const listed = async () =>
    (await db.select({ id: organizations.id }).from(organizations).where(and(eq(organizations.id, main.organizationId), notSwitchedOff("hub", organizations.id)))).length;
  assert.equal(await listed(), 1);
  // Offered only where the server runs a BrandHub.
  const had = process.env.HUB_URL;
  process.env.HUB_URL ??= "http://localhost:3000/hub";
  await assert.rejects(switchFeature(ada.caller, "project", "hub", "off"), /switched for the organization/);
  await switchFeature(ada.caller, "organization", "hub", "off");
  assert.equal(await listed(), 0);
  await switchFeature(ada.caller, "organization", "hub", "on");
  assert.equal(await listed(), 1);
  if (had === undefined) delete process.env.HUB_URL;
});
