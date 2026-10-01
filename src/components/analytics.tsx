"use client";

import { useId, useState } from "react";
import { IconArrowDownRight, IconArrowUpRight } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/lib/motion";

/**
 * Analytics, as DataFast draws them: one card with the numbers that matter
 * across its top, each a button that picks the chart under it; a line for
 * the main series over bars for a second; and breakdowns, a card each, whose
 * tabs regroup the same rows, every row its share drawn behind it. Plain
 * SVG and boxes, no chart library.
 */

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** 1.2k, 34k, 1.2M: a number in a tight spot. */
export const short = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : n.toLocaleString());

/** The change from `before` to `now`, in percent; null when there was nothing before. */
export const change = (now: number, before: number) => (before > 0 ? Math.round((100 * (now - before)) / before) : null);

/** The second half of a series against the first: the change a KPI shows. */
export function halves(xs: number[]) {
  const h = Math.floor(xs.length / 2);
  return change(sum(xs.slice(xs.length - h)), sum(xs.slice(0, h)));
}

export type Kpi = {
  id: string;
  label: string;
  value: string;
  /** Percent change against the period before, null when there is no before. */
  delta?: number | null;
  /** Whether a rise is good news (the default) or bad: replaced files fetched more is bad. */
  rising?: "good" | "bad";
  /** What the delta compares, for its tooltip: "vs the 6 weeks before". */
  against?: string;
  /** Picks the chart; a KPI without one only says its number. */
  chart?: boolean;
};

/**
 * A figure as given ("1,204", "38%", "2.4 GB") that counts up to itself:
 * its number moves, its words around it stay. Text with no number is as is.
 */
