import { inkOn, rgb } from "./color.ts";
import { fontStyle, isFont } from "./font.ts";
import { fontValue, listStyle, type Rule, type RuleAsset } from "./rules.ts";

/**
 * Brand rules as design tokens, for code: plain stylesheets (CSS custom
 * properties, Sass, Less), framework themes (Tailwind 4 and 3, a TypeScript
 * module), design-system themes (shadcn/ui, MUI, Chakra UI), and W3C Design
 * Tokens (DTCG 2025.10) JSON for Style Dictionary, Tokens Studio and Figma
 * importers. Colors, numbers, fonts (family, size, weight, and their files as
 * @font-face) and a type scale become tokens; a rule set in one of the
 * brand's fonts (see SetIn) aliases that font. Sentences and do/don't lists
 * are guidance, not values, and stay out.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

export type TokenRule = Pick<Rule, "key" | "type" | "value" | "usage" | "assets">;
type Opts = { origin: string; title: string };

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

/** A key within a theme namespace: `color.brandDark` among colors is `brand-dark`; `logo.tile` keeps its section. */
const local = (key: string, home: string) => kebab(key.startsWith(`${home}.`) ? key.slice(home.length + 1) : key);
/** The same, as a JS property: `brandDark`, `logoTile`. */
const localCamel = (key: string, home: string) =>
  (key.startsWith(`${home}.`) ? key.slice(home.length + 1) : key)
    .split(".")
    .map((p, i) => (i ? p[0].toUpperCase() + p.slice(1) : p))
    .join("");

/** A comment can't be closed from inside. */
const comment = (s: string) => `/* ${s.replace(/\*\//g, "* /").replace(/\s+/g, " ")} */`;
const str = (s: string) => JSON.stringify(s);
/** An object literal as JS: JSON with bare keys where a key can go bare. */
const js = (o: unknown) => JSON.stringify(o, null, 2).replace(/^(\s*)"([A-Za-z_$][\w$]*)":/gm, "$1$2:");

const fonts = (rules: TokenRule[]) => rules.filter((r) => r.type === "font");
const last = (key: string) => key.split(".").pop()!;
/** The brand's body and heading faces, by name where they say so; the first font otherwise. */
function roles(rules: TokenRule[]) {
  const fs = fonts(rules);
  const body = fs.find((f) => /body|text|base|sans|copy|regular/i.test(last(f.key))) ?? fs[0];
  const heading = fs.find((f) => f !== body && /head|display|title/i.test(last(f.key)));
  const mono = fs.find((f) => /mono|code/i.test(last(f.key)));
  return { body, heading, mono };
}

// ---- stylesheets: CSS, Sass, Less ----------------------------------------------

/** One @font-face per font file, however many rules carry it. */
function fontFaces(rules: TokenRule[], origin: string) {
  const faces = new Map<string, string>();
  for (const r of fonts(rules)) {
    const { family } = fontValue(r.value);
    for (const a of fontFiles(r)) {
      const { weight, italic } = fontStyle(a.filename ?? "");
      const format = FORMAT[a.mime!];
      faces.set(
        a.id,
        [
          "@font-face {",
          `  font-family: ${str(family)};`,
          `  src: url(${str(fileUrl(a, origin))})${format ? ` format(${str(format)})` : ""};`,
          `  font-weight: ${weight};`,
          `  font-style: ${italic ? "italic" : "normal"};`,
          "  font-display: swap;",
          "}",
        ].join("\n"),
      );
    }
  }
  return [...faces.values()];
}

type Decl = [name: string, value: string | { ref: string }];

