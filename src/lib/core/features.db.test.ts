import assert from "node:assert/strict";
import { test } from "node:test";
import { request, signUp } from "@/test/db";
import { callerFrom } from "@/lib/core/access";
import { featureOn, listFeatures, switchFeature } from "@/lib/core/features";
import { createKey, listKeys } from "@/lib/core/keys";
import { createProject } from "@/lib/core/people";

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
