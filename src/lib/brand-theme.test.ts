import assert from "node:assert/strict";
import { test } from "node:test";
import {
  brandTheme,
  checkWarnings,
  colorsOf,
  deriveTheme,
  fontFaceCss,
  fontRoles,
  renameThemeKey,
  sectionGround,
  stack,
  type Theme,
  ThemeSettings,
  themeVars,
} from "./brand-theme.ts";
import { contrast, luminance, mix, rgb } from "./color.ts";
import { FIXTURES } from "./fixtures/brand-book.ts";
import { TONES } from "./pages.ts";
import { RuleInput, type Rule } from "./rules.ts";

let n = 0;
const r = (key: string, type: Rule["type"], value: Rule["value"], extra: Partial<Rule> = {}) =>
  ({ key, type, value, context: null, assets: [], id: String(++n), usage: null, ...extra }) as Rule;

test("the accent is the primary, lifted to read on both app backgrounds", () => {
  const t = brandTheme([r("color.background", "color", "#ffffff"), r("color.primary", "color", "#ffd400")]);
  assert.ok(t.accent);
  assert.ok(contrast(t.accent.light, "#ffffff") >= 3, "yellow is lifted on white");
  assert.ok(contrast(t.accent.dark, "#111111") >= 3);
  // Already readable on dark: left as it is.
  assert.equal(t.accent.dark, "#ffd400");
});

test("without a primary, brand, then accent, then the first color", () => {
  assert.equal(brandTheme([r("color.ink", "color", "#101010"), r("color.accent", "color", "#e87d0d")]).accent?.dark, "#e87d0d");
  assert.equal(brandTheme([r("color.sky", "color", "#3b82f6")]).accent?.dark, "#3b82f6");
  assert.equal(brandTheme([r("color.sky", "color", "not a color")]).accent, undefined);
});

test("faces: a heading rule for headings, a body rule for text, one face for both otherwise", () => {
  const two = brandTheme([
    r("type.primary", "font", { family: "Inter", weight: 400 }),
    r("type.heading", "font", { family: "Space Grotesk", weight: 700 }),
  ]);
  assert.deepEqual(two.head, { family: "Space Grotesk", weight: 700 });
  assert.deepEqual(two.body, { family: "Inter", weight: 400 });
  const one = brandTheme([r("type.face", "font", "Inter")]);
  assert.deepEqual(one.head, { family: "Inter" });
  assert.deepEqual(one.body, one.head);
  assert.deepEqual(brandTheme([]), {});
});

test("a face carries its font file, not its other assets", () => {
  const t = brandTheme([
    r("type.heading", "font", "Brand Sans", {
      assets: [
        { id: "img", rendition: null, mime: "image/png", filename: "specimen.png" },
        { id: "woff", rendition: null, mime: "font/woff2", filename: "BrandSans-Bold.woff2" },
      ],
    }),
  ]);
  assert.equal(t.head?.file, "woff");
});

test("a face's file is the one for its weight, not the first listed", () => {
  const font = (id: string, filename: string) => ({ id, rendition: null, mime: "font/ttf", filename });
  const assets = [font("thin", "Inter-Thin.ttf"), font("italic", "Inter-Italic.ttf"), font("regular", "Inter-Regular.ttf"), font("bold", "Inter-Bold.ttf")];
  assert.equal(brandTheme([r("type.body", "font", "Inter", { assets })]).body?.file, "regular");
  assert.equal(brandTheme([r("type.body", "font", { family: "Inter", weight: 700 }, { assets })]).body?.file, "bold");
});

test("context variants don't change the page's look", () => {
  const t = brandTheme([r("color.primary", "color", "#e87d0d"), r("color.primary", "color", "#000000", { context: "print" })]);
  assert.equal(t.accent?.dark, "#e87d0d");
});

test("the stack falls back to the name, then the app's face", () => {
  assert.equal(stack({ family: "Inter" }, "ab-font-1"), `"ab-font-1", "Inter", var(--font-sans), sans-serif`);
  assert.equal(stack({ family: "Inter" }, null), `"Inter", var(--font-sans), sans-serif`);
});

