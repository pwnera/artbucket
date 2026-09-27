import { rgb } from "./color.ts";
import { fontStyle, isFont } from "./font.ts";
import { fontValue, listStyle, type Rule, type RuleAsset } from "./rules.ts";

/**
 * Brand rules as design tokens, for code: CSS custom properties, or W3C
 * Design Tokens (DTCG 2025.10) JSON for Style Dictionary, Tokens Studio and
 * Figma importers. Colors, numbers, fonts (family, size, weight, and their
 * files as @font-face) and a type scale become tokens; a rule set in one of
 * the brand's fonts (see SetIn) aliases that font. Sentences and do/don't
 * lists are guidance, not values, and stay out.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

export type TokenRule = Pick<Rule, "key" | "type" | "value" | "usage" | "assets">;

/** `logo.minClearSpace` is `--logo-min-clear-space`. */
export const kebab = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/\./g, "-").toLowerCase();
const fontFiles = (r: TokenRule) => r.assets.filter((a) => a.mime && isFont(a.mime, a.filename ?? ""));
const isScale = (r: TokenRule) => r.type === "list" && listStyle(r.key, r.value as (string | number)[]) === "scale";
const FORMAT: Record<string, string> = { "font/woff2": "woff2", "font/woff": "woff", "font/ttf": "truetype", "font/otf": "opentype" };

/** A non-font rule set in a font: the font rule whose file it carries. */
function setIn(r: TokenRule, rules: TokenRule[]) {
  if (r.type === "font") return undefined;
  const file = fontFiles(r)[0];
  return file && rules.find((f) => f.type === "font" && f.assets.some((a) => a.id === file.id));
}

const fileUrl = (a: RuleAsset, origin: string) => `${origin}/a/${a.id}`;

// ---- CSS -------------------------------------------------------------------

/** A comment can't be closed from inside. */
const comment = (s: string) => `/* ${s.replace(/\*\//g, "* /").replace(/\s+/g, " ")} */`;
const str = (s: string) => JSON.stringify(s);

export function toCss(rules: TokenRule[], { origin, title }: { origin: string; title: string }) {
  const faces = new Map<string, string>();
  const lines: string[] = [];
  const add = (r: TokenRule, decls: string[]) => {
    if (!decls.length) return;
    if (r.usage) lines.push(`  ${comment(r.usage)}`);
    lines.push(...decls.map((d) => `  ${d}`));
  };

  for (const r of rules) {
    const name = `--${kebab(r.key)}`;
    const font = setIn(r, rules);
    const via = font ? [`${name}-font-family: var(--${kebab(font.key)}-font-family);`] : [];
    if (font && fontValue(font.value).weight) via.push(`${name}-font-weight: var(--${kebab(font.key)}-font-weight);`);

    if (r.type === "color" || r.type === "number") add(r, [`${name}: ${r.value};`]);
    else if (isScale(r)) add(r, [...(r.value as number[]).map((n, i) => `${name}-${i + 1}: ${n}px;`), ...via]);
    else if (r.type === "font") {
      const { family, size, weight } = fontValue(r.value);
      add(r, [
        `${name}-font-family: ${str(family)};`,
        ...(size ? [`${name}-font-size: ${size}px;`] : []),
        ...(weight ? [`${name}-font-weight: ${weight};`] : []),
      ]);
      for (const a of fontFiles(r)) {
        const { weight: w, italic } = fontStyle(a.filename ?? "");
        const format = FORMAT[a.mime!];
        faces.set(
          a.id,
          [
            "@font-face {",
            `  font-family: ${str(family)};`,
            `  src: url(${str(fileUrl(a, origin))})${format ? ` format(${str(format)})` : ""};`,
            `  font-weight: ${w};`,
            `  font-style: ${italic ? "italic" : "normal"};`,
            "  font-display: swap;",
            "}",
          ].join("\n"),
        );
      }
    } else add(r, via);
  }

  return [comment(title), ...faces.values(), ":root {", ...lines, "}", ""].join("\n");
}

// ---- DTCG ------------------------------------------------------------------

type Node = { [k: string]: unknown };

/** #rrggbb[aa] as a DTCG 2025.10 color: sRGB components 0 to 1, with the hex kept for tools that want it. */
function color(hex: string) {
  const alpha = hex.length === 9 ? parseInt(hex.slice(7), 16) / 255 : 1;
  return {
    colorSpace: "srgb",
    components: rgb(hex).map((c) => Math.round((c / 255) * 10000) / 10000),
    ...(alpha < 1 ? { alpha: Math.round(alpha * 10000) / 10000 } : {}),
    hex: hex.slice(0, 7),
  };
}

export function toDtcg(rules: TokenRule[], { origin }: { origin: string }) {
  const root: Node = {};
  // ponytail: a key that is both a token and another key's prefix (color.primary
  // and color.primary.dark) nests the second inside the first, which DTCG
  // readers reject. Rename one of the rules if it comes up.
  const at = (key: string) => key.split(".").reduce<Node>((g, p) => (g[p] ??= {}) as Node, root);
  const described = (r: TokenRule) => (r.usage ? { $description: r.usage } : {});

  for (const r of rules) {
    const font = setIn(r, rules);
    const via = font
      ? {
          fontFamily: { $type: "fontFamily", $value: `{${font.key}.fontFamily}` },
          ...(fontValue(font.value).weight ? { fontWeight: { $type: "fontWeight", $value: `{${font.key}.fontWeight}` } } : {}),
        }
      : {};

    if (r.type === "color") Object.assign(at(r.key), { $type: "color", $value: color(r.value as string), ...described(r) });
    else if (r.type === "number") Object.assign(at(r.key), { $type: "number", $value: r.value, ...described(r) });
    else if (isScale(r)) {
      const steps = Object.fromEntries(
        (r.value as number[]).map((n, i) => [String(i + 1), { $type: "dimension", $value: { value: n, unit: "px" } }]),
      );
      Object.assign(at(r.key), steps, via, described(r));
    } else if (r.type === "font") {
      const { family, size, weight } = fontValue(r.value);
      const files = fontFiles(r).map((a) => {
        const s = fontStyle(a.filename ?? "");
        return { url: fileUrl(a, origin), weight: s.weight, style: s.italic ? "italic" : "normal", mime: a.mime };
      });
      Object.assign(at(r.key), {
        fontFamily: { $type: "fontFamily", $value: family },
        ...(size ? { fontSize: { $type: "dimension", $value: { value: size, unit: "px" } } } : {}),
        ...(weight ? { fontWeight: { $type: "fontWeight", $value: weight } } : {}),
        ...described(r),
        ...(files.length ? { $extensions: { "com.artbucket": { files } } } : {}),
      });
    } else if (font) Object.assign(at(r.key), via, described(r));
  }
  return root;
}
