"use client";

import { useId, useSyncExternalStore } from "react";
import { IconArrowRight, IconCheck, IconX } from "@tabler/icons-react";
import { HEAD } from "@/components/brand-sections/look";
import { ItemText, ItemTitle, itemRoot, RuleValue, useRuleAnchor, useSection } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { CollectionIcon } from "@/components/collections";
import { useMedia, useSite } from "@/components/site/site-context";
import { Thumb } from "@/components/thumb";
import { Badge } from "@/components/ui/badge";
import type { CollectionIcon as IconName } from "@/lib/collection-icons";
import { SITE_PATH } from "@/lib/markdown";
import type { Item } from "@/lib/pages";
import { listStyle, ruleName, type ListStyle } from "@/lib/rules";
import { cn } from "@/lib/utils";

/**
 * A card per point: each entry of the lists it binds, each text rule, then
 * each item, in that order. `layout: list` sets them as rows instead, one
 * under the other. `stats`, `steps`, `checklist` and `tree` set the items their
 * own way (a big figure over its label, a numbered process, a line to tick,
 * the brand's family), under the rules as rows.
 */

/** As many across as `columns` asks, once the section has the room. */
const GRID: Record<number, string> = {
  1: "",
  2: "@xl:grid-cols-2",
  3: "@xl:grid-cols-2 @4xl:grid-cols-3",
  4: "@xl:grid-cols-2 @4xl:grid-cols-4",
};

export function CardsSection({ section: s, rules }: SectionProps) {
  const anchor = useRuleAnchor();
  const layout = s.props.layout ?? "cards";
  const list = layout !== "cards";
  const card = list ? "flex min-w-0 items-start gap-4 py-4" : "bg-card text-card-foreground flex min-w-0 flex-col gap-3 rounded-xl border p-5";

  // Only its keys: `rules` also carries a background color and items' keys.
  const fromRules = rules
    .filter((r) => s.keys.includes(r.key))
    .flatMap((r) => {
      if (r.type === "text")
        return (
          <li key={r.key} id={anchor(r.key)} className={cn(card, "scroll-mt-20")}>
            <div className="min-w-0 flex-1 space-y-1.5">
              <h3 className={cn(HEAD, "text-(length:--brand-h3) leading-snug text-balance")}>{ruleName(r)}</h3>
              <div className="text-muted-foreground [&_.rich]:text-sm">
                <RuleValue rule={r} />
              </div>
            </div>
          </li>
        );
      if (r.type !== "list") return [];
      const entries = r.value as (string | number)[];
      const look = listStyle(r.key, entries);
      return entries.map((entry, j) => (
        <li key={`${r.key}:${j}`} id={j === 0 ? anchor(r.key) : undefined} className={cn(card, "scroll-mt-20", !list && "flex-row items-start")}>
          <Verdict look={look} />
          <p className={cn(HEAD, "min-w-0 flex-1 text-lg text-balance")}>{entry}</p>
        </li>
      ));
    });

  const items = s.items ?? [];
  const own =
    layout === "stats" ? (
      <Stats n={items.length} columns={s.columns} />
    ) : layout === "steps" ? (
      <Steps n={items.length} columns={s.columns} />
    ) : layout === "checklist" ? (
      <Checklist items={items} section={s.id} />
    ) : layout === "tree" ? (
      <Branch nodes={nest(items.map((it) => it.level ?? 0))} />
    ) : null;
  if (own)
    return (
      <div className="space-y-8">
        {fromRules.length > 0 && (
          <ul role="list" className="divide-y">
            {fromRules}
          </ul>
        )}
        {own}
      </div>
    );

  return (
    <ul role="list" className={list ? "divide-y" : cn("grid gap-4", GRID[s.columns])}>
      {fromRules}
      {(s.items ?? []).map((_, k) => (
        <ItemCard key={k} i={k} className={card} list={list} />
      ))}
    </ul>
  );
}

