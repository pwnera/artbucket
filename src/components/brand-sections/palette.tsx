"use client";

import { useId, useMemo, useState } from "react";
import { IconCheck, IconDownload } from "@tabler/icons-react";
import type { z } from "zod";
import { GRADE_STYLE, Markdown, useCopied } from "@/components/brand-values";
import { HEAD } from "@/components/brand-sections/look";
import { Pairings } from "@/components/brand-sections/parts";
import { Body, Opens, useRuleAnchor } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { CopyButton } from "@/components/copy-button";
import { AnchorLink } from "@/components/site/anchors";
import { useMedia, useSite } from "@/components/site/site-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toAse } from "@/lib/ase";
import { colorsOf } from "@/lib/brand-theme";
import { contrast, grade, hsl, inkOn, rgb, tintOf, toCmyk } from "@/lib/color";
import type { TEMPLATE_PROPS } from "@/lib/pages";
import { type COLOR_SPEC, resolve, ruleName } from "@/lib/rules";
import type { ViewRule } from "@/lib/site";
import { gradientCss, gradientOf, kebab, stopHex } from "@/lib/tokens";
import { cn } from "@/lib/utils";

/**
 * A palette: a card per color, grouped as the book groups them, each with
 * its swatch (a gradient drawn live, a texture laid over), the text it pairs
 * with and its grade, its tints, and its values for screen or print, each a
 * copy away. Above, how much of the brand each color is and an .ase of them
 * (props.ase); below, every color on every other (props.matrix). With
 * props.simulate, the whole palette seen as with a color vision deficiency,
 * one at a time, through an SVG color matrix.
 */

type Props = z.output<typeof TEMPLATE_PROPS.palette>;
type Value = NonNullable<Props["show"]>[number];
type Medium = NonNullable<Props["media"]>;
type Spec = z.output<typeof COLOR_SPEC>;

const SCREEN: Value[] = ["hex", "rgb", "hsl", "token", "css"];
const PRINT: Value[] = ["cmyk", "pantone", "ral"];

/** The section's columns, as many as its room takes: one on a phone. */
const GRID: Record<number, string> = {
  2: "@xl:grid-cols-2",
  3: "@xl:grid-cols-2 @4xl:grid-cols-3",
  4: "@xl:grid-cols-2 @4xl:grid-cols-3 @5xl:grid-cols-4",
};

const specOf = (r: ViewRule) => (r.spec ?? {}) as Spec;

/**
 * Color vision deficiencies at full severity (Machado, Oliveira and Fernandes
 * 2009), and no color at all as luminance: matrices on linear RGB, which is
 * what feColorMatrix works in by default.
 */
const SIMULATE = {
  protanopia: { name: "Protanopia", what: "without red cones", m: "0.152286 1.052583 -0.204868 0 0 0.114503 0.786281 0.099216 0 0 -0.003882 -0.048116 1.051998 0 0" },
  deuteranopia: { name: "Deuteranopia", what: "without green cones", m: "0.367322 0.860646 -0.227968 0 0 0.280085 0.672501 0.047413 0 0 -0.01182 0.04294 0.968881 0 0" },
  tritanopia: { name: "Tritanopia", what: "without blue cones", m: "1.255528 -0.076749 -0.178779 0 0 -0.078411 0.930809 0.147602 0 0 0.004733 0.691367 0.3039 0 0" },
  achromatopsia: { name: "Achromatopsia", what: "without color", m: "0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0" },
};
type Sim = keyof typeof SIMULATE;
const KIND = { linear: "Linear", radial: "Radial", conic: "Conic" } as const;

/** What a swatch is painted with: its gradient, else its color. */
function fill(r: ViewRule, paint: (color: string) => string) {
  const g = gradientOf(r);
  return g ? gradientCss(g, paint) : (r.value as string);
}

type Row = { label: string; text: string; converted?: boolean };