/** Every rule as flat, kebab-named variables, each group under its usage: what the stylesheet formats share. */
function declarations(rules: TokenRule[]) {
  const blocks: { usage: string | null; decls: Decl[] }[] = [];
  for (const r of rules) {
    const name = kebab(r.key);
    const font = setIn(r, rules);
    const via: Decl[] = font ? [[`${name}-font-family`, { ref: `${kebab(font.key)}-font-family` }]] : [];
    if (font && fontValue(font.value).weight) via.push([`${name}-font-weight`, { ref: `${kebab(font.key)}-font-weight` }]);

    let decls: Decl[] = via;
    if (r.type === "color" || r.type === "number") decls = [[name, String(r.value)]];
    else if (isScale(r)) decls = [...(r.value as number[]).map((n, i): Decl => [`${name}-${i + 1}`, `${n}px`]), ...via];
    else if (r.type === "font") {
      const { family, size, weight } = fontValue(r.value);
      decls = [[`${name}-font-family`, str(family)]];
      if (size) decls.push([`${name}-font-size`, `${size}px`]);
      if (weight) decls.push([`${name}-font-weight`, String(weight)]);
    }
    if (decls.length) blocks.push({ usage: r.usage, decls });
  }
  return blocks;
}

/** Declarations in one stylesheet syntax: `--x` and `var(--y)`, `$x` and `$y`, `@x` and `@y`. */
function variables(rules: TokenRule[], sigil: string, ref: (name: string) => string, indent = "") {
  return declarations(rules).flatMap(({ usage, decls }) => [
    ...(usage ? [indent + comment(usage)] : []),
    ...decls.map(([n, v]) => `${indent}${sigil}${n}: ${typeof v === "string" ? v : ref(v.ref)};`),
  ]);
}

export function toCss(rules: TokenRule[], { origin, title }: Opts) {
  return [comment(title), ...fontFaces(rules, origin), ":root {", ...variables(rules, "--", (n) => `var(--${n})`, "  "), "}", ""].join("\n");
}

export const toScss = (rules: TokenRule[], { origin, title }: Opts) =>
  [comment(title), ...fontFaces(rules, origin), ...variables(rules, "$", (n) => `$${n}`), ""].join("\n");

export const toLess = (rules: TokenRule[], { origin, title }: Opts) =>
  [comment(title), ...fontFaces(rules, origin), ...variables(rules, "@", (n) => `@${n}`), ""].join("\n");

// ---- frameworks ------------------------------------------------------------------

/**
 * Tailwind CSS 4: an @theme in its namespaces, so the brand is utilities:
 * `--color-primary` is `bg-primary`, `--font-headings` is `font-headings`,
 * `--text-scale-3` is `text-scale-3`. Numbers have no namespace and stay
 * plain variables.
 */
export function toTailwind(rules: TokenRule[], { origin, title }: Opts) {
  const theme: string[] = [];
  const root: string[] = [];
  for (const r of rules) {
    const note = r.usage ? [`  ${comment(r.usage)}`] : [];
    if (r.type === "color") theme.push(...note, `  --color-${local(r.key, "color")}: ${r.value};`);
    else if (r.type === "number") root.push(...note, `  --${kebab(r.key)}: ${r.value};`);
    else if (isScale(r)) theme.push(...note, ...(r.value as number[]).map((n, i) => `  --text-${local(r.key, "type")}-${i + 1}: ${n}px;`));
    else if (r.type === "font") {
      const { family, size, weight } = fontValue(r.value);
      const n = local(r.key, "type");
      theme.push(...note, `  --font-${n}: ${str(family)};`);
      if (size) theme.push(`  --text-${n}: ${size}px;`);
      if (weight) theme.push(`  --font-weight-${n}: ${weight};`);
    }
  }
  return [
    comment(title),
    comment('In your main stylesheet, after @import "tailwindcss";'),
    ...fontFaces(rules, origin),
    "@theme {",
    ...theme,
    "}",
    ...(root.length ? [":root {", ...root, "}"] : []),
    "",
  ].join("\n");
}

/** Tailwind CSS 3: `theme.extend` for tailwind.config.js. The font files load from the CSS export. */
export function toTailwind3(rules: TokenRule[], { title }: Opts) {
  const ext: Record<string, Record<string, unknown>> = { colors: {}, fontFamily: {}, fontSize: {}, fontWeight: {} };
  for (const r of rules) {
    if (r.type === "color") ext.colors[local(r.key, "color")] = r.value;
    else if (isScale(r)) (r.value as number[]).forEach((n, i) => (ext.fontSize[`${local(r.key, "type")}-${i + 1}`] = `${n}px`));
    else if (r.type === "font") {
      const { family, size, weight } = fontValue(r.value);
      const n = local(r.key, "type");
      ext.fontFamily[n] = [family];
      if (size) ext.fontSize[n] = `${size}px`;
      if (weight) ext.fontWeight[n] = String(weight);
    }
  }
  const extend = Object.fromEntries(Object.entries(ext).filter(([, v]) => Object.keys(v).length));
  return [
    `// ${title}`,
    "// The font files: link the CSS export, which has their @font-face.",
    "/** @type {import('tailwindcss').Config} */",
    `export default ${js({ theme: { extend } })};`,
    "",
  ].join("\n");
}

