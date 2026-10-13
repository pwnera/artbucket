// Builds the site into dist/ from src/ and the brand that `npm run brand` exported into .brand/
// (artbucket brand export: the release readers see, its rules, tokens.css and files).
// No dependencies: Node 22 or later. Change anything here; this file is yours.
//
// In a page or the layout:
//   {{title}} {{name}} {{content}} {{nav}}       the page, the brand's name, the layout's slots
//   {{text:brand.headline}}                      a text rule's value, escaped; {{text:key|fallback}}
//   {{logo}} {{icon}}                            the brand's logo as an <img>, its mark (or logo) as the tab's icon
//   {{palette}} {{type}} {{logos}} {{rules}}     the brand's colors, fonts, logos and every other rule
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const BRAND = ".brand";
const OUT = "dist";

const brand = JSON.parse(await readFile(join(BRAND, "brand.json"), "utf8").catch(() => {
  throw new Error("No .brand/brand.json: run npm run brand first (it needs artbucket login, or ARTBUCKET_URL and ARTBUCKET_KEY)");
}));
const rules = brand.rules.filter((r) => r.context === null);
const used = new Set();

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** The rule of a type whose key says one of the words, else (`any`) the first of that type. */
const pick = (type, words, any = true) => {
  const all = rules.filter((r) => r.type === type);
  return words.map((w) => all.find((r) => r.key.toLowerCase().includes(w))).find(Boolean) ?? (any ? all[0] : undefined);
};
/** A file of a rule, as the site serves it: copied from .brand/assets, so the deploy check knows it by its bytes. */
const file = (a) => {
  used.add(a.id);
  return a.file;
};
const fontOf = (r) => (r ? (typeof r.value === "string" ? r.value : (r.value?.family ?? r.label ?? r.key)) : null);
/** A family as a CSS string: its quotes and backslashes escaped, so a name can't end the declaration. */
const cssFamily = (r) => JSON.stringify(String(fontOf(r)));
const imageOf = (r) => r?.assets.find((a) => a.mime?.startsWith("image/"));

// The site's look, from the brand's rules: its colors, its faces, its logo.
const accent = pick("color", ["primary", "accent", "brand"]);
const ink = pick("color", ["ink", "text", "foreground"], false);
const paper = pick("color", ["background", "surface", "paper"], false);
const head = pick("font", ["head", "display", "title"]);
// Text keeps the system's face unless the brand names one for it: a display face is rarely one to read at length.
const body = pick("font", ["body", "text", "copy"], false);
const logo = rules.find((r) => r.key.startsWith("logo") && imageOf(r)) ?? rules.find((r) => imageOf(r));
const look = [
  accent && `--accent: ${accent.value};`,
  ink && `--ink: ${ink.value};`,
  paper && `--paper: ${paper.value};`,
  head && `--font-head: ${cssFamily(head)}, system-ui, sans-serif;`,
  body && `--font-body: ${cssFamily(body)}, system-ui, sans-serif;`,
].filter(Boolean);

const text = (spec) => {
  const [key, fallback = ""] = spec.split("|");
  const r = rules.find((x) => x.key === key && x.type === "text");
  // A file the text links to was exported beside it (assets/...): copied in too, and linked from the site's root.
  return esc(r ? r.value : fallback).replace(/(^|[^/\w])(assets\/[\w.-]+)/g, (all, before, path) => {
    if (!brand.files?.[path]) return all;
    used.add(brand.files[path]);
    return `${before}/${path}`;
  });
};
const logoTag = () => {
  const a = imageOf(logo);
  return a ? `<img class="logo" src="/${file(a)}" alt="${esc(brand.name)}">` : `<span class="wordmark">${esc(brand.name)}</span>`;
};
/** The browser tab's icon: the brand's mark if it has one (a key with mark, icon or symbol), else its logo. */
const iconTag = () => {
  const mark = rules.find((r) => /mark|icon|symbol/.test(r.key) && imageOf(r)) ?? logo;
  const a = imageOf(mark);
  return a ? `<link rel="icon" href="/${file(a)}">` : "";
};
const label = (r) => esc(r.label ?? r.key);
const palette = () =>
  `<ul class="palette">${rules
    .filter((r) => r.type === "color")
    .map((r) => `<li><span class="swatch" style="background:${esc(r.value)}"></span><b>${label(r)}</b><code>${esc(r.value)}</code>${r.usage ? `<p>${esc(r.usage)}</p>` : ""}</li>`)
    .join("")}</ul>`;
