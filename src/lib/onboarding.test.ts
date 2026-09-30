import assert from "node:assert/strict";
import { test } from "node:test";
import { isPath, onboardingSteps, PATHS, type Facts } from "./onboarding.ts";

const none: Facts = { named: false, branded: false, noEmail: false, uploaded: false, brand: null, hub: false, team: false, workspaces: 1, agent: false, mcp: false, git: null };
const brand = { slug: "acme", basics: true, tokens: true, published: false, git: false, public: false, portal: false };

test("every path ends in its first win, and only there", () => {
  for (const { id } of PATHS) {
    const steps = onboardingSteps(id, none);
    assert.equal(steps.at(-1)!.win, true, id);
    assert.equal(steps.filter((s) => s.win).length, 1, id);
    assert.ok(steps.every((s) => !s.done), `${id}: nothing done from nothing`);
  }
});

test("each win is read from what happened", () => {
  const win = (id: (typeof PATHS)[number]["id"], f: Partial<Facts>) => onboardingSteps(id, { ...none, ...f }).at(-1)!.done;
  assert.equal(win("company", { brand: { ...brand, published: true } }), true);
  assert.equal(win("product", { brand: { ...brand, git: true } }), true);
  assert.equal(win("product", { brand }), false);
  assert.equal(win("clients", { workspaces: 2 }), true);
  assert.equal(win("oss", { hub: true, brand: { ...brand, published: true } }), false, "released is not public");
  assert.equal(win("oss", { hub: true, brand: { ...brand, public: true } }), true);
  assert.equal(win("oss", { hub: false, brand: { ...brand, portal: true } }), true, "without a hub, a public portal is the win");
  assert.equal(win("ai", { agent: true }), false, "a key is not a call");
  assert.equal(win("ai", { mcp: true }), true);
});

test("without a brand, brand steps start by making one; with one, they open its builder", () => {
  assert.equal(onboardingSteps("company", none).find((s) => s.id === "basics")!.href, "/brands");
  assert.equal(onboardingSteps("company", { ...none, brand }).find((s) => s.id === "publish")!.href, "/brands/acme/guidelines");
  assert.equal(onboardingSteps("product", { ...none, brand, git: "https://git.example/connect?b={brand}" }).at(-1)!.href, "https://git.example/connect?b=acme");
  assert.equal(onboardingSteps("product", { ...none, brand }).at(-1)!.href, "/brands/acme");
});

test("email is a step only where the organization must turn its own on", () => {
  assert.ok(!onboardingSteps("company", none).some((s) => s.id === "email"));
  assert.ok(onboardingSteps("company", { ...none, noEmail: true }).some((s) => s.id === "email"));
});

test("a stored path is one of the five, and an old one counts as none", () => {
  assert.equal(isPath("ai"), true);
  assert.equal(isPath("nope"), false);
  assert.equal(isPath("brand"), false);
  assert.equal(isPath(undefined), false);
});
