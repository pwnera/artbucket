import assert from "node:assert/strict";
import { test } from "node:test";
import { request, signUp } from "@/test/db";
import { callerFrom } from "@/lib/core/access";
import { featureImpact, switchFeature } from "@/lib/core/features";
import { createKey } from "@/lib/core/keys";
import { createProject } from "@/lib/core/people";
import { createPortal } from "@/lib/core/portals";

const ada = await signUp("Ada");
const agency = await createProject(ada.caller, { name: "Agency" });

test("a key in use: asked first, with how many and which was used last", async () => {
  const key = await createKey(ada.caller, { name: "ci-deploy", scope: "read" });
  await callerFrom(request({ authorization: `Bearer ${key.secret}` }));
  await new Promise((r) => setTimeout(r, 100)); // its use is written after the request
  const i = await featureImpact(ada.caller, "project", "agents", "off");
  assert.equal(i.confirm, true);
  assert.equal(i.title, "Turn off Agents and API keys?");
  assert.match(i.says.join(" "), /1 API key will be refused, including "ci-deploy", last used/);
  assert.match(i.says.join(" "), /Scripts and CI that use them will fail/);
});

test("nothing outside to break: no question", async () => {
  const i = await featureImpact(ada.caller, "project", "shares", "off");
  assert.deepEqual([i.changes, i.confirm, i.says], [1, false, []]);
});

test("for every project: always asked, naming the projects it changes", async () => {
  const i = await featureImpact(ada.caller, "organization", "shares", "off");
  assert.equal(i.confirm, true);
  assert.equal(i.title, "Turn off Share and upload links for every project?");
  assert.match(i.says[0], /^2 of 2 projects turn off: .*Agency/);
});

test("overriding a project's own choice says so", async () => {
  const there = (await callerFrom(request({ cookie: `${ada.cookie}; ab_project=${agency.id}` })))!;
  await switchFeature(there, "project", "insights", "off");
  const i = await featureImpact(ada.caller, "organization", "insights", "on");
  assert.match(i.says.join(" "), /overrides 1 project that chose otherwise/);
  await switchFeature(there, "project", "insights", "on");
});

test("open portals and sites, and counting that can't be made up: said", async () => {
  await createPortal(ada.caller, { name: "Docs", slug: `docs-${Date.now().toString(36)}`, kind: "docs" });
  assert.match((await featureImpact(ada.caller, "project", "portals", "off")).says.join(" "), /1 site close to visitors/);
  assert.match((await featureImpact(ada.caller, "project", "insights", "off")).says.join(" "), /can't be filled in later/);
});

test("a change that changes nothing asks nothing", async () => {
  await switchFeature(ada.caller, "project", "shares", "off");
  const i = await featureImpact(ada.caller, "project", "shares", "off");
  assert.deepEqual([i.changes, i.confirm], [0, false]);
  await switchFeature(ada.caller, "project", "shares", "on");
});
