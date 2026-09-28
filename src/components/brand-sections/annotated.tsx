"use client";

import { useId } from "react";
import { LABEL } from "@/components/brand-sections/look";
import { Body, ItemText, ItemTitle, RuleValue, useRuleAnchor } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { useMedia, useSite } from "@/components/site/site-context";
import { Thumb } from "@/components/thumb";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ruleName } from "@/lib/rules";
import type { ViewRule } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * Annotated image: props.image with a numbered hotspot at each item's `at`
 * ([x, y] in percent from the top left), and beside it, under it in a
 * narrow section, the same notes as a numbered list, so they read without
 * the picture: on paper, to a screen reader, before the script loads. A
 * hotspot is a button: Tab reaches them in the items' order, Enter or Space
 * opens its note, Esc closes it. With no image, the list alone; the page
 * warns (lib/pages.ts ruleWarnings).
 */

/** A note's number, on the picture and in the list alike. */
const BADGE = "flex size-7 shrink-0 items-center justify-center rounded-full bg-(--brand-accent) text-xs font-semibold text-(--brand-on-accent) tabular-nums";

export function AnnotatedSection({ section: s, rules }: SectionProps) {
  const { url } = useSite();
  const id = useId();
  const image = typeof s.props.image === "string" ? s.props.image : undefined;
  const media = useMedia(image);
  const items = s.items ?? [];
  const ruleOf = (key?: string) => (key ? rules.find((r) => r.key === key) : undefined);
  const noteId = (i: number) => `${id}-note-${i}`;

  const list = items.length > 0 && (
    <ol className="min-w-0 space-y-6">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-3">
          <span aria-hidden className={BADGE}>
            {i + 1}
          </span>
          <Note i={i} rule={ruleOf(it.key)} id={noteId(i)} />
        </li>
      ))}
    </ol>
  );

  return (
    <div className="space-y-8">
      <Body />
      {image ? (
        <div className="grid items-start gap-8 @3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] @3xl:gap-12">
          {/* At the picture's own shape, so `at` lands where it was set. ponytail: 4:3 until its size is known, which misplaces hotspots on another shape. */}
          <div className="relative" style={{ aspectRatio: media?.width && media.height ? media.width / media.height : 4 / 3 }}>
            <div className="bg-muted absolute inset-0 overflow-hidden rounded-xl">
              <Thumb src={url(image, "/w_1600,f_webp")} alt={media?.title ?? media?.description ?? media?.filename ?? ""} className="p-0" />
            </div>
            {items.map((it, i) =>
              it.at ? (
                <Hotspot key={i} n={i + 1} at={it.at} note={noteId(i)}>
                  <Note i={i} rule={ruleOf(it.key)} />
                </Hotspot>
              ) : null,
            )}
          </div>
          {list}
        </div>
      ) : (
        list
      )}
    </div>
  );
}

/**
 * A numbered button on the picture, its note in a popover. Focus stays on
 * the button when it opens, so Tab goes on to the next hotspot (closing
 * this one) rather than into a popover at the end of the page; a screen
 * reader hears the note as the button's description, from the list.
 */
function Hotspot({ n, at: [x, y], note, children }: { n: number; at: [number, number]; note: string; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-describedby={note}
        className={cn(
          BADGE,
          "ring-background absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer shadow-md ring-2 outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--brand-accent) data-[state=open]:scale-110",
        )}
        // physical: `at` is measured on the picture, which reads the same way in any script.
        style={{ left: `${x}%`, top: `${y}%` }}
      >
        <span className="sr-only">Note </span>
        {n}
      </PopoverTrigger>
      <PopoverContent side="top" onOpenAutoFocus={(e) => e.preventDefault()}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** An item's words and the rule it names. `id`: the listed copy, which carries the heading and the rule's anchor; the popover's is plain. */
function Note({ i, rule, id }: { i: number; rule?: ViewRule; id?: string }) {
  const anchor = useRuleAnchor();
  return (
    <div id={id} className="min-w-0 flex-1 space-y-1.5">
      <ItemTitle i={i} as={id ? "h3" : "p"} />
      <ItemText i={i} className="text-muted-foreground" />
      {rule && (
        <div id={id && anchor(rule.key)} className="scroll-mt-20 space-y-1 pt-1 [&_.rich]:text-sm">
          <p className={cn(LABEL, "text-muted-foreground")}>{ruleName(rule)}</p>
          <RuleValue rule={rule} />
        </div>
      )}
    </div>
  );
}
