"use client";

import type { z } from "zod";
import { Markdown } from "@/components/brand-values";
import { HEAD } from "@/components/brand-sections/look";
import { Body, Opens, RuleSlot, useRuleAnchor } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { CopyButton } from "@/components/copy-button";
import { useSite } from "@/components/site/site-context";
import { measure } from "@/lib/diagram";
import type { TEMPLATE_PROPS } from "@/lib/pages";
import { ruleName } from "@/lib/rules";
import type { ViewRule } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * Design tokens drawn, by props.kind (spacing when left out): a bar per step
 * of a spacing scale, a box per radius, a card casting each shadow, a dot
 * crossing in each duration, the grid's columns and gutters over a frame.
 * Every value is written beside its drawing. A bound rule the kind can't
 * draw (words in a spacing specimen, a width in x) reads as its block.
 */

type Kind = NonNullable<z.output<typeof TEMPLATE_PROPS.specimen>["kind"]>;

/** The units a CSS length takes as they are; x and ms measure something else. */
const LENGTH = new Set(["px", "pt", "mm", "cm", "in", "%", "em", "rem"]);

const unitOf = (r: ViewRule) => (r.type === "number" && r.spec && "unit" in r.spec ? r.spec.unit : undefined);

/** What a specimen draws: a number rule's value, or a list's numbers (a list has no unit). */
const steps = (r: ViewRule): number[] =>
  r.type === "number" ? [r.value as number] : r.type === "list" ? (r.value as (string | number)[]).filter((v): v is number => typeof v === "number") : [];

/** A step as a CSS length, in px when the rule names no unit; null for a unit that isn't a length. */
const length = (v: number, unit = "px") => (LENGTH.has(unit) ? `${v}${unit}` : null);

/**
 * A shadow is the rule's words set as box-shadow through a style object. On
 * the server React writes that object into the style attribute as it is, so
 * a `;` or a brace would start CSS of its own: such a value is only shown.
 */
const SHADOW = /^[^;{}<>\\]+$/;

const measured = (r: ViewRule) => steps(r).length > 0 && length(0, unitOf(r)) !== null;

const DRAW: Record<Exclude<Kind, "grid">, { fits: (r: ViewRule) => boolean; View: React.ComponentType<{ rule: ViewRule }> }> = {
  spacing: { fits: measured, View: Bars },
  radius: { fits: measured, View: Corners },
  shadow: { fits: (r) => r.type === "text" && SHADOW.test(r.value as string), View: Shadow },
  motion: { fits: (r) => steps(r).length > 0 && (unitOf(r) ?? "ms") === "ms", View: Motion },
};

/** As many across as `columns` asks, once the section has the room. */
const GRID: Record<number, string> = {
  1: "",
  2: "@xl:grid-cols-2",
  3: "@xl:grid-cols-2 @4xl:grid-cols-3",
  4: "@xl:grid-cols-2 @4xl:grid-cols-4",
};

export function SpecimenSection({ section: s, rules }: SectionProps) {
  const kind = (s.props.kind as Kind | undefined) ?? "spacing";
  // Only its keys: `rules` also carries a background color.
  const own = rules.filter((r) => s.keys.includes(r.key));
  const draw = kind === "grid" ? null : DRAW[kind];
  return (
    <div className="space-y-8">
      <Body />
      {draw ? (
        <div className={cn("grid gap-10", GRID[s.columns])}>
          {own.map((r) =>
            draw.fits(r) ? (
              <Named key={r.key} rule={r}>
                <draw.View rule={r} />
              </Named>
            ) : (
              <RuleSlot key={r.key} rule={r} />
            ),
          )}
        </div>
      ) : (
        <Grid rules={own} columns={s.columns} />
      )}
    </div>
  );
}

/** A rule's name over its drawing, its note under it. On the canvas a click opens its card. */
function Named({ rule, children }: { rule: ViewRule; children: React.ReactNode }) {
  const anchor = useRuleAnchor()(rule.key);
  return (
    <Opens rule={rule}>
      <div id={anchor} className="min-w-0 scroll-mt-20 space-y-3">
        <h3 className={cn(HEAD, "text-lg")}>{ruleName(rule)}</h3>
        {children}
        {rule.usage && <Markdown text={rule.usage} className="text-muted-foreground text-sm" demote />}
      </div>
    </Opens>
  );
}

const READOUT = "text-muted-foreground w-16 shrink-0 font-mono text-xs tabular-nums";

