"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { fonts } from "../../src/app/fonts";
import { contrast, grade } from "../../src/lib/color";
import { cn } from "../../src/lib/utils";

/**
 * What the Foundations pages draw, read from the CSS at runtime (globals.css as the preview loads it), so the
 * docs never drift from the tokens: a new token in globals.css shows up here with no edit.
 */

/** The app's faces and ground, for a docs page (the preview's decorator only wraps stories). */
export function Frame({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn(fonts, "bg-background text-foreground font-sans antialiased", className)}>{children}</div>;
}

/** Every custom property the app's color rule declares (`:root, .app-tokens, .light` in globals.css), in its order. */
function tokenNames() {
  const names = new Set<string>();
  const walk = (rules: CSSRuleList) => {
    for (const r of rules) {
      if (r instanceof CSSStyleRule && r.selectorText.includes(".app-tokens"))
        for (const p of r.style) if (p.startsWith("--") && p !== "--radius") names.add(p);
      if ("cssRules" in r) walk((r as CSSGroupingRule).cssRules);
    }
  };
  for (const s of document.styleSheets) {
    try {
      walk(s.cssRules);
    } catch {
      // Another origin's sheet (a font) can't be read, and holds no tokens.
    }
  }
  return [...names];
}

let ctx: CanvasRenderingContext2D | null = null;
/** Any CSS color (oklch, color-mix, with alpha) as the "#rrggbb" it paints over `under`. */
function paint(color: string, under = "#ffffff") {
  ctx ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!ctx) return under;
  ctx.fillStyle = under;
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** A token's resolved color in the mode `el` is in, painted over that mode's background. */
function resolve(el: Element, name: string) {
  const probe = document.createElement("i");
  el.append(probe);
  probe.style.color = `var(${name})`;
  const color = getComputedStyle(probe).color;
  probe.style.color = "var(--background)";
  const bg = getComputedStyle(probe).color;
  probe.remove();
  return paint(color, paint(bg));
}

/** What a token is read against: a `-foreground` on its own surface, anything else on the page. */
const pairOf = (name: string) => (name === "--foreground" ? "--background" : name.endsWith("-foreground") ? name.replace(/-foreground$/, "") : "--background");

type Row = { name: string; value: string; ratio: number; on: string };

/** What `read` makes of an element once it is on the page, and the ref that hands it over. `read` must be stable. */
function useRead<T>(read: (el: HTMLElement) => T, initial: T) {
  const [v, setV] = useState(initial);
  const ref = useCallback((el: HTMLElement | null) => void (el && setV(read(el))), [read]);
  return [v, ref] as const;
}

/** Each token in the mode `el` is in: its value as written, and its ratio against what it is read on. */
function readTokens(el: HTMLElement): Row[] {
  const s = getComputedStyle(el);
  return tokenNames().map((name) => {
    const on = pairOf(name);
    return { name, value: s.getPropertyValue(name).trim(), on, ratio: contrast(resolve(el, name), resolve(el, on)) };
  });
}
const NONE: Row[] = [];

