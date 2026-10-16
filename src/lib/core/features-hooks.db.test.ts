import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { signUp } from "@/test/db";
import { ingestBytes } from "@/lib/core/assets";
import { featureOn, switchFeature } from "@/lib/core/features";
import { listFields } from "@/lib/core/fields";
import { createProject } from "@/lib/core/people";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";

// A server's feature as FEATURES_FILE has Intelligence: a key, a field, and a hook, here a server that says yes.
const told: { type: string; project: { id: string }; organization: { id: string }; asset?: Record<string, unknown> }[] = [];
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

test("a feature that asks for asset.created is told of each new asset where it is on, and nowhere else", async () => {
  const third = join(dir, "features-events.json");
  writeFileSync(
    third,
    JSON.stringify({
      features: [
        {
          id: "tagger3",
          name: "Tagger",
          description: "Tags.",
          key: { name: "Tagger", scope: "propose" },
          hook: { url: `http://127.0.0.1:${port}/hooks`, secret: "TAGGER_HOOK_SECRET", events: ["asset.created"] },
        },
      ],
    }),
  );
  process.env.FEATURES_FILE = third;
  const png = (r: number) => sharp({ create: { width: 8, height: 8, channels: 3, background: { r, g: 3, b: 3 } } }).png().toBuffer();
  /** The event about `id`, once it came: the core never waits for its features. */
  const eventFor = async (id: string, ms = 3000) => {
    for (let t = 0; t < ms; t += 50) {
      const e = told.find((x) => x.type === "asset.created" && x.asset?.id === id);
      if (e) return e;
      await sleep(50);
    }
    return null;
  };

  await switchFeature(ada.caller, "organization", "tagger3", "on");
  const { asset } = await ingestBytes(ada.caller, { bytes: await png(1), mime: "image/png", filename: "new.png" });
  const event = await eventFor(asset.id);
  assert.ok(event, "the feature was told");
  assert.equal(event.project.id, ada.caller.project.id);
  assert.equal(event.organization.id, org);
  assert.deepEqual(event.asset, { id: asset.id, filename: "new.png", mime: "image/png", status: "active", version: null });

  await switchFeature(ada.caller, "organization", "tagger3", "off");
  const quiet = (await ingestBytes(ada.caller, { bytes: await png(2), mime: "image/png", filename: "later.png" })).asset;
  assert.equal(await eventFor(quiet.id, 500), null, "off, it isn't told");
});
