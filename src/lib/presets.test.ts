import assert from "node:assert/strict";
import { test } from "node:test";
import { camel, ESSENTIALS, keyFor, PRESETS } from "./presets.ts";
import { RuleInput, ruleLabel } from "./rules.ts";

test("names become camelCase key segments", () => {
  assert.equal(camel("Min clear space"), "minClearSpace");
  assert.equal(camel("  Primary  "), "primary");
  assert.equal(camel("Don't use on photos!"), "dontUseOnPhotos");
  assert.equal(camel("Café au lait"), "cafeAuLait");
  assert.equal(camel("2nd color"), "ndColor", "a key segment can't start with a digit");
  assert.equal(camel("!!!"), "");
  assert.equal(camel("socialMedia"), "socialMedia", "a key segment passes through");
  assert.equal(camel("HTML colors"), "htmlColors");
  assert.equal(camel("Logo on iPhone"), "logoOnIPhone");
});

test("keys are made unique by counting up", () => {
  assert.equal(keyFor("color", "Accent", new Set()), "color.accent");
  assert.equal(keyFor("color", "Accent", new Set(["color.accent"])), "color.accent2");
  assert.equal(keyFor("color", "Accent", new Set(["color.accent", "color.accent2"])), "color.accent3");
  assert.equal(keyFor("Social media", "Avatar size", new Set()), "socialMedia.avatarSize");
  assert.equal(keyFor("socialMedia", "Avatar size", new Set()), "socialMedia.avatarSize", "a section key is kept as is");
  assert.equal(keyFor("color", "!!!", new Set()), null);
  assert.equal(keyFor("", "Accent", new Set()), null, "a rule needs a section");
});

test("a name survives the round trip to a key and back", () => {
  assert.equal(ruleLabel(keyFor("logo", "Min clear space", new Set())!), "Min clear space");
});

test("every preset makes a valid rule, and the essentials exist", () => {
  for (const p of PRESETS) {
    const key = keyFor(p.section || "custom", p.name ?? p.suggest ?? "rule", new Set())!;
    assert.ok(RuleInput.safeParse({ key, type: p.type, value: p.value, usage: p.usage }).success, p.id);
  }
  for (const id of ESSENTIALS) assert.ok(PRESETS.some((p) => p.id === id && p.name), `${id} is a named preset`);
});