type Node = { [k: string]: unknown };
/** The object at a dotted key, made on the way. */
const at = (root: Node, key: string) => key.split(".").reduce<Node>((g, p) => (g[p] ??= {}) as Node, root);

/** A TypeScript module: the tokens as one typed object, for CSS-in-JS, React Native, or anything else in JS. */
export function toTs(rules: TokenRule[], { origin, title }: Opts) {
  const root: Node = {};
  const put = (key: string, v: unknown) => {
    const parts = key.split(".");
    at(root, parts.slice(0, -1).join("."))[parts.at(-1)!] = v;
  };
  for (const r of rules) {
    if (r.type === "color" || r.type === "number") put(r.key, r.value);
    else if (isScale(r)) put(r.key, (r.value as number[]).map((n) => `${n}px`));
    else if (r.type === "font") {
      const { family, size, weight } = fontValue(r.value);
      const files = fontFiles(r).map((a) => ({ url: fileUrl(a, origin), ...fontStyle(a.filename ?? "") }));
      put(r.key, {
        fontFamily: family,
        ...(size ? { fontSize: `${size}px` } : {}),
        ...(weight ? { fontWeight: weight } : {}),
        ...(files.length ? { files: files.map(({ url, weight: w, italic }) => ({ url, weight: w, style: italic ? "italic" : "normal" })) } : {}),
      });
    }
  }
  return [`// ${title}`, `export const tokens = ${js(root)} as const;`, "", "export type Tokens = typeof tokens;", ""].join("\n");
}

// ---- design systems ----------------------------------------------------------------

/** What shadcn/ui's globals.css names; a brand color by one of these names takes its place. */
const SHADCN = new Set([
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground", "primary", "primary-foreground",
  "secondary", "secondary-foreground", "muted", "muted-foreground", "accent", "accent-foreground", "destructive",
  "border", "input", "ring", "chart-1", "chart-2", "chart-3", "chart-4", "chart-5",
]);
/** Colors shadcn/ui sets text on: without a brand foreground, black or white, whichever reads. */
const PAIRED = ["card", "popover", "primary", "secondary", "muted", "accent"];

/**
 * shadcn/ui on Tailwind 4: its own variables where a brand color has their
 * name (`color.primary` is `--primary`), with a readable foreground made for
 * any it lacks; the brand's other colors and its fonts join them as utilities.
 */
export function toShadcn(rules: TokenRule[], { origin, title }: Opts) {
  const root: string[] = [];
  const inline: string[] = [];
  const named = new Map(rules.filter((r) => r.type === "color").map((r) => [local(r.key, "color"), r]));
  for (const [n, r] of named) {
    if (r.usage) root.push(`  ${comment(r.usage)}`);
    root.push(`  --${n}: ${r.value};`);
    if (!SHADCN.has(n)) inline.push(`  --color-${n}: var(--${n});`);
    if (PAIRED.includes(n) && !named.has(`${n}-foreground`)) root.push(`  --${n}-foreground: ${inkOn((r.value as string).slice(0, 7))};`);
  }
  const radius = rules.find((r) => r.type === "number" && last(r.key) === "radius");
  if (radius) root.push(`  --radius: ${radius.value}px;`);
  const { body, heading, mono } = roles(rules);
  for (const [n, f] of [["sans", body], ["heading", heading], ["mono", mono]] as const)
    if (f) inline.push(`  --font-${n}: ${str(fontValue(f.value).family)};`);
  return [
    comment(title),
    comment("Over the matching variables in globals.css; .dark keeps its own."),
    ...fontFaces(rules, origin),
    ":root {",
    ...root,
    "}",
    ...(inline.length ? ["@theme inline {", ...inline, "}"] : []),
    "",
  ].join("\n");
}