test("theme settings are strict, and name rules by key", () => {
  const ok = { accent: "color.primary", head: null, device: "7f1c3c3e-4c3a-4d8e-9a8b-2f3f4a5b6c7d", radius: 8, width: "wide", scale: 1.333, band: true };
  assert.deepEqual(ThemeSettings.parse(ok), ok);
  assert.deepEqual(ThemeSettings.parse({}), {});
  assert.ok(!ThemeSettings.safeParse({ acent: "color.primary" }).success, "a misspelled setting is refused");
  assert.ok(!ThemeSettings.safeParse({ accent: "Color Primary" }).success);
  assert.ok(!ThemeSettings.safeParse({ radius: 41 }).success);
  assert.ok(!ThemeSettings.safeParse({ device: "logo.svg" }).success);
});

test("W5 settings: on this page is side when left out; languages are tags, each once, the first the pages' own", () => {
  assert.equal(deriveTheme([]).toc, "side");
  assert.equal(deriveTheme([], { toc: "inline" }).toc, "inline");
  assert.ok(!ThemeSettings.safeParse({ toc: "top" }).success);
  const languages = [{ code: "en", label: "English" }, { code: "ar", label: "Arabic", dir: "rtl" }];
  assert.deepEqual(ThemeSettings.parse({ languages }).languages, languages);
  assert.ok(!ThemeSettings.safeParse({ languages: [...languages, { code: "en", label: "Again" }] }).success);
  assert.ok(!ThemeSettings.safeParse({ languages: [{ code: "EN", label: "English" }] }).success);
  assert.ok(!ThemeSettings.safeParse({ languages: [{ code: "en", label: "" }] }).success);
});

test("fontRoles: the setting, then the role, then the name, then the first font", () => {
  const spec = (role: string) => ({ spec: { role } }) as Partial<Rule>;
  const rules = [
    r("type.heading", "font", "Named Head"),
    r("type.body", "font", "Named Body"),
    r("type.feature", "font", "Role Head", spec("headline")),
    r("type.reading", "font", "Role Body", spec("body")),
    r("type.eyebrow", "font", "Role Label", spec("label")),
    r("type.picked", "font", "Picked"),
    r("color.head", "color", "#000000"),
  ];
  const family = (x: { head?: Rule; body?: Rule; label?: Rule }) =>
    [x.head, x.body, x.label].map((f) => f && (f.value as string));
  assert.deepEqual(family(fontRoles(rules, { head: "type.picked", body: "type.picked", label: "type.picked" })), ["Picked", "Picked", "Picked"]);
  assert.deepEqual(family(fontRoles(rules)), ["Role Head", "Role Body", "Role Label"]);
  const unroled = rules.map((x) => ({ ...x, spec: null }));
  assert.deepEqual(family(fontRoles(unroled)), ["Named Head", "Named Body", undefined], "no label without a setting or a role");
  assert.deepEqual(family(fontRoles(unroled.slice(5))), ["Picked", "Picked", undefined], "the first font, for both");
  // A setting naming a deleted rule, or a color, falls back as if unset.
  assert.deepEqual(family(fontRoles(rules, { head: "type.gone", body: "color.head" })), ["Role Head", "Role Body", "Role Label"]);
});

test("the page's faces: a role beats a name, and text is the first font when nothing names it", () => {
  const t = brandTheme([r("type.heading", "font", "Inter"), r("type.serif", "font", "Canela", { spec: { role: "display" } } as Partial<Rule>)]);
  assert.equal(t.head?.family, "Canela");
  assert.equal(t.body?.family, "Inter");
  const named = brandTheme([r("type.sans", "font", "Inter"), r("type.heading", "font", "Space Grotesk")]);
  assert.deepEqual([named.head?.family, named.body?.family], ["Space Grotesk", "Inter"]);
});

test("renameThemeKey renames every slot naming the rule, and says when none does", () => {
  const s: ThemeSettings = { accent: "color.brand", surface: "color.brand", head: "type.a", width: "normal", logo: "logo.main" };
  assert.deepEqual(renameThemeKey(s, "color.brand", "color.primary"), { ...s, accent: "color.primary", surface: "color.primary" });
  assert.deepEqual(renameThemeKey(s, "logo.main", "logo.primary"), { ...s, logo: "logo.primary" });
  assert.equal(renameThemeKey(s, "color.other", "color.x"), null);
  assert.equal(renameThemeKey({ width: "normal" }, "normal", "wide"), null, "enum values are not keys");
});

