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

test("find_icons takes nothing; import_icons wants a set and each icon once, as POST /icons does", () => {
  assert.ok(TOOL_INPUTS.find_icons.safeParse({}).success);
  assert.ok(TOOL_INPUTS.import_icons.safeParse({ prefix: "tabler", icons: ["home", "arrow-right"] }).success);
  assert.ok(!TOOL_INPUTS.import_icons.safeParse({ prefix: "tabler", icons: ["home", "home"] }).success);
  assert.ok(!TOOL_INPUTS.import_icons.safeParse({ prefix: "Tabler Icons", icons: ["home"] }).success);
  assert.ok(!TOOL_INPUTS.import_icons.safeParse({ prefix: "tabler", icons: [] }).success);
});

test("create_portal takes what POST /portals takes, asks for access, and refuses a misspelled field", () => {
  const ok = { name: "Press kit", access: "members", brands: ["default"] };
  assert.ok(TOOL_INPUTS.create_portal.safeParse(ok).success);
  assert.ok(TOOL_INPUTS.create_portal.safeParse({ ...ok, slug: "press-kit", access: "public" }).success);
  assert.ok(TOOL_INPUTS.create_portal.safeParse({ ...ok, access: "password", password: "hunter22", theme: { accent: "#ff5500" } }).success);
  assert.ok(!TOOL_INPUTS.create_portal.safeParse({ ...ok, access: "password", password: "abc" }).success, "four characters at least, as there");
  assert.ok(!TOOL_INPUTS.create_portal.safeParse({ ...ok, theme: { accent: "orange" } }).success);
  assert.ok(!TOOL_INPUTS.create_portal.safeParse({ ...ok, brand: ["default"] }).success);
  assert.ok(!TOOL_INPUTS.create_portal.safeParse({ name: "No door", brands: ["default"] }).success, "access is asked for");
});

test("create_brand and update_brand take what POST and PATCH /brands take, and refuse a misspelled field", () => {
  assert.ok(TOOL_INPUTS.create_brand.safeParse({ name: "Acme Kids" }).success);
  assert.ok(TOOL_INPUTS.create_brand.safeParse({ name: "Acme Kids", slug: "kids", from: "default" }).success);
  assert.ok(!TOOL_INPUTS.create_brand.safeParse({ name: "Acme Kids", slug: "Acme Kids" }).success);
  assert.ok(!TOOL_INPUTS.create_brand.safeParse({ nmae: "Acme Kids" }).success);
  assert.ok(TOOL_INPUTS.update_brand.safeParse({ brand: "kids", default: true }).success);
  assert.ok(!TOOL_INPUTS.update_brand.safeParse({ brand: "kids", default: false }).success, "a brand is made the default, never unmade");
  assert.ok(!TOOL_INPUTS.delete_brand.safeParse({}).success, "the brand is named, never the default by omission");
});

test("the collection tools name a collection by id or name, and take ids to file", () => {
  assert.ok(TOOL_INPUTS.create_collection.safeParse({ name: "Spring campaign", fields: { channel: "web" }, private: true }).success);
  assert.ok(!TOOL_INPUTS.create_collection.safeParse({ name: "" }).success);
  assert.ok(TOOL_INPUTS.update_collection.safeParse({ collection: "Spring campaign", fields: { channel: null } }).success);
  assert.ok(!TOOL_INPUTS.update_collection.safeParse({ collection: "Spring campaign", nmae: "Spring" }).success);
  const id = "4b8f7a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b";
  assert.ok(TOOL_INPUTS.update_collection_assets.safeParse({ collection: "Spring campaign", add: [id], remove: [] }).success);
  assert.ok(!TOOL_INPUTS.update_collection_assets.safeParse({ collection: "Spring campaign", add: ["logo.svg"] }).success);
});

test("update_portal takes a password and a theme, as PATCH /portals/{id} does", () => {
  assert.ok(TOOL_INPUTS.update_portal.safeParse({ portal: "press", access: "password", password: "hunter22" }).success);
  assert.ok(TOOL_INPUTS.update_portal.safeParse({ portal: "press", theme: { logo: null, background: "#101010" } }).success);
  assert.ok(TOOL_INPUTS.decide_portal_request.safeParse({ portal: "press", request: "4b8f7a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b", status: "approved" }).success);
  assert.ok(!TOOL_INPUTS.decide_portal_request.safeParse({ portal: "press", request: "4b8f7a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b", status: "pending" }).success);
});

test("the field tools take what POST and PATCH /fields take: a select has options, a key never changes", () => {
  assert.ok(TOOL_INPUTS.create_field.safeParse({ key: "channel", label: "Channel", type: "select", options: ["web", "print"] }).success);
  assert.ok(!TOOL_INPUTS.create_field.safeParse({ key: "channel", label: "Channel", type: "select" }).success);
  assert.ok(!TOOL_INPUTS.create_field.safeParse({ key: "Channel", label: "Channel", type: "text" }).success);
  assert.ok(TOOL_INPUTS.update_field.safeParse({ key: "channel", required: true }).success);
  assert.ok(!TOOL_INPUTS.update_field.safeParse({ key: "channel", options: ["web", "web"] }).success, "the refinement survives the extension");
  assert.ok(!TOOL_INPUTS.update_field.safeParse({ key: "channel", type: "number" }).success);
});

test("review_asset decides, and accepts or dismisses suggestions, by name", () => {
  const id = "4b8f7a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b";
  assert.ok(TOOL_INPUTS.review_asset.safeParse({ id, decision: "approve", fields: { channel: "web" }, acceptTags: ["logo"] }).success);
  assert.ok(TOOL_INPUTS.review_asset.safeParse({ id, decision: "reject", note: "Off brand" }).success);
  assert.ok(!TOOL_INPUTS.review_asset.safeParse({ id, decision: "archive" }).success);
  assert.ok(!TOOL_INPUTS.review_asset.safeParse({ id, status: "active" }).success);
});

test("comments start a thread on a page or reply by parent, never both, as POST /comments does", () => {
  const parent = "4b8f7a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b";
  assert.ok(TOOL_INPUTS.add_comment.safeParse({ brand: "default", page: "logo", body: "Too small?" }).success);
  assert.ok(TOOL_INPUTS.add_comment.safeParse({ parent, body: "Fixed" }).success);
  assert.ok(!TOOL_INPUTS.add_comment.safeParse({ page: "logo", parent, body: "Both" }).success);
  assert.ok(TOOL_INPUTS.update_comment.safeParse({ id: parent, resolved: true }).success);
  assert.ok(!TOOL_INPUTS.update_comment.safeParse({ id: parent }).success, "body, resolved, or both");
});

test("versions go by number; against is a number or current", () => {
  assert.ok(TOOL_INPUTS.get_version.safeParse({ number: 3, against: "current" }).success);
  assert.ok(!TOOL_INPUTS.get_version.safeParse({ number: 0 }).success);
  assert.ok(!TOOL_INPUTS.get_version.safeParse({ number: 3, against: "latest" }).success);
  assert.ok(TOOL_INPUTS.name_version.safeParse({ number: 3, name: null }).success);
  assert.ok(!TOOL_INPUTS.name_version.safeParse({ number: 3 }).success, "a name, or null to clear it");
});
