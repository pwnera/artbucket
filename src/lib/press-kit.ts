import { hexOf, rgb, toCmyk } from "./color.ts";
import { isFont } from "./font.ts";
import { contextLabel, fontLabel, fontValue, listStyle, ruleName, type RuleType, type RuleValue } from "./rules.ts";
import { uniqueNames } from "./zip.ts";

/**
 * A brand's press kit, as BrandHub hands it out ({org}/{brand}/press-kit.zip,
 * lib/core/press-kit.ts): which files go in, and the words that come with
 * them. A portal's Logos section zips its marks with the same folders.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

type KitAsset = { id: string; mime: string; filename: string | null; kept?: true };
type KitRule = { key: string; label: string | null; context: string | null; type: RuleType; value: RuleValue; usage: string | null; assets: KitAsset[] };

/** A rule's name: a context's version often has no label of its own, so it goes by its default's. */
const nameIn = (rules: Pick<KitRule, "key" | "label">[], r: Pick<KitRule, "key" | "label">) => ruleName(rules.find((x) => x.key === r.key && x.label) ?? r);

/** A version's folder in a kit: "The logo (Dark background)". */
export const kitFolder = (name: string, context: string | null) => `${name}${context ? ` (${contextLabel(context)})` : ""}`.replace(/[\\/]/g, "-");

/** A file of the kit: where it goes, the asset, and `png` for an SVG's PNG beside it. */
export type KitFile = { path: string; id: string; png?: true };

/**
 * The kit's files: every logo rule's pictures, a folder per version
 * (logos/The logo (Dark background)/logo.svg), an SVG with a PNG of it
 * beside; every typeface's font files (fonts/Inter/Inter-Bold.woff2). A
 * file kept from outside (lib/rights.ts isDownloadable: a foundry font, a
 * licensed mark) stays out, named in `left`.
 */
export function kitFiles(rules: KitRule[]) {
  const files: KitFile[] = [];
  const left: string[] = [];
  const seen = new Set<string>();
  for (const r of rules) {
    const logo = r.key.startsWith("logo.");
    if (!logo && r.type !== "font") continue;
    const folder = logo ? `logos/${kitFolder(nameIn(rules, r), r.context)}` : `fonts/${kitFolder(fontValue(r.value).family, null)}`;
    for (const a of r.assets) {
      if (logo ? !a.mime.startsWith("image/") : !isFont(a.mime, a.filename ?? "")) continue;
      const path = `${folder}/${a.filename ?? a.id}`;
      // Two typefaces of one family share its files.
      if (seen.has(`${path}\0${a.id}`)) continue;
      seen.add(`${path}\0${a.id}`);
      if (a.kept) left.push(path);
      else files.push({ path, id: a.id }, ...(a.mime === "image/svg+xml" ? [{ path: path.replace(/(\.svg)?$/i, ".png"), id: a.id, png: true as const }] : []));
    }
  }
  const paths = uniqueNames(files.map((f) => f.path));
  return { files: files.map((f, i) => ({ ...f, path: paths[i] })), left };
}

/** The brand's colors with a hex value, each named for its version: "Primary (Dark background)". */
export const kitColors = (rules: Pick<KitRule, "key" | "label" | "context" | "type" | "value" | "usage">[]) =>
  rules.flatMap((r) => {
    const hex = r.type === "color" && typeof r.value === "string" ? hexOf(r.value.slice(0, 7)) : null;
    return hex ? [{ name: kitFolder(nameIn(rules, r), r.context), hex, usage: r.usage }] : [];
  });
type KitColor = ReturnType<typeof kitColors>[number];

/** colors.txt: each color in HEX, RGB and CMYK (a screen's conversion: a printer proofs its own), and its use. */
export const colorsText = (colors: KitColor[]) =>
  colors
    .map((c) => [c.name, `  HEX  ${c.hex.toUpperCase()}`, `  RGB  ${rgb(c.hex).join(" ")}`, `  CMYK ${toCmyk(c.hex).join(" ")}`, ...(c.usage ? [`  Use  ${c.usage.replace(/\s+/g, " ")}`] : [])].join("\n"))
    .join("\n\n") + "\n";

/**
 * colors.ase, Adobe Swatch Exchange, for Illustrator, Photoshop, InDesign
 * and Affinity: a swatch per color, RGB, named as colors.txt names it.
 * Big-endian: "ASEF", version 1.0, a block count, then each color block
 * (its name in UTF-16 with a terminating 0, the model, three floats, normal).
 */
export function ase(colors: KitColor[]): Uint8Array<ArrayBuffer> {
  const blocks = colors.map(({ name, hex }) => {
    const n = `${name}\0`;
    const length = 2 + n.length * 2 + 4 + 12 + 2;
    const v = new DataView(new ArrayBuffer(6 + length));
    v.setUint16(0, 0x0001);
    v.setUint32(2, length);
    v.setUint16(6, n.length);
    for (let i = 0; i < n.length; i++) v.setUint16(8 + i * 2, n.charCodeAt(i));
    let at = 8 + n.length * 2;
    for (const c of "RGB ") v.setUint8(at++, c.charCodeAt(0));
    for (const c of rgb(hex)) v.setFloat32((at += 4) - 4, c / 255);
    v.setUint16(at, 2);
    return new Uint8Array(v.buffer);
  });
  const out = new Uint8Array(12 + blocks.reduce((n, b) => n + b.length, 0));
  const head = new DataView(out.buffer);
  out.set([0x41, 0x53, 0x45, 0x46]);
  head.setUint16(4, 1);
  head.setUint32(8, blocks.length);
  let at = 12;
  for (const b of blocks) {
    out.set(b, at);
    at += b.length;
  }
  return out;
}

