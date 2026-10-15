import { colorsOf, deriveTheme, type ThemeFace, type ThemeSettings } from "./brand-theme.ts";
import { luminance, mix, rgb } from "./color.ts";
import type { Rule } from "./rules.ts";
import { type Entry, zip } from "./zip.ts";

/**
 * A brand's release as Office templates: a PowerPoint template (.potx) and a
 * Word template (.dotx), each the smallest package Office opens, written by
 * hand over lib/zip.ts. Both carry one Office theme (theme1.xml): the brand's
 * colors in its twelve slots and its heading and text families. PowerPoint's
 * slide master and its three layouts (title, title and content, section) and
 * Word's header carry the logo. Google Slides and LibreOffice open the .potx
 * too.
 *
 * Office can't load a web font from a template, so the theme names the
 * family and says what kind of face it is (sans, serif, mono): a machine
 * without it falls back to one of that kind, Word to the fallback's first
 * named family (fontTable.xml).
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

type R = Pick<Rule, "key" | "type" | "value" | "context" | "assets" | "spec">;

/** The theme's color slots, in the order theme1.xml lists them. */
export const SLOTS = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"] as const;

/** A family, its kind (Office's font family classes) and the face Word takes when it isn't installed. */
export type OfficeFont = { family: string; kind: "swiss" | "roman" | "modern"; alt: string };

export type OfficeLook = {
  name: string;
  /** "#rrggbb" by slot: dk1 and lt1 are the ink and the paper, the darker one first. */
  colors: Record<(typeof SLOTS)[number], string>;
  /** The paper is the dark one: slides use dk1 as their ground. */
  dark: boolean;
  /** Text on the accent, for the section layout's ground. */
  onAccent: string;
  head: OfficeFont;
  body: OfficeFont;
  /** The logo rule's asset ids, in its order: the first that may leave and draws is the one placed. */
  logo: string[];
};

const ALT = { swiss: "Arial", roman: "Times New Roman", modern: "Courier New" } as const;
const GENERIC = /^(sans-serif|serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|-apple-system|emoji|math)$/i;

/** A face as Office names it: its kind from its fallback (else its name), and the fallback's first real family for Word. */
export function officeFont(f: Pick<ThemeFace, "family" | "fallback"> | undefined): OfficeFont {
  if (!f) return { family: "Arial", kind: "swiss", alt: "Arial" };
  const stack = (f.fallback ?? "").split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
  const said = `${f.family} ${f.fallback ?? ""}`;
  const kind = /\bmono(space)?\b|\bcode\b/i.test(said) ? "modern" : /(^|[^-])\bserif\b/i.test(said) && !/\bsans\b(?!-serif)/i.test(f.family) ? "roman" : "swiss";
  const named = stack.find((s) => s && !GENERIC.test(s) && s !== f.family);
  return { family: f.family, kind, alt: named ?? ALT[kind] };
}

const lum = (hex: string) => luminance(rgb(hex));

/**
 * The release's look in Office's terms, as its pages wear it (deriveTheme):
 * ink and paper are dk1 and lt1, the dark and the panel dk2 and lt2 (on a
 * dark paper, the panel and the quiet text), the accent accent1, then the
 * palette's other colors in its order, and tints and shades of the accent
 * where it runs short. Links are the accent as text, visited ones the quiet
 * text.
 */
export function officeLook(name: string, rules: R[], settings: ThemeSettings = {}): OfficeLook {
  const t = deriveTheme(rules, settings);
  const paper = t.surface ?? "#ffffff";
  const dark = lum(paper) < lum(t.ink);
  const [dk1, lt1] = dark ? [paper, t.ink] : [t.ink, paper];
  const taken = new Set([dk1, lt1, t.dark, t.panel, t.accent]);
  const palette = colorsOf(rules.filter((r) => r.context === null))
    .map((r) => (r.value as string).slice(0, 7).toLowerCase())
    .filter((c) => !taken.has(c) && (taken.add(c), true));
  const fill = [mix(t.accent, dk1, 0.35), mix(t.accent, lt1, 0.35), mix(t.accent, dk1, 0.6), mix(t.accent, lt1, 0.6), mix(t.accent, lt1, 0.8)];
  const [a2, a3, a4, a5, a6] = [...palette, ...fill];
  const logoKey = t.logo?.key;
  const logo = logoKey ? (rules.find((r) => r.key === logoKey && r.context === null)?.assets.map((a) => a.id) ?? []) : [];
  return {
    name,
    // bg2 is the panel and tx2 the quieter text either way: on dark paper the clrMap swaps the pairs (master).
    colors: { dk1, lt1, dk2: dark ? t.panel : t.dark, lt2: dark ? t.muted : t.panel, accent1: t.accent, accent2: a2, accent3: a3, accent4: a4, accent5: a5, accent6: a6, hlink: t.accentText, folHlink: t.muted },
    dark,
    onAccent: t.onAccent,
    head: officeFont(t.faces.head ?? t.faces.body),
    body: officeFont(t.faces.body ?? t.faces.head),
    logo,
  };
}