/** The values `show` asks for that the color has, in its order; print values the book didn't give are converted, and say so. */
function readouts(r: ViewRule, show: Value[]): Row[] {
  const hex = r.value as string;
  const s = specOf(r);
  const [R, G, B] = s.rgb ?? rgb(hex);
  // #rrggbbaa: the RGB says how see-through.
  const alpha = hex.length === 9 ? Math.round((parseInt(hex.slice(7), 16) / 255) * 100) : 100;
  return show.flatMap((v): Row[] => {
    switch (v) {
      case "hex":
        return [{ label: "HEX", text: hex }];
      case "rgb":
        return [{ label: "RGB", text: alpha < 100 ? `rgb(${R} ${G} ${B} / ${alpha}%)` : `rgb(${R} ${G} ${B})` }];
      case "hsl": {
        const [h, sat, l] = hsl([R, G, B]);
        return [{ label: "HSL", text: `hsl(${h} ${sat}% ${l}%)` }];
      }
      case "token":
        return s.token ? [{ label: "Token", text: s.token }] : [];
      case "css":
        return [{ label: "CSS", text: `var(--${kebab(r.key)})` }];
      case "cmyk": {
        const [c, m, y, k] = s.cmyk ?? toCmyk(hex);
        return [{ label: "CMYK", text: `C${c} M${m} Y${y} K${k}`, converted: s.print === "converted" || !s.cmyk }];
      }
      case "pantone":
        return (s.pantone ?? []).map((p) => ({ label: "Pantone", text: p }));
      case "ral":
        return s.ral ? [{ label: "RAL", text: `RAL ${s.ral}` }] : [];
    }
  });
}

/** The section's colors as Adobe swatches, in CMYK where the book gives it, saved as `name`. */
function saveAse(colors: ViewRule[], name: string) {
  const bytes = toAse(
    colors.map((r) => {
      const s = specOf(r);
      return { name: ruleName(r), hex: r.value as string, ...(s.cmyk && s.print !== "converted" && { cmyk: s.cmyk }) };
    }),
  );
  const link = document.createElement("a");
  // toAse builds on a plain ArrayBuffer; its signature just says Uint8Array.
  link.href = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}

export function PaletteSection({ section, rules }: SectionProps) {
  const p = section.props as Props;
  const { view, context } = useSite();
  const colors = useMemo(() => colorsOf(rules), [rules]);
  // Pairs and stops name colors the section may not bind; they read as the context being read has them.
  const all = useMemo(() => resolve(view.rules, context ?? ""), [view.rules, context]);
  const paint = useMemo(() => stopHex(all), [all]);
  const show = p.show ?? [...SCREEN, ...PRINT];
  const values = { screen: show.filter((v) => SCREEN.includes(v)), print: show.filter((v) => PRINT.includes(v)) };
  const both = values.screen.length > 0 && values.print.length > 0;
  const [picked, setPicked] = useState<Medium>(p.media ?? "screen");
  const medium: Medium = both ? picked : values.screen.length ? "screen" : "print";
  const groups = useMemo(() => {
    const by = new Map<string, ViewRule[]>();
    for (const r of colors) {
      const g = specOf(r).group ?? "";
      by.set(g, [...(by.get(g) ?? []), r]);
    }
    return [...by];
  }, [colors]);
  const grouped = groups.some(([g]) => g);
  const [sim, setSim] = useState<Sim | null>(null);
  // A filter id for CSS url(): useId's, without the marks a URL fragment would have to escape.
  const filter = `cvd${useId().replace(/[^\w-]/g, "")}`;

  return (
    <div className="space-y-10">
      <Body />
      {colors.length > 0 && (both || p.ase || p.simulate) && (
        <div className="flex flex-wrap items-center gap-3">
          {both && (
            <ToggleGroup type="single" variant="outline" size="sm" value={medium} onValueChange={(v) => v && setPicked(v as Medium)} aria-label="Values for">
              <ToggleGroupItem value="screen" className="px-3">
                Screen
              </ToggleGroupItem>
              <ToggleGroupItem value="print" className="px-3">
                Print
              </ToggleGroupItem>
            </ToggleGroup>
          )}
          {p.simulate && (
            <div role="group" aria-labelledby={`${filter}-label`} className="flex flex-wrap items-center gap-1">
              <span id={`${filter}-label`} className="text-muted-foreground me-1 text-xs">
                Color blindness
              </span>
              {(Object.keys(SIMULATE) as Sim[]).map((k) => (
                <Toggle key={k} variant="outline" size="sm" className="px-3" pressed={sim === k} onPressedChange={(on) => setSim(on ? k : null)}>
                  {SIMULATE[k].name}
                </Toggle>
              ))}
            </div>
          )}
          {p.ase && (
            <Button variant="outline" size="sm" className="ms-auto" onClick={() => saveAse(colors, `${view.brand.slug}-colors.ase`)}>
              <IconDownload /> Swatches (.ase)
            </Button>
          )}
        </div>
      )}
      {sim && (
        <>
          <p className="text-muted-foreground text-sm">
            A simulation of {SIMULATE[sim].name.toLowerCase()}: the palette {SIMULATE[sim].what}. The values below are the colors as set.
          </p>
          <svg aria-hidden className="absolute size-0">
            <filter id={filter}>
              <feColorMatrix type="matrix" values={`${SIMULATE[sim].m} 0 0 0 1 0`} />
            </filter>
          </svg>
        </>
      )}
      {/* Everything drawn in the colors, filtered together while a simulation is on. */}
      {colors.length > 0 && (
        <div className="space-y-10" style={sim ? { filter: `url(#${filter})` } : undefined}>
          <Proportions colors={colors} paint={paint} />
          {groups.map(([name, rs]) => (
            <div key={name} className="space-y-4">
              {grouped && <h3 className={cn(HEAD, "text-(length:--brand-h3)")}>{name || "Other"}</h3>}
              {/* Its own container: the frame's is the whole section, wider than a reading column. */}
              <div className="@container">
                <div className={cn("grid gap-x-6 gap-y-8", GRID[section.columns])}>
                  {rs.map((r) => (
                    <Opens key={r.key} rule={r}>
                      <Swatch rule={r} all={all} paint={paint} medium={medium} values={values} heading={grouped ? "h4" : "h3"} />
                    </Opens>
                  ))}
                </div>
              </div>
            </div>
          ))}
          {p.matrix && <Pairings colors={colors} />}
        </div>
      )}
    </div>
  );
}

