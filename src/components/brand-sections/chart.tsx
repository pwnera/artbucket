"use client";

import { useMemo } from "react";
import { IconAlertTriangle } from "@/components/icons";
import type { z } from "zod";
import { Body, Opens } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { GRADE_STYLE } from "@/components/brand-values";
import { useSite } from "@/components/site/site-context";
import { colorsOf, sectionGround } from "@/lib/brand-theme";
import { contrast, isHex } from "@/lib/color";
import type { TEMPLATE_PROPS } from "@/lib/pages";
import { resolve, ruleName } from "@/lib/rules";
import type { ViewRule } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * Chart colors: a sample bar, line or donut chart (props.kind, bar when left
 * out), a series per bound color in order, drawn in SVG with a legend and the
 * numbers in a table for screen readers. Neighbors under 3:1 against each
 * other, or against the ground, are named under it: side by side they are
 * hard to tell apart (WCAG 1.4.11).
 */

type Kind = NonNullable<z.output<typeof TEMPLATE_PROPS.chart>["kind"]>;
type Series = { rule: ViewRule; hex: string; name: string };

/** Made-up numbers, the same for every brand, so only the colors differ. */
const AT = ["2021", "2022", "2023", "2024", "2025"];
const TICKS = [0, 25, 50, 75, 100];
const SLOPE = [8, -3, 5, 1, -6, 4];
/** Series `s` in year `c`: a trend with a little wobble, never random, so the server and the browser draw the same. */
const value = (s: number, c: number) => Math.max(5, Math.min(95, 20 + ((s * 31) % 45) + c * SLOPE[s % SLOPE.length] + ((s * 7 + c * 13) % 7)));
/** The middle of year `c`'s column, in percent: bars group around it and lines pass through it, under the labels. */
const mid = (c: number) => ((c + 0.5) * 100) / AT.length;
/** A donut's shares: the first series biggest, as a palette's lead color is. */
const shares = (n: number) => Array.from({ length: n }, (_, i) => ((n - i) * 200) / (n * (n + 1)));

/** Contrast between marks that must read apart: 3:1, as WCAG asks of graphics. */
const APART = 3;