// ---- the parts ---------------------------------------------------------------------

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = {
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  wp: "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
  pic: "http://schemas.openxmlformats.org/drawingml/2006/picture",
};
const xmlns = (...ps: (keyof typeof NS)[]) => ps.map((p) => ` xmlns:${p}="${NS[p]}"`).join("");
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
const CT = "application/vnd.openxmlformats-officedocument.";

/** Text and attribute values: escaped, and without the characters XML 1.0 can't hold. */
const x = (s: string) => s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g, "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const hex = (c: string) => c.slice(1, 7).toUpperCase();

type Rel = { id: string; type: string; target: string };
const rels = (list: Rel[]) =>
  `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map((r) => `<Relationship Id="${r.id}" Type="${REL}${r.type}" Target="${r.target}"/>`).join("")}</Relationships>`;

const contentTypes = (overrides: Record<string, string>) =>
  `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>${Object.entries(
    overrides,
  )
    .map(([part, type]) => `<Override PartName="${part}" ContentType="${CT}${type}"/>`)
    .join("")}</Types>`;

/** What Office picks a stand-in by when a family isn't installed: its pitch and family byte, and the PANOSE of Arial, Times New Roman or Courier New. */
const PITCH = { swiss: 34, roman: 18, modern: 49 } as const;
const PANOSE = { swiss: "020B0604020202020204", roman: "02020603050405020304", modern: "02070309020205020404" } as const;
/** A family as a theme's `<a:latin>` names it. */
export const latinTag = (f: OfficeFont) => `<a:latin typeface="${x(f.family)}" panose="${PANOSE[f.kind]}" pitchFamily="${PITCH[f.kind]}" charset="0"/>`;
const latin = (f: OfficeFont) => `${latinTag(f)}<a:ea typeface=""/><a:cs typeface=""/>`;
/** The look's twelve colors as a theme's `<a:clrScheme>`. */
export const clrScheme = (l: OfficeLook) => `<a:clrScheme name="${x(l.name)}">${SLOTS.map((s) => `<a:${s}><a:srgbClr val="${hex(l.colors[s])}"/></a:${s}>`).join("")}</a:clrScheme>`;
const three = (s: string) => s + s + s;

/** theme1.xml, one for both: the colors, the fonts, and the plainest format scheme the schema allows (three of each). */
export function themeXml(l: OfficeLook) {
  const solid = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  return (
    `${XML}<a:theme${xmlns("a")} name="${x(l.name)}"><a:themeElements>` +
    clrScheme(l) +
    `<a:fontScheme name="${x(l.name)}"><a:majorFont>${latin(l.head)}</a:majorFont><a:minorFont>${latin(l.body)}</a:minorFont></a:fontScheme>` +
    `<a:fmtScheme name="${x(l.name)}"><a:fillStyleLst>${three(solid)}</a:fillStyleLst><a:lnStyleLst>${three(`<a:ln w="6350">${solid}</a:ln>`)}</a:lnStyleLst>` +
    `<a:effectStyleLst>${three("<a:effectStyle><a:effectLst/></a:effectStyle>")}</a:effectStyleLst><a:bgFillStyleLst>${three(solid)}</a:bgFillStyleLst></a:fmtScheme>` +
    `</a:themeElements></a:theme>`
  );
}

