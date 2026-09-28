import assert from "node:assert/strict";
import { test } from "node:test";
import { TOOL_INPUTS, toolSchemas } from "./mcp-tools.ts";

// Every tools/list carries these into an agent's context: the flat wire keeps them small as templates grow.
// 8000 held through W1. W2's four templates and the cover's hero props took edit_page to 8818; listing the
// icons once and dropping the pattern from section references brought it back to 8472, so the line moved to
// 9000, still well under the 13 KB save_page advertised before the flat wire. W4's diagram template, its 13
// props and Item.span took edit_page to 9885 (save_page 8689): about 1000 of that is their names, enums and
// bounds before any description, so no trim of the new words fits 9000, and the W1 and W2 words stay. The
// line moved to 10000. W5's languages and layout took edit_page to 11283 (save_page 10087): a section's
// translations are its five text fields and three item fields again, keyed by a language tag, and a page's are
// three more, plus layout and the updates template. Their descriptions are cut to a phrase, and the text fields
// share one set of bounds; what is left is shape, so the line moved to 12000. W7's nine templates, their props,
// the new layouts and kinds, Item.at and Item.level took edit_page to 13596; hotspot, formula, scales and embed
// words cut to a phrase or to nothing (list_templates says the rest) brought it to 13354 (save_page 12158), so
// the line moved to 14000. The icons template took edit_page to 14455; saying a description once for every
// template that shares it (collection and icons share their source), one size description for logos and icons,
// and leaving the icons' defaults to list_templates brought it to 13997 (save_page 12801). Raise it only after
// the same hunt.
test("the page tools' schemas stay under 14000 characters", () => {
  const s = toolSchemas();
  for (const name of ["save_page", "edit_page"]) {
    const size = JSON.stringify(s[name]).length;
    assert.ok(size < 14000, `${name} is ${size} characters`);
  }
});

test("a uuid and a date-time are advertised by their format alone", () => {
  const image = JSON.stringify(toolSchemas().publish);
  assert.match(image, /"format":"uuid"/);
  assert.doesNotMatch(image, /"pattern"/);
  const closes = JSON.stringify(toolSchemas().update_portal.properties?.expiresAt);
  assert.match(closes, /"format":"date-time"/);
  assert.doesNotMatch(closes, /"pattern"/);
});

test("update_portal refuses a misspelled field, as PATCH /portals/{id} does", () => {
  assert.ok(TOOL_INPUTS.update_portal.safeParse({ portal: "press", expiresAt: null, site: { listed: true } }).success);
  assert.ok(!TOOL_INPUTS.update_portal.safeParse({ portal: "press", brand: ["default"] }).success);
});

test("set_theme merges: null clears any setting, and a misspelled one is refused", () => {
  assert.ok(TOOL_INPUTS.set_theme.safeParse({ radius: null, width: null, accent: null, band: true }).success);
  assert.ok(!TOOL_INPUTS.set_theme.safeParse({ radious: 4 }).success);
  assert.ok(!TOOL_INPUTS.set_theme.safeParse({ radius: 41 }).success);
});
