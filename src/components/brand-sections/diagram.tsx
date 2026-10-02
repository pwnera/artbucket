"use client";

import { useId, useState } from "react";
import { IconCheck, IconX } from "@tabler/icons-react";
import { pictured } from "@/components/brand-sections/parts";
import { Body, ItemTitle, useRuleAnchor } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { useMedia, useSite } from "@/components/site/site-context";
import { Input } from "@/components/ui/input";
import {
  clearSpace,
  cobrand,
  lengths,
  MARK,
  markSize,
  measure,
  meetsMin,
  num,
  onPage,
  PAGE,
  place,
  POSITIONS,
  positionName,
  type Position,
  type Separator,
  type Size,
  type Spacing,
  spacing,
  toPx,
} from "@/lib/diagram";
import type { DIAGRAMS } from "@/lib/pages";
import { ruleName } from "@/lib/rules";
import type { ViewAsset, ViewRule } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * A logo rule drawn over the real mark (props.kind): its clear space, its
 * minimum size at true size with a checker, where it sits on a page, or
 * beside a partner's mark. The mark is the first bound rule with a picture;
 * the value, the first number rule that fits. Geometry is lib/diagram.ts's.
 * Every value drawn is written out under the drawing too. Editors see what's
 * missing; readers see only what can be drawn.
 *
 * The drawings are SVG in their own coordinates, not logical properties: a
 * page's corners and a mark's sides are the same in any script.
 */

type Kind = (typeof DIAGRAMS)[number];

/** Guides in the brand's accent, one pixel wide at any scale; zones in a wash of it; their words in its text shade. */
const GUIDE = "stroke-[var(--brand-accent,var(--primary))]";
const ZONE = "fill-[color-mix(in_oklab,var(--brand-accent,var(--primary))_16%,transparent)]";
const WORDS = "fill-[var(--brand-accent-text,var(--foreground))] font-medium";
const PANEL = "bg-muted/40 rounded-xl border p-6 @3xl:p-10";

const unitOf = (r: ViewRule) => (r.spec && "unit" in r.spec ? r.spec.unit : undefined);
const ofOf = (r: ViewRule) => (r.spec && "of" in r.spec ? r.spec.of : undefined);
const spacingOf = (r: ViewRule): Spacing => ({ value: r.value as number, unit: unitOf(r), of: ofOf(r) });
const isLength = (r: ViewRule) => toPx(1, unitOf(r)) !== null;
const isRelative = (r: ViewRule) => unitOf(r) === "x" || unitOf(r) === "%";

/** A spacing in words: 0.5x the mark's height, 5% of the page's shorter side. */
function spaced(r: ViewRule, of: string) {
  const u = unitOf(r);
  return `${measure(r.value as number, u)}${u === "x" ? ` ${ofOf(r) ?? of}` : u === "%" ? ` of ${ofOf(r) ?? of}` : ""}`;
}

