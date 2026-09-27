import assert from "node:assert/strict";
import { test } from "node:test";
import { listStyle, resolve, RuleInput, ruleContext, ruleKey, ruleLabel } from "./rules.ts";

const r = (key: string, context: string | null, value: string) => ({ key, context, value });

test("a context gets its own rule where it has one, the default otherwise", () => {
  const rules = [
    r("color.primary", "dark-background", "#6f8cff"),
    r("color.primary", null, "#1f4fff"),
    r("color.primary", "print", "#0033cc"),
    r("logo.minSize", null, "24px"),
  ];
  assert.deepEqual(
    resolve(rules, "dark-background").map((x) => x.value),
    ["#6f8cff", "24px"],
  );
  assert.deepEqual(resolve(rules, "instagram-story").map((x) => x.value), ["#1f4fff", "24px"]);
});

test("a rule that exists only in another context is left out", () => {
  assert.deepEqual(resolve([r("tone.avoid", "print", "x")], "web"), []);
});

test("keys are dotted camelCase, contexts are slugs", () => {
  for (const k of ["color", "color.primary", "logo.minClearSpace", "type.scale2"]) assert.ok(ruleKey.safeParse(k).success, k);
  for (const k of ["Color", "color.", ".color", "color..primary", "color.primary-dark", "color primary"])
    assert.ok(!ruleKey.safeParse(k).success, k);
  assert.ok(ruleContext.safeParse("instagram-story").success);
  assert.ok(!ruleContext.safeParse("Instagram Story").success);
  assert.ok(!ruleContext.safeParse("-story").success);
});

test("values must match their type; hex is lowercased", () => {
  const ok = (v: unknown) => RuleInput.parse({ key: "color.primary", ...(v as object) });
  assert.equal(ok({ type: "color", value: "#1F4FFF" }).value, "#1f4fff");
  assert.throws(() => ok({ type: "color", value: "blue" }));
  assert.throws(() => ok({ type: "color", value: "#fff" }));
  assert.throws(() => ok({ type: "number", value: "12" }));
  assert.deepEqual(ok({ type: "list", value: ["stretch it", 12] }).value, ["stretch it", 12]);
  assert.throws(() => ok({ type: "list", value: [] }));
  assert.deepEqual(ok({ type: "text", value: "x", assets: [] }).assets, []);
  assert.throws(() => ok({ type: "text", value: "x", assets: ["logo.png"] }));
  const id = "6f1c2a4e-1b7d-4c3e-9a2b-0d4e5f6a7b8c";
  assert.throws(() => ok({ type: "text", value: "x", assets: [id, id] }), "each asset once");
  assert.throws(() => ok({ type: "text", value: "x", extra: 1 }), "unknown keys are refused");
});

test("a list's key says how it reads", () => {
  assert.equal(listStyle("type.scale", [12, 14, 16]), "scale");
  assert.equal(listStyle("type.scale", ["12", "big"]), "bullets", "a scale is numbers");
  assert.equal(listStyle("spacing.sizes", [4, 8]), "scale");
  assert.equal(listStyle("logo.neverDo", ["x"]), "dont");
  assert.equal(listStyle("tone.avoid", ["x"]), "dont");
  assert.equal(listStyle("imagery.dontShow", ["x"]), "dont");
  assert.equal(listStyle("tone.follow", ["x"]), "do");
  assert.equal(listStyle("logo.do", ["x"]), "do");
  assert.equal(listStyle("tone.doubts", ["x"]), "bullets", "do must be a whole word");
  assert.equal(listStyle("tone.words", ["x"]), "bullets");
});

test("labels read as words", () => {
  assert.equal(ruleLabel("logo.minClearSpace"), "Min clear space");
  assert.equal(ruleLabel("color"), "Color");
});

test("assets take an id or { id, rendition }; renditions are checked and put in canonical order", () => {
  const id = "6f1c2a4e-1b7d-4c3e-9a2b-0d4e5f6a7b8c";
  const other = "7a2d3b5f-2c8e-4d4f-8b3c-1e5f6a7b8c9d";
  const parse = (assets: unknown) => RuleInput.safeParse({ key: "logo.primary", type: "text", value: "x", assets });
  assert.deepEqual(parse([id, { id: other, rendition: "f_png,w_512" }]).data?.assets, [
    { id, rendition: null },
    { id: other, rendition: "w_512,f_png" },
  ]);
  assert.deepEqual(parse([{ id, rendition: null }]).data?.assets, [{ id, rendition: null }]);
  assert.equal(parse([{ id, rendition: "w_99999" }]).success, false, "past the size cap");
  assert.equal(parse([{ id, rendition: "" }]).success, false, "an empty spec is not a rendition");
  assert.equal(parse([{ id, rendition: "rotate_90" }]).success, false);
  assert.equal(parse([id, { id, rendition: "f_png" }]).success, false, "each asset once");
});
