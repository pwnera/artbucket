"use client";

import { useId } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { Body, ItemFold, ItemText, ItemTitle } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";

/**
 * Questions: each item's title and its text (Markdown), as native folds, one
 * open at a time (`name` groups them; find in page opens the one it lands
 * in). With layout `definitions`, a glossary: each term beside its meaning.
 * Paper shows every answer.
 */
export function FaqSection({ section: s }: SectionProps) {
  // Per copy of the section: a context tab's folds are a group of their own.
  const group = useId();
  const items = s.items ?? [];
  return (
    <div className="space-y-6">
      <Body />
      {items.length > 0 &&
        (s.props.layout === "definitions" ? (
          <dl className="divide-y border-y">
            {items.map((_, i) => (
              <div key={i} className="grid gap-1 py-4 @xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] @xl:gap-8">
                <dt>
                  <ItemTitle i={i} as="p" />
                </dt>
                <dd>
                  <ItemText i={i} className="text-muted-foreground text-base" />
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="divide-y border-y">
            {items.map((_, i) => (
              <ItemFold key={i} name={group} className="group/faq print:details-content:h-auto! print:details-content:[content-visibility:visible]">
                <summary className="flex cursor-pointer list-none items-center gap-4 rounded-sm py-4 outline-none focus-visible:ring-2 focus-visible:ring-(--brand-accent) [&::-webkit-details-marker]:hidden">
                  <ItemTitle i={i} className="min-w-0 flex-1" />
                  <IconChevronDown
                    aria-hidden
                    className="text-muted-foreground size-5 shrink-0 transition-transform group-open/faq:rotate-180 motion-reduce:transition-none print:hidden"
                  />
                </summary>
                <ItemText i={i} className="text-muted-foreground pb-5 text-base" />
              </ItemFold>
            ))}
          </div>
        ))}
    </div>
  );
}
