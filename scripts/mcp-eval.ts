/**
 * The brand pages acceptance test: build the Blender book (lib/fixtures/brand-book.ts)
 * in a brand of its own, over MCP only, and check every answer on the way.
 *
 *   pnpm dev
 *   pnpm eval:mcp                                     # against http://localhost:3000
 *   ARTBUCKET_URL=http://localhost:3100 pnpm eval:mcp
 *
 * It needs the server's database (DATABASE_URL, read from .env) for one
 * thing: a write key of its own in the first project, like `pnpm bench`.
 * Then it puts the brand on a public portal of its own, over REST, and reads
 * the portal as an anonymous visitor would. Pass or fail, it then deletes the
 * portal and the brand it made, trashes the logos it ingested (not ones
 * already in the library) and deletes the key, and it touches nothing else. A
 * run killed midway leaves a brand eval-blender-*, a portal eval-* and a key
 * eval-mcp-*: delete them by hand. Not part of `pnpm test`: it needs a server.
 */

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";
import { checkWarnings, type Theme } from "../src/lib/brand-theme.ts";
import { blender, type BookAssets } from "../src/lib/fixtures/brand-book.ts";
import type { DIAGRAMS } from "../src/lib/pages.ts";

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
/** Stand-ins, uploaded when Wikimedia won't serve the real ones: the eval tests artbucket, not their rate limit. */
const STAND_INS: BookAssets = {
  mark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#e87d0d"/><circle cx="50" cy="50" r="16" fill="#265787"/></svg>`,
  wordmark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 100"><circle cx="50" cy="50" r="40" fill="#e87d0d"/><circle cx="50" cy="50" r="16" fill="#265787"/><text x="110" y="64" font-family="sans-serif" font-size="44" fill="#265787">blender</text></svg>`,
};

type Section = { id: string; title: string; tone: string } & Record<string, unknown>;
/** What get_theme, set_theme and PATCH theme answer. */
type ThemeView = { settings: unknown; theme: Theme; checks: Theme["checks"]; warnings: string[] };
type Page = { slug: string; title: string; parent: string | null; aliases: string[]; sections: Section[] } & Record<string, unknown>;

const run = randomBytes(4).toString("hex");
const brand = `eval-blender-${run}`;
const portalSlug = `eval-${run}`;
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

/** A section comes back as sent: every field it was given, items, tones, props and all. */
function asSent(got: Section | undefined, sent: object, at: string) {
  assert.ok(got, `${at}: there`);
  for (const [k, v] of Object.entries(sent)) assert.deepEqual(got[k], v, `${at}.${k}`);
}

let passed = 0;
const ok = (what: string) => console.log(`ok ${++passed} ${what}`);

const [ws] = await sql<{ id: string }[]>`select id from projects order by created_at limit 1`;
if (!ws) throw new Error("No project yet: make the first account");
await sql`insert into api_keys (project_id, name, prefix, hash, scope)
  values (${ws.id}, ${`eval-mcp-${run}`}, ${secret.slice(0, 10)}, ${hash}, 'write')`;
/** Logos this run added; one the library already had deduped to it, and stays. */
const ingested: string[] = [];
let portalId: string | undefined;

