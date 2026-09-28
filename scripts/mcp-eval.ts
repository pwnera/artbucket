/**
 * The brand pages acceptance test: build the Blender book (lib/fixtures/brand-book.ts)
 * in a brand of its own, over MCP only, and check every answer on the way.
 *
 *   pnpm dev
 *   pnpm eval:mcp                                     # against http://localhost:3000
 *   ARTBUCKET_URL=http://localhost:3100 pnpm eval:mcp
 *
 * It needs the server's database (DATABASE_URL, read from .env) for one
 * thing: a write key of its own in the first workspace, like `pnpm bench`.
 * Pass or fail, it then deletes the brand it made, trashes the logos it
 * ingested (not ones already in the library) and deletes the key, and it
 * touches nothing else. A run killed midway leaves a brand eval-blender-* and
 * a key eval-mcp-*: delete them by hand. Not part of `pnpm test`: it needs a server.
 */

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";
import { checkWarnings, type Theme } from "../src/lib/brand-theme.ts";
import { blender, type BookAssets } from "../src/lib/fixtures/brand-book.ts";

const URL_ = process.env.ARTBUCKET_URL ?? "http://localhost:3000";
if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL to the server's database: the eval makes itself a key there.");
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });

/** Blender's logos on Commons (scripts/seed-demo.ts): public domain, trademarks of the Blender Foundation. */
const LOGOS: BookAssets = {
  mark: "https://upload.wikimedia.org/wikipedia/commons/0/0c/Blender_logo_no_text.svg",
  wordmark: "https://upload.wikimedia.org/wikipedia/commons/3/3c/Logo_Blender.svg",
};

type Section = { id: string; title: string; tone: string } & Record<string, unknown>;
/** What get_theme, set_theme and PATCH theme answer. */
type ThemeView = { settings: unknown; theme: Theme; checks: Theme["checks"]; warnings: string[] };
type Page = { slug: string; title: string; parent: string | null; aliases: string[]; sections: Section[] } & Record<string, unknown>;

const run = randomBytes(4).toString("hex");
const brand = `eval-blender-${run}`;
const secret = `ab_${randomBytes(32).toString("base64url")}`;
const hash = createHash("sha256").update(secret).digest("hex");

async function http<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

let id = 0;
async function rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const { result, error } = await http<{ result: T; error?: { message: string } }>("POST", "/api/v1/mcp", { jsonrpc: "2.0", id: ++id, method, params });
  if (error) throw new Error(`${method}: ${error.message}`);
  return result;
}

/** A tool's answer, or a throw with the error the agent would have read. */
async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const r = await rpc<{ content: { text: string }[]; isError?: boolean }>("tools/call", { name, arguments: args });
  const data = JSON.parse(r.content[0].text);
  if (r.isError) throw new Error(`${name}: ${data.error}`);
  return data;
}

/** A call that must fail: the error the agent reads. */
async function refused(name: string, args: Record<string, unknown>): Promise<string> {
  const r = await rpc<{ content: { text: string }[]; isError?: boolean }>("tools/call", { name, arguments: args });
  assert.ok(r.isError, `${name} should have been refused`);
  return JSON.parse(r.content[0].text).error;
}

let passed = 0;
const ok = (what: string) => console.log(`ok ${++passed} ${what}`);

const [ws] = await sql<{ id: string }[]>`select id from workspaces order by created_at limit 1`;
if (!ws) throw new Error("No workspace yet: make the first account");
await sql`insert into api_keys (workspace_id, name, prefix, hash, scope)
  values (${ws.id}, ${`eval-mcp-${run}`}, ${secret.slice(0, 10)}, ${hash}, 'write')`;
/** Logos this run added; one the library already had deduped to it, and stays. */
const ingested: string[] = [];