test("colorsOf: one color per key, the first variant, valid hex only", () => {
  const rules = [
    r("color.primary", "color", "#6d4aff"),
    r("type.body", "font", { family: "Inter" }),
    r("color.primary", "color", "#ffffff", { context: "dark-background" }),
    r("color.bad", "color", "blue"),
    r("color.ink", "color", "#10101080"),
  ];
  assert.deepEqual(colorsOf(rules).map((x) => x.value), ["#6d4aff", "#10101080"]);
});

// ---- theme v2 ----------------------------------------------------------------

/** A fixture's rules as the page has them, and its settings. */
function book(name: string) {
  const b = FIXTURES[name]();
  const rules = b.rules.map((x) => ({ context: null, assets: [], ...RuleInput.parse(x) }) as Rule);
  return { rules, settings: b.theme, colorOf: (k: string) => rules.find((x) => x.key === k && x.context === null) };
}

/** Themes to hold the guardrails to: every fixture, one on a dark surface, one with no surface, one with no colors. */
function themes(): [string, Theme, (k: string) => Rule | undefined][] {
  const made = ["blender", "ugly", "hairline"].map((n): [string, Theme, (k: string) => Rule | undefined] => {
    const b = book(n);
    return [n, deriveTheme(b.rules, b.settings), b.colorOf];
  });
  const night = [r("color.background", "color", "#0b0b14"), r("color.primary", "color", "#1f3fff"), r("color.ink", "color", "#303040")];
  const bare = [r("color.primary", "color", "#ffd400"), r("color.secondary", "color", "#9aa0a6")];
  const find = (rs: Rule[]) => (k: string) => rs.find((x) => x.key === k);
  return [...made, ["night", deriveTheme(night), find(night)], ["bare", deriveTheme(bare), find(bare)], ["empty", deriveTheme([]), find([])]];
}

test("deriveTheme reads each part from the rules by name, and a setting wins", () => {
  const rules = [
    r("color.primary", "color", "#e87d0d"),
    r("color.brand", "color", "#265787"),
    r("color.paper", "color", "#fdfcf8"),
    r("color.text", "color", "#222222"),
    r("color.alt", "color", "#eeeeee"),
    r("color.navy", "color", "#0b1a33"),
    r("color.coal", "color", "#050505"),
    r("color.paper", "color", "#000000", { context: "print" }),
    r("logo.wordmark", "text", "The logo", { assets: [{ id: "w", rendition: null }] }),
    r("logo.mark", "text", "The mark", { assets: [{ id: "m", rendition: null }] }),
  ];
  const t = deriveTheme(rules);
  assert.deepEqual(
    [t.accent, t.surface, t.ink, t.panel, t.dark, t.logo?.key],
    ["#e87d0d", "#fdfcf8", "#222222", "#eeeeee", "#0b1a33", "logo.mark"],
    "a dark named dark, night, navy or black before the darkest; the mark before the wordmark",
  );
  assert.deepEqual(
    [t.radius, t.width, t.density, t.scale, t.nav, t.band, t.numbering, t.motion, t.accentUse, t.device],
    [10, "normal", "normal", 1.25, "sidebar", false, false, "none", "fill", null],
  );
  const s = deriveTheme(rules, { accent: "color.brand", surface: "color.gone", dark: "color.coal", logo: "logo.wordmark", radius: 0, band: true });
  assert.deepEqual([s.accent, s.surface, s.dark, s.logo?.key, s.radius, s.band], ["#265787", "#fdfcf8", "#050505", "logo.wordmark", 0, true]);

  // Nothing named: no surface (the app's), ink by contrast on white, panel a step off it, dark the darkest under 0.2 or #111111.
  const few = deriveTheme([r("color.sky", "color", "#7dd3fc"), r("color.deep", "color", "#10243e")]);
  assert.deepEqual([few.accent, few.surface, few.ink, few.dark, few.logo], ["#7dd3fc", null, "#000000", "#10243e", null]);
  assert.ok(contrast(few.panel, "#ffffff") < 1.2 && few.panel !== "#ffffff");
  assert.equal(deriveTheme([r("color.sky", "color", "#7dd3fc")]).dark, "#111111");
  assert.equal(deriveTheme([]).accent, "#6d4aff", "no colors: the app's accent");
  assert.deepEqual(deriveTheme(rules).v1, brandTheme(rules), "v1 is today's theme");
});

