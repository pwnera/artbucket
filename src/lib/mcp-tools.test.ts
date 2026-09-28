import assert from "node:assert/strict";
import { test } from "node:test";
import { TOOL_INPUTS, toolSchemas } from "./mcp-tools.ts";

// Every tools/list carries these into an agent's context: the flat wire keeps them small as templates grow.
test("the page tools' schemas stay under 8000 characters", () => {
  const s = toolSchemas();
  for (const name of ["save_page", "edit_page"]) {
    const size = JSON.stringify(s[name]).length;
    assert.ok(size < 8000, `${name} is ${size} characters`);
  }
});

test("a uuid is advertised by its format alone", () => {
  const image = JSON.stringify(toolSchemas().publish);
  assert.match(image, /"format":"uuid"/);
  assert.doesNotMatch(image, /"pattern"/);
});

test("set_theme merges: null clears any setting, and a misspelled one is refused", () => {
  assert.ok(TOOL_INPUTS.set_theme.safeParse({ radius: null, width: null, accent: null, band: true }).success);
  assert.ok(!TOOL_INPUTS.set_theme.safeParse({ radious: 4 }).success);
  assert.ok(!TOOL_INPUTS.set_theme.safeParse({ radius: 41 }).success);
});
