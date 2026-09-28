"use client";

import { HEAD } from "@/components/brand-sections/look";
import { AssetTile, LogoTile, pictured } from "@/components/brand-sections/parts";
import { Body, RuleValue, useRuleAnchor } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { Markdown } from "@/components/brand-values";
import { ruleName } from "@/lib/rules";
import type { ViewRule } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * The marks, big and a click from taken: each bound rule's name, then its
 * pictures as tiles on a transparent, light or dark backdrop, each with its
 * download and URL, then what it is, when to use it, and its other files.
 * W4 adds backdrops from bound colors, don't pairs and the kit.
 */

/** Marks per row, as the section's room allows: one on a phone. */
const GRID: Record<number, string> = {
  2: "@xl:grid-cols-2",
  3: "@xl:grid-cols-2 @4xl:grid-cols-3",
  4: "@xl:grid-cols-2 @4xl:grid-cols-4",
};

export function LogosSection({ section, rules: bound }: SectionProps) {
  const anchor = useRuleAnchor();
  // Only its keys: `rules` also carries a background color and items' keys (W4's grounds).
  const rules = bound.filter((r) => section.keys.includes(r.key));
  return (
    <div className="space-y-8">
      <Body />
      {rules.length > 0 && (
        // Its own container: the frame's is the whole section, wider than the column this sits in.
        <div className="@container">
          <div className={cn("grid gap-x-6 gap-y-10", GRID[section.columns])}>
            {rules.map((r) => (
              <Mark key={r.key} rule={r} id={anchor(r.key)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Mark({ rule: r, id }: { rule: ViewRule; id?: string }) {
  const pics = r.assets.filter(pictured);
  const files = r.assets.filter((a) => !pictured(a));
  return (
    <div id={id} className="@container min-w-0 scroll-mt-20 space-y-3">
      <h3 className={cn(HEAD, "text-lg")}>{ruleName(r)}</h3>
      {pics.length > 0 && (
        <div className={cn("grid gap-3", pics.length > 1 && "@lg:grid-cols-2")}>
          {pics.map((a) => (
            // A dark-background version starts on dark, where it is meant to sit.
            <LogoTile key={a.id} asset={a} dark={!!r.context && /dark/.test(r.context)} />
          ))}
        </div>
      )}
      <RuleValue rule={r} />
      {r.usage && <Markdown text={r.usage} className="text-muted-foreground text-sm" demote />}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {files.map((a) => (
            <AssetTile key={a.id} asset={a} />
          ))}
        </div>
      )}
    </div>
  );
}
