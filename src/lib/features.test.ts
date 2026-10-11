import assert from "node:assert/strict";
import { test } from "node:test";
import { BUILTIN, catalog, decide, onApp, parseFeatures, ruleOf } from "./features.ts";

const both = { levels: ["organization", "project"] as ("organization" | "project")[], default: "off" as const };

test("the organization's switch, set, decides for every project", () => {
  assert.deepEqual(decide(both, "on", "off"), { on: true, from: "organization" });
  assert.deepEqual(decide(both, "off", "on"), { on: false, from: "organization" });
});

test("unset, each project decides, else the default", () => {
  assert.deepEqual(decide(both, null, "on"), { on: true, from: "project" });
  assert.deepEqual(decide(both, null, null), { on: false, from: "default" });
  assert.deepEqual(decide({ ...both, default: "on" }, null, null), { on: true, from: "default" });
});

test("a level the feature isn't switched at is ignored", () => {
  assert.deepEqual(decide({ levels: ["organization"], default: "on" }, null, "off"), { on: true, from: "default" });
  assert.deepEqual(decide({ levels: ["project"], default: "off" }, "on", null), { on: false, from: "default" });
});

test("a feature taking a plan is off without one, whatever its switches say", () => {
  assert.deepEqual(decide({ ...both, paid: true }, "on", "on", false), { on: false, from: "plan" });
  assert.deepEqual(decide({ ...both, paid: true }, "on", null, true), { on: true, from: "organization" });
  assert.deepEqual(decide(both, "on", null, false), { on: true, from: "organization" }, "one that takes none ignores it");
});

test("the organization's rule: each project decides only where projects have a switch", () => {
  assert.equal(ruleOf(both, null), "projects");
  assert.equal(ruleOf(both, "off"), "off");
  assert.equal(ruleOf({ levels: ["organization"], default: "on" }, null), "on");
});

test("the core's own start on, so nothing changes until an admin says so", () => {
  for (const f of BUILTIN) assert.equal(f.default, "on", f.id);
});

test("BrandHub is offered only where the server runs one", () => {
  const had = process.env.HUB_URL;
  delete process.env.HUB_URL;
  assert.ok(!catalog(undefined).some((f) => f.id === "hub"));
  process.env.HUB_URL = "https://hub.example.com";
  assert.ok(catalog(undefined).some((f) => f.id === "hub"));
  if (had === undefined) delete process.env.HUB_URL;
  else process.env.HUB_URL = had;
});

test("BrandHub is the organization's alone: a project's switch says nothing", () => {
  const hub = BUILTIN.find((f) => f.id === "hub")!;
  assert.deepEqual(decide(hub, null, "off"), { on: true, from: "default" });
});

test("a server's file: checked, with defaults filled in", () => {
  const [f] = parseFeatures(
    JSON.stringify({
      features: [
        {
          id: "intelligence",
          name: "Intelligence",
          description: "Tag suggestions.",
          key: { name: "Artbucket Intelligence", scope: "propose" },
          hook: { url: "http://localhost:8788/intelligence/hooks", secret: "INTELLIGENCE_HOOK_SECRET" },
        },
      ],
    }),
    "features.json",
  );
  assert.equal(f.default, "off");
  assert.deepEqual(f.levels, ["organization", "project"]);
  assert.deepEqual(f.fields, []);
  assert.equal(f.builtin, false);
});

test("from FEATURES itself, JSON or YAML, as a host's settings pass it", () => {
  const json = JSON.stringify({ features: [{ id: "tagger", name: "Tagger", description: "Tags." }] });
  assert.ok(catalog(undefined, json).some((f) => f.id === "tagger" && !f.builtin));
  assert.ok(catalog(undefined, "features:\n  - { id: ocr, name: OCR, description: Text in images. }\n").some((f) => f.id === "ocr"));
  assert.ok(!catalog(undefined, undefined).some((f) => !f.builtin), "neither: the core's own only");
  assert.throws(() => catalog("features.json", json), /both set/);
  assert.throws(() => catalog(undefined, '{ "features": [{ "id": "Bad" }] }'), /^Error: FEATURES:/);
});

test("and in YAML", () => {
  const [f] = parseFeatures("features:\n  - id: ocr\n    name: OCR\n    description: Text in images.\n    levels: [project]\n", "features.yaml");
  assert.deepEqual(f.levels, ["project"]);
});

test("a mistake in the file stops the server, by name", () => {
  assert.throws(() => parseFeatures(JSON.stringify({ features: [{ id: "agents", name: "x", description: "y" }] })), /already a feature/);
  assert.throws(() => parseFeatures(JSON.stringify({ features: [{ id: "Bad id", name: "x", description: "y" }] })), /FEATURES_FILE/);
  assert.throws(() => parseFeatures(JSON.stringify({ features: [{ id: "x1", name: "x", description: "y", hook: { url: "http://h", secret: "lower" } }] })));
});

test("a server's address on the app's origin is called on the page's host, or by its path; elsewhere, as it is", () => {
  assert.equal(onApp("http://localhost:8788/assistant", "http://localhost:8788"), "/assistant");
  assert.equal(onApp("https://app.example.com/assistant", "https://app.example.com", "brand.acme.com"), "https://brand.acme.com/assistant");
  assert.equal(onApp("https://ai.example.com/assistant", "https://app.example.com", "brand.acme.com"), "https://ai.example.com/assistant");
  assert.equal(onApp("https://app.example.com/intelligence?x=1", "https://app.example.com/"), "/intelligence?x=1");
  assert.equal(onApp("https://ai.example.com/assistant", "https://app.example.com"), "https://ai.example.com/assistant");
  assert.equal(onApp("https://ai.example.com/assistant", undefined), "https://ai.example.com/assistant");
});