/** How much of the brand each color is, as a bar and in words. */
function Proportions({ colors, paint }: { colors: ViewRule[]; paint: (color: string) => string }) {
  const weighed = colors.filter((r) => specOf(r).weight);
  if (!weighed.length) return null;
  return (
    <figure className="space-y-2">
      <div aria-hidden className="ring-border flex h-10 overflow-hidden rounded-xl ring-1">
        {weighed.map((r) => (
          <span key={r.key} className="min-w-1 basis-0" style={{ flexGrow: specOf(r).weight, background: fill(r, paint) }} />
        ))}
      </div>
      <figcaption>
        <span className="sr-only">How much of the brand each color is: </span>
        <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {weighed.map((r) => (
            <li key={r.key} className="flex items-center gap-1.5">
              <span className="ring-border size-2.5 rounded-full ring-1" style={{ background: fill(r, paint) }} />
              <span className="text-foreground">{ruleName(r)}</span>
              <span className="tabular-nums">{specOf(r).weight}%</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

/** Where a copied value was: a check and the word, read out too. */
const Copied = () => (
  <>
    <IconCheck aria-hidden className="animate-in zoom-in-50 size-3.5" /> Copied
    <span className="sr-only" aria-live="polite">
      Copied
    </span>
  </>
);

/** A color's card. Both media's values stay in the DOM, the other hidden, so print shows them all. */
function Swatch({
  rule: r,
  all,
  paint,
  medium,
  values,
  heading: H,
}: {
  rule: ViewRule;
  all: ViewRule[];
  paint: (color: string) => string;
  medium: Medium;
  values: Record<Medium, Value[]>;
  heading: "h3" | "h4";
}) {
  const { url } = useSite();
  const anchor = useRuleAnchor()(r.key);
  // A copy says so on the swatch you clicked, not in a toast.
  const [copied, copy] = useCopied();
  const s = specOf(r);
  const value = r.value as string;
  const hex = value.slice(0, 7);
  const texture = useMedia(s.texture);
  const g = gradientOf(r);
  const name = ruleName(r);
  // Text on it: the color the book pairs with it, else whichever of black and white reads.
  const partner = s.pair ? all.find((x) => x.key === s.pair && x.type === "color") : undefined;
  const ink = partner ? (partner.value as string).slice(0, 7) : inkOn(hex);
  const ratio = contrast(ink, hex);
  const graded = grade(ratio);

  return (
    <div id={anchor} className="group/block min-w-0 scroll-mt-20 space-y-3">
      <div className="flex items-center gap-1">
        <H className={cn(HEAD, "text-lg")}>{name}</H>
        {anchor && <AnchorLink id={anchor} label={`Copy a link to ${name}`} className="group-hover/block:opacity-100" />}
      </div>

      <button
        type="button"
        data-specimen
        aria-label={`Copy ${value}`}
        onClick={() => void copy(value, "hex")}
        className={cn(
          "ring-border relative flex h-32 w-full cursor-copy flex-col justify-between overflow-hidden rounded-xl p-3 text-start shadow-sm ring-1 transition-[box-shadow,scale] hover:shadow-md active:scale-[0.98] active:duration-75",
          value.length === 9 && "bg-checker",
        )}
        style={{ color: ink }}
      >
        <span aria-hidden className="absolute inset-0" style={{ background: fill(r, paint) }} />
        {texture?.preview && (
          <span aria-hidden className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(url(texture.id, "/w_720,f_webp"))})` }} />
        )}
        <span className="relative text-3xl font-semibold tracking-tight">Aa</span>
        <span className="relative flex items-center gap-1 font-mono text-xs opacity-80">{copied === value ? <Copied /> : value}</span>
      </button>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="ring-border size-3 shrink-0 rounded-full ring-1" style={{ backgroundColor: ink }} />
        <span>Text in {partner ? ruleName(partner) : ink === "#ffffff" ? "white" : "black"}</span>
        <span className="font-mono tabular-nums">{ratio.toFixed(1)}</span>
        <span className={cn("rounded px-1 text-2xs font-semibold tracking-wide uppercase", GRADE_STYLE[graded])}>{graded}</span>
      </p>
      {texture && <p className="text-muted-foreground text-xs">Textured with {texture.title ?? texture.filename}</p>}

      {s.tints?.length ? (
        <ul aria-label="Tints" className="ring-border grid grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] overflow-hidden rounded-lg ring-1">
          {s.tints.map((t) => {
            const c = tintOf(hex, t);
            return (
              <li key={t}>
                <button
                  type="button"
                  title={`Copy ${c}`}
                  onClick={() => void copy(c, "hex")}
                  className="flex h-14 w-full cursor-copy flex-col justify-end p-1.5 text-start transition-[scale] active:scale-95 active:duration-75"
                  style={{ backgroundColor: c, color: inkOn(c) }}
                >
                  <span className="text-2xs font-medium tabular-nums">{t}%</span>
                  <span className="flex items-center gap-0.5 font-mono text-2xs opacity-80">{copied === c ? <Copied /> : c}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {g && (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            {KIND[g.kind ?? "linear"]} gradient
            {g.angle !== undefined && g.kind !== "radial" && `, ${g.angle}°`}
          </p>
          <ol aria-label="Stops" className="grid gap-1 text-xs">
            {g.stops.map((stop, i) => {
              const named = stop.color.startsWith("#") ? undefined : all.find((x) => x.key === stop.color);
              const c = paint(stop.color);
              return (
                <li key={i} className="flex items-center gap-2">
                  <span className="ring-border size-3 shrink-0 rounded-full ring-1" style={{ backgroundColor: c, opacity: stop.opacity }} />
                  {named && <span className="truncate">{ruleName(named)}</span>}
                  <code className={cn("font-mono", named && "text-muted-foreground")}>{c}</code>
                  {stop.opacity !== undefined && stop.opacity < 1 && <span className="text-muted-foreground">at {Math.round(stop.opacity * 100)}% opacity</span>}
                  {stop.at !== undefined && <span className="text-muted-foreground ms-auto tabular-nums">{stop.at}%</span>}
                </li>
              );
            })}
          </ol>
          <ValueRow label="Gradient" text={gradientCss(g, paint)} wrap />
        </div>
      )}

      {(["screen", "print"] as const).map((m) => {
        const rows = readouts(r, values[m]);
        return (
          rows.length > 0 && (
            <div key={m} className={cn("grid gap-1.5", m !== medium && "hidden print:grid")}>
              {rows.map((row) => (
                <ValueRow key={`${row.label}:${row.text}`} {...row} />
              ))}
            </div>
          )
        );
      })}

      {r.usage && <Markdown text={r.usage} className="text-muted-foreground text-sm" demote />}
    </div>
  );
}

/** A value and its copy button; a converted print value says so. */
function ValueRow({ label, text, converted, wrap }: Row & { wrap?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-muted-foreground w-14 shrink-0 text-xs font-medium">{label}</span>
      <code className={cn("min-w-0 flex-1 font-mono text-sm", wrap ? "break-all" : "truncate")} title={text}>
        {text}
      </code>
      {converted && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" tabIndex={0}>
              converted
            </Badge>
          </TooltipTrigger>
          <TooltipContent>Converted from the hex, not given by the book: proof it before it goes to print.</TooltipContent>
        </Tooltip>
      )}
      <CopyButton text={text} label={`Copy ${label}`} what={label} />
    </div>
  );
}
