import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { LOOKS } from "./brand-theme.ts";
import { PLAYBOOK, PLAYBOOK_MDX } from "./playbook.ts";

test("the playbook names every look and the blocks that matter, stays short, and has no em dashes", () => {
  for (const id of Object.keys(LOOKS)) assert.match(PLAYBOOK, new RegExp(`\`${id}\``));
  for (const t of ["statement", "quote", "split", "gallery", "palette", "cards", "specimen", "pattern", "annotated", "updates", "dodont", "preview_page"]) assert.ok(PLAYBOOK.includes(t), t);
  assert.ok(PLAYBOOK.length < 7000, `${PLAYBOOK.length} characters`);
  assert.doesNotMatch(PLAYBOOK, /\u2014/);
});

test("the docs' playbook page is this text: run pnpm docs:playbook after changing it", () => {
  assert.equal(readFileSync(join(import.meta.dirname, "..", "..", "docs", "guides", "playbook.mdx"), "utf8"), PLAYBOOK_MDX);
});