try {
  await http("POST", "/api/v1/brands", { name: "Blender (eval)", slug: brand });

  const ids = {} as BookAssets;
  for (const [name, url] of Object.entries(LOGOS) as [keyof BookAssets, string][]) {
    const { deduped, asset } = await call<{ deduped: boolean; asset: { id: string; mime: string } }>("ingest_asset", { url });
    assert.equal(asset.mime, "image/svg+xml");
    ids[name] = asset.id;
    if (!deduped) ingested.push(asset.id);
  }
  ok("ingest_asset: the mark and the logo");

  const book = blender(ids);
  const set = await call<{ created: string[] }>("set_rules", { brand, set: book.rules });
  assert.equal(set.created.length, book.rules.length);
  // Labels and specs come back as they went in: the palette's print values, the gradient's stops, the faces' roles.
  const { rules } = await call<{ rules: { key: string; context: string | null; label?: string | null; spec?: unknown; assets: { id: string }[] }[] }>("brand_rules", { brand });
  for (const r of book.rules) {
    const got = rules.find((x) => x.key === r.key && x.context === (r.context ?? null));
    assert.ok(got, `brand_rules has ${r.key}`);
    assert.equal(got.label ?? null, r.label ?? null, `${r.key}.label`);
    assert.deepEqual(got.spec ?? null, ("spec" in r && r.spec) || null, `${r.key}.spec`);
    assert.deepEqual(got.assets.map((x) => x.id), r.assets ?? [], `${r.key}.assets`);
  }
  ok(`set_rules: ${book.rules.length} rules with labels, specs, a gradient, fonts and logos`);

  const theme = await call<ThemeView>("set_theme", { brand, ...book.theme });
  assert.deepEqual(theme.settings, book.theme);
  // Its orange on white is 2.84:1: links, marks and text on it fall back, and those three warn. Nothing else does.
  assert.deepEqual(
    theme.checks.filter((c) => !c.ok).map((c) => c.pair),
    ["accent text on surface", "accent on surface", "text on accent"],
  );
  assert.deepEqual(theme.warnings, checkWarnings(theme.checks));
  const got = await call<ThemeView>("get_theme", { brand });
  assert.deepEqual([got.settings, got.checks, got.warnings], [book.theme, theme.checks, theme.warnings]);
  ok("set_theme, then get_theme: the settings, and the orange's three contrast warnings");

  for (const { slug, ...page } of book.pages) {
    const saved = await call<{ created: boolean; url: string }>("save_page", { brand, page: slug, ...page });
    assert.equal(saved.created, true, slug);
    assert.equal(typeof saved.url, "string");
  }
  ok(`save_page: ${book.pages.length} pages, logo-use under logo`);

  for (const { slug, sections, ...meta } of book.pages) {
    const got = await call<{ page: Page; missing: string[]; warnings: string[]; url: string }>("get_page", { brand, page: slug });
    assert.deepEqual(got.missing, [], `${slug}: missing`);
    assert.deepEqual(got.warnings, [], `${slug}: warnings`);
    assert.match(got.url, new RegExp(`[?&]page=${slug}(&|$)`));
    for (const [k, v] of Object.entries(meta)) assert.deepEqual(got.page[k], v, `${slug}.${k}`);
    assert.equal(got.page.parent, meta.parent ?? null, `${slug}.parent`);
    // Every field sent comes back as sent: items, tones, backgrounds, tabs, contexts, audience.
    assert.equal(got.page.sections.length, sections.length, `${slug}: sections`);
    sections.forEach((s, i) => {
      for (const [k, v] of Object.entries(s)) assert.deepEqual(got.page.sections[i][k], v, `${slug}.sections[${i}].${k}`);
    });
  }
  ok("get_page: every page as saved, nothing missing, no warnings, a url");

  const edited = await call<{ page: Page; url: string }>("edit_page", {
    brand,
    page: "logo",
    ops: [
      { op: "add", after: "mark", section: { id: "note", template: "text", title: "A note", body: "Added by the eval." } },
      { op: "update", id: "note", set: { title: "Note", tone: "tint" } },
      { op: "move", id: "note", after: null },
      { op: "remove", id: "size" },
      { op: "page", set: { slug: "logos", title: "Logos" } },
    ],
  });
  assert.deepEqual(edited.page.sections.map((s) => s.id), ["note", "mark", "versions"]);
  assert.equal(edited.page.sections[0].title, "Note");
  assert.equal(edited.page.sections[0].tone, "tint");
  assert.equal(edited.page.slug, "logos");
  assert.equal(edited.page.title, "Logos");
  assert.deepEqual(edited.page.aliases, ["logo"]);
  assert.match(edited.url, /[?&]page=logos(&|$)/);
  // The old slug still finds it, and links to it still land.
  assert.equal((await call<{ page: Page }>("get_page", { brand, page: "logo" })).page.slug, "logos");
  assert.deepEqual((await call<{ warnings: string[] }>("get_page", { brand, page: "overview" })).warnings, []);
  ok("edit_page: add, update, move, remove, and a rename the old slug follows");

  // The wire takes `sample` (a type specimen's prop); a palette doesn't, and says where.
  const bad = await refused("edit_page", {
    brand,
    page: "logos",
    ops: [{ op: "add", section: { template: "palette", title: "Bad", props: { sample: "Aa" } } }],
  });
  assert.match(bad, /ops\[0\]\.section\.props\.sample: Unrecognized key/);
  ok("edit_page: a bad add is refused with its path");

  const uri = `artbucket://brands/${brand}/pages/voice`;
  const { resources } = await rpc<{ resources: { uri: string }[] }>("resources/list", {});
  assert.ok(resources.some((r) => r.uri === uri), `resources/list has ${uri}`);
  const { contents } = await rpc<{ contents: { mimeType: string; text: string }[] }>("resources/read", { uri });
  assert.equal(contents[0].mimeType, "text/markdown");
  assert.match(contents[0].text, /^# Voice/);
  assert.match(contents[0].text, /Plain words/);
  ok("the page resource: Markdown with its rules");

  const note = "The first Blender book, built over MCP.";
  const published = await call<{ unchanged: boolean; note: string; noteImage: string; pages: number; rules: number; publishedAt: string }>("publish", {
    brand,
    note,
    image: ids.mark,
  });
  assert.equal(published.unchanged, false);
  assert.equal(published.note, note);
  assert.equal(published.noteImage, ids.mark);
  assert.equal(published.pages, book.pages.length);
  assert.equal(published.rules, book.rules.length);
  assert.ok(published.publishedAt);
  // Nothing changed since: no spurious version to publish.
  assert.equal((await call<{ unchanged: boolean }>("publish", { brand })).unchanged, true);
  ok("publish with a note and a picture; again, unchanged");

  const { pages } = await call<{ pages: (Omit<Page, "sections"> & { sections: number })[] }>("list_pages", { brand });
  assert.deepEqual(
    pages.map((p) => [p.slug, p.parent]),
    [["overview", null], ["logos", null], ["logo-use", "logos"], ["color", null], ["typography", null], ["voice", null]],
  );
  // The refused add wrote nothing.
  assert.equal(pages.find((p) => p.slug === "logos")?.sections, 3);
  ok("list_pages: the tree, its child following the rename");

  // A deleted page leaves no gap in the order, so saving a page after it as it is makes no version.
  await call("delete_page", { brand, page: "color" });
  await call("publish", { brand });
  const { slug: voiceSlug, ...voice } = book.pages.find((p) => p.slug === "voice")!;
  assert.equal((await call<{ created: boolean }>("save_page", { brand, page: voiceSlug, ...voice })).created, false);
  assert.equal((await call<{ unchanged: boolean }>("publish", { brand })).unchanged, true);
  ok("delete_page, then an unchanged save_page: no new version");

  // Two edits of one page at once: the second applies its ops to what the first wrote.
  const add = (id: string) => call("edit_page", { brand, page: "voice", ops: [{ op: "add", section: { id, template: "text", title: id, body: "Added at once." } }] });
  await Promise.all([add("race-a"), add("race-b")]);
  const raced = (await call<{ page: Page }>("get_page", { brand, page: "voice" })).page.sections.map((s) => s.id);
  assert.deepEqual(raced.filter((s) => s.startsWith("race-")).sort(), ["race-a", "race-b"]);
  ok("edit_page: two at once on one page, both kept");

  // A version compared with now says when a restore would change the theme, even with rules and pages the same.
  // Published, so the theme change starts a version of its own rather than extending this one.
  const { number } = await call<{ number: number }>("publish", { brand });
  await call("set_theme", { brand, radius: 12 });
  const { data: then } = await http<{ data: { diff: unknown[]; pageDiff: string[]; themeChanged: boolean } }>(
    "GET",
    `/api/v1/brands/${brand}/versions/${number}?against=current`,
  );
  assert.deepEqual([then.diff, then.pageDiff, then.themeChanged], [[], [], true]);
  ok("a version compared with now: only the theme differs");

  // W3: a yellow accent on white fails as text and as marks; each pair comes back with the color used instead.
  await call("set_rules", { brand, set: [{ key: "color.yellow", type: "color", value: "#ffd400" }] });
  const yellow = await call<ThemeView>("set_theme", { brand, accent: "color.yellow" });
  assert.equal(yellow.theme.accent, "#ffd400");
  const failing = yellow.checks.filter((c) => !c.ok);
  assert.deepEqual(failing.map((c) => c.pair).slice(0, 2), ["accent text on surface", "accent on surface"]);
  for (const c of failing) {
    assert.ok(c.ratio < c.need, c.pair);
    assert.notEqual(c.used, c.fg, `${c.pair}: falls back`);
  }
  assert.equal(yellow.theme.accentText, failing[0].used);
  assert.deepEqual(yellow.warnings, checkWarnings(yellow.checks));
  ok("set_theme: a yellow accent comes back graded, each failing pair with its fallback");

  // The editor's page lists them; a reader's never does, though it wears the same look.
  const view = (edit: string) => http<{ data: { theme: Theme; warnings: string[] } }>("GET", `/api/v1/brands/${brand}/view?page=overview${edit}`);
  const [{ data: editing }, { data: reading }] = await Promise.all([view("&edit=1"), view("")]);
  for (const w of yellow.warnings) assert.ok(editing.warnings.includes(w), w);
  assert.deepEqual(reading.warnings, []);
  assert.deepEqual([editing.theme.checks, reading.theme.checks], [yellow.checks, yellow.checks]);
  ok("the page view: contrast warnings for editors only");

  // A mapping to a key with no rule is refused with its path, over MCP and REST, and writes nothing.
  assert.match(await refused("set_theme", { brand, accent: "color.nope" }), /^accent: no color rule "color\.nope"/);
  const res = await fetch(`${URL_}/api/v1/brands/${brand}/theme`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ink: "color.nope" }),
  });
  assert.equal(res.status, 422);
  const { error } = (await res.json()) as { error: { detail: { errors: string[] } } };
  assert.match(error.detail.errors[0], /^ink: no color rule "color\.nope"/);
  assert.deepEqual((await call<ThemeView>("get_theme", { brand })).settings, { ...book.theme, radius: 12, accent: "color.yellow" });
  ok("set_theme and PATCH theme: a missing key is refused with its path (422), and nothing is written");

  console.log(`\nThe Blender book builds over MCP: ${passed} steps passed.`);
} finally {
  // Each on its own: one failing cleanup never keeps the others from running.
  const warn = (what: string) => (err: unknown) => console.error(`Cleanup: couldn't ${what}: ${(err as Error).message}`);
  // SQL, not DELETE /brands: that refuses the default, which this brand is in an empty workspace.
  await sql`delete from brands where workspace_id = ${ws.id} and slug = ${brand}`.catch(warn(`delete brand ${brand}`));
  for (const a of ingested) await http("DELETE", `/api/v1/assets/${a}`).catch(warn(`trash asset ${a}`));
  await sql`delete from api_keys where hash = ${hash}`.catch(warn("delete the eval's key"));
  await sql.end();
}
