import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { plan, signUp } from "@/test/db";
import { featureOn, listFeatures, requireFeature, switchFeature } from "@/lib/core/features";
import { effective } from "@/lib/core/settings";
import { createProject } from "@/lib/core/people";
import { db } from "@/lib/db";
import { apiKeys, settings } from "@/lib/db/schema";

// As Intelligence: takes a plan, has a key, is told by its hook. The hook takes a while, and can refuse one project.
let refuse: string | null = null;
let calls = 0;
const hook = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    calls++;
    const e = JSON.parse(body);
    setTimeout(() => {
      if (e.type === "feature.enabled" && e.project.id === refuse) return res.writeHead(403, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: "Not this one" } }));
      res.writeHead(200, { "content-type": "application/json" }).end("{}");
    }, 150);
  });
});
await new Promise<void>((r) => hook.listen(0, "127.0.0.1", r));
const { port } = hook.address() as { port: number };
const dir = mkdtempSync(join(tmpdir(), "features-"));
process.env.FEATURES_FILE = join(dir, "features.json");
process.env.PAID_HOOK_SECRET = "test-secret";
writeFileSync(
  process.env.FEATURES_FILE,
  JSON.stringify({
    features: [
      {
        id: "paid",
        name: "Paid",
        description: "Takes a plan.",
        paid: true,
        key: { name: "Paid", scope: "propose" },
        hook: { url: `http://127.0.0.1:${port}/hooks`, secret: "PAID_HOOK_SECRET" },
      },
    ],
  }),
);
test.after(() => hook.close());

const ada = await signUp("Ada");
const org = ada.caller.project.organizationId;
const here = { organizationId: org, projectId: ada.caller.project.id };
const keys = (projectIds: string[]) => db.select().from(apiKeys).where(and(inArray(apiKeys.projectId, projectIds), eq(apiKeys.feature, "paid")));
const setPlan = async (value: Record<string, unknown>) => {
  await db.update(settings).set({ value }).where(and(eq(settings.organizationId, org), eq(settings.key, "limits")));
  await effective("limits", { organizationId: org }, { fresh: true });
};

test("without a plan it can't be turned on, and Settings says so", async () => {
  await assert.rejects(switchFeature(ada.caller, "project", "paid", "on"), /isn't part of this organization's plan/);
  const f = (await listFeatures(ada.caller, "project")).find((x) => x.id === "paid")!;
  assert.deepEqual([f.available, f.on, f.from], [false, false, "plan"]);
});

test("a plan lapsing turns it off everywhere at once, and its return brings it back as it was", async () => {
  await plan(org, {});
  await switchFeature(ada.caller, "project", "paid", "on");
  assert.ok(await featureOn("paid", here));
  const { value } = await effective("limits", { organizationId: org });
  await setPlan({ ...value, readOnly: true });
  assert.equal(await featureOn("paid", here), false);
  await assert.rejects(requireFeature("paid", here), /isn't part of this organization's plan/);
  assert.equal((await keys([here.projectId])).length, 1, "nothing is taken down: its key waits for the plan");
  await setPlan({ ...value, readOnly: false });
  assert.ok(await featureOn("paid", here), "back, as it was");
});

test("on for twenty projects at once: the hooks run side by side, not one after another", async () => {
  const many = await Promise.all(Array.from({ length: 20 }, (_, i) => createProject(ada.caller, { name: `P${i}` })));
  calls = 0;
  const t = Date.now();
  await switchFeature(ada.caller, "organization", "paid", "on");
  const took = Date.now() - t;
  assert.equal(calls, 20, "each project that changed is told");
  assert.ok(took < 20 * 150 / 2, `${took} ms for 20 hooks of 150 ms`);
  assert.equal((await keys(many.map((p) => p.id))).length, 20);
  await switchFeature(ada.caller, "organization", "paid", "projects");
});

test("one refusal among many: none is turned on, and those set up meanwhile are taken down", async () => {
  const more = await Promise.all(Array.from({ length: 12 }, (_, i) => createProject(ada.caller, { name: `Q${i}` })));
  refuse = more[5].id;
  await assert.rejects(switchFeature(ada.caller, "organization", "paid", "on"), /Not this one/);
  refuse = null;
  for (const p of more) assert.equal(await featureOn("paid", { organizationId: org, projectId: p.id }), false);
  assert.equal((await keys(more.map((p) => p.id))).length, 0);
});