/** Material UI: a theme with the brand's colors in the palette and its faces in the typography. */
export function toMui(rules: TokenRule[], { title }: Opts) {
  const palette = Object.fromEntries(rules.filter((r) => r.type === "color").map((r) => [localCamel(r.key, "color"), { main: r.value }]));
  const { body, heading } = roles(rules);
  const face = (f: TokenRule) => `${str(fontValue(f.value).family)}, sans-serif`;
  const typography = {
    ...(body ? { fontFamily: face(body) } : {}),
    ...(heading
      ? Object.fromEntries(
          ["h1", "h2", "h3", "h4", "h5", "h6"].map((h) => [
            h,
            { fontFamily: face(heading), ...(fontValue(heading.value).weight ? { fontWeight: fontValue(heading.value).weight } : {}) },
          ]),
        )
      : {}),
  };
  return [
    `// ${title}`,
    'import { createTheme } from "@mui/material/styles";',
    "",
    "// Palette colors beyond primary, secondary, error, warning, info and success need a PaletteOptions augmentation in TypeScript.",
    "// The font files: link the CSS export, which has their @font-face.",
    `export const theme = createTheme(${js(Object.keys(typography).length ? { palette, typography } : { palette })});`,
    "",
  ].join("\n");
}

/** Chakra UI 3: the tokens as a system config, merged over Chakra's defaults. */
export function toChakra(rules: TokenRule[], { title }: Opts) {
  const tokens: Record<string, Record<string, { value: unknown }>> = { colors: {}, fonts: {}, fontSizes: {}, fontWeights: {} };
  for (const r of rules) {
    if (r.type === "color") tokens.colors[local(r.key, "color")] = { value: r.value };
    else if (isScale(r)) (r.value as number[]).forEach((n, i) => (tokens.fontSizes[`${local(r.key, "type")}-${i + 1}`] = { value: `${n}px` }));
    else if (r.type === "font") {
      const { family, size, weight } = fontValue(r.value);
      const n = local(r.key, "type");
      tokens.fonts[n] = { value: `${str(family)}, sans-serif` };
      if (size) tokens.fontSizes[n] = { value: `${size}px` };
      if (weight) tokens.fontWeights[n] = { value: String(weight) };
    }
  }
  const theme = { tokens: Object.fromEntries(Object.entries(tokens).filter(([, v]) => Object.keys(v).length)) };
  return [
    `// ${title}`,
    'import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";',
    "",
    "// The font files: link the CSS export, which has their @font-face.",
    `const config = defineConfig(${js({ theme })});`,
    "",
    "export const system = createSystem(defaultConfig, config);",
    "",
  ].join("\n");
}

// ---- DTCG ------------------------------------------------------------------

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
  const described = (r: TokenRule) => (r.usage ? { $description: r.usage } : {});

  for (const r of rules) {
    const font = setIn(r, rules);
    const via = font
      ? {
          fontFamily: { $type: "fontFamily", $value: `{${font.key}.fontFamily}` },
          ...(fontValue(font.value).weight ? { fontWeight: { $type: "fontWeight", $value: `{${font.key}.fontWeight}` } } : {}),
        }
      : {};

    if (r.type === "color") Object.assign(at(root, r.key), { $type: "color", $value: color(r.value as string), ...described(r) });
    else if (r.type === "number") Object.assign(at(root, r.key), { $type: "number", $value: r.value, ...described(r) });
    else if (isScale(r)) {
      const steps = Object.fromEntries(
        (r.value as number[]).map((n, i) => [String(i + 1), { $type: "dimension", $value: { value: n, unit: "px" } }]),
      );
      Object.assign(at(root, r.key), steps, via, described(r));
    } else if (r.type === "font") {
      const { family, size, weight } = fontValue(r.value);
      const files = fontFiles(r).map((a) => {
        const s = fontStyle(a.filename ?? "");
        return { url: fileUrl(a, origin), weight: s.weight, style: s.italic ? "italic" : "normal", mime: a.mime };
      });
      Object.assign(at(root, r.key), {
        fontFamily: { $type: "fontFamily", $value: family },
        ...(size ? { fontSize: { $type: "dimension", $value: { value: size, unit: "px" } } } : {}),
        ...(weight ? { fontWeight: { $type: "fontWeight", $value: weight } } : {}),
        ...described(r),
        ...(files.length ? { $extensions: { "com.artbucket": { files } } } : {}),
      });
    } else if (font) Object.assign(at(root, r.key), via, described(r));
  }
  return root;
}