export function ChartSection({ section, rules }: SectionProps) {
  const { view, context } = useSite();
  const kind = (section.props.kind as Kind | undefined) ?? "bar";
  const series = useMemo(() => colorsOf(rules).map((r) => ({ rule: r, hex: (r.value as string).slice(0, 7), name: ruleName(r) })), [rules]);
  const { tone, background } = section;

  // The ground the marks sit on: the section's own, else the page's surface. A page on the app's light or dark has none to check.
  const ground = useMemo(() => {
    const colorOf = (key: string) =>
      resolve(
        view.rules.filter((r) => r.key === key),
        context ?? "",
      )[0];
    const g = sectionGround(view.theme, { tone, background }, colorOf).background;
    return g && isHex(g) ? g : view.theme.surface;
  }, [view.theme, view.rules, context, tone, background]);

  const low = useMemo(() => {
    const out: { what: string; ratio: number }[] = [];
    series.forEach((a, i) => {
      // A donut closes: its last slice touches its first.
      const b = series[i + 1] ?? (kind === "donut" && series.length > 2 ? series[0] : undefined);
      if (b) out.push({ what: `${a.name} beside ${b.name}`, ratio: contrast(a.hex, b.hex) });
      if (ground) out.push({ what: `${a.name} on the ground (${ground})`, ratio: contrast(a.hex, ground) });
    });
    return out.filter((x) => x.ratio < APART);
  }, [series, kind, ground]);

  const pct = shares(series.length);
  return (
    <div className="space-y-6">
      <Body />
      {series.length > 0 && (
        <figure aria-label={`A sample ${kind} chart in the brand's colors`} className="space-y-4">
          {kind === "donut" ? (
            <div className="flex flex-wrap items-center gap-8">
              <Donut series={series} pct={pct} />
              <Legend series={series} pct={pct} className="flex-col" />
            </div>
          ) : (
            <>
              <Legend series={series} />
              <Plot series={series} kind={kind} />
            </>
          )}
          <table className="sr-only">
            <caption>Sample data, as the chart draws it</caption>
            <thead>
              <tr>
                <th scope="col">Series</th>
                {kind === "donut" ? (
                  <th scope="col">Share</th>
                ) : (
                  AT.map((a) => (
                    <th key={a} scope="col">
                      {a}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {series.map((s, i) => (
                <tr key={s.rule.key}>
                  <th scope="row">{s.name}</th>
                  {kind === "donut" ? <td>{Math.round(pct[i])}%</td> : AT.map((a, c) => <td key={a}>{value(i, c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </figure>
      )}
      {low.length > 0 && (
        <div className="space-y-2 text-sm">
          <p className="flex items-center gap-1.5 font-medium">
            <IconAlertTriangle className="size-4 shrink-0" aria-hidden />
            Hard to tell apart, under {APART}:1
          </p>
          <ul className="text-muted-foreground space-y-1">
            {low.map((x) => (
              <li key={x.what} className="flex flex-wrap items-center gap-2">
                {x.what}
                <span className={cn("rounded px-1 font-mono text-2xs font-semibold tabular-nums", GRADE_STYLE.fail)}>{x.ratio.toFixed(1)}:1</span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">Keep a gap or an outline between them, label them directly, or put another color between.</p>
        </div>
      )}
    </div>
  );
}

/** Each series' color and name, its hex, and a donut's share; on the canvas a click opens its rule. */
function Legend({ series, pct, className }: { series: Series[]; pct?: number[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-5 gap-y-2 text-sm", className)}>
      {series.map((s, i) => (
        <li key={s.rule.key}>
          <Opens rule={s.rule}>
            <span className="flex items-center gap-2">
              <span className="ring-border size-3 shrink-0 rounded-sm ring-1" style={{ backgroundColor: s.hex }} />
              {s.name}
              <code className="text-muted-foreground font-mono text-xs">{s.hex}</code>
              {pct && <span className="text-muted-foreground tabular-nums">{Math.round(pct[i])}%</span>}
            </span>
          </Opens>
        </li>
      ))}
    </ul>
  );
}

/**
 * Bars or lines over a 0 to 100 grid. The SVG stretches to its box, so its
 * strokes keep their width (non-scaling-stroke) and the labels are HTML.
 * Neighboring bars and dots are parted by a 2px line of the ground. In RTL
 * the years run from the right, the plot mirrored to match.
 */
function Plot({ series, kind }: { series: Series[]; kind: "bar" | "line" }) {
  const col = 100 / AT.length;
  const bar = (col * 0.7) / series.length;
  const y = (s: number, c: number) => 100 - value(s, c);
  return (
    <div aria-hidden className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
      <div className="text-muted-foreground relative w-6 text-2xs tabular-nums">
        {TICKS.map((t) => (
          <span key={t} className="absolute end-0 -translate-y-1/2" style={{ insetBlockStart: `${100 - t}%` }}>
            {t}
          </span>
        ))}
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-56 w-full overflow-visible @3xl:h-72 rtl:-scale-x-100">
        {TICKS.map((t) => (
          <line key={t} x1={0} x2={100} y1={100 - t} y2={100 - t} className="stroke-border" vectorEffect="non-scaling-stroke" />
        ))}
        {kind === "bar"
          ? AT.flatMap((a, c) =>
              series.map((s, i) => (
                <rect
                  key={`${a}-${s.rule.key}`}
                  x={c * col + col * 0.15 + i * bar}
                  y={y(i, c)}
                  width={bar}
                  height={value(i, c)}
                  fill={s.hex}
                  className="stroke-background"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              )),
            )
          : series.map((s, i) => {
              // A dot is a zero-length stroke with round caps: round however the box stretches.
              const dots = AT.map((_, c) => `M${mid(c)} ${y(i, c)}h0`).join("");
              return (
                <g key={s.rule.key} fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points={AT.map((_, c) => `${mid(c)},${y(i, c)}`).join(" ")} stroke={s.hex} strokeWidth={2} vectorEffect="non-scaling-stroke" />
                  <path d={dots} className="stroke-background" strokeWidth={12} vectorEffect="non-scaling-stroke" />
                  <path d={dots} stroke={s.hex} strokeWidth={8} vectorEffect="non-scaling-stroke" />
                </g>
              );
            })}
      </svg>
      <span />
      <div className="text-muted-foreground grid pt-2 text-center text-xs tabular-nums" style={{ gridTemplateColumns: `repeat(${AT.length}, minmax(0, 1fr))` }}>
        {AT.map((a) => (
          <span key={a}>{a}</span>
        ))}
      </div>
    </div>
  );
}

/** Slices as dashes around one circle (its circumference is 100), from the top, a sliver of the ground between each. */
function Donut({ series, pct }: { series: Series[]; pct: number[] }) {
  const gap = series.length > 1 ? 0.6 : 0;
  const starts = pct.map((_, i) => pct.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <svg aria-hidden viewBox="0 0 42 42" className="size-48 shrink-0 -rotate-90">
      {series.map((s, i) => (
        <circle
          key={s.rule.key}
          cx={21}
          cy={21}
          r={100 / (2 * Math.PI)}
          fill="none"
          stroke={s.hex}
          strokeWidth={8}
          strokeDasharray={`${pct[i] - gap} ${100 - pct[i] + gap}`}
          strokeDashoffset={-starts[i]}
        />
      ))}
    </svg>
  );
}
