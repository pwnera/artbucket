import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

/**
 * The starters `artbucket site new` copies (starters/): each kind builds with
 * its own build.mjs from a release as `artbucket brand export` writes it,
 * with no network, and the kit (kit/) where npm install puts it.
 */

const STARTERS = join(import.meta.dirname, "..", "..", "starters");
const KIT = join(import.meta.dirname, "..", "..", "kit");
/** The kit as npm install leaves it in a site: node_modules/@artbucket/{brand,ui}. */
function withKit(dir: string) {
  mkdirSync(join(dir, "node_modules", "@artbucket"), { recursive: true });
  for (const name of ["brand", "ui"]) symlinkSync(join(KIT, name), join(dir, "node_modules", "@artbucket", name), "dir");
}
const LOGO = "0b6c2f0e-6a52-4a5e-9d3b-1f1a2c3d4e5f";
const FONT = "1c7d3f1f-7b63-4b6f-8e4c-2a2b3d4e5f60";

/** A site made from a kind, with a release exported into .brand/ beside it, built. */
function built(kind: string, brand: Record<string, unknown> = {}, pages: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), `starter-${kind}-`));
  cpSync(join(STARTERS, "common"), dir, { recursive: true });
  cpSync(join(STARTERS, kind), dir, { recursive: true });
  withKit(dir);
  for (const [name, html] of Object.entries(pages)) writeFileSync(join(dir, "src", "pages", name), html);
  mkdirSync(join(dir, ".brand", "assets"), { recursive: true });
  writeFileSync(join(dir, ".brand", "assets", `${LOGO}.svg`), "<svg xmlns='http://www.w3.org/2000/svg'/>");
  writeFileSync(join(dir, ".brand", "assets", `${FONT}.woff2`), "font");
  writeFileSync(join(dir, ".brand", "tokens.css"), `:root { --color-primary: #e11d48; }\n@font-face { font-family: "Acme Sans"; src: url("assets/${FONT}.woff2"); }\n`);
  const rule = (key: string, type: string, value: unknown, assets: { id: string; file: string; mime: string }[] = []) => ({ key, type, value, context: null, label: null, usage: null, spec: null, assets });
  writeFileSync(
    join(dir, ".brand", "brand.json"),
    JSON.stringify({
      slug: "acme",
      name: "Acme & Co",
      release: { number: 4, publishedAt: "2026-10-01T00:00:00.000Z" },
      rules: [
        rule("color.primary", "color", "#e11d48"),
        rule("color.background", "color", "#fffbf5"),
        rule("type.heading", "font", { family: "Acme Sans" }, [{ id: FONT, file: `assets/${FONT}.woff2`, mime: "font/woff2" }]),
        rule("brand.headline", "text", "Rockets, <delivered>."),
        rule("logo.primary", "text", "The logo", [{ id: LOGO, file: `assets/${LOGO}.svg`, mime: "image/svg+xml" }]),
        rule("tone.avoid", "list", ["jargon", "hype"]),
      ],
      files: { [`assets/${LOGO}.svg`]: LOGO, [`assets/${FONT}.woff2`]: FONT },
      ...brand,
    }),
  );
  execFileSync(process.execPath, ["build.mjs"], { cwd: dir, stdio: "pipe" });
  const read = (path: string) => readFileSync(join(dir, "dist", path), "utf8");
  return { dir, read, has: (path: string) => existsSync(join(dir, "dist", path)) };
}

