import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COLOR_SPEC,
  contextLabel,
  fontLabel,
  fontValue,
  listStyle,
  resolve,
  RULE_VALUE,
  RuleInput,
  ruleContext,
  ruleKey,
  ruleLabel,
  RulePatch,
  ruleName,
  renameInSpec,
  specAssets,
  specKeys,
} from "./rules.ts";

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
  assert.equal(contextLabel("dark-background"), "Dark background");
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

test("a font is a family, sized and weighted or not; a bare name is the family", () => {
  assert.deepEqual(RULE_VALUE.font.parse(" Inter "), { family: "Inter" });
  assert.deepEqual(RULE_VALUE.font.parse({ family: "Inter", size: 32, weight: 700 }), { family: "Inter", size: 32, weight: 700 });
  assert.ok(!RULE_VALUE.font.safeParse({ family: "Inter", color: "red" }).success);
  assert.ok(!RULE_VALUE.font.safeParse({ family: "Inter", size: -1 }).success);
  assert.equal(fontLabel(fontValue("Inter")), "Inter");
  assert.equal(fontLabel({ family: "Inter", size: 32, weight: 700 }), "Inter, 32px, 700");
});

test("each type takes its own spec; a misspelled or foreign field is refused", () => {
  const parse = (v: object) => RuleInput.safeParse({ key: "color.primary", ...v });
  const color = parse({
    type: "color",
    value: "#E6007E",
    spec: {
      token: "Pink-500",
      group: "Primary",
      weight: 40,
      pair: "color.white",
      tints: [80, 60],
      cmyk: [0, 100, 0, 0],
      pantone: ["Rhodamine Red C"],
      rgb: [230, 0, 126],
      print: "specified",
      gradient: { kind: "linear", angle: 90, stops: [{ color: "color.primary" }, { color: "#FFFFFF", at: 100, opacity: 0.5 }] },
    },
  });
  assert.ok(color.success);
  assert.equal(color.data.type === "color" && color.data.spec?.gradient?.stops[1].color, "#ffffff", "a stop's hex is lowercased");
  assert.ok(parse({ type: "number", value: 2, spec: { unit: "x", of: "the mark's height" } }).success);
  assert.ok(
    parse({
      type: "font",
      value: "Inter",
      spec: {
        role: "body",
        tracking: [
          [12, 0.01],
          [48, -0.02],
        ],
        case: "upper",
        script: "Latn",
        features: ["ss01"],
        download: false,
      },
    }).success,
  );
  assert.ok(parse({ type: "color", value: "#e6007e", spec: null }).success, "null clears");

  assert.ok(!parse({ type: "color", value: "#e6007e", spec: { pantones: ["485 C"] } }).success, "misspelled");
  assert.ok(!parse({ type: "number", value: 2, spec: { unit: "pixels" } }).success);
  assert.ok(!parse({ type: "number", value: 2, spec: { pair: "color.white" } }).success, "a color's field on a number");
  assert.ok(!parse({ type: "font", value: "Inter", spec: { font: "Inter" } }).success);
  assert.ok(!parse({ type: "font", value: "Inter", spec: { script: "latin" } }).success);
  assert.ok(parse({ type: "font", value: "Inter", spec: { url: "https://rsms.me/inter/" } }).success);
  for (const url of ["javascript:alert(1)", "data:text/html,<script>x</script>", "ftp://example.com/inter.zip"]) {
    assert.ok(!parse({ type: "font", value: "Inter", spec: { url } }).success, url);
  }
  assert.ok(parse({ type: "text", value: "Made with Blender", spec: { copy: true, max: 30 } }).success, "words to paste, and their limit");
  assert.ok(!parse({ type: "text", value: "x", spec: { max: 0 } }).success);
  assert.ok(!parse({ type: "text", value: "x", spec: { max: 2.5 } }).success);
  assert.ok(!parse({ type: "text", value: "x", spec: { unit: "px" } }).success, "a number's field on text");
  assert.ok(!parse({ type: "list", value: ["x"], spec: {} }).success);
  assert.ok(!parse({ type: "color", value: "#e6007e", spec: {}, extra: 1 }).success, "still strict with a spec");
});

test("a gradient needs two stops, each a color key or a hex", () => {
  const stop = (color: string) => ({ color });
  const g = (stops: object[]) => COLOR_SPEC.safeParse({ gradient: { stops } }).success;
  assert.ok(g([stop("color.a"), stop("#000000")]));
  assert.ok(!g([stop("color.a")]));
  assert.ok(!g([stop("color.a"), stop("#fff")]), "a short hex, like a value");
  assert.ok(!g([stop("color.a"), stop("Pink")]), "not a key");
  assert.ok(!g([stop("color.a"), { color: "#000000", offset: 50 }]));
});

test("labels are headings: optional, clearable, never the key", () => {
  const parse = (label: unknown) => RuleInput.safeParse({ key: "logo.minClearSpace", type: "number", value: 1, label });
  assert.equal(parse("  Clear space ").data?.label, "Clear space");
  assert.ok(parse(null).success);
  assert.ok(!parse("  ").success);
  assert.equal(ruleName({ key: "logo.minClearSpace", label: "Clear space" }), "Clear space");
  assert.equal(ruleName({ key: "logo.minClearSpace", label: null }), "Min clear space");
  assert.equal(ruleName({ key: "logo.minClearSpace" }), "Min clear space");
  assert.deepEqual(RulePatch.parse({ label: "Clear space", spec: { unit: "x" } }), { label: "Clear space", spec: { unit: "x" } });
});

test("a spec names rules through its pair and gradient stops, and assets through its texture", () => {
  const texture = "6f1c2a4e-1b7d-4c3e-9a2b-0d4e5f6a7b8c";
  const spec = COLOR_SPEC.parse({
    pair: "color.white",
    texture,
    gradient: { stops: [{ color: "color.pink" }, { color: "#000000" }, { color: "color.white" }] },
  });
  assert.deepEqual(specKeys(spec), ["color.white", "color.pink"], "once each, pair first, hexes left out");
  assert.deepEqual(specAssets(spec), [texture]);
  assert.deepEqual(specKeys(null), []);
  assert.deepEqual(specKeys({ unit: "px" }), []);
  assert.deepEqual(specKeys({ copy: true, max: 30 }), []);
  assert.deepEqual(specAssets(undefined), []);
});

test("renaming a rule renames it in a spec; a spec that doesn't name it is left alone", () => {
  const spec = COLOR_SPEC.parse({
    pair: "color.white",
    group: "Primary",
    gradient: { angle: 45, stops: [{ color: "color.white", at: 0 }, { color: "#000000" }] },
  });
  assert.deepEqual(renameInSpec(spec, "color.white", "color.paper"), {
    pair: "color.paper",
    group: "Primary",
    gradient: { angle: 45, stops: [{ color: "color.paper", at: 0 }, { color: "#000000" }] },
  });
  assert.equal(renameInSpec(spec, "color.pink", "color.rose"), null);
  assert.equal(renameInSpec({ role: "body" }, "color.white", "color.paper"), null);
  assert.deepEqual(renameInSpec({ gradient: { stops: [{ color: "color.a" }, { color: "color.b" }] } }, "color.b", "color.c"), {
    gradient: { stops: [{ color: "color.a" }, { color: "color.c" }] },
  });
});
