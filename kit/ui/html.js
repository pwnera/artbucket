// @artbucket/ui: a brand's rules drawn as HTML, from a release as `artbucket brand export` writes it
// (or the rules of /api/v1/brand/rules). Plain strings, so they work in any framework, at build time
// or in the browser; ui.css styles them. MIT License, see LICENSE.
import { contrast, grade, hsl, inkOn, isHex, rgb, toCmyk } from "./color.js";

/** Text made safe for HTML, in an element or an attribute. */
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Whether a key is one a list asks for: a key, `color.*` for a group, `*` for every one. */
export const asks = (key, keys) => !keys || keys.some((k) => k === "*" || k === key || (k.endsWith(".*") && key.startsWith(k.slice(0, -1))));

const only = (rules, keys, context = null) => rules.filter((r) => (r.context ?? null) === context && asks(r.key, keys));
const label = (r) => esc(r.label ?? r.key);
const usage = (r) => (r.usage ? `<p class="ab-usage">${esc(r.usage)}</p>` : "");
/** The first image of a rule's files. */
export const imageOf = (r) => r?.assets?.find((a) => a.mime?.startsWith("image/"));
/** Where a file is, by default: the export's copy, from the site's root. */
const fileSrc = (a) => (a.file ? `/${a.file}` : "");

/** A font rule's family: its value, or its value's `family`. */
export const familyOf = (r) => (typeof r.value === "string" ? r.value : (r.value?.family ?? r.label ?? r.key));
/** A family as a CSS string: quotes and backslashes escaped, so a name can't end the declaration. */
export const cssFamily = (r) => JSON.stringify(String(familyOf(r)));

/** A rule's value as words: a list joined, a font by its family. */
export function textOf(r) {
  if (r.type === "font") return familyOf(r);
  if (Array.isArray(r.value)) return r.value.join(", ");
  if (r.value && typeof r.value === "object") return JSON.stringify(r.value);
  return String(r.value ?? "");
}

/**
 * The colors, each a chip in its color with its values and how it reads on
 * white and on black (WCAG 2), as the app's palette shows them.
 * `keys` narrows it (`color.primary`, `color.*`); `context` picks a context's values.
 */
export function palette(rules, o = {}) {
  const items = only(rules, o.keys, o.context).filter((r) => r.type === "color");
  return `<ul class="ab-palette">${items
    .map((r) => {
      if (!isHex(String(r.value))) return `<li><span class="ab-chip"></span><b>${label(r)}</b><code>${esc(textOf(r))}</code>${usage(r)}</li>`;
      const hex = String(r.value).slice(0, 7).toLowerCase();
      const on = (bg) => {
        const ratio = contrast(hex, bg);
        return `${ratio.toFixed(1)}:1 ${grade(ratio)}`;
      };
      const [h, s, l] = hsl(rgb(hex));
      return `<li><span class="ab-chip" style="background:${hex};color:${inkOn(hex)}">Aa</span><b>${label(r)}</b><code>${hex}</code><dl class="ab-values"><dt>RGB</dt><dd>${rgb(hex).join(", ")}</dd><dt>HSL</dt><dd>${h}, ${s}%, ${l}%</dd><dt>CMYK</dt><dd>${toCmyk(hex).join(", ")}</dd><dt>On white</dt><dd>${on("#ffffff")}</dd><dt>On black</dt><dd>${on("#000000")}</dd></dl>${usage(r)}</li>`;
    })
    .join("")}</ul>`;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789";

/** The faces, each set in itself: a large sample, its name and its alphabet. */
export function typeSpecimen(rules, o = {}) {
  const items = only(rules, o.keys, o.context).filter((r) => r.type === "font");
  return `<ul class="ab-type">${items
    .map((r) => `<li style="font-family:${esc(cssFamily(r))}"><span class="ab-sample">${esc(o.sample ?? "Aa")}</span><b>${label(r)}</b><span class="ab-family">${esc(familyOf(r))}</span><p class="ab-alphabet">${ALPHABET}</p>${usage(r)}</li>`)
    .join("")}</ul>`;
}

/** Every rule with an image (logos, marks, icons), each on its own tile. `src(asset)` says where its file is. */
export function logoGrid(rules, o = {}) {
  const src = o.src ?? fileSrc;
  const items = only(rules, o.keys, o.context).filter((r) => imageOf(r));
  return `<ul class="ab-logos">${items.map((r) => `<li><figure class="ab-tile"><img src="${esc(src(imageOf(r)))}" alt="${label(r)}"></figure><b>${label(r)}</b>${usage(r)}</li>`).join("")}</ul>`;
}

/** Dos and don'ts: `{ verdict: "do" | "dont", title?, text?, image? }`, an image by its URL. */
export function doDont(items) {
  return `<ul class="ab-dodont">${items
    .map((i) => {
      const dont = i.verdict === "dont";
      return `<li class="${dont ? "ab-dont" : "ab-do"}">${i.image ? `<figure class="ab-tile"><img src="${esc(i.image)}" alt="${esc(i.caption ?? i.title ?? "")}"></figure>` : ""}<span class="ab-verdict">${dont ? "Don't" : "Do"}</span>${i.title ? `<b>${esc(i.title)}</b>` : ""}${i.text ? `<p>${esc(i.text)}</p>` : ""}</li>`;
    })
    .join("")}</ul>`;
}

/** The rules that are neither colors, faces nor images (voice, spacing, words), as a list of terms. */
export function ruleList(rules, o = {}) {
  const items = only(rules, o.keys, o.context).filter((r) => !["color", "font"].includes(r.type) && !imageOf(r));
  return `<dl class="ab-rules">${items.map((r) => `<dt>${label(r)}</dt><dd>${esc(textOf(r))}${usage(r)}</dd>`).join("")}</dl>`;
}

/** One rule's value, inline: a color's chip and hex, a face set in itself, an image, or its words. */
export function ruleValue(r, o = {}) {
  if (!r) return "";
  const src = o.src ?? fileSrc;
  if (r.type === "color" && isHex(String(r.value))) {
    const hex = String(r.value).slice(0, 7).toLowerCase();
    return `<span class="ab-value"><span class="ab-dot" style="background:${hex}"></span><code>${hex}</code></span>`;
  }
  if (r.type === "font") return `<span class="ab-value" style="font-family:${esc(cssFamily(r))}">${esc(familyOf(r))}</span>`;
  const image = imageOf(r);
  if (image) return `<img class="ab-value" src="${esc(src(image))}" alt="${label(r)}">`;
  return `<span class="ab-value">${esc(textOf(r))}</span>`;
}