export type KitAbout = {
  name: string;
  owner: string;
  verified: string | null;
  version: number;
  publishedAt: Date | string | null;
  /** The listing, pinned to this release. */
  url: string;
  guidelines: string | null;
  terms: string | null;
  /** What this release said. */
  note: string | null;
  /** What the first release said, where a community listing names where it came from. */
  source: string | null;
};

/**
 * README.md: whose brand, which release, where it came from, what is in
 * the zip, and how to use it: each mark's and color's use, the typefaces
 * and their licenses, and the brand's do and don't lists.
 */
export function kitReadme(about: KitAbout, rules: KitRule[], { files, left, licenses }: { files: KitFile[]; left: string[]; licenses: Map<string, string | null> }) {
  const date = about.publishedAt ? new Date(about.publishedAt).toISOString().slice(0, 10) : null;
  const by = about.verified ? `${about.owner} (verified: ${about.verified})` : `${about.owner}, a community listing not verified as the brand's owner`;
  const lines = [
    `# ${about.name} press kit`,
    "",
    `${about.name}'s brand from the Artbucket BrandHub, release @${about.version}${date ? ` of ${date}` : ""}, listed by ${by}.`,
    "",
    `- Listing: ${about.url}`,
    ...(about.guidelines ? [`- Guidelines: ${about.guidelines}`] : []),
  ];
  const part = (heading: string, body: string[]) => {
    if (body.length) lines.push("", `## ${heading}`, "", ...body);
  };
  if (!about.verified) {
    part("Source", [
      `This listing may not come from ${about.name}'s owner: check with them before you rely on it. Trademarks belong to their owners.`,
      ...(about.source && about.source !== about.note ? ["", about.source] : []),
    ]);
  }
  part("Terms of use", about.terms ? [about.terms] : []);
  part(`Release @${about.version}`, about.note ? [about.note] : []);

  const inKit = new Map<string, string[]>();
  for (const f of files) inKit.set(f.id, [...(inKit.get(f.id) ?? []), f.path]);
  const own = rules.filter((r) => !r.context);
  part("In this kit", [
    "- `README.md`: this file",
    ...(files.some((f) => f.path.startsWith("logos/")) ? ["- `logos/`: every logo, a folder per version, SVG files with a PNG beside them"] : []),
    ...(rules.some((r) => r.type === "color") ? ["- `colors.txt`, `colors.ase`: the palette, in words and as Adobe swatches"] : []),
    "- `tokens.css`, `tokens.json`: the brand as CSS variables and W3C design tokens",
    ...(files.some((f) => f.path.startsWith("fonts/")) ? ["- `fonts/`: the font files their licenses let anyone pass on"] : []),
  ]);

  part(
    "Logos",
    rules
      .filter((r) => r.key.startsWith("logo.") && r.assets.some((a) => a.mime.startsWith("image/")))
      .map((r) => `- **${kitFolder(nameIn(rules, r), r.context)}**${r.usage ? `: ${r.usage}` : ""}`),
  );
  part(
    "Colors",
    kitColors(rules).map((c) => `- **${c.name}** \`${c.hex}\`${c.usage ? `: ${c.usage}` : ""}`),
  );
  part(
    "Typefaces",
    own
      .filter((r) => r.type === "font")
      .map((r) => {
        const fonts = r.assets.filter((a) => isFont(a.mime, a.filename ?? ""));
        const named = [...new Set(fonts.map((a) => licenses.get(a.id)).filter(Boolean))];
        const license = named.length ? `License: ${named.join(", ")}.` : "License: not stated.";
        const files = fonts.some((a) => inKit.has(a.id)) ? "Its files are in `fonts/`." : fonts.length ? "Its files aren't in the kit: their license doesn't let BrandHub pass them on. Get them from the foundry." : "No files: get it where the family is published.";
        return `- **${fontLabel(fontValue(r.value))}** (${ruleName(r)})${r.usage ? `: ${r.usage}` : ""}. ${license} ${files}`;
      }),
  );
  const doDont = own.flatMap((r) => {
    if (r.type !== "list") return [];
    const style = listStyle(r.key, r.value as (string | number)[]);
    return style === "do" || style === "dont" ? (r.value as (string | number)[]).map((v) => `- ${style === "do" ? "Do" : "Don't"}: ${v}`) : [];
  });
  part("Do's and don'ts", doDont);
  part("Not in this kit", left.length ? ["Shown on BrandHub, but not here: their owner doesn't hand them out, or the zip had no room left for them.", "", ...left.map((p) => `- ${p}`)] : []);
  return lines.join("\n") + "\n";
}