const type = () =>
  `<ul class="type">${rules
    .filter((r) => r.type === "font")
    .map((r) => `<li style="font-family:${esc(cssFamily(r))}"><span class="sample">Aa</span><b>${label(r)}</b><span>${esc(fontOf(r))}</span>${r.usage ? `<p>${esc(r.usage)}</p>` : ""}</li>`)
    .join("")}</ul>`;
const logos = () =>
  `<ul class="logos">${rules
    .filter((r) => imageOf(r))
    .map((r) => `<li><img src="/${file(imageOf(r))}" alt="${label(r)}"><b>${label(r)}</b>${r.usage ? `<p>${esc(r.usage)}</p>` : ""}</li>`)
    .join("")}</ul>`;
const others = () =>
  `<dl class="rules">${rules
    .filter((r) => !["color", "font"].includes(r.type) && !imageOf(r))
    .map((r) => `<dt>${label(r)}</dt><dd>${esc(Array.isArray(r.value) ? r.value.join(", ") : typeof r.value === "object" ? JSON.stringify(r.value) : r.value)}${r.usage ? `<p>${esc(r.usage)}</p>` : ""}</dd>`)
    .join("")}</dl>`;

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
  html.replace(/\{\{\s*([a-z]+)(?::([^}]+))?\s*\}\}/g, (all, name, arg) => {
    if (name === "text") return text(arg);
    if (name === "logo") return logoTag();
    if (name === "icon") return iconTag();
    if (name === "palette") return palette();
    if (name === "type") return type();
    if (name === "logos") return logos();
    if (name === "rules") return others();
    if (name === "name") return esc(brand.name);
    return name in slots ? slots[name] : all;
  });

// The pages: src/pages/*.html, each a fragment whose first <h1> is its title, in src/layout.html.
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const layout = await readFile("src/layout.html", "utf8");
const names = (await readdir("src/pages")).filter((n) => n.endsWith(".html")).sort((a, b) => (a === "index.html" ? -1 : b === "index.html" ? 1 : a.localeCompare(b)));
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

// The brand's tokens (custom properties and @font-face, its files beside it), the look above, the starter's CSS.
await writeFile(join(OUT, "tokens.css"), await readFile(join(BRAND, "tokens.css"), "utf8"));
for (const m of (await readFile(join(BRAND, "tokens.css"), "utf8")).matchAll(/url\("?(assets\/[^")]+)"?\)/g)) used.add(brand.files[m[1]]);
await writeFile(join(OUT, "look.css"), `:root {\n  ${look.join("\n  ")}\n}\n`);
await copyFile("src/style.css", join(OUT, "style.css"));
for (const [path, id] of Object.entries(brand.files)) {
  if (!used.has(id)) continue;
  await mkdir(join(OUT, dirname(path)), { recursive: true });
  await copyFile(join(BRAND, path), join(OUT, path));
}
// What the site uses, for its lineage: Artbucket reads this as it deploys (and finds the copies by their bytes anyway).
used.delete(undefined);
// `rules`: what a release must change for this site to be built again. tokens.css carries every rule, so all of them;
// a build that reads fewer can name them (keys, or color.* for a group) and skip releases that change none.
await writeFile(join(OUT, "artbucket.site.json"), JSON.stringify({ brand: brand.slug, release: brand.release?.number ?? null, rules: ["*"], assets: [...used] }, null, 2) + "\n");
console.log(`Built ${pages.length} page${pages.length === 1 ? "" : "s"} into ${OUT}/ from ${brand.name}${brand.release ? ` release ${brand.release.number}` : ""}, using ${used.size} of its files`);
