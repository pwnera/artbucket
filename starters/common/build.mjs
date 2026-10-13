// Builds the site into dist/ from src/ and the brand that `npm run brand` exported into .brand/
// (artbucket brand export: the release readers see, its rules, tokens.css and files), with the
// Artbucket kit: @artbucket/brand reads the release, @artbucket/ui draws its rules. Node 22 or later.
// Change anything here; this file is yours.
//
// In a page or the layout:
//   {{title}} {{name}} {{content}} {{nav}}       the page, the brand's name, the layout's slots
//   {{text:brand.headline}}                      a text rule's value, escaped; {{text:key|fallback}}
//   {{logo}} {{icon}}                            the brand's logo as an <img>, its mark (or logo) as the tab's icon
//   {{palette}} {{type}} {{logos}} {{rules}}     the brand's colors, fonts, logos and every other rule;
//                                                {{palette:color.primary,color.ink}} or {{logos:logo.*}} for some
//   {{rule:color.primary}}                       one rule's value, inline
// src/public/ is copied into dist/ as it is. src/pages/order.txt, if there is one, orders the menu.
import { cp, copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadBrand } from "@artbucket/brand";
import { cssFamily, esc, imageOf, logoGrid, palette, ruleList, ruleValue, typeSpecimen } from "@artbucket/ui/html";

const OUT = "dist";

const brand = await loadBrand(".brand").catch((err) => {
  throw new Error(`${err.message}. Run npm run brand first (it needs artbucket login, or ARTBUCKET_URL and ARTBUCKET_KEY)`);
});
/** A file of a rule, as the site serves it: copied from .brand/assets, so the deploy check knows it by its bytes. */
const src = (a) => `/${brand.file(a)}`;

// The site's look, from the brand's rules: its colors, its faces, its logo.
const accent = brand.pick("color", ["primary", "accent", "brand"]);
const ink = brand.pick("color", ["ink", "text", "foreground"], false);
const paper = brand.pick("color", ["background", "surface", "paper"], false);
const head = brand.pick("font", ["head", "display", "title"]);
// Text keeps the system's face unless the brand names one for it: a display face is rarely one to read at length.
const body = brand.pick("font", ["body", "text", "copy"], false);
const all = brand.rules();
const logo = all.find((r) => r.key.startsWith("logo") && imageOf(r)) ?? all.find((r) => imageOf(r));
const look = [
  accent && `--accent: ${accent.value};`,
  ink && `--ink: ${ink.value};`,
  paper && `--paper: ${paper.value};`,
  head && `--font-head: ${cssFamily(head)}, system-ui, sans-serif;`,
  body && `--font-body: ${cssFamily(body)}, system-ui, sans-serif;`,
].filter(Boolean);

const text = (spec) => {
  const [key, fallback = ""] = spec.split("|");
  // A file the text links to was exported beside it (assets/...): copied in too, and linked from the site's root.
  return esc(brand.text(key, fallback)).replace(/(^|[^/\w])(assets\/[\w.-]+)/g, (whole, before, path) => (brand.fileAt(path) ? `${before}/${path}` : whole));
};
const logoTag = () => {
  const a = imageOf(logo);
  return a ? `<img class="logo" src="${esc(src(a))}" alt="${esc(brand.name)}">` : `<span class="wordmark">${esc(brand.name)}</span>`;
};
/** The browser tab's icon: the brand's mark if it has one (a key with mark, icon or symbol), else its logo. */
const iconTag = () => {
  const mark = all.find((r) => /mark|icon|symbol/.test(r.key) && imageOf(r)) ?? logo;
  const a = imageOf(mark);
  return a ? `<link rel="icon" href="${esc(src(a))}">` : "";
};
/** Some rules (keys, or color.* for a group), or every one. */
const some = (arg) => (arg ? arg.split(",").map((k) => k.trim()).filter(Boolean) : undefined);

/** A heading's text: what is outside its tags, with no angle bracket at all. */
const textOf = (html) => {
  let out = "";
  let tag = false;
  for (const c of html) {
    if (c === "<") tag = true;
    else if (c === ">") tag = false;
    else if (!tag) out += c;
  }
  return out.trim();
};

const fill = (html, slots) =>
  html.replace(/\{\{\s*([a-z]+)(?::([^}]+))?\s*\}\}/g, (whole, name, arg) => {
    if (name === "text") return text(arg);
    if (name === "logo") return logoTag();
    if (name === "icon") return iconTag();
    if (name === "palette") return palette(all, { keys: some(arg) });
    if (name === "type") return typeSpecimen(all, { keys: some(arg) });
    if (name === "logos") return logoGrid(all, { keys: some(arg), src });
    if (name === "rules") return ruleList(all, { keys: some(arg) });
    if (name === "rule") return ruleValue(brand.rule(arg.trim()), { src });
    if (name === "name") return esc(brand.name);
    return name in slots ? slots[name] : whole;
  });

// The pages: src/pages/*.html, each a fragment whose first <h1> is its title, in src/layout.html.
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const layout = await readFile("src/layout.html", "utf8");
// The menu's order: src/pages/order.txt if there is one (a file name a line), else index first, then by name.
const order = (await readFile("src/pages/order.txt", "utf8").catch(() => "")).split("\n").map((l) => l.trim()).filter(Boolean);
const rank = (n) => (order.includes(n) ? order.indexOf(n) : n === "index.html" ? -1 : order.length);
const names = (await readdir("src/pages")).filter((n) => n.endsWith(".html")).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
const pages = await Promise.all(
  names.map(async (n) => {
    const html = fill(await readFile(join("src/pages", n), "utf8"), {});
    // Already HTML: the brand's text in it is escaped once, as filled.
    const title = textOf(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "") || esc(n);
    return { n, html, title, href: n === "index.html" ? "/" : `/${n.replace(/\.html$/, "")}` };
  }),
);
for (const p of pages) {
  // One page needs no menu.
  const nav = pages.length < 2 ? "" : pages.map((x) => `<a href="${x.href}"${x === p ? ' aria-current="page"' : ""}>${x.title}</a>`).join("");
  await writeFile(join(OUT, p.n), fill(layout, { content: p.html, nav, title: p.title }));
}

// The brand's tokens (custom properties and @font-face, its files beside it), the look above, the kit's and the starter's CSS.
await writeFile(join(OUT, "tokens.css"), await brand.tokensCss());
await writeFile(join(OUT, "look.css"), `:root {\n  ${look.join("\n  ")}\n}\n`);
await copyFile(new URL(import.meta.resolve("@artbucket/ui/ui.css")), join(OUT, "kit.css"));
await copyFile("src/style.css", join(OUT, "style.css"));
await cp("src/public", OUT, { recursive: true }).catch((err) => {
  if (err.code !== "ENOENT") throw err;
});
await brand.copyFiles(OUT);
// What the site uses, for its lineage: Artbucket reads this as it deploys (and finds the copies by their bytes anyway).
// Its `rules` say what a release must change for this site to be built again: tokens.css carries every rule, so all.
const m = await brand.writeManifest(OUT);
console.log(`Built ${pages.length} page${pages.length === 1 ? "" : "s"} into ${OUT}/ from ${brand.name}${brand.release ? ` release ${brand.release.number}` : ""}, using ${m.assets.length} of its files`);