try {
  await http("POST", "/api/v1/brands", { name: "Blender (eval)", slug: brand });

  const ids = {} as BookAssets;
  for (const [name, url] of Object.entries(LOGOS) as [keyof BookAssets, string][]) {
    type Got = { deduped: boolean; asset: { id: string; mime: string } };
    // Wikimedia rate-limits repeat fetches (429): a short wait, then the stand-in through the upload flow.
    const upload = async (): Promise<Got> => {
      const bytes = Buffer.from(STAND_INS[name]);
      const filename = `eval-${name}.svg`;
      const t = await http<{ token: string; uploadUrl: string }>("POST", "/api/v1/uploads", { filename, mime: "image/svg+xml", size: bytes.length });
      const put = await fetch(t.uploadUrl, { method: "PUT", body: bytes, headers: { "Content-Type": "image/svg+xml" } });
      if (!put.ok) throw new Error(`PUT ${filename}: ${put.status}`);
      const done = await http<{ data: { id: string; mime: string }; deduped: boolean }>("POST", "/api/v1/assets", { token: t.token, filename, mime: "image/svg+xml" });
      return { deduped: done.deduped, asset: done.data };
    };
    const ingest = async (wait = 5): Promise<Got> => {
      try {
        return await call("ingest_asset", { url });
      } catch (err) {
        if (!/returned 429/.test(String(err))) throw err;
        if (wait > 10) return upload();
        await new Promise((r) => setTimeout(r, wait * 1000));
        return ingest(wait * 2);
      }
    };
    const { deduped, asset } = await ingest();
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
    sections.forEach((s, i) => asSent(got.page.sections[i], s, `${slug}.sections[${i}]`));
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

  // W4: the rules in depth. A section of the fixture's, by page and id.
  const sent = (slug: string, id: string) => book.pages.find((p) => p.slug === slug)!.sections.find((s) => s.id === id)!;
  const byId = (p: Page, id: string) => p.sections.find((s) => s.id === id);
  type Read = { page: Page; rules: { key: string; spec: Record<string, unknown> | null }[]; markdown: string; warnings: string[] };

  // The color page, deleted above, saved again: get_page hands back each palette rule's spec whole.
  const { slug: colorSlug, ...color } = book.pages.find((p) => p.slug === "color")!;
  assert.equal((await call<{ created: boolean }>("save_page", { brand, page: colorSlug, ...color })).created, true);
  const palette = await call<Read>("get_page", { brand, page: colorSlug });
  assert.deepEqual(palette.warnings, []);
  color.sections.forEach((s, i) => asSent(palette.page.sections[i], s, `color.sections[${i}]`));
  for (const r of palette.rules) {
    const want = book.rules.find((x) => x.key === r.key && !x.context);
    assert.deepEqual(r.spec, (want && "spec" in want && want.spec) || null, `${r.key}.spec`);
  }
  const specs = palette.rules.map((r) => r.spec ?? {});
  for (const f of ["cmyk", "pantone", "ral", "rgb", "tints", "gradient", "pair", "weight"]) assert.ok(specs.some((s) => f in s), `a palette rule with ${f}`);
  assert.deepEqual(new Set(specs.map((s) => s.print).filter(Boolean)), new Set(["specified", "converted"]));
  ok("get_page: a palette's rules with print values given and converted, tints, a gradient, pairs and weights, and its print view and ASE");

  // Each kind of diagram saves and says what it draws in the page's Markdown.
  const drawn = {
    clearspace: "Drawn: clearspace.",
    minsize: "Drawn: minsize.",
    placement: "Drawn: placement, at tl, bl, br.",
    cobrand: "Drawn: cobrand, beside Blender Studio.",
  } satisfies Record<(typeof DIAGRAMS)[number], string>;
  const use = await call<Read>("get_page", { brand, page: "logo-use" });
  assert.deepEqual(use.warnings, []);
  for (const [kind, line] of Object.entries(drawn)) {
    const s = book.pages.find((p) => p.slug === "logo-use")!.sections.find((x) => x.template === "diagram" && x.props?.kind === kind);
    assert.ok(s, `the fixture has a ${kind} diagram`);
    asSent(byId(use.page, s.id!), s, `logo-use#${s.id}`);
    assert.ok(use.markdown.split("\n").includes(line), line);
  }
  ok("get_page: a diagram of each kind, as saved and drawn in the Markdown");

  // A clear space diagram with no number to measure by, and a length in px beside one in mm, each warn, and exactly.
  await call("set_rules", { brand, set: [{ key: "logo.bleed", type: "number", value: 3, spec: { unit: "mm" } }] });
  const checks = await call<{ warnings: string[] }>("save_page", {
    brand,
    page: "checks",
    title: "Checks",
    sections: [
      { template: "diagram", title: "Clear space", keys: ["logo.mark"], props: { kind: "clearspace" } },
      { template: "text", title: "Sizes", keys: ["logo.minSize", "logo.bleed"] },
    ],
  });
  const warned = [
    "sections[0].keys: a clearspace diagram draws from a number rule, its clear space in x; bind one",
    "sections[1]: mixes px and mm (logo.minSize in px, logo.bleed in mm); give them one unit",
  ];
  assert.deepEqual(checks.warnings, warned);
  assert.deepEqual((await call<Read>("get_page", { brand, page: "checks" })).warnings, warned);
  ok("save_page and get_page: a diagram missing its number rule, and px beside mm, warn exactly");

  // A logos item marks a mark never set on a color: it comes back, reads as a don't, and binds colors only.
  const logos = await call<Read>("get_page", { brand, page: "logos" });
  asSent(byId(logos.page, "versions"), sent("logo", "versions"), "logos#versions");
  assert.ok(logos.markdown.includes(`- Don't: asset ${ids.mark} on \`color.primary\`. The circle vanishes on its own orange.`));
  const onLogo = await refused("edit_page", {
    brand,
    page: "logos",
    ops: [{ op: "update", id: "versions", set: { items: [{ asset: ids.mark, key: "logo.wordmark", verdict: "dont" }] } }],
  });
  // The page is note, mark, versions since the edit above.
  assert.equal(onLogo, "sections[2].items[0].key: a logos item's key is a color rule; logo.wordmark is text");
  ok("logos: a don't on a color round-trips; one on a logo is refused with its path");

  // A bento gallery with a wide tile, and a carousel.
  const overview = await call<Read>("get_page", { brand, page: "overview" });
  const bento = byId(overview.page, "in-use");
  asSent(bento, sent("overview", "in-use"), "overview#in-use");
  assert.deepEqual([bento!.props, (bento!.items as { span?: number }[]).map((it) => it.span)], [{ layout: "bento" }, [2, undefined]]);
  const carousel = byId(use.page, "seen");
  asSent(carousel, sent("logo-use", "seen"), "logo-use#seen");
  assert.deepEqual(carousel!.props, { layout: "carousel" });
  ok("gallery: a bento with a span, and a carousel, as saved");

  // W5: a portal serves the latest publish at its visitor's level, never the draft.
  // A page for partners, some of the voice page's words in Arabic and the languages to read them in; then a portal, then a publish.
  await call("save_page", {
    brand,
    page: "partners",
    title: "Partners",
    audience: "partners",
    sections: [{ template: "text", title: "Launch kit", body: "The Kestrel launch kit, for partners under NDA." }],
  });
  await call("edit_page", {
    brand,
    page: "voice",
    ops: [
      { op: "page", set: { translations: { ar: { title: "الصوت" } } } },
      { op: "update", id: "line", set: { translations: { ar: { title: "في سطر واحد" } } } },
    ],
  });
  await call("set_theme", { brand, languages: [{ code: "en", label: "English" }, { code: "ar", label: "العربية", dir: "rtl" }] });
  portalId = (await http<{ data: { id: string } }>("POST", "/api/v1/portals", { name: "Blender (eval)", slug: portalSlug, brands: [brand] })).data.id;
  const news = "Partners, and the voice page in Arabic.";
  const { data: pub } = await http<{ data: { number: number; portals: { slug: string }[] } }>("POST", `/api/v1/brands/${brand}/publish`, { note: news });
  assert.deepEqual(pub.portals.map((p) => p.slug), [portalSlug]);
  ok("a public portal carries the brand, and publish names it");

  type Site = {
    portal: { level: string; brands: { slug: string; publishedAt: string | null }[] };
    canonical: string | null;
    redirect: boolean;
    view: {
      version: { number: number } | null;
      lang: string | null;
      locked: boolean;
      nav: { slug: string; title: string; locked: boolean }[];
      page: (Page & { layout: string; lede: string | null }) | null;
      updates?: { version: number; note: string | null }[];
    };
  };
  type Found = { hits: { kind: string; title: string; page: string }[] };
  /** The portal as anyone reads it: no key, no password, no session. */
  const visit = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${URL_}/api/v1/portal/${portalSlug}/${path}`);
    if (!res.ok) throw new Error(`GET portal ${path}: ${res.status} ${await res.text()}`);
    return ((await res.json()) as { data: T }).data;
  };

  const home = await visit<Site>("site");
  assert.equal(home.portal.level, "everyone");
  assert.deepEqual(home.portal.brands.map((b) => [b.slug, !!b.publishedAt]), [[brand, true]]);
  assert.deepEqual([home.canonical, home.redirect, home.view.version?.number], ["/overview", false, pub.number]);
  assert.equal(home.view.page?.layout, "landing");
  assert.deepEqual([home.view.updates?.[0]?.version, home.view.updates?.[0]?.note], [pub.number, news]);
  ok("the portal, anonymous: the latest publish, its home a landing page with the publish in What's new");

  await call("edit_page", { brand, page: "overview", ops: [{ op: "update", id: "glance", set: { title: "Quokka draft" } }] });
  const later = await visit<Site>("site?path=overview");
  assert.equal(later.view.version?.number, pub.number);
  assert.equal(later.view.page?.sections.find((s) => s.id === "glance")?.title, "At a glance");
  ok("a draft edit after the publish: the portal doesn't show it");

  const locked = await visit<Site>("site?path=partners");
  assert.deepEqual([locked.view.page, locked.view.locked], [null, true]);
  assert.equal(locked.view.nav.find((p) => p.slug === "partners")?.locked, true);
  // A section for partners, on a page for everyone, is left out.
  const open = await visit<Site>("site?path=logo-use");
  assert.ok(open.view.page, "logo-use is for everyone");
  assert.ok(!open.view.page.sections.some((s) => s.id === "credits"), "logo-use#credits is for partners");
  ok("for the public, a partners page is listed locked and carries nothing; a partners section is left out");

  const orange = await visit<Found>("search?q=orange");
  assert.ok(orange.hits.some((h) => h.kind === "rule" && h.title === "Blender orange"), JSON.stringify(orange.hits));
  // The locked page's words and the draft's are nowhere.
  for (const q of ["kestrel", "quokka"]) assert.deepEqual((await visit<Found>(`search?q=${q}`)).hits, [], q);
  ok("portal search: a published rule is found; a locked page's words and a draft's never");

  const moved = await visit<Site>("site?path=logo");
  assert.deepEqual([moved.redirect, moved.canonical, moved.view.page?.slug], [true, "/logos", "logos"]);
  ok("the portal: the logo page's old slug redirects to its path now");

  const ar = await visit<Site>("site?path=voice&lang=ar");
  assert.equal(ar.view.lang, "ar");
  assert.equal(ar.view.nav.find((p) => p.slug === "voice")?.title, "الصوت");
  assert.deepEqual([ar.view.page?.title, ar.view.page?.lede], ["الصوت", "Plain words, and credit where it is due."]);
  const line = ar.view.page?.sections.find((s) => s.id === "line");
  assert.deepEqual([line?.title, line?.lede], ["في سطر واحد", "Blender is free and open source, made by a community."]);
  assert.equal(ar.view.page?.sections.find((s) => s.id === "habits")?.title, "How we write");
  // Readers get their language's words, never the others'.
  assert.ok(line && !("translations" in line) && !("translations" in ar.view.page!));
  ok("?lang=ar: the Arabic there is, the rest as written, field by field");

  console.log(`\nThe Blender book builds over MCP: ${passed} steps passed.`);
} finally {
  // Each on its own: one failing cleanup never keeps the others from running.
  const warn = (what: string) => (err: unknown) => console.error(`Cleanup: couldn't ${what}: ${(err as Error).message}`);
  if (portalId) await http("DELETE", `/api/v1/portals/${portalId}`).catch(warn(`delete portal ${portalSlug}`));
  // SQL, not DELETE /brands: that refuses the default, which this brand is in an empty project.
  await sql`delete from brands where project_id = ${ws.id} and slug = ${brand}`.catch(warn(`delete brand ${brand}`));
  for (const a of ingested) await http("DELETE", `/api/v1/assets/${a}`).catch(warn(`trash asset ${a}`));
  await sql`delete from api_keys where hash = ${hash}`.catch(warn("delete the eval's key"));
  await sql.end();
}