test("a landing page: the release's text escaped, its logo copied in, its look from its rules, no menu for one page", () => {
  const site = built("landing");
  const html = site.read("index.html");
  assert.match(html, /<h1>Rockets, &#60;delivered&#62;\.<\/h1>/);
  assert.match(html, new RegExp(`<img class="logo" src="/assets/${LOGO}.svg" alt="Acme &#38; Co">`));
  assert.match(html, /<title>Rockets, &#60;delivered&#62;\. · Acme &#38; Co<\/title>/);
  assert.match(html, /<nav><\/nav>/);
  assert.match(html, new RegExp(`<link rel="icon" href="/assets/${LOGO}.svg">`));
  assert.ok(site.has(`assets/${LOGO}.svg`));
  // The starter's MIT notice comes with every site made from it.
  assert.match(readFileSync(join(site.dir, "LICENSE"), "utf8"), /^MIT License\n\nCopyright \(c\) 2026 Artbucket contributors/);
  const look = site.read("look.css");
  assert.match(look, /--accent: #e11d48;/);
  assert.match(look, /--paper: #fffbf5;/);
  assert.match(look, /--font-head: "Acme Sans"/);
  // No text face named: the system's.
  assert.doesNotMatch(look, /--font-body/);
  // look.css comes after style.css, so the brand's values win.
  assert.ok(html.indexOf("/style.css") < html.indexOf("/look.css"));
});

test("the manifest names the release and every file the build uses, the fonts tokens.css points at included", () => {
  const site = built("landing");
  assert.deepEqual(JSON.parse(site.read("artbucket.site.json")), { brand: "acme", release: 4, rules: ["*"], assets: [LOGO, FONT] });
  assert.ok(site.has(`assets/${FONT}.woff2`));
  assert.match(site.read("tokens.css"), new RegExp(`url\\("assets/${FONT}\\.woff2"\\)`));
});

test("docs: a page per file, a menu of their titles, the current one marked", () => {
  const site = built("docs");
  const html = site.read("getting-started.html");
  assert.match(html, /<nav><a href="\/">Acme &#38; Co docs<\/a><a href="\/getting-started" aria-current="page">Getting started<\/a><\/nav>/);
  assert.match(site.read("index.html"), /<a href="\/" aria-current="page">Acme &#38; Co docs<\/a>/);
});

test("guidelines: the palette, faces, logos and every other rule, from the release", () => {
  const site = built("guidelines");
  const html = site.read("index.html");
  // Drawn by @artbucket/ui: the chip in its color with the ink that reads on it, its values and contrast.
  assert.match(html, /<span class="ab-chip" style="background:#e11d48;color:#ffffff">Aa<\/span><b>color\.primary<\/b><code>#e11d48<\/code>/);
  assert.match(html, /<dt>RGB<\/dt><dd>225, 29, 72<\/dd>/);
  assert.match(html, /<dt>On white<\/dt><dd>4\.\d:1 AA<\/dd>/);
  assert.match(html, /font-family:&#34;Acme Sans&#34;/);
  assert.match(html, new RegExp(`<img src="/assets/${LOGO}.svg" alt="logo.primary">`));
  assert.match(html, /<dt>tone\.avoid<\/dt><dd>jargon, hype<\/dd>/);
  assert.ok(site.has("kit.css"));
});

test("no export yet: the build says to run it first", () => {
  const dir = mkdtempSync(join(tmpdir(), "starter-none-"));
  cpSync(join(STARTERS, "common"), dir, { recursive: true });
  withKit(dir);
  assert.throws(() => execFileSync(process.execPath, ["build.mjs"], { cwd: dir, stdio: "pipe" }), /npm run brand/);
});

test("a page's title in the menu and <title> is its heading's text, with no tag or angle bracket left", () => {
  const site = built("docs", {}, { "tricky.html": "<h1>Odd <<b>script>alert(1)<</b>/script> heading</h1>" });
  const html = site.read("tricky.html");
  const title = html.match(/<title>(.*?)<\/title>/)![1];
  assert.doesNotMatch(title, /[<>]/);
  assert.match(title, /^Odd scriptalert\(1\)\/script heading/);
});

test("a font's name stays a CSS string, whatever it holds", () => {
  const evil = 'X"; } body { background: url(//evil.example) } :root { --a: "';
  const site = built("guidelines", {
    rules: [{ key: "type.heading", type: "font", value: { family: evil }, context: null, label: null, usage: null, spec: null, assets: [] }],
    files: {},
  });
  assert.match(site.read("look.css"), /--font-head: "X\\"; } body \{ background: url\(\/\/evil\.example\) \} :root \{ --a: \\"", system-ui/);
  assert.doesNotMatch(site.read("index.html"), /font-family:[^"]*"; }/);
  assert.match(site.read("index.html"), /font-family:&#34;X\\&#34;; \} body/);
});

test("a file a text rule links to is copied in, and linked from the site's root", () => {
  const site = built("landing", {
    rules: [{ key: "brand.headline", type: "text", value: `See assets/${LOGO}.svg for the mark`, context: null, label: null, usage: null, spec: null, assets: [] }],
    files: { [`assets/${LOGO}.svg`]: LOGO },
  });
  assert.match(site.read("index.html"), new RegExp(`<h1>See /assets/${LOGO}.svg for the mark</h1>`));
  assert.ok(site.has(`assets/${LOGO}.svg`));
  assert.deepEqual(JSON.parse(site.read("artbucket.site.json")).assets, [LOGO]);
});

test("eject: a brand's released pages become the site's pages, in its order, its rules drawn by the kit, its words safe, its pictures copied", async () => {
  const PIC = "2d6c2f0e-6a52-4a5e-9d3b-1f1a2c3d4e5f";
  const rules = [
    { key: "color.primary", type: "color", context: null, assets: [] },
    { key: "logo.primary", type: "text", context: null, assets: [{ id: LOGO }] },
    { key: "tone.avoid", type: "list", context: null, assets: [] },
  ];
  const media = { [LOGO]: { mime: "image/svg+xml" }, [PIC]: { mime: "image/png" } };
  const nav = [
    { slug: "overview", title: "Overview", home: true },
    { slug: "color", title: "Color", home: false },
  ];
  const pages: Record<string, unknown> = {
    overview: { slug: "overview", title: "Overview", eyebrow: null, lede: "All of it {{logo}}", sections: [
      { template: "statement", title: "Say <less>." },
      { template: "logos", title: "Marks", keys: ["logo.primary", "color.primary"], items: [{ verdict: "dont", title: "Stretch it", asset: PIC }] },
      { template: "chart", title: "Shares", body: "**Bold** and [a page](/color), [a script](javascript:alert(1))" },
      { template: "text", title: "Hidden", hidden: true },
    ] },
    color: { slug: "color", title: "Color", eyebrow: "02", lede: null, sections: [{ template: "palette", keys: ["color.primary"] }, { template: "faq", items: [{ title: "Why?", text: "- one\n- two" }] }] },
  };
  const { createServer } = await import("node:http");
  const server = createServer((req, res) => {
    const url = new URL(req.url!, "http://x");
    if (url.pathname === "/api/v1/sites") return res.end(JSON.stringify({ data: [] }));
    if (url.pathname === "/api/v1/brands/acme/view") {
      assert.equal(url.searchParams.get("version"), "live");
      const page = pages[url.searchParams.get("page") ?? "overview"];
      return res.end(JSON.stringify({ data: { nav, page, rules, media } }));
    }
    if (url.pathname === `/a/${PIC}`) {
      res.setHeader("content-type", "image/png");
      return res.end("png");
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((ok) => server.listen(0, ok));
  const port = (server.address() as { port: number }).port;
  const dir = join(mkdtempSync(join(tmpdir(), "eject-")), "acme-guidelines");
  try {
    const { execFile } = await import("node:child_process");
    const said = await new Promise<string>((ok, no) =>
      execFile(process.execPath, ["--experimental-strip-types", "--no-warnings", join(import.meta.dirname, "..", "..", "bin", "artbucket.ts"), "site", "eject", dir, "--brand", "acme"], { env: { ...process.env, ARTBUCKET_URL: `http://127.0.0.1:${port}`, ARTBUCKET_KEY: "ab_test" } }, (err, out, errOut) => (err ? no(new Error(errOut || err.message)) : ok(out))),
    );
    assert.match(said, /Ejected 2 pages of acme, with 1 picture/);
    assert.equal(readFileSync(join(dir, "src", "pages", "order.txt"), "utf8"), "index.html\ncolor.html\n");
    const home = readFileSync(join(dir, "src", "pages", "index.html"), "utf8");
    // Its words can't be read as the build's slots, nor as tags.
    assert.match(home, /<p>All of it &#123;&#123;logo&#125;&#125;<\/p>/);
    assert.match(home, /<blockquote><p>Say &#60;less&#62;\.<\/p><\/blockquote>/);
    assert.match(home, /\{\{logos:logo\.primary\}\}\n\{\{palette:color\.primary\}\}/);
    assert.match(home, new RegExp(`<li class="ab-dont"><figure class="ab-tile"><img src="/assets/${PIC}.png" alt="Stretch it"></figure><span class="ab-verdict">Don't</span>`));
    assert.match(home, /<!-- A "chart" section in Artbucket, kept here as its words/);
    assert.match(home, /<strong>Bold<\/strong> and <a href="\/color">a page<\/a>, a script/);
    assert.doesNotMatch(home, /Hidden|javascript:/);
    assert.equal(readFileSync(join(dir, "src", "public", "assets", `${PIC}.png`), "utf8"), "png");
    assert.match(readFileSync(join(dir, "src", "pages", "color.html"), "utf8"), /<details><summary>Why\?<\/summary><ul><li>one<\/li><li>two<\/li><\/ul><\/details>/);
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).devDependencies), ["artbucket", "@artbucket/brand", "@artbucket/ui"]);

    // It builds as any starter does: the menu in the brand's order, the picture beside the pages.
    withKit(dir);
    mkdirSync(join(dir, ".brand", "assets"), { recursive: true });
    writeFileSync(join(dir, ".brand", "assets", `${LOGO}.svg`), "<svg xmlns='http://www.w3.org/2000/svg'/>");
    writeFileSync(join(dir, ".brand", "tokens.css"), ":root {}\n");
    const r = (key: string, type: string, value: unknown, assets: unknown[] = []) => ({ key, type, value, context: null, label: null, usage: null, spec: null, assets });
    writeFileSync(join(dir, ".brand", "brand.json"), JSON.stringify({ slug: "acme", name: "Acme", release: { number: 2 }, rules: [r("color.primary", "color", "#e11d48"), r("logo.primary", "text", "Logo", [{ id: LOGO, file: `assets/${LOGO}.svg`, mime: "image/svg+xml" }])], files: { [`assets/${LOGO}.svg`]: LOGO } }));
    execFileSync(process.execPath, ["build.mjs"], { cwd: dir, stdio: "pipe" });
    const built = readFileSync(join(dir, "dist", "color.html"), "utf8");
    assert.match(built, /<nav><a href="\/">Overview<\/a><a href="\/color" aria-current="page">Color<\/a><\/nav>/);
    assert.match(built, /<ul class="ab-palette"><li><span class="ab-chip" style="background:#e11d48/);
    assert.ok(existsSync(join(dir, "dist", "assets", `${PIC}.png`)));
    assert.match(readFileSync(join(dir, "dist", "index.html"), "utf8"), new RegExp(`<ul class="ab-logos"><li><figure class="ab-tile"><img src="/assets/${LOGO}.svg"`));
  } finally {
    server.close();
  }
});