function Bars({ rule }: { rule: ViewRule }) {
  const unit = unitOf(rule);
  return (
    <ul className="space-y-2">
      {steps(rule).map((v, i) => (
        <li key={i} className="flex items-center gap-4">
          <span className={READOUT}>{measure(v, unit ?? "px")}</span>
          <span data-specimen className="h-3 max-w-full rounded-sm bg-(--brand-accent)" style={{ inlineSize: length(v, unit)! }} />
        </li>
      ))}
    </ul>
  );
}

function Corners({ rule }: { rule: ViewRule }) {
  const unit = unitOf(rule);
  return (
    <ul className="flex flex-wrap gap-6">
      {steps(rule).map((v, i) => (
        <li key={i} className="space-y-2">
          <span data-specimen className="block size-20 border-2 border-(--brand-accent) bg-(--brand-accent)/10" style={{ borderRadius: length(v, unit)! }} />
          <span className={cn(READOUT, "block")}>{measure(v, unit ?? "px")}</span>
        </li>
      ))}
    </ul>
  );
}

function Shadow({ rule }: { rule: ViewRule }) {
  const css = rule.value as string;
  return (
    <div className="space-y-3">
      {/* Room around the card, so the shadow shows whole. */}
      <div className="p-4">
        <div data-specimen className="bg-card h-28 rounded-xl" style={{ boxShadow: css }} />
      </div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 font-mono text-sm break-all">{css}</code>
        <CopyButton text={css} label="Copy the shadow" what="the shadow" />
      </div>
    </div>
  );
}

/**
 * A dot crossing its track in each duration, on hover or focus. Still when
 * the reader asks for less motion, or the theme's motion is none; the
 * duration is written beside it either way.
 */
function Motion({ rule }: { rule: ViewRule }) {
  const moves = useSite().view.theme.motion !== "none";
  return (
    <ul className="space-y-3">
      {steps(rule).map((v, i) => (
        <li key={i} className="flex items-center gap-4">
          <span className={READOUT}>{measure(v, "ms")}</span>
          <span
            data-specimen
            role="img"
            aria-label={`A dot crossing in ${measure(v, "ms")}`}
            tabIndex={moves ? 0 : undefined}
            className="group bg-muted relative h-10 min-w-0 flex-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-(--brand-accent)"
          >
            <span
              className={cn(
                "absolute inset-y-1 start-1 aspect-square rounded-full bg-(--brand-accent) transition-all ease-out",
                moves && "motion-safe:group-hover:start-[calc(100%-2.25rem)] motion-safe:group-focus-visible:start-[calc(100%-2.25rem)]",
              )}
              style={{ transitionDuration: `${v}ms` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The grid over a frame: the columns, a whole number with no unit, apart by
 * the gutter, the next number that is a length, at true size. Each rule is
 * then written out as its value.
 */
function Grid({ rules, columns }: { rules: ViewRule[]; columns: number }) {
  const n = (r: ViewRule) => r.value as number;
  const cols = rules.find((r) => r.type === "number" && !unitOf(r) && Number.isInteger(n(r)) && n(r) >= 1 && n(r) <= 48);
  const gutter = rules.find((r) => r !== cols && r.type === "number" && length(n(r), unitOf(r)) !== null);
  const words = (
    <div className={cn("grid gap-10", GRID[columns])}>
      {rules.map((r) =>
        r.type === "number" ? (
          <Named key={r.key} rule={r}>
            <p data-specimen className="font-mono text-2xl tabular-nums">
              {measure(n(r), unitOf(r))}
            </p>
          </Named>
        ) : (
          <RuleSlot key={r.key} rule={r} />
        ),
      )}
    </div>
  );
  if (!cols) return words;
  return (
    <div className="space-y-8">
      <Opens rule={cols}>
        {/* The drawing repeats the values written under it. */}
        <div
          data-specimen
          aria-hidden
          className="bg-muted/40 grid h-40 rounded-xl border p-4"
          style={{ gridTemplateColumns: `repeat(${n(cols)}, minmax(0, 1fr))`, columnGap: gutter ? length(n(gutter), unitOf(gutter))! : 0 }}
        >
          {Array.from({ length: n(cols) }, (_, i) => (
            <span key={i} className="rounded-sm bg-(--brand-accent)/20" />
          ))}
        </div>
      </Opens>
      {words}
    </div>
  );
}
