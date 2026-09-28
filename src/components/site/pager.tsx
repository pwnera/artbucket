"use client";

import { useMemo } from "react";
import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react";
import { LABEL } from "@/components/brand-sections/look";
import { SiteLink } from "@/components/site/nav-tree";
import { useSite } from "@/components/site/site-context";
import { type NavNode, neighbors } from "@/lib/site";
import { cn } from "@/lib/utils";

export type PagerProps = {
  roots: NavNode[];
  /** The page being read: the pages before and after it come from lib/site.ts neighbors. */
  current: string;
  onNavigate?: (href: string) => void;
};

/** The pages either side in reading order, locked ones passed over, at the foot of the page. */
export function Pager({ roots, current, onNavigate }: PagerProps) {
  const { prev, next } = useMemo(() => neighbors(roots, current), [roots, current]);
  if (!prev && !next) return <></>;
  return (
    <nav aria-label="Pages" data-chrome className="mx-auto grid w-full max-w-280 gap-3 px-6 py-12 @md:grid-cols-2 @3xl:px-10 print:hidden">
      {prev && <Step node={prev} rel="prev" onNavigate={onNavigate} />}
      {next && <Step node={next} rel="next" onNavigate={onNavigate} />}
    </nav>
  );
}

function Step({ node: n, rel, onNavigate }: { node: NavNode; rel: "prev" | "next"; onNavigate?: (href: string) => void }) {
  const { href } = useSite();
  const next = rel === "next";
  // Arrows point along the line, so they turn round in a right-to-left book.
  const Arrow = next ? IconArrowRight : IconArrowLeft;
  return (
    <SiteLink
      href={href(n.slug)}
      rel={rel}
      onNavigate={onNavigate}
      className={cn(
        "hover:bg-muted focus-visible:ring-ring/50 flex flex-col gap-1 rounded-xl border p-4 outline-none focus-visible:ring-2",
        next && "items-end text-end @md:col-start-2",
      )}
    >
      <span className="text-muted-foreground flex items-center gap-1 text-xs">
        {!next && <Arrow aria-hidden className="size-3.5 rtl:-scale-x-100" />}
        {next ? "Next" : "Previous"}
        {next && <Arrow aria-hidden className="size-3.5 rtl:-scale-x-100" />}
      </span>
      <span className="flex items-baseline gap-2 font-medium">
        {n.number && <span className={cn(LABEL, "text-muted-foreground tabular-nums")}>{n.number}</span>}
        {n.title}
      </span>
    </SiteLink>
  );
}
