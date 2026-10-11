import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { and, eq } from "drizzle-orm";
import { signUp } from "@/test/db";
import { featureOn, switchFeature } from "@/lib/core/features";
import { listFields } from "@/lib/core/fields";
import { createProject } from "@/lib/core/people";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";

// A server's feature as FEATURES_FILE has Intelligence: a key, a field, and a hook, here a server that says yes.
const told: { type: string; project: { id: string } }[] = [];
/** Whether the hook says no to being turned on, as Intelligence does for an organization without a plan for it. */
let refusing = false;
const hook = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const event = JSON.parse(body);
    told.push(event);
    if (refusing && event.type === "feature.enabled") return res.writeHead(403, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: "Not on this plan" } }));
    res.writeHead(200, { "content-type": "application/json" }).end("{}");
  });
});
await new Promise<void>((r) => hook.listen(0, "127.0.0.1", r));
const { port } = hook.address() as { port: number };
const dir = mkdtempSync(join(tmpdir(), "features-"));
process.env.FEATURES_FILE = join(dir, "features.json");
process.env.TAGGER_HOOK_SECRET = "test-secret";
writeFileSync(
  process.env.FEATURES_FILE,
  JSON.stringify({
    features: [
      {
        id: "tagger",
        name: "Tagger",
        description: "Tags.",
        key: { name: "Tagger", scope: "propose" },
        fields: [{ key: "alt_text", label: "Alt text", type: "text" }],
        hook: { url: `http://127.0.0.1:${port}/hooks`, secret: "TAGGER_HOOK_SECRET" },
      },
    ],
  }),
);

const ada = await signUp("Ada");
const org = ada.caller.project.organizationId;
const keysIn = (projectId: string) => db.select().from(apiKeys).where(and(eq(apiKeys.projectId, projectId), eq(apiKeys.feature, "tagger")));

test.after(() => hook.close());

test("on for the whole organization: a project made afterwards is set up like the others", async () => {
  await switchFeature(ada.caller, "organization", "tagger", "on");
  assert.equal((await keysIn(ada.caller.project.id)).length, 1, "the project there before has its key");
  const later = await createProject(ada.caller, { name: "Later" });
  assert.ok(await featureOn("tagger", { organizationId: org, projectId: later.id }), "it reads as on");
  assert.equal((await keysIn(later.id)).length, 1, "and has its key");
  assert.ok((await listFields(later.id)).some((f) => f.key === "alt_text"), "its field");
  assert.ok(told.some((e) => e.type === "feature.enabled" && e.project.id === later.id), "and the feature was told");
});

test("each project deciding: a new project starts as the feature's default, off here, and nothing is made", async () => {
  await switchFeature(ada.caller, "organization", "tagger", "projects");
  const fresh = await createProject(ada.caller, { name: "Fresh" });
  assert.equal(await featureOn("tagger", { organizationId: org, projectId: fresh.id }), false);
  assert.equal((await keysIn(fresh.id)).length, 0);
});

test("a feature that refuses a new project is turned off there, never left reading on", async () => {
  // On by default, each project deciding: a new project is on, and the hook says no.
  const second = join(dir, "features-default-on.json");
  writeFileSync(
    second,
    JSON.stringify({
      features: [
        {
          id: "tagger2",
          name: "Tagger",
          description: "Tags.",
          default: "on",
          key: { name: "Tagger", scope: "propose" },
          hook: { url: `http://127.0.0.1:${port}/hooks`, secret: "TAGGER_HOOK_SECRET" },
        },
      ],
    }),
  );
  // Another file: the catalog reads it afresh.
  process.env.FEATURES_FILE = second;
  refusing = true;
  const refused = await createProject(ada.caller, { name: "Refused" });
  refusing = false;
  assert.equal(await featureOn("tagger2", { organizationId: org, projectId: refused.id }), false);
  assert.equal(
    (await db.select().from(apiKeys).where(and(eq(apiKeys.projectId, refused.id), eq(apiKeys.feature, "tagger2")))).length,
    0,
    "its key was taken back",
  );
});
