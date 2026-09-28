"use client";

import { IconArrowRight, IconCheck, IconX } from "@tabler/icons-react";
import { HEAD } from "@/components/brand-sections/look";
import { ItemText, ItemTitle, RuleValue, useRuleAnchor, useSection } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { CollectionIcon } from "@/components/collections";
import { useMedia, useSite } from "@/components/site/site-context";
import { Thumb } from "@/components/thumb";
import { Badge } from "@/components/ui/badge";
import type { CollectionIcon as IconName } from "@/lib/collection-icons";
import { SITE_PATH } from "@/lib/markdown";
import { listStyle, ruleName, type ListStyle } from "@/lib/rules";
import { cn } from "@/lib/utils";

/**
 * A card per point: each entry of the lists it binds, each text rule, then
 * each item, in that order. `layout: list` sets them as rows instead, one
 * under the other.
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
  const list = s.props.layout === "list";
  const card = list ? "flex items-start gap-4 py-4" : "bg-card text-card-foreground flex flex-col gap-3 rounded-xl border p-5";

  // Only its keys: `rules` also carries a background color and items' keys.
  const fromRules = rules
    .filter((r) => s.keys.includes(r.key))
    .flatMap((r) => {
      if (r.type === "text")
        return (
          <li key={r.key} id={anchor(r.key)} className={cn(card, "scroll-mt-20")}>
            <div className="min-w-0 flex-1 space-y-1.5">
              <h3 className={cn(HEAD, "text-lg text-balance")}>{ruleName(r)}</h3>
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
    <li className={className}>
      {it.asset && (
        <div className={cn("bg-muted relative shrink-0 overflow-hidden rounded-lg", list ? "size-16" : "aspect-video")}>
          <Thumb src={url(it.asset, list ? "/w_128,f_webp" : "/w_640,f_webp")} alt={media?.title ?? it.caption ?? media?.filename ?? ""} />
        </div>
      )}
      {it.icon && (
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--brand-accent,var(--primary))_14%,transparent)] text-[var(--brand-accent,var(--primary-ink))]"
        >
          <CollectionIcon icon={it.icon as IconName} className="size-5" />
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        {to ? (
          <a href={to} className="group/link focus-visible:ring-ring/50 flex items-center gap-1.5 rounded-sm outline-none focus-visible:ring-[3px]">
            <ItemTitle i={i} className="group-hover/link:underline group-hover/link:underline-offset-4" />
            <IconArrowRight aria-hidden className="size-4 shrink-0 rtl:-scale-x-100" />
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