// ---- formats -----------------------------------------------------------------

export type TokenFormat = {
  label: string;
  group: "Stylesheets" | "Frameworks" | "Design systems" | "Tools";
  mime: string;
  file: (name: string) => string;
  /** Where it goes, in a line. */
  hint: string;
  render: (rules: TokenRule[], opts: Opts) => string;
};

/** Every export, in the order the Tokens dialog lists them. `?format=` is the key. */
export const TOKEN_FORMATS = {
  css: {
    label: "CSS variables",
    group: "Stylesheets",
    mime: "text/css",
    file: (n) => `${n}.tokens.css`,
    hint: "Custom properties on :root, with @font-face for every font file. Link it, or import it first.",
    render: toCss,
  },
  scss: {
    label: "Sass",
    group: "Stylesheets",
    mime: "text/x-scss",
    file: (n) => `_${n}-tokens.scss`,
    hint: "Sass variables and @font-face. @use it where the brand is needed.",
    render: toScss,
  },
  less: {
    label: "Less",
    group: "Stylesheets",
    mime: "text/x-less",
    file: (n) => `${n}.tokens.less`,
    hint: "Less variables and @font-face. @import it where the brand is needed.",
    render: toLess,
  },
  tailwind: {
    label: "Tailwind CSS 4",
    group: "Frameworks",
    mime: "text/css",
    file: (n) => `${n}.theme.css`,
    hint: "An @theme: the brand as utilities, like bg-primary and font-headings. Import it after tailwindcss.",
    render: toTailwind,
  },
  tailwind3: {
    label: "Tailwind CSS 3",
    group: "Frameworks",
    mime: "text/javascript",
    file: (n) => `tailwind.${n}.js`,
    hint: "theme.extend for tailwind.config.js. Add it to presets, or spread it into your config.",
    render: toTailwind3,
  },
  ts: {
    label: "TypeScript",
    group: "Frameworks",
    mime: "text/plain",
    file: (n) => `${n}.tokens.ts`,
    hint: "One typed object, for styled-components, Emotion, vanilla-extract, React Native or plain JS.",
    render: toTs,
  },
  shadcn: {
    label: "shadcn/ui",
    group: "Design systems",
    mime: "text/css",
    file: (n) => `${n}.shadcn.css`,
    hint: "Brand colors named like shadcn's take their place, with readable foregrounds. Paste over globals.css.",
    render: toShadcn,
  },
  mui: {
    label: "Material UI",
    group: "Design systems",
    mime: "text/plain",
    file: (n) => `${n}.mui-theme.ts`,
    hint: "A createTheme with the palette and typography. Pass it to ThemeProvider.",
    render: toMui,
  },
  chakra: {
    label: "Chakra UI",
    group: "Design systems",
    mime: "text/plain",
    file: (n) => `${n}.chakra-system.ts`,
    hint: "A Chakra 3 system over the defaults. Pass it to ChakraProvider as value.",
    render: toChakra,
  },
  json: {
    label: "Design Tokens JSON",
    group: "Tools",
    mime: "application/json",
    file: (n) => `${n}.tokens.json`,
    hint: "W3C Design Tokens for Style Dictionary (iOS, Android, anything), Tokens Studio and Figma importers.",
    render: (rules, { origin }) => `${JSON.stringify(toDtcg(rules, { origin }), null, 2)}\n`,
  },
} satisfies Record<string, TokenFormat>;

export type TokenFormatId = keyof typeof TOKEN_FORMATS;
export const TOKEN_FORMAT_IDS = Object.keys(TOKEN_FORMATS) as [TokenFormatId, ...TokenFormatId[]];