/** Every color token as a swatch in light and dark, with its value and its contrast against what it sits on. */
export function ColorTokens() {
  const [light, lightRef] = useRead(readTokens, NONE);
  const [dark, darkRef] = useRead(readTokens, NONE);
  const names = light.map((r) => r.name);
  return (
    <Frame className="not-prose overflow-x-auto rounded-lg border">
      <table className="w-full text-xs">
        <thead className="text-muted-foreground text-start">
          <tr>
            <th scope="col" className="p-3 text-start font-medium">
              Token
            </th>
            <th scope="col" className="p-3 text-start font-medium">
              Light
            </th>
            <th scope="col" className="p-3 text-start font-medium">
              Dark
            </th>
          </tr>
        </thead>
        <tbody>
          {names.map((name, i) => (
            <tr key={name} className="border-t">
              <th scope="row" className="p-3 text-start align-top font-mono font-normal">
                {name}
                <span className="text-muted-foreground block font-sans">on {pairOf(name)}</span>
              </th>
              {[light, dark].map((m, j) => (
                <td key={j} className={cn(j ? "dark" : "light", "bg-background text-foreground p-3 align-top")}>
                  <Swatch row={m[i]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {/* What the values are read from: one element per mode, under the same rule as the app. */}
      <div ref={lightRef} className="light" hidden />
      <div ref={darkRef} className="dark" hidden />
      {!names.length && <p className="text-muted-foreground p-3 text-sm">Reading the tokens from globals.css...</p>}
    </Frame>
  );
}

/** Text and icons are graded; a surface or a border on the page is not read, so its ratio is only shown. */
const isText = (name: string) => name.endsWith("foreground") || ["--primary-ink", "--success", "--warning", "--destructive", "--ring", "--primary", "--sidebar-primary"].includes(name);

function Swatch({ row }: { row?: Row }) {
  if (!row) return null;
  const g = isText(row.name) ? grade(row.ratio) : "";
  return (
    <div className="flex items-center gap-3">
      <span className="size-10 shrink-0 rounded-md border" style={{ background: `var(${row.name})` }} />
      <span className="grid gap-0.5">
        <code className="font-mono break-all">{row.value}</code>
        <span className={cn("tabular-nums", g === "fail" ? "text-destructive" : "text-muted-foreground")}>
          {row.ratio.toFixed(2)}:1 {g}
        </span>
      </span>
    </div>
  );
}

const TEXT = ["--foreground", "--muted-foreground", "--primary-ink", "--success", "--warning", "--destructive"];
const SURFACES = ["--background", "--card", "--muted", "--sidebar"];

/** Each text token on each surface text sits on, in one mode whatever the docs' theme (lib/color.test.ts holds them at 4.5). */
const readRatios = (el: HTMLElement): Record<string, number> =>
  Object.fromEntries(TEXT.flatMap((t) => SURFACES.map((s) => [`${t} ${s}`, contrast(resolve(el, t), resolve(el, s))])));

export function TextOnSurfaces({ mode }: { mode: "light" | "dark" }) {
  const [ratios, ref] = useRead(readRatios, {});
  return (
    <Frame>
      <div ref={ref} className={cn(mode, "bg-background text-foreground overflow-x-auto rounded-lg border p-3 text-xs")}>
        <table className="w-full">
          <caption className="pb-2 text-start font-medium">{mode === "light" ? "Light" : "Dark"}</caption>
          <thead>
            <tr>
              <td />
              {SURFACES.map((s) => (
                <th key={s} scope="col" className="text-muted-foreground px-2 pb-1 text-start font-mono font-normal">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TEXT.map((t) => (
              <tr key={t}>
                <th scope="row" className="pe-2 text-start font-mono font-normal">
                  {t}
                </th>
                {SURFACES.map((s) => {
                  const r = ratios[`${t} ${s}`];
                  return (
                    <td key={s} className="px-2 py-1.5 font-medium tabular-nums" style={{ background: `var(${s})`, color: `var(${t})` }}>
                      {r ? `${r.toFixed(1)}:1` : "..."}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Frame>
  );
}

type Read = (el: HTMLElement) => string;
const Computed = ({ value }: { value: string }) => <code className="text-muted-foreground font-mono text-xs">{value}</code>;

/** A sample drawn with `className`, with what the browser made of it. */
function Sample({ label, className, read, children }: { label: string; className: string; read: Read; children: React.ReactNode }) {
  const [value, ref] = useRead(read, "");
  return (
    <div className="grid items-baseline gap-x-6 gap-y-1 border-t py-3 sm:grid-cols-[10rem_1fr]">
      <span className="grid">
        <code className="font-mono text-xs">{label}</code>
        <Computed value={value} />
      </span>
      <div ref={ref} className={cn("min-w-0", className)}>
        {children}
      </div>
    </div>
  );
}

const css = (el: HTMLElement) => getComputedStyle(el);
const size: Read = (el) => `${css(el).fontSize} / ${css(el).lineHeight}`;
const face: Read = (el) => css(el).fontFamily.split(",")[0].replaceAll(/["']/g, "");
const radius: Read = (el) => css(el).borderTopLeftRadius;
// The offsets and blur, without the colors that make them unreadable.
const shadow: Read = (el) => css(el).boxShadow.replaceAll(/rgba?\([^)]*\)\s*/g, "").trim();
const width: Read = (el) => css(el).width;

// Literal class names, so Tailwind generates each.
const SIZES = [
  ["text-2xs", "text-2xs"],
  ["text-xs", "text-xs"],
  ["text-sm", "text-sm"],
  ["text-base", "text-base"],
  ["text-lg", "text-lg"],
  ["text-xl", "text-xl"],
  ["text-2xl", "text-2xl"],
  ["text-3xl", "text-3xl"],
  ["text-4xl", "text-4xl"],
] as const;

/** The type scale as the app sets it: each step with its computed size and line height. */
export function TypeScale() {
  return (
    <Frame>
      {SIZES.map(([label, c]) => (
        <Sample key={label} label={label} className={c} read={size}>
          Spring campaign, 24 assets
        </Sample>
      ))}
    </Frame>
  );
}

/** The three faces, with the family each resolves to. */
export function Faces() {
  return (
    <Frame>
      <Sample label="font-display" className="font-display text-2xl font-semibold tracking-tight" read={face}>
        Change your brand once
      </Sample>
      <Sample label="font-sans" className="font-sans text-base" read={face}>
        Body copy, labels and controls read in Funnel Sans.
      </Sample>
      <Sample label="font-mono" className="font-mono text-sm" read={face}>
        /a/7f3c/w_800,f_webp
      </Sample>
    </Frame>
  );
}

/** The roles text takes in the app, each with the classes that set it. */
export function TypeRoles() {
  const roles: [string, string, string][] = [
    ["Page title", "font-display text-3xl font-semibold tracking-tight", "Your art, all in one bucket"],
    ["Section heading", "font-display text-xl font-semibold tracking-tight", "Collections"],
    ["Label and control", "text-sm font-medium", "Usage rights"],
    ["Body", "text-sm", "Body copy reads at 14px with a comfortable line height."],
    ["Supporting", "text-muted-foreground text-sm", "Muted text for descriptions under a title."],
    ["Counts", "text-muted-foreground text-xs tabular-nums", "4000 x 3000 · 18.4 MB"],
    ["Code", "font-mono text-xs", "f.channel=web&tag=brand"],
  ];
  return (
    <Frame>
      {roles.map(([label, c, text]) => (
        <div key={label} className="grid items-baseline gap-x-6 gap-y-1 border-t py-3 sm:grid-cols-[10rem_1fr]">
          <span className="grid">
            <span className="text-sm font-medium">{label}</span>
            <code className="text-muted-foreground font-mono text-xs">{c}</code>
          </span>
          <p className={c}>{text}</p>
        </div>
      ))}
    </Frame>
  );
}

const RADII = ["rounded-sm", "rounded-md", "rounded-lg", "rounded-xl", "rounded-2xl", "rounded-full"] as const;

/** Radii, all from --radius: a brand site's square look (radius 0) squares every one of them. */
export function Radii() {
  return (
    <Frame className="flex flex-wrap gap-6">
      {RADII.map((r) => (
        <Measured key={r} label={r} className={cn("bg-muted size-20 border", r)} read={radius} />
      ))}
    </Frame>
  );
}

const SHADOWS = ["shadow-xs", "shadow-sm", "shadow-md", "shadow-lg"] as const;

/** Elevation: xs for fields and outline buttons, sm for cards, md for menus and popovers, lg for dialogs and toasts. */
export function Shadows() {
  return (
    <Frame className="flex flex-wrap gap-8 p-4">
      {SHADOWS.map((s) => (
        <Measured key={s} label={s} className={cn("bg-card size-24 rounded-lg border", s)} read={shadow} />
      ))}
    </Frame>
  );
}

const SPACE = ["w-1", "w-2", "w-3", "w-4", "w-6", "w-8", "w-12", "w-16"] as const;

/** The spacing steps the app uses most, each a multiple of --spacing. */
export function Spacing() {
  return (
    <Frame className="grid gap-2">
      {SPACE.map((w) => (
        <SpaceRow key={w} w={w} />
      ))}
    </Frame>
  );
}

function SpaceRow({ w }: { w: string }) {
  const [value, ref] = useRead(width, "");
  return (
    <div className="grid grid-cols-[4rem_5rem_1fr] items-center gap-4">
      <code className="font-mono text-xs">{w.slice(2)}</code>
      <Computed value={value} />
      <div ref={ref} className={cn("bg-primary h-3 rounded-sm", w)} />
    </div>
  );
}

function Measured({ label, className, read }: { label: string; className: string; read: Read }) {
  const [value, ref] = useRead(read, "");
  return (
    <figure className="grid justify-items-start gap-2">
      <div ref={ref} className={className} />
      <figcaption className="grid">
        <code className="font-mono text-xs">{label}</code>
        <Computed value={value} />
      </figcaption>
    </figure>
  );
}

const never = () => () => {};

/** A custom property's value on the page as the app has it (`:root`). */
export function Token({ name }: { name: string }) {
  const v = useSyncExternalStore(
    never,
    () => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    () => "",
  );
  return (
    <code>
      {name}: {v || "unset"}
    </code>
  );
}