export function DiagramSection({ section: s, rules }: SectionProps) {
  const { mode } = useSite();
  const anchor = useRuleAnchor();
  const kind = (s.props.kind as Kind | undefined) ?? "clearspace";
  // Only its keys: `rules` also carries a background color.
  const own = rules.filter((r) => s.keys.includes(r.key));
  const logo = own.find((r) => r.assets.some(pictured));
  const asset = logo?.assets.find(pictured);
  const numbers = own.filter((r) => r.type === "number" && typeof r.value === "number");
  const n = numbers.find(kind === "minsize" ? isLength : isRelative) ?? numbers[0];

  const warn: string[] = [];
  if (!asset) warn.push("Bind a rule with the mark's picture: there is nothing to draw on.");
  let figure: React.ReactNode = null;

  if (asset && kind === "clearspace") {
    const mark = markSize(asset.width, asset.height);
    const pad = n && spacing(spacingOf(n), mark);
    if (!n) warn.push("Bind a number rule, the clear space in x (times the mark's height).");
    else if (pad == null) warn.push(`${n.key} is in ${unitOf(n) ?? "no unit"}; a clear space is drawn in x or %.`);
    else figure = <ClearSpaceFigure asset={asset} mark={mark} pad={pad} rule={n} id={anchor(n.key)} />;
  }

  if (asset && kind === "minsize") {
    if (!n) warn.push("Bind a number rule, the minimum size in px or mm.");
    else if (!isLength(n)) warn.push(`${n.key} is in ${unitOf(n) ?? "no unit"}; a minimum size is drawn in px, pt or mm.`);
    else figure = <MinSizeFigure asset={asset} rule={n} id={anchor(n.key)} />;
  }

  if (asset && kind === "placement") {
    const positions = ((s.props.positions as Position[] | undefined) ?? []).filter((p) => POSITIONS.includes(p));
    if (!positions.length) warn.push("Mark where it may sit on a page: Where it may sit, in the section's options (props.positions). None is marked.");
    const mark = onPage(markSize(asset.width, asset.height));
    const margin = n ? spacing(spacingOf(n), mark, PAGE) : null;
    if (n && margin == null) warn.push(`${n.key} is in ${unitOf(n)}; a margin is drawn in x, %, px, pt or mm.`);
    figure = <PlacementFigure asset={asset} mark={mark} positions={positions} margin={margin} rule={margin == null ? undefined : n} id={n && anchor(n.key)} />;
  }

  if (asset && logo && kind === "cobrand") {
    const mark = markSize(asset.width, asset.height);
    const gap = n ? spacing(spacingOf(n), mark) : null;
    if (n && gap == null) warn.push(`${n.key} is in ${unitOf(n)}; the space between the marks is drawn in x or %.`);
    const hasItem = !!s.items?.[0]?.asset;
    const partner = typeof s.props.partner === "string" ? s.props.partner : undefined;
    if (!hasItem && !partner) warn.push("Add the partner: their mark with Add their mark, or their name as Partner's name in the section's options (props.partner).");
    else
      figure = (
        <CobrandFigure
          logo={logo}
          asset={asset}
          mark={mark}
          partnerId={s.items?.[0]?.asset}
          title={s.items?.[0]?.title}
          partner={partner}
          separator={(s.props.separator as Separator | undefined) ?? "line"}
          gap={gap}
          rule={gap == null ? undefined : n}
          id={n && anchor(n.key)}
        />
      );
  }

  return (
    <div className="space-y-6">
      <Body />
      {mode === "edit" && warn.length > 0 && (
        <ul className="text-destructive space-y-1 text-sm">
          {warn.map((w) => (
            <li key={w}>Readers see less here: {w}</li>
          ))}
        </ul>
      )}
      {figure}
    </div>
  );
}

// ---- parts ----------------------------------------------------------------------

/** The mark's picture, as the drawings place it. */
function useMark(asset: ViewAsset) {
  const { url } = useSite();
  return { src: url(asset.id, "/w_960,f_webp"), alt: asset.title ?? asset.filename };
}