/** A PNG's size, from its header. */
export function pngSize(png: Uint8Array) {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  if (png.length < 24 || v.getUint32(0) !== 0x89504e47 || v.getUint32(12) !== 0x49484452) throw new Error("Not a PNG");
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

const IN = 914400;
/** The logo `h` high, narrower when it would pass `maxW`: EMUs, rounded. */
function fit(png: Uint8Array, h: number, maxW: number) {
  const { width, height } = pngSize(png);
  const w = Math.min(maxW, (h * width) / Math.max(1, height));
  return { cx: Math.round(w), cy: Math.round((w * height) / Math.max(1, width)) };
}

// ---- PowerPoint ----------------------------------------------------------------------

/** 16:9, as PowerPoint makes a new deck. */
const W = 12192000;
const H = 6858000;

const box = (x0: number, y0: number, cx: number, cy: number) => `<a:xfrm><a:off x="${Math.round(x0)}" y="${Math.round(y0)}"/><a:ext cx="${Math.round(cx)}" cy="${Math.round(cy)}"/></a:xfrm>`;
const rect = '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
const tree = (shapes: string) => `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree>`;
const ground = (slot: string) => `<p:bg><p:bgPr><a:solidFill><a:schemeClr val="${slot}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
const run = (rPr: string, fill: string, font: "mj" | "mn") =>
  `<a:defRPr ${rPr}>${fill}<a:latin typeface="+${font}-lt"/><a:ea typeface="+${font}-ea"/><a:cs typeface="+${font}-cs"/></a:defRPr>`;
const scheme = (slot: string) => `<a:solidFill><a:schemeClr val="${slot}"/></a:solidFill>`;

/** A placeholder: where it sits (none: the master's), how its text sits, and its text. */
function ph(id: number, name: string, kind: string, o: { at?: string; anchor?: "t" | "b"; style?: string; text?: string } = {}) {
  const p = o.text ? `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${x(o.text)}</a:t></a:r></a:p>` : "<a:p><a:endParaRPr lang=\"en-US\"/></a:p>";
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${x(name)}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>${kind}</p:nvPr></p:nvSpPr>` +
    `<p:spPr>${o.at ? o.at + rect : ""}</p:spPr><p:txBody><a:bodyPr${o.anchor ? ` anchor="${o.anchor}"` : ""}/><a:lstStyle>${o.style ?? ""}</a:lstStyle>${p}</p:txBody></p:sp>`
  );
}

const pic = (id: number, rId: string, at: string) =>
  `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Logo"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr userDrawn="1"/></p:nvPicPr>` +
  `<p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${at}${rect}</p:spPr></p:pic>`;

const M = 0.6 * IN;