function Figure({ text }: { text: string }) {
  const m = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(text);
  const decimals = m?.[2].split(".")[1]?.length ?? 0;
  const scale = 10 ** decimals;
  const n = useCountUp(m ? Math.round(Number(m[2].replace(/,/g, "")) * scale) : 0);
  if (!m) return text;
  const v = n / scale;
  const body = m[2].includes(",") ? v.toLocaleString("en", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : v.toFixed(decimals);
  return (
    <>
      {m[1]}
      {body}
      {m[3]}
    </>
  );
}

/** The KPI strip atop the card: a row of buttons where they pick the chart, wrapping on a phone. */
export function Kpis({ items, picked, onPick }: { items: Kpi[]; picked?: string; onPick?: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-px sm:grid-cols-3 lg:flex lg:flex-wrap lg:gap-0">
      {items.map((k) => {
        const body = (
          <>
            <span className="text-muted-foreground text-xs font-medium">{k.label}</span>
            <span className="font-display text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
              <Figure text={k.value} />
            </span>
            <Delta value={k.delta} rising={k.rising} against={k.against} />
          </>
        );
        const cls = "grid min-w-0 content-start gap-0.5 rounded-lg px-3 py-2.5 text-start lg:min-w-36";
        return k.chart && onPick ? (
          <button
            key={k.id}
            type="button"
            aria-pressed={picked === k.id}
            onClick={() => onPick(k.id)}
            className={cn(cls, "hover:bg-muted/60 aria-pressed:bg-muted relative transition-colors", "aria-pressed:after:bg-primary aria-pressed:after:absolute aria-pressed:after:inset-x-3 aria-pressed:after:bottom-0 aria-pressed:after:h-0.5 aria-pressed:after:rounded-full")}
          >
            {body}
          </button>
        ) : (
          <div key={k.id} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

function Delta({ value, rising = "good", against }: { value?: number | null; rising?: "good" | "bad"; against?: string }) {
  if (value === undefined) return <span className="h-4" />;
  if (value === null) return <span className="text-muted-foreground h-4 text-xs">New</span>;
  const up = value > 0;
  const good = value === 0 ? null : up === (rising === "good");
  const Arrow = up ? IconArrowUpRight : IconArrowDownRight;
  return (
    <span title={against} className={cn("inline-flex h-4 items-center gap-0.5 text-xs tabular-nums", good === null ? "text-muted-foreground" : good ? "text-success" : "text-destructive")}>
      {value !== 0 && <Arrow aria-hidden className="size-3" />}
      {Math.abs(value)}%<span className="sr-only">{up ? " up" : value < 0 ? " down" : ""}{against ? ` ${against}` : ""}</span>
    </span>
  );
}

/** Rounded up to 1, 2 or 5 times a power of ten, so the gridlines fall on round numbers. */
function nice(max: number) {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= max) ?? 10) * p;
}

/** A smooth path through the points, a cubic between each pair (Catmull-Rom, kept inside the chart). */
function smooth(pts: [number, number][]) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1] ?? pts[i], pts[i], pts[i + 1], pts[i + 2] ?? pts[i + 1]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${Math.min(H, c1[1])} ${c2[0]},${Math.min(H, c2[1])} ${p2[0]},${p2[1]}`;
  }
  return d;
}

const W = 1000;
const H = 300;

export type Series<R> = { key: keyof R & string; label: string; format?: (n: number) => string };

/**
 * The card's chart: `line` a smooth line over its area, `bars` under it on a
 * scale of their own (the bars' tops stay under the line's, as DataFast's
 * revenue sits under its visitors), gridlines on the line's scale. Hovering
 * a column, or focusing the chart and moving with the arrow keys, says its
 * numbers; screen readers get the totals.
 */
export function ComboChart<R extends Record<string, number | string>>({
  rows,
  x,
  line,
  bars,
  detail,
  partial,
  tick = x,
}: {
  rows: R[];
  /** A column's name, in the tooltip and for screen readers. */
  x: (r: R) => string;
  /** Its name under the chart, shorter; x when left out. */
  tick?: (r: R) => string;
  line: Series<R>;
  bars?: Series<R>;
  /** More lines for the tooltip, under the two series. */
  detail?: (r: R) => { label: string; value: string }[];
  /** The last column is a period still going (this week, today): its stretch of line dashed, its bar lighter, as DataFast draws it. */
  partial?: boolean;
}) {
  const id = useId();
  const [at, setAt] = useState<number | null>(null);
  if (!rows.length) return null;
  const v = (r: R, s: Series<R>) => Number(r[s.key]) || 0;
  const fmt = (s: Series<R>, n: number) => (s.format ?? ((m: number) => m.toLocaleString()))(n);
  // At least 4, so a quiet chart's gridlines still fall on whole numbers.
  const top = Math.max(4, nice(Math.max(...rows.map((r) => v(r, line)))));
  const barTop = bars ? nice(Math.max(...rows.map((r) => v(r, bars)))) / 0.7 : 1;
  const step = W / rows.length;
  const pts = rows.map((r, i) => [step * (i + 0.5), H - (v(r, line) / top) * H] as [number, number]);
  // A period still going ends the solid line a column early; a dashed stretch reaches it.
  const cut = partial && pts.length > 2 ? pts.length - 1 : pts.length;
  const path = smooth(pts.slice(0, cut));
  const area = smooth(pts);
  const ticks = [1, 0.75, 0.5, 0.25, 0];
  // A label every few columns, so they never crowd.
  const every = Math.ceil(rows.length / 7);
  const total = (s: Series<R>) => fmt(s, sum(rows.map((r) => v(r, s))));
  const r = at === null ? null : rows[at];
  return (
    <div className="grid gap-2">
      <div
        role="img"
        tabIndex={0}
        aria-label={`From ${x(rows[0])} to ${x(rows.at(-1)!)}. ${line.label}: ${total(line)}${bars ? `. ${bars.label}: ${total(bars)}` : ""}.`}
        className="focus-visible:ring-ring/50 relative h-56 rounded-md ps-10 pe-1 outline-none focus-visible:ring-[3px] sm:h-64"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setAt((a) => Math.min(rows.length - 1, (a ?? -1) + 1));
          else if (e.key === "ArrowLeft") setAt((a) => Math.max(0, (a ?? rows.length) - 1));
          else if (e.key === "Escape") setAt(null);
        }}
        onBlur={() => setAt(null)}
        onMouseLeave={() => setAt(null)}
      >
        {/* Gridlines, on the line's scale. */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 start-0 end-1">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 flex items-center gap-2" style={{ top: `${(1 - t) * 100}%` }}>
              <span className="text-muted-foreground w-8 -translate-y-1/2 text-end text-[11px] tabular-nums">{short(top * t)}</span>
              <span className={cn("h-px flex-1 -translate-y-1/2", t === 0 ? "bg-border" : "bg-border/50 border-border/60 border-t border-dashed bg-transparent")} />
            </div>
          ))}
        </div>
        <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="chart-reveal absolute inset-y-0 start-10 h-full w-[calc(100%-2.75rem)] overflow-visible">
          <defs>
            <linearGradient id={`${id}-area`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {bars &&
            rows.map((row, i) => {
              const h = (v(row, bars) / barTop) * H;
              const bw = Math.min(step * 0.56, 40);
              return (
                <rect
                  key={i}
                  x={step * (i + 0.5) - bw / 2}
                  y={H - h}
                  width={bw}
                  height={h}
                  rx={3}
                  className={cn("transition-opacity", at !== null && at !== i ? "opacity-40" : partial && i === rows.length - 1 ? "opacity-50" : "opacity-100")}
                  style={{ fill: "color-mix(in oklab, var(--primary) 38%, transparent)" }}
                />
              );
            })}
          <path d={`${area} L${pts.at(-1)![0]},${H} L${pts[0][0]},${H} Z`} fill={`url(#${id}-area)`} />
          <path d={path} fill="none" stroke="var(--primary-ink)" strokeWidth={2.25} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {cut < pts.length && (
            <path d={`M${pts[cut - 1][0]},${pts[cut - 1][1]} L${pts[cut][0]},${pts[cut][1]}`} fill="none" stroke="var(--primary-ink)" strokeWidth={2.25} strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
          )}
          {at !== null && <line x1={pts[at][0]} x2={pts[at][0]} y1={0} y2={H} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        </svg>
        {/* The point hovered: an HTML dot, round whatever the chart's aspect. */}
        {at !== null && (
          <span
            aria-hidden
            className="bg-background border-primary-ink pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-[inset-inline-start,top] duration-100 rtl:translate-x-1/2"
            style={{ insetInlineStart: `calc(2.5rem + (100% - 2.75rem) * ${(at + 0.5) / rows.length})`, top: `${(pts[at][1] / H) * 100}%` }}
          />
        )}
        {/* Hover targets, one per column. */}
        <div className="absolute inset-y-0 start-10 end-1 flex">
          {rows.map((_, i) => (
            <div key={i} className="h-full flex-1" onMouseEnter={() => setAt(i)} />
          ))}
        </div>
        {r && at !== null && (
          <div
            role="status"
            className={cn(
              "bg-popover text-popover-foreground pointer-events-none absolute top-2 z-10 grid min-w-40 gap-1 rounded-lg border px-3 py-2 text-xs shadow-md",
              at < rows.length / 2 ? "" : "-translate-x-full rtl:translate-x-full",
            )}
            style={{ insetInlineStart: `calc(2.5rem + (100% - 2.75rem) * ${(at + (at < rows.length / 2 ? 0.75 : 0.25)) / rows.length})` }}
          >
            <span className="font-medium">
              {x(r)}
              {partial && at === rows.length - 1 && <span className="text-muted-foreground font-normal">, so far</span>}
            </span>
            <span className="flex items-center gap-2">
              <span aria-hidden className="bg-primary-ink h-0.5 w-3 rounded-full" />
              {line.label}
              <b className="ms-auto font-medium tabular-nums">{fmt(line, v(r, line))}</b>
            </span>
            {bars && (
              <span className="flex items-center gap-2">
                <span aria-hidden className="bg-primary/40 size-2.5 rounded-sm" />
                {bars.label}
                <b className="ms-auto font-medium tabular-nums">{fmt(bars, v(r, bars))}</b>
              </span>
            )}
            {detail?.(r).map((d) => (
              <span key={d.label} className="text-muted-foreground flex gap-2">
                {d.label}
                <span className="text-foreground ms-auto tabular-nums">{d.value}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div aria-hidden className="text-muted-foreground flex ps-10 pe-1 text-[11px]">
        {rows.map((row, i) => (
          <span key={i} className="flex-1 truncate text-center tabular-nums">
            {i % every === 0 ? tick(row) : ""}
          </span>
        ))}
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 ps-10 text-xs">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="bg-primary-ink h-0.5 w-3 rounded-full" />
          {line.label} <span className="text-foreground tabular-nums">{total(line)}</span>
        </span>
        {bars && (
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="bg-primary/40 size-2.5 rounded-sm" />
            {bars.label} <span className="text-foreground tabular-nums">{total(bars)}</span>
          </span>
        )}
      </div>
    </div>
  );
}

export type Row = { key: string; label: React.ReactNode; sub?: React.ReactNode; value: number; display?: string; tone?: "warning" };
export type BreakdownTab = { id: string; label: string; column: string; rows: Row[]; empty: React.ReactNode };

/** A ranked list, each row's share of the largest drawn behind it. Ten at first, the rest a click away. */
export function BarList({ rows, column, empty }: { rows: Row[]; column: string; empty: React.ReactNode }) {
  const [all, setAll] = useState(false);
  if (!rows.length) return <p className="text-muted-foreground px-1 py-6 text-center text-sm">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  const shown = all ? rows : rows.slice(0, 8);
  return (
    <div className="grid gap-1">
      <div className="text-muted-foreground flex justify-end px-2 text-xs font-medium">{column}</div>
      <ol className="grid grid-cols-1 gap-1">
        {shown.map((r) => (
          <li key={r.key} className="relative isolate min-w-0 overflow-hidden rounded-md">
            <span
              aria-hidden
              className={cn("bar-grow absolute inset-y-0 start-0 -z-10 rounded-md", r.tone === "warning" ? "bg-warning/15" : "bg-primary/12")}
              style={{ width: `${Math.max(2, (100 * r.value) / max)}%` }}
            />
            <div className="flex min-h-8 items-center gap-3 px-2 py-1 text-sm">
              <span className="grid min-w-0 flex-1">
                <span className="truncate">{r.label}</span>
                {r.sub && <span className="text-muted-foreground truncate text-xs">{r.sub}</span>}
              </span>
              <span className="shrink-0 font-medium tabular-nums">{r.display ?? short(r.value)}</span>
            </div>
          </li>
        ))}
      </ol>
      {rows.length > 8 && (
        <button type="button" onClick={() => setAll(!all)} className="text-muted-foreground hover:text-foreground justify-self-center px-2 py-1 text-xs underline-offset-2 hover:underline">
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}

/** A breakdown card: its tabs in its header, as DataFast's Referrer, Campaign and Channel, then the picked tab's rows. */
export function Breakdown({ title, tabs, action }: { title: string; tabs: BreakdownTab[]; action?: React.ReactNode }) {
  const [picked, setPicked] = useState(tabs[0].id);
  const tab = tabs.find((t) => t.id === picked) ?? tabs[0];
  const id = useId();
  return (
    <section aria-label={title} className="bg-card flex min-w-0 flex-col gap-3 rounded-xl border p-3 sm:p-4">
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="font-display shrink-0 text-sm font-semibold">{title}</h2>
        {tabs.length > 1 && (
          <div role="tablist" aria-label={title} className="ms-auto flex min-w-0 gap-0.5 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`${id}-${t.id}`}
                aria-selected={t.id === tab.id}
                aria-controls={`${id}-panel`}
                onClick={() => setPicked(t.id)}
                className="text-muted-foreground hover:text-foreground aria-selected:bg-muted aria-selected:text-foreground shrink-0 rounded-md px-2 py-1 text-xs font-medium"
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        {action && <div className={cn("shrink-0", tabs.length > 1 ? "" : "ms-auto")}>{action}</div>}
      </div>
      <div id={`${id}-panel`} role={tabs.length > 1 ? "tabpanel" : undefined} aria-labelledby={tabs.length > 1 ? `${id}-${tab.id}` : undefined}>
        <BarList key={tab.id} rows={tab.rows} column={tab.column} empty={tab.empty} />
      </div>
    </section>
  );
}