/** A measured span: a line with its ends ticked and its value beside it (a vertical one) or above it. */
function Dim({ x1, y1, x2, y2, label, font }: { x1: number; y1: number; x2: number; y2: number; label: string; font: number }) {
  const vertical = x1 === x2;
  const t = font / 2.5;
  return (
    <g>
      <g className={GUIDE} strokeWidth={1.5} fill="none">
        <line x1={x1} y1={y1} x2={x2} y2={y2} vectorEffect="non-scaling-stroke" />
        {vertical ? (
          <>
            <line x1={x1 - t} y1={y1} x2={x1 + t} y2={y1} vectorEffect="non-scaling-stroke" />
            <line x1={x1 - t} y1={y2} x2={x1 + t} y2={y2} vectorEffect="non-scaling-stroke" />
          </>
        ) : (
          <>
            <line x1={x1} y1={y1 - t} x2={x1} y2={y1 + t} vectorEffect="non-scaling-stroke" />
            <line x1={x2} y1={y1 - t} x2={x2} y2={y1 + t} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </g>
      <text
        x={vertical ? x1 + t * 1.6 : (x1 + x2) / 2}
        y={vertical ? (y1 + y2) / 2 : y1 - t * 1.6}
        textAnchor={vertical ? "start" : "middle"}
        dominantBaseline={vertical ? "central" : "auto"}
        fontSize={font}
        className={WORDS}
      >
        {label}
      </text>
    </g>
  );
}

/** Under a drawing: what it shows in words, then the rule's note. */
function Caption({ rule, children }: { rule?: ViewRule; children: React.ReactNode }) {
  return (
    <figcaption className="space-y-1 text-sm">
      <div>{children}</div>
      {rule?.usage && <p className="text-muted-foreground">{rule.usage}</p>}
    </figcaption>
  );
}

// ---- clear space ----------------------------------------------------------------

/** The zone around the mark, washed in the accent, its width marked in the top and start bands, and x marked on the mark. */
function ClearSpaceFigure({ asset, mark, pad, rule, id }: { asset: ViewAsset; mark: Size; pad: number; rule: ViewRule; id?: string }) {
  const { src, alt } = useMark(asset);
  const g = clearSpace(mark, pad);
  const { width: W, height: H } = g.zone;
  const m = g.mark;
  const byWidth = /width|wide/i.test(ofOf(rule) ?? "");
  const label = measure(rule.value as number, unitOf(rule));
  const font = MARK / 7;
  const room = font * 3;
  const words = `${ruleName(rule)}: ${spaced(rule, "the mark's height")}, on every side.`;
  return (
    <figure id={id} className="scroll-mt-20 space-y-3">
      <div className={PANEL}>
        <svg role="img" aria-label={`${alt}, with its clear space. ${words}`} viewBox={`${-room} ${-room} ${W + 2 * room} ${H + 2 * room}`} className="mx-auto block h-auto max-h-96 w-full max-w-xl">
          <path d={`M0 0H${W}V${H}H0Z M${m.x} ${m.y}h${m.width}v${m.height}h${-m.width}Z`} fillRule="evenodd" className={ZONE} />
          <rect x={0} y={0} width={W} height={H} fill="none" strokeDasharray="4 3" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className={GUIDE} />
          <image href={src} {...m} preserveAspectRatio="xMidYMid meet" />
          <rect {...m} fill="none" strokeWidth={1} vectorEffect="non-scaling-stroke" className={cn(GUIDE, "opacity-60")} />
          <Dim x1={W / 2} y1={0} x2={W / 2} y2={pad} label={label} font={font} />
          <Dim x1={0} y1={H / 2} x2={pad} y2={H / 2} label={label} font={font} />
          {byWidth ? (
            <Dim x1={m.x} y1={H + room - font / 2} x2={m.x + m.width} y2={H + room - font / 2} label="x" font={font} />
          ) : (
            <Dim x1={W + room / 3} y1={m.y} x2={W + room / 3} y2={m.y + m.height} label="x" font={font} />
          )}
        </svg>
      </div>
      <Caption rule={rule}>{words}</Caption>
    </figure>
  );
}

// ---- minimum size ---------------------------------------------------------------

/** The mark at the minimum, as a CSS length: exact in print, and close to a ruler on a screen at 100% zoom. */
function MinSizeFigure({ asset, rule, id }: { asset: ViewAsset; rule: ViewRule; id?: string }) {
  const { url } = useSite();
  const value = rule.value as number;
  const unit = unitOf(rule)!;
  const l = lengths(value, unit)!;
  const byWidth = /width|wide/i.test(ofOf(rule) ?? "");
  const css = `${value}${unit}`;
  const side = byWidth ? "wide" : "high";
  return (
    <figure id={id} className="scroll-mt-20 space-y-6">
      <div className={cn(PANEL, "flex items-center gap-3")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url(asset.id, "/w_480,f_webp")}
          alt={`${asset.title ?? asset.filename}, ${measure(value, unit)} ${side}`}
          style={byWidth ? { inlineSize: css } : { blockSize: css }}
          className={cn("max-w-none shrink-0", byWidth ? "h-auto" : "w-auto")}
        />
        {!byWidth && <span aria-hidden className="w-1.5 shrink-0 border-y border-e border-[var(--brand-accent,var(--primary))]" style={{ blockSize: css }} />}
        <span className="font-mono text-sm text-[var(--brand-accent-text,var(--foreground))] tabular-nums">{measure(value, unit)}</span>
      </div>
      <Caption rule={rule}>
        <p>
          {ruleName(rule)}: {measure(value, unit)} {side}, at the least. That is {num(l.px)} px, {num(l.mm)} mm or {num(l.pt)} pt.
        </p>
        <p className="text-muted-foreground">Drawn at true size: exact in print, and close to a ruler on a screen at 100% zoom.</p>
      </Caption>
      <SizeCheck min={{ value, unit }} side={side} />
    </figure>
  );
}

/** Type a size, see whether it clears the minimum, in any unit a length takes. */
function SizeCheck({ min, side }: { min: { value: number; unit: string }; side: string }) {
  const id = useId();
  const [typed, setTyped] = useState("");
  const [unit, setUnit] = useState(min.unit);
  const units = [...new Set(["px", "mm", "pt", min.unit])];
  const n = Number(typed);
  const ok = typed.trim() && Number.isFinite(n) && n > 0 ? meetsMin({ value: n, unit }, min) : null;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        Check a size: how {side} is the mark where you use it?
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Input id={id} type="number" inputMode="decimal" min={0} step="any" value={typed} onChange={(e) => setTyped(e.target.value)} className="w-28" />
        <select
          aria-label="Unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="border-input dark:bg-input/30 h-9 rounded-md border bg-transparent px-2 text-sm"
        >
          {units.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <output htmlFor={id} aria-live="polite" className={cn("flex items-center gap-1.5 text-sm", ok === true && "text-success", ok === false && "text-destructive")}>
          {ok === true && <IconCheck className="size-4" />}
          {ok === false && <IconX className="size-4" />}
          {ok === null
            ? `The minimum is ${measure(min.value, min.unit)}.`
            : ok
              ? `Passes: ${measure(n, unit)} is at least ${measure(min.value, min.unit)}.`
              : `Too small: ${measure(n, unit)} is under ${measure(min.value, min.unit)}.`}
        </output>
      </div>
    </div>
  );
}

// ---- placement ------------------------------------------------------------------

/** When no rule gives the margin, a page's is drawn at 5% of its shorter side, and not labeled. */
const MARGIN = Math.min(PAGE.width, PAGE.height) * 0.05;

/** An A4 page, the margin inset in the accent, the mark at each position it may take and a dot at the others. */
function PlacementFigure({
  asset,
  mark,
  positions,
  margin,
  rule,
  id,
}: {
  asset: ViewAsset;
  mark: Size;
  positions: Position[];
  margin: number | null;
  rule?: ViewRule;
  id?: string;
}) {
  const { src, alt } = useMark(asset);
  const m = margin ?? MARGIN;
  const { width: W, height: H } = PAGE;
  const font = 10;
  const where = positions.map(positionName);
  return (
    <figure id={id} className="scroll-mt-20 space-y-3">
      <div className={PANEL}>
        <svg
          role="img"
          aria-label={`A page with ${alt} ${where.length ? `at the ${where.join(", ")}` : "nowhere marked"}.`}
          viewBox={`-2 -2 ${W + 4} ${H + 4}`}
          className="mx-auto block h-auto w-full max-w-72"
        >
          <rect x={0} y={0} width={W} height={H} rx={2} strokeWidth={1} vectorEffect="non-scaling-stroke" className="fill-background stroke-border" />
          <rect x={m} y={m} width={W - 2 * m} height={H - 2 * m} fill="none" strokeDasharray="4 3" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className={GUIDE} />
          {POSITIONS.map((p) => {
            const b = place(PAGE, mark, p, m);
            return positions.includes(p) ? (
              <g key={p}>
                <rect {...b} className={ZONE} />
                <image href={src} {...b} preserveAspectRatio="xMidYMid meet" />
              </g>
            ) : (
              <circle key={p} cx={b.x + b.width / 2} cy={b.y + b.height / 2} r={2} className="fill-muted-foreground/40" />
            );
          })}
          {rule && <Dim x1={W * 0.3} y1={0} x2={W * 0.3} y2={m} label={measure(rule.value as number, unitOf(rule))} font={font} />}
        </svg>
      </div>
      <Caption rule={rule}>
        <p>{where.length ? `It may sit at the ${where.join(", ")} of a page.` : "No position is set."}</p>
        {rule && (
          <p>
            {ruleName(rule)}: {spaced(rule, "the page's shorter side")} from the page&apos;s edges.
          </p>
        )}
      </Caption>
    </figure>
  );
}

// ---- co-brand -------------------------------------------------------------------

/** Their mark's box when only their name is given: room for the name at 0.4 of the mark's height. */
const nameBox = (name: string): Size => ({ width: Math.max(2 * MARK, name.length * 0.24 * MARK + 0.6 * MARK), height: MARK });

/** When no rule gives the gap, half the mark's height, not labeled. */
const GAP = MARK / 2;

/** Our mark, the separator and theirs on one line at one height, the gaps washed in the accent and measured. */
function CobrandFigure({
  logo,
  asset,
  mark,
  partnerId,
  title,
  partner,
  separator,
  gap,
  rule,
  id,
}: {
  logo: ViewRule;
  asset: ViewAsset;
  mark: Size;
  partnerId?: string;
  /** The partner item's title, which its slot shows. */
  title?: string;
  partner?: string;
  separator: Separator;
  gap: number | null;
  rule?: ViewRule;
  id?: string;
}) {
  const { url } = useSite();
  const { src, alt } = useMark(asset);
  const media = useMedia(partnerId);
  const theirs: Size = media?.width && media.height ? { width: media.width, height: media.height } : nameBox(partner ?? title ?? "");
  const g = cobrand(mark, theirs, gap ?? GAP, separator);
  const font = MARK / 7;
  const room = font * 3;
  const label = rule ? measure(rule.value as number, unitOf(rule)) : "";
  const sep = g.separator;
  // The spans between: mark to separator and separator to theirs, or mark to theirs.
  const spans = sep ? [[g.mark.width, sep.x], [sep.x + sep.width, g.partner.x]] : [[g.mark.width, g.partner.x]];
  const theirName = title ?? media?.title ?? partner ?? "their mark";
  const how = { line: "a line between", x: "an x between", none: "nothing between" }[separator];
  return (
    <figure id={id} className="scroll-mt-20 space-y-3">
      <div className={PANEL}>
        <svg
          role="img"
          aria-label={`${alt} beside ${theirName}, ${how}.`}
          viewBox={`${-room} ${-room} ${g.size.width + 2 * room} ${g.size.height + 1.5 * room}`}
          className="mx-auto block h-auto w-full max-w-2xl"
        >
          {spans.map(([a, b]) => (
            <rect key={a} x={a} y={0} width={b - a} height={g.size.height} className={ZONE} />
          ))}
          <image href={src} {...g.mark} preserveAspectRatio="xMidYMid meet" />
          {sep && separator === "line" && <line x1={sep.x} y1={sep.y} x2={sep.x} y2={sep.y + sep.height} strokeWidth={1.5} vectorEffect="non-scaling-stroke" className="stroke-foreground" />}
          {sep && separator === "x" && (
            <g strokeWidth={1.5} className="stroke-foreground">
              <line x1={sep.x} y1={sep.y} x2={sep.x + sep.width} y2={sep.y + sep.height} vectorEffect="non-scaling-stroke" />
              <line x1={sep.x} y1={sep.y + sep.height} x2={sep.x + sep.width} y2={sep.y} vectorEffect="non-scaling-stroke" />
            </g>
          )}
          {media ? (
            <image href={url(media.id, "/w_960,f_webp")} {...g.partner} preserveAspectRatio="xMidYMid meet" />
          ) : (
            <g>
              <rect {...g.partner} rx={MARK / 12} fill="none" strokeDasharray="6 4" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className="stroke-muted-foreground" />
              <text
                x={g.partner.x + g.partner.width / 2}
                y={g.partner.height / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={MARK * 0.4}
                className="fill-muted-foreground"
              >
                {partner ?? title}
              </text>
            </g>
          )}
          {rule && spans.map(([a, b]) => <Dim key={a} x1={a} y1={-font / 2} x2={b} y2={-font / 2} label={label} font={font} />)}
          {rule && unitOf(rule) === "x" && <Dim x1={-room / 2} y1={0} x2={-room / 2} y2={MARK} label="x" font={font} />}
        </svg>
      </div>
      <Caption rule={rule}>
        <div>
          {ruleName(logo)} beside {title ? <ItemTitle i={0} as="p" className="inline text-sm" /> : theirName}, with {how}.
        </div>
        {rule && (
          <p>
            {ruleName(rule)}: {spaced(rule, "the mark's height")}
            {sep ? " on each side of the separator" : " between them"}, both at one height.
          </p>
        )}
      </Caption>
    </figure>
  );
}