function master(l: OfficeLook, logo: Uint8Array | null) {
  const mark = logo && fit(logo, 0.35 * IN, 2 * IN);
  const map = l.dark
    ? 'bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2"'
    : 'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2"';
  const shapes =
    ph(2, "Title", '<p:ph type="title"/>', { at: box(M, 0.5 * IN, W - 2 * M, 1.1 * IN), anchor: "b" }) +
    ph(3, "Text", '<p:ph type="body" idx="1"/>', { at: box(M, 1.8 * IN, W - 2 * M, H - 2.7 * IN) }) +
    (mark ? pic(4, "rId5", box(W - M - mark.cx, H - 0.4 * IN - mark.cy, mark.cx, mark.cy)) : "");
  const bullet = (lvl: number, sz: number) =>
    `<a:lvl${lvl}pPr marL="${228600 + (lvl - 1) * 457200}" indent="-228600"><a:spcBef><a:spcPts val="1000"/></a:spcBef><a:buFont typeface="Arial"/><a:buChar char="•"/>${run(`sz="${sz}"`, scheme("tx1"), "mn")}</a:lvl${lvl}pPr>`;
  return (
    `${XML}<p:sldMaster${xmlns("a", "r", "p")}><p:cSld>${ground("bg1")}${tree(shapes)}</p:cSld>` +
    `<p:clrMap ${map} accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
    `<p:sldLayoutIdLst>${[1, 2, 3].map((n) => `<p:sldLayoutId id="${2147483648 + n}" r:id="rId${n}"/>`).join("")}</p:sldLayoutIdLst>` +
    `<p:txStyles><p:titleStyle><a:lvl1pPr><a:lnSpc><a:spcPct val="90000"/></a:lnSpc>${run('sz="4000"', scheme("tx1"), "mj")}</a:lvl1pPr></p:titleStyle>` +
    `<p:bodyStyle>${bullet(1, 2000)}${bullet(2, 1800)}${bullet(3, 1600)}</p:bodyStyle>` +
    `<p:otherStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr></p:otherStyle></p:txStyles></p:sldMaster>`
  );
}

const plain = (sz: number, fill: string) => `<a:lvl1pPr marL="0" indent="0"><a:buNone/><a:defRPr sz="${sz}">${fill}</a:defRPr></a:lvl1pPr>`;

/** Title: the accent down the side and the logo large, the master's own shapes left off. */
function titleLayout(logo: Uint8Array | null) {
  const mark = logo && fit(logo, 0.8 * IN, 3.5 * IN);
  const x0 = 0.9 * IN;
  const shapes =
    `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Accent"/><p:cNvSpPr/><p:nvPr userDrawn="1"/></p:nvSpPr><p:spPr>${box(0, 0, 0.25 * IN, H)}${rect}${scheme("accent1")}<a:ln><a:noFill/></a:ln></p:spPr></p:sp>` +
    (mark ? pic(3, "rId2", box(x0, 0.8 * IN, mark.cx, mark.cy)) : "") +
    ph(4, "Title", '<p:ph type="ctrTitle"/>', { at: box(x0, 2.4 * IN, W - 2 * x0, 1.6 * IN), anchor: "b", style: `<a:lvl1pPr><a:defRPr sz="5400"/></a:lvl1pPr>` }) +
    ph(5, "Subtitle", '<p:ph type="subTitle" idx="1"/>', { at: box(x0, 4.15 * IN, W - 2 * x0, 1 * IN), anchor: "t", style: plain(2000, scheme("tx2")) });
  return layout("title", "Title Slide", tree(shapes), false);
}

function contentLayout() {
  return layout("obj", "Title and Content", tree(ph(2, "Title", '<p:ph type="title"/>') + ph(3, "Content", '<p:ph idx="1"/>')), true);
}

/** Section: on the accent, in the color that reads there. */
function sectionLayout(l: OfficeLook) {
  const on = `<a:solidFill><a:srgbClr val="${hex(l.onAccent)}"/></a:solidFill>`;
  const x0 = 0.9 * IN;
  const shapes =
    ph(2, "Title", '<p:ph type="title"/>', { at: box(x0, 2.4 * IN, W - 2 * x0, 1.6 * IN), anchor: "b", style: `<a:lvl1pPr><a:defRPr sz="4800">${on}</a:defRPr></a:lvl1pPr>` }) +
    ph(3, "Text", '<p:ph type="body" idx="1"/>', { at: box(x0, 4.15 * IN, W - 2 * x0, 1 * IN), anchor: "t", style: plain(2000, on) });
  return layout("secHead", "Section Header", ground("accent1") + tree(shapes), false);
}

/** `cSld`: its ground, if its own, then its shapes. `master`: the master's shapes (the logo) show on it too. */
const layout = (type: string, name: string, cSld: string, master: boolean) =>
  `${XML}<p:sldLayout${xmlns("a", "r", "p")} type="${type}" preserve="1"${master ? "" : ' showMasterSp="0"'}><p:cSld name="${name}">${cSld}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

/** The deck's one slide, on the title layout: the brand's name, so the template opens on something. */
const slide = (l: OfficeLook) =>
  `${XML}<p:sld${xmlns("a", "r", "p")}><p:cSld>${tree(ph(2, "Title", '<p:ph type="ctrTitle"/>', { text: l.name }) + ph(3, "Subtitle", '<p:ph type="subTitle" idx="1"/>', { text: "Presentation title" }))}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;

/** The .potx package. `date`: the zip's file times, the release's, so one release is one file byte for byte. */
export function potx(l: OfficeLook, logo: Uint8Array | null, date?: Date): Uint8Array<ArrayBuffer> {
  const img = logo ? [{ id: "rId5", type: "image", target: "../media/logo.png" }] : [];
  const layoutRels = (n: number) => rels([{ id: "rId1", type: "slideMaster", target: "../slideMasters/slideMaster1.xml" }, ...(n === 1 && logo ? [{ id: "rId2", type: "image", target: "../media/logo.png" }] : [])]);
  const parts: [string, string | Uint8Array][] = [
    [
      "[Content_Types].xml",
      contentTypes({
        "/ppt/presentation.xml": "presentationml.template.main+xml",
        "/ppt/presProps.xml": "presentationml.presProps+xml",
        "/ppt/viewProps.xml": "presentationml.viewProps+xml",
        "/ppt/tableStyles.xml": "presentationml.tableStyles+xml",
        "/ppt/theme/theme1.xml": "theme+xml",
        "/ppt/slideMasters/slideMaster1.xml": "presentationml.slideMaster+xml",
        "/ppt/slideLayouts/slideLayout1.xml": "presentationml.slideLayout+xml",
        "/ppt/slideLayouts/slideLayout2.xml": "presentationml.slideLayout+xml",
        "/ppt/slideLayouts/slideLayout3.xml": "presentationml.slideLayout+xml",
        "/ppt/slides/slide1.xml": "presentationml.slide+xml",
      }),
    ],
    ["_rels/.rels", rels([{ id: "rId1", type: "officeDocument", target: "ppt/presentation.xml" }])],
    [
      "ppt/presentation.xml",
      `${XML}<p:presentation${xmlns("a", "r", "p")}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId6"/></p:sldIdLst><p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    ],
    [
      "ppt/_rels/presentation.xml.rels",
      rels([
        { id: "rId1", type: "slideMaster", target: "slideMasters/slideMaster1.xml" },
        { id: "rId2", type: "theme", target: "theme/theme1.xml" },
        { id: "rId3", type: "presProps", target: "presProps.xml" },
        { id: "rId4", type: "viewProps", target: "viewProps.xml" },
        { id: "rId5", type: "tableStyles", target: "tableStyles.xml" },
        { id: "rId6", type: "slide", target: "slides/slide1.xml" },
      ]),
    ],
    ["ppt/presProps.xml", `${XML}<p:presentationPr${xmlns("a", "r", "p")}/>`],
    ["ppt/viewProps.xml", `${XML}<p:viewPr${xmlns("a", "r", "p")}/>`],
    ["ppt/tableStyles.xml", `${XML}<a:tblStyleLst${xmlns("a")} def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`],
    ["ppt/theme/theme1.xml", themeXml(l)],
    ["ppt/slideMasters/slideMaster1.xml", master(l, logo)],
    [
      "ppt/slideMasters/_rels/slideMaster1.xml.rels",
      rels([...[1, 2, 3].map((n) => ({ id: `rId${n}`, type: "slideLayout", target: `../slideLayouts/slideLayout${n}.xml` })), { id: "rId4", type: "theme", target: "../theme/theme1.xml" }, ...img]),
    ],
    ["ppt/slideLayouts/slideLayout1.xml", titleLayout(logo)],
    ["ppt/slideLayouts/slideLayout2.xml", contentLayout()],
    ["ppt/slideLayouts/slideLayout3.xml", sectionLayout(l)],
    ...[1, 2, 3].map((n): [string, string] => [`ppt/slideLayouts/_rels/slideLayout${n}.xml.rels`, layoutRels(n)]),
    ["ppt/slides/slide1.xml", slide(l)],
    ["ppt/slides/_rels/slide1.xml.rels", rels([{ id: "rId1", type: "slideLayout", target: "../slideLayouts/slideLayout1.xml" }])],
    ...(logo ? [["ppt/media/logo.png", logo] as [string, Uint8Array]] : []),
  ];
  return pack(parts, date);
}

// ---- Word ----------------------------------------------------------------------------

/** The theme's heading (major) or text (minor) family, for every script. */
const fonts = (f: "major" | "minor") => `<w:rFonts w:asciiTheme="${f}HAnsi" w:eastAsiaTheme="${f}EastAsia" w:hAnsiTheme="${f}HAnsi" w:cstheme="${f}Bidi"/>`;

function styles(l: OfficeLook) {
  const color = (slot: "text1" | "accent1", c: string) => `<w:color w:val="${hex(c)}" w:themeColor="${slot}"/>`;
  const heading = (n: number, sz: number, slot: "text1" | "accent1", c: string) =>
    `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${n === 1 ? 360 : 240}" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr>` +
    `<w:rPr>${fonts("major")}${color(slot, c)}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`;
  return (
    `${XML}<w:styles${xmlns("w")}><w:docDefaults><w:rPrDefault><w:rPr>${fonts("minor")}<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:rPr>${color("text1", l.colors.dk1)}</w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="10"/><w:qFormat/>` +
    `<w:pPr><w:spacing w:after="240" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr>${fonts("major")}<w:sz w:val="56"/><w:szCs w:val="56"/></w:rPr></w:style>` +
    heading(1, 32, "accent1", l.colors.accent1) +
    heading(2, 26, "accent1", l.colors.accent1) +
    heading(3, 24, "text1", l.colors.dk1) +
    `<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:uiPriority w:val="99"/><w:rPr><w:color w:val="${hex(l.colors.hlink)}" w:themeColor="hyperlink"/><w:u w:val="single"/></w:rPr></w:style>` +
    `</w:styles>`
  );
}

const fontTable = (l: OfficeLook) =>
  `${XML}<w:fonts${xmlns("w")}>${[...new Map([l.head, l.body].map((f) => [f.family, f])).values()]
    .map((f) => `<w:font w:name="${x(f.family)}"><w:altName w:val="${x(f.alt)}"/><w:panose1 w:val="${PANOSE[f.kind]}"/><w:family w:val="${f.kind}"/><w:pitch w:val="${f.kind === "modern" ? "fixed" : "variable"}"/></w:font>`)
    .join("")}</w:fonts>`;

/** The header: the logo at the end of the line, 0.45 in high. */
function header(logo: Uint8Array) {
  const { cx, cy } = fit(logo, 0.45 * IN, 2.5 * IN);
  return (
    `${XML}<w:hdr${xmlns("w", "r", "wp", "a", "pic")}><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Logo"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>${rect}</pic:spPr></pic:pic>` +
    `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:hdr>`
  );
}

/** The .dotx package: A4, opening on an empty Title paragraph. */
export function dotx(l: OfficeLook, logo: Uint8Array | null, date?: Date): Uint8Array<ArrayBuffer> {
  const head = logo ? '<w:headerReference w:type="default" r:id="rId4"/>' : "";
  const parts: [string, string | Uint8Array][] = [
    [
      "[Content_Types].xml",
      contentTypes({
        "/word/document.xml": "wordprocessingml.template.main+xml",
        "/word/styles.xml": "wordprocessingml.styles+xml",
        "/word/fontTable.xml": "wordprocessingml.fontTable+xml",
        "/word/theme/theme1.xml": "theme+xml",
        ...(logo && { "/word/header1.xml": "wordprocessingml.header+xml" }),
      }),
    ],
    ["_rels/.rels", rels([{ id: "rId1", type: "officeDocument", target: "word/document.xml" }])],
    [
      "word/document.xml",
      `${XML}<w:document${xmlns("w", "r")}><w:body><w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr></w:p>` +
        `<w:sectPr>${head}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1134" w:bottom="1440" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`,
    ],
    [
      "word/_rels/document.xml.rels",
      rels([
        { id: "rId1", type: "styles", target: "styles.xml" },
        { id: "rId2", type: "theme", target: "theme/theme1.xml" },
        { id: "rId3", type: "fontTable", target: "fontTable.xml" },
        ...(logo ? [{ id: "rId4", type: "header", target: "header1.xml" }] : []),
      ]),
    ],
    ["word/styles.xml", styles(l)],
    ["word/fontTable.xml", fontTable(l)],
    ["word/theme/theme1.xml", themeXml(l)],
    ...(logo
      ? ([
          ["word/header1.xml", header(logo)],
          ["word/_rels/header1.xml.rels", rels([{ id: "rId1", type: "image", target: "media/logo.png" }])],
          ["word/media/logo.png", logo],
        ] as [string, string | Uint8Array][])
      : []),
  ];
  return pack(parts, date);
}

const enc = new TextEncoder();
const pack = (parts: [string, string | Uint8Array][], date = new Date(1980, 0, 1)) =>
  zip(parts.map(([name, data]): Entry => ({ name, data: typeof data === "string" ? enc.encode(data) : data, date })));

/** What each template is, for a download. */
export const OFFICE_FORMATS = {
  potx: { build: potx, mime: `${CT}presentationml.template`, label: "PowerPoint template" },
  dotx: { build: dotx, mime: `${CT}wordprocessingml.template`, label: "Word template" },
} as const;
export type OfficeFormat = keyof typeof OFFICE_FORMATS;
export const OFFICE_FORMAT_IDS = Object.keys(OFFICE_FORMATS) as [OfficeFormat, ...OfficeFormat[]];