/** A do or don't list's entries keep their check or cross, and say which in words. */
function Verdict({ look }: { look: ListStyle }) {
  if (look !== "do" && look !== "dont") return null;
  const I = look === "do" ? IconCheck : IconX;
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full",
        look === "do" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
      )}
    >
      <I aria-hidden className="size-4" stroke={2.5} />
      <span className="sr-only">{look === "do" ? "Do:" : "Don't:"}</span>
    </span>
  );
}

/** An item: its picture, its icon, its title (the link, when it has one), its text and its tag. */
function ItemCard({ i, className, list }: { i: number; className: string; list: boolean }) {
  const it = useSection().items![i];
  const { view, href, url } = useSite();
  const media = useMedia(it.asset);
  // The brand's own links (/logo, /logo#clear-space, #clear-space) go where the site is shown.
  const m = it.link ? SITE_PATH.exec(it.link) : null;
  const to = m ? href(m[1] ?? view.page?.slug ?? "", m[2]) : it.link;
  return (
    <li {...itemRoot(i)} className={className}>
      {it.asset && (
        <div className={cn("bg-muted relative shrink-0 overflow-hidden rounded-lg", list ? "size-16" : "aspect-video")}>
          <Thumb src={url(it.asset, list ? "/w_128,f_webp" : "/w_640,f_webp")} alt={media?.title ?? it.caption ?? media?.filename ?? ""} />
        </div>
      )}
      {it.icon && (
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--brand-accent)/14 text-(--brand-accent)"
        >
          <CollectionIcon icon={it.icon as IconName} className="size-5" />
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        {to ? (
          <a href={to} className="group/link flex items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-(--brand-accent)">
            <ItemTitle i={i} className="group-hover/link:underline group-hover/link:underline-offset-4" />
            <IconArrowRight aria-hidden className="size-4 shrink-0 text-(--brand-accent-text) rtl:-scale-x-100" />
          </a>
        ) : (
          <ItemTitle i={i} />
        )}
        <ItemText i={i} className="text-muted-foreground" />
      </div>
      {it.label && (
        <Badge variant="secondary" className={cn(!list && "self-start")}>
          {it.label}
        </Badge>
      )}
    </li>
  );
}

/** Big numbers: the item's title is the figure, its text says what it counts. */
function Stats({ n, columns }: { n: number; columns: number }) {
  return (
    <ul role="list" className={cn("grid gap-x-8 gap-y-6", GRID[columns])}>
      {Array.from({ length: n }, (_, i) => (
        <li key={i} {...itemRoot(i)} className="space-y-2 border-s-2 border-(--brand-accent) ps-4">
          <ItemTitle i={i} as="p" className="text-5xl leading-none tabular-nums @3xl:text-6xl" />
          <ItemText i={i} className="text-muted-foreground text-base" />
        </li>
      ))}
    </ul>
  );
}

/** A numbered process: the step's number big in the accent, its title and text beside or under it. */
function Steps({ n, columns }: { n: number; columns: number }) {
  return (
    <ol className={cn("grid gap-x-8 gap-y-8", GRID[columns])}>
      {Array.from({ length: n }, (_, i) => (
        <li key={i} {...itemRoot(i)} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
          <span aria-hidden className={cn(HEAD, "text-(--brand-accent) row-span-2 text-4xl leading-none tabular-nums @3xl:text-5xl")}>
            {String(i + 1).padStart(2, "0")}
          </span>
          <ItemTitle i={i} className="text-lg leading-snug" />
          <ItemText i={i} className="text-muted-foreground text-base" />
        </li>
      ))}
    </ol>
  );
}

// ---- checklist ----------------------------------------------------------------

/** Ticks this page made, which lead: where storage refuses them (a private window, a full disk) the list still ticks, it just won't remember. */
const made = new Map<string, string>();
const TICKED = "artbucket:checklist";
const subscribe = (on: () => void) => {
  window.addEventListener(TICKED, on);
  return () => window.removeEventListener(TICKED, on);
};

/**
 * Which of a checklist's items this reader ticked, in this browser. The
 * server has none, so the first paint is unticked everywhere and hydration
 * agrees. ponytail: by index, so a moved item takes the tick of the one
 * that stood there; key by item when editors reorder lists that readers keep.
 */
function useTicks(key: string): [number[], (next: number[]) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      if (made.has(key)) return made.get(key)!;
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
  let ticks: number[] = [];
  try {
    const v: unknown = JSON.parse(raw ?? "[]");
    if (Array.isArray(v)) ticks = v.filter(Number.isInteger);
  } catch {}
  const set = (next: number[]) => {
    const s = JSON.stringify(next);
    made.set(key, s);
    try {
      localStorage.setItem(key, s);
    } catch {}
    window.dispatchEvent(new Event(TICKED));
  };
  return [ticks, set];
}

/**
 * Lines to tick before something goes out, kept per brand, page and section
 * so two checklists never share ticks. The box is named by the item's title
 * (a label can't hold the heading a slot draws) and described by its text.
 */
function Checklist({ items, section }: { items: Item[]; section: string }) {
  const { view } = useSite();
  const id = useId();
  const [ticks, setTicks] = useTicks(`${TICKED}:${view.brand.slug}/${view.page?.slug ?? ""}#${section}`);
  return (
    <ul role="list" className="space-y-4">
      {items.map((it, i) => (
        <li key={i} {...itemRoot(i)} className="flex items-start gap-3">
          <input
            type="checkbox"
            aria-labelledby={`${id}-${i}`}
            aria-describedby={it.text ? `${id}-${i}-text` : undefined}
            checked={ticks.includes(i)}
            onChange={(e) => setTicks(e.target.checked ? [...ticks, i] : ticks.filter((k) => k !== i))}
            className="mt-1 size-5 shrink-0 cursor-pointer accent-(--brand-accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--brand-accent)"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <div id={`${id}-${i}`}>
              <ItemTitle i={i} as="p" className="text-lg" />
            </div>
            <div id={`${id}-${i}-text`}>
              <ItemText i={i} className="text-muted-foreground" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---- tree ---------------------------------------------------------------------

type Node = { i: number; kids: Node[] };

/** Items by their level: each under the last item above it a level up. A jump (0, then 2) nests one level, not two. */
function nest(levels: number[]): Node[] {
  const roots: Node[] = [];
  // The last node at each depth, down to the one just placed.
  const path: Node[] = [];
  levels.forEach((level, i) => {
    const depth = Math.min(level, path.length);
    const node = { i, kids: [] };
    (depth === 0 ? roots : path[depth - 1].kids).push(node);
    path.length = depth;
    path.push(node);
  });
  return roots;
}

/**
 * A child joined to its parent's line: an elbow to its card, and the line
 * running on past it to the next sibling, stopping at the last.
 */
const JOINED =
  "relative ps-6 pt-3 before:absolute before:start-0 before:top-0 before:h-9 before:w-4 before:rounded-es-lg before:border-s before:border-b before:border-border after:absolute after:start-0 after:inset-y-0 after:border-s after:border-border last:after:hidden";

/** Brand architecture as nested lists, so a screen reader says how deep each one sits. */
function Branch({ nodes, sub }: { nodes: Node[]; sub?: boolean }) {
  return (
    <ul role="list" className={sub ? "ms-5" : "space-y-3"}>
      {nodes.map((node) => (
        <li key={node.i} className={cn(sub && JOINED)}>
          <div {...itemRoot(node.i)} className="bg-card text-card-foreground inline-block max-w-full min-w-0 space-y-1 rounded-lg border px-4 py-3">
            <ItemTitle i={node.i} />
            <ItemText i={node.i} className="text-muted-foreground" />
          </div>
          {node.kids.length > 0 && <Branch nodes={node.kids} sub />}
        </li>
      ))}
    </ul>
  );
}