test("every checks row meets its need, or names the fallback that does", () => {
  for (const [name, t] of themes()) {
    assert.ok(t.checks.length >= 7, name);
    for (const c of t.checks) {
      const at = `${name}: ${c.pair}`;
      assert.ok(Math.abs(contrast(c.fg, c.bg) - c.ratio) < 0.01, at);
      if (c.ok) assert.ok(c.ratio >= c.need && c.used === c.fg, at);
      else assert.ok(c.used !== c.fg && contrast(c.used, c.bg) >= c.need, `${at}: ${c.used} on ${c.bg}`);
    }
    // What the page uses is what the rows say it uses.
    const used = (pair: string) => t.checks.find((c) => c.pair === pair)?.used;
    assert.deepEqual([t.ink, t.muted, t.accentText, t.onAccent, t.onDark], ["ink on surface", "muted on surface", "accent text on surface", "text on accent", "text on dark"].map(used), name);
  }
});

test("ugly warns, and every pair it uses passes", () => {
  const { rules, settings } = book("ugly");
  const t = deriveTheme(rules, settings);
  assert.equal(t.surface, "#fbfaf4");
  assert.equal(t.ink, "#000000", "no ink: black on the near-white");
  assert.equal(t.faces.body?.family, "Bungee", "the display face, as set, over the text face's role");
  const warned = checkWarnings(t.checks);
  for (const pair of ["accent text on surface", "accent on surface", "text on accent"]) assert.ok(warned.some((w) => w.startsWith(`${pair}: `)), pair);
  assert.match(warned[0], /^accent text on surface: #ffd400 on #fbfaf4 is 1\.\d+:1, under 4\.5:1; #[0-9a-f]{6} is used$/);
  assert.ok(contrast(t.accentText, t.surface!) >= 4.5 && contrast(t.onAccent, t.accent) >= 4.5);
  assert.equal(t.accent, "#ffd400", "the fill stays the brand's yellow; its text turns black");
  assert.equal(t.onAccent, "#000000");
  assert.deepEqual(t.checks.filter((c) => c.ok).map((c) => c.pair), ["ink on surface", "muted on surface", "ink on panel", "text on dark"]);
});

test("with no stated pair, text on a fill starts from the page color that reads there: no warning the brand didn't earn", () => {
  const night = [r("color.background", "color", "#0b0b14"), r("color.primary", "color", "#1f3fff"), r("color.ink", "color", "#f0f0f0")];
  const t = deriveTheme(night);
  assert.deepEqual(checkWarnings(t.checks).filter((w) => w.startsWith("text on")), [], "blue links on near black do fail, and say so");
  assert.deepEqual([t.dark, t.onDark, t.onAccent], ["#0b0b14", "#f0f0f0", "#f0f0f0"]);
  // Stated and failing: warned, and set right.
  const paired = deriveTheme([r("color.primary", "color", "#ffd400", { spec: { pair: "color.paper" } } as Partial<Rule>), r("color.paper", "color", "#ffffff")]);
  assert.deepEqual(checkWarnings(paired.checks).filter((w) => w.startsWith("text on")), ["text on accent: #ffffff on #ffd400 is 1.43:1, under 4.5:1; #000000 is used"]);
});

test("every ground meets 4.5 for text and 3 for marks, and is dark when its text is light", () => {
  for (const [name, t, colorOf] of themes()) {
    const sections: Parameters<typeof sectionGround>[1][] = [
      ...TONES.map((tone) => ({ tone })),
      { tone: "color", background: { color: "color.secondary" } },
      { tone: "color", background: { color: "color.gone" } },
      { tone: "image", background: { image: "x", scrim: 0 } },
    ];
    for (const s of sections) {
      const g = sectionGround(t, s, colorOf);
      const at = `${name} ${s.tone} ${JSON.stringify(s.background ?? "")}`;
      if (s.tone === "plain") {
        assert.deepEqual(g, { background: null, dark: false, vars: {}, checks: [] });
        continue;
      }
      for (const c of g.checks) assert.ok(contrast(c.used, c.bg) >= c.need, `${at} ${c.pair}`);
      // With no surface, a tint or a panel follows the app: its own test below.
      if (g.dark === null) continue;
      const v = g.vars;
      const bg = v["--background"];
      for (const k of ["--brand-ink", "--brand-muted", "--brand-accent-text", "--muted-foreground"]) assert.ok(contrast(v[k], bg) >= 4.5, `${at} ${k}`);
      assert.ok(contrast(v["--brand-accent"], bg) >= 3 && contrast(v["--ring"], bg) >= 3, at);
      assert.ok(contrast(v["--primary-foreground"], v["--primary"]) >= 4.5, `${at} buttons`);
      assert.equal(g.dark, luminance(rgb(v["--brand-ink"])) > luminance(rgb(bg)), at);
      assert.ok(contrast(v["--brand-ink"], g.background!) >= 4.5, `${at} on what shows before an image loads`);
      for (const c of g.checks) assert.ok(contrast(c.used, c.bg) >= c.need, `${at} ${c.pair}`);
    }
  }
});

test("grounds: tones take the theme's colors, a pair when it reads, and a hairline never fills", () => {
  const { rules, settings, colorOf } = book("blender");
  const t = deriveTheme(rules, settings);
  const g = (s: Parameters<typeof sectionGround>[1], th = t) => sectionGround(th, s, colorOf);
  assert.equal(g({ tone: "brand" }).background, t.accent);
  assert.equal(g({ tone: "brand" }).vars["--brand-ink"], t.onAccent);
  assert.equal(g({ tone: "brand" }).vars["--primary"], t.onAccent, "on its own color, a button is the ink");
  assert.equal(g({ tone: "panel" }).vars["--primary"], t.accent);
  assert.deepEqual([g({ tone: "dark" }).background, g({ tone: "dark" }).dark, g({ tone: "dark" }).vars["--brand-ink"]], ["#1d1d1d", true, "#ffffff"]);
  assert.equal(g({ tone: "pattern" }).background, t.panel);
  assert.equal(g({ tone: "tint" }).background, "#fdf5ec", "8% of the accent on the surface");
  // Blender blue pairs with white, which reads on it.
  const blue = g({ tone: "color", background: { color: "color.secondary" } });
  assert.deepEqual([blue.background, blue.vars["--brand-ink"], blue.dark], ["#265787", "#ffffff", true]);
  assert.deepEqual(g({ tone: "color", background: { color: "color.gone" } }).background, t.accent, "a gone color: the brand ground");
  assert.equal(g({ tone: "image", background: { image: "x", scrim: 0.8 } }).scrim, 0.8);
  assert.equal(g({ tone: "image", background: { image: "x" } }).scrim, 0.54, "raised until white reads on any picture");

  const h = deriveTheme(rules, { ...settings, accentUse: "hairline" });
  const band = g({ tone: "brand" }, h);
  assert.equal(band.background, h.panel);
  assert.ok(band.rule && contrast(band.rule, h.panel) >= 3);
  assert.equal(g({ tone: "panel" }, h).vars["--primary"], h.ink, "hairline: buttons in the ink");
  assert.equal(themeVars(h, String)["--primary"], h.ink);
});

test("with no surface, tint and panel follow the app's light or dark, with the accent graded on each", () => {
  const rules = [r("color.primary", "color", "#ffd400")];
  const t = deriveTheme(rules);
  const g = (tone: Parameters<typeof sectionGround>[1]["tone"]) => sectionGround(t, { tone }, () => undefined);
  const tint = g("tint");
  assert.equal(tint.background, "color-mix(in srgb, #ffd400 8%, var(--background))", "the accent itself, not the var it re-sets");
  assert.equal(tint.dark, null, "no scheme class: the app's holds");
  assert.equal(tint.vars["--brand-ink"], undefined, "the app's ink");
  assert.ok(contrast(tint.vars["--brand-accent-text-l"], mix("#ffffff", "#ffd400", 0.08)) >= 4.5);
  assert.ok(contrast(tint.vars["--brand-accent-l"], mix("#ffffff", "#ffd400", 0.08)) >= 3);
  assert.ok(contrast(tint.vars["--brand-accent-text-d"], mix("#111111", "#ffd400", 0.08)) >= 4.5);
  for (const tone of ["panel", "pattern"] as const) {
    assert.equal(g(tone).background, "color-mix(in srgb, var(--foreground) 4%, var(--background))");
    assert.equal(g(tone).dark, null);
  }
  const band = sectionGround(deriveTheme(rules, { accentUse: "hairline" }), { tone: "brand" }, () => undefined);
  assert.deepEqual([band.background, band.rule], [g("panel").background, "var(--brand-accent)"]);
  // A surface keeps the computed ground and its checks.
  const paper = deriveTheme([...rules, r("color.paper", "color", "#fbfaf4")]);
  assert.equal(sectionGround(paper, { tone: "tint" }, () => undefined).background, mix("#fbfaf4", "#ffd400", 0.08));
});

test("themeVars: the brand's surface sets the app's tokens; with none the page stays the app's", () => {
  const { rules, settings } = book("blender");
  const t = deriveTheme(rules, { ...settings, width: "wide", density: "airy", radius: 4 });
  const v = themeVars(t, (id) => `/a/${id}?sig=1`);
  assert.deepEqual(
    [v["--background"], v["--foreground"], v["--brand-surface"], v["--brand-ink"], v["--primary"], v["--radius"], v["--brand-radius"]],
    ["#ffffff", "#1d1d1d", "#ffffff", "#1d1d1d", "#e87d0d", "4px", "4px"],
  );
  assert.deepEqual([v["--brand-measure"], v["--brand-gap"], v["--brand-h1"], v["--brand-h3"]], ["76ch", "2.5rem", "3.052rem", "1.25rem"]);
  assert.equal(v["--brand-device"], `url("/a/${settings.device}?sig=1")`);
  assert.equal(v["--brand-accent-l"], v["--brand-accent"], "LOOK's light and dark pick the same accent");
  assert.deepEqual([v["--brand-label-case"], v["--brand-label-tracking"]], ["uppercase", "0.08em"]);

  const bare = themeVars(deriveTheme([r("color.primary", "color", "#ffd400")]), String);
  assert.equal(bare["--background"], undefined);
  assert.equal(bare["--brand-ink"], "var(--foreground)");
  assert.equal(bare["--brand-device"], "none");
  assert.ok(contrast(bare["--brand-accent-text-l"], "#ffffff") >= 4.5 && contrast(bare["--brand-accent-text-d"], "#111111") >= 4.5);
  assert.deepEqual([bare["--brand-accent-l"], bare["--brand-accent-d"]], [brandTheme([r("color.primary", "color", "#ffd400")]).accent!.light, "#ffd400"]);
});

test("fontFaceCss: one @font-face per file, with its weight and style, under the brand's own name", () => {
  const f = (id: string, filename: string) => ({ id, rendition: null, mime: "font/woff2", filename });
  const rules = [
    r("type.heading", "font", { family: "IBM Plex Sans", weight: 700 }, { assets: [f("b", "IBMPlexSans-Bold.woff2"), f("bi", "IBMPlexSans-BoldItalic.woff2")] }),
    r("type.body", "font", "Source Serif", {
      assets: [f("r", "SourceSerif-Regular.woff2"), f("i", "SourceSerif-Italic.woff2"), f("r", "SourceSerif-Regular.woff2")],
      spec: { fallback: "Georgia, serif; } body { color: red" },
    } as Partial<Rule>),
    r("type.eyebrow", "font", "Space Mono", { spec: { role: "label", source: "google", case: "small-caps", tracking: [[24, 0.02], [11, 0.12]] } } as Partial<Rule>),
  ];
  const t = deriveTheme(rules);
  const css = fontFaceCss(t.faces, (id) => `/a/${id}`);
  assert.equal(css.match(/@font-face/g)?.length, 4, "one per file, the repeated one once");
  assert.equal(css.match(/@import/g)?.length, 1);
  assert.ok(css.startsWith('@import url("https://fonts.googleapis.com/css2?family=Space+Mono:'), "an @import comes first");
  for (const line of [
    'font-family: "b-ibm-plex-sans";\n  src: url("/a/bi") format("woff2");\n  font-weight: 700;\n  font-style: italic;',
    'font-family: "b-source-serif";\n  src: url("/a/r") format("woff2");\n  font-weight: 400;\n  font-style: normal;',
    "font-display: swap;",
  ])
    assert.ok(css.includes(line), `missing: ${line}\n${css}`);

  const v = themeVars(t, String);
  assert.equal(v["--brand-head"], '"b-ibm-plex-sans", "IBM Plex Sans", var(--font-sans), sans-serif');
  assert.equal(v["--brand-body"], '"b-source-serif", "Source Serif", Georgia, serif  body  color red, var(--font-sans), sans-serif', "a fallback can't end the declaration");
  assert.equal(v["--brand-label"], '"Space Mono", var(--font-sans), sans-serif');
  assert.deepEqual([t.faces.label?.case, t.faces.label?.tracking, v["--brand-label-tracking"]], ["small-caps", 0.12, "0.12em"], "labels are small: the smallest size's tracking");
  assert.equal(fontFaceCss({}, String), "");
});
