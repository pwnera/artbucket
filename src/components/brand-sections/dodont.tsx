"use client";

import { Body, ItemCaption, ItemText, ItemTitle, itemRoot, RuleSlot } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { MARKER } from "@/components/brand-values";
import { useSite } from "@/components/site/site-context";
import { Thumb } from "@/components/thumb";
import { cn } from "@/lib/utils";

/**
 * Do beside don't: the lists it binds, each line marked with a check or a
 * cross, then its own examples. Their pictures are numbered, and a legend
 * says what each number shows. `pairs` (the default) sets each do beside a
 * don't, `grid` runs the pictures across the section's columns, and `rows`
 * sets each picture beside its words.
 */

type Verdict = "do" | "dont";
const SAYS: Record<Verdict, string> = { do: "Do:", dont: "Don't:" };

type Example = {
  /** The item's index, as the slots take it. */
  i: number;
  /** What the picture and the legend call it: one more than its index. */
  n: number;
  verdict: Verdict;
  /** A title or a text: something for the legend to say. */
  words: boolean;
  pic: { src: string; alt: string } | null;
};

/** Pictures per row with `grid`: two on a phone at most. */
const GRID: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-2 @3xl:grid-cols-3",
  4: "grid-cols-2 @3xl:grid-cols-4",
};

export function DoDontSection({ section: s, rules: bound }: SectionProps) {
  const { view } = useSite();
  // Only its keys: `rules` also carries a background color and items' keys.
  const rules = bound.filter((r) => s.keys.includes(r.key));
  const examples = (s.items ?? []).map((it, i): Example => {
    const m = it.asset ? view.media[it.asset] : undefined;
    return {
      i,
      n: i + 1,
      verdict: it.verdict === "dont" ? "dont" : "do",
      words: !!(it.title || it.text),
      // Only a still has a thumbnail; a file with none is left to the legend.
      pic: m?.thumbnail ? { src: m.thumbnail, alt: it.title ?? it.caption ?? m.title ?? m.filename } : null,
    };
  });
  const pics = examples.filter((x) => x.pic);
  const legend = examples.filter((x) => x.words);
  // Dos in the first column and don'ts in the second, row by row, once there are both.
  const paired = s.props.layout !== "grid" && pics.some((x) => x.verdict === "do") && pics.some((x) => x.verdict === "dont");

  return (
    <div className="space-y-10">
      <Body />
      {rules.length > 0 && (
        <div className="@container">
          <div className={cn("grid gap-x-8 gap-y-6", rules.length > 1 && "@xl:grid-cols-2")}>
            {rules.map((r) => (
              <RuleSlot key={r.key} rule={r} />
            ))}
          </div>
        </div>
      )}
      {examples.length > 0 && (
        <div className="@container space-y-8">
          {s.props.layout === "rows" ? (
            <ol className="divide-y">
              {examples.map((x) => (
                <li key={x.i} {...itemRoot(x.i)} className={cn("grid gap-4 py-6 first:pt-0 last:pb-0", x.pic && "@xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]")}>
                  <Picture example={x} />
                  <Entry example={x} />
                </li>
              ))}
            </ol>
          ) : (
            <>
              {pics.length > 0 && (
                <div className={cn("grid gap-4", s.props.layout === "grid" ? GRID[s.columns] : "@md:grid-cols-2")}>
                  {(paired ? pair(pics) : pics).map((x) => (
                    <Picture
                      key={x.i}
                      example={x}
                      numbered
                      className={cn(paired && (x.verdict === "do" ? "@md:col-start-1" : "@md:col-start-2"))}
                    />
                  ))}
                </div>
              )}
              {legend.length > 0 && (
                <ol className="grid gap-x-8 gap-y-5 @xl:grid-cols-2">
                  {legend.map((x) => (
                    <li key={x.i} {...itemRoot(x.i)}>
                      <Entry example={x} />
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The nth do beside the nth don't. Placed by column, a do or a don't left
 * over sits in its own column on a row of its own, under the rest.
 */
function pair(xs: Example[]): Example[] {
  const dos = xs.filter((x) => x.verdict === "do");
  const donts = xs.filter((x) => x.verdict === "dont");
  return Array.from({ length: Math.max(dos.length, donts.length) }, (_, k) => [dos[k], donts[k]]).flat().filter((x) => x !== undefined);
}

/** An example's number, on its picture and in the legend. */
function Num({ n }: { n: number }) {
  return (
    <span className="bg-foreground text-background flex size-5 shrink-0 items-center justify-center rounded-full text-2xs font-semibold tabular-nums">
      {n}
    </span>
  );
}

/** An example's picture as DoCards draws a rule's: a green or red bar, the picture on a checker, the mark and the caption. */
function Picture({ example: x, numbered, className }: { example: Example; numbered?: boolean; className?: string }) {
  if (!x.pic) return null;
  return (
    <figure {...itemRoot(x.i)} className={cn("bg-card min-w-0 self-start overflow-hidden rounded-xl border", className)}>
      <div aria-hidden className={cn("h-1", x.verdict === "do" ? "bg-success" : "bg-destructive")} />
      <div className="bg-checker relative aspect-[4/3]">
        <Thumb src={x.pic.src} alt={x.pic.alt} className="p-4" />
      </div>
      <figcaption className="flex min-w-0 items-start gap-2 border-t px-3 py-2">
        {numbered && <Num n={x.n} />}
        {MARKER[x.verdict]}
        <span className="sr-only">{SAYS[x.verdict]}</span>
        <ItemCaption i={x.i} className="min-w-0" />
      </figcaption>
    </figure>
  );
}

/** An example in words: its number, its mark, its title and its text. */
function Entry({ example: x }: { example: Example }) {
  return (
    <div className="flex min-w-0 gap-3">
      <Num n={x.n} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          {MARKER[x.verdict]}
          <span className="sr-only">{SAYS[x.verdict]}</span>
          <ItemTitle i={x.i} />
        </div>
        <ItemText i={x.i} className="text-muted-foreground" />
      </div>
    </div>
  );
}
