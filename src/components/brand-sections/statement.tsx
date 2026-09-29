"use client";

import { Body, RuleSlot } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { cn } from "@/lib/utils";

/**
 * One line at headline size on a ground: the title, drawn by the frame at
 * the template's size (huge). Under it, a small line (the body) and the text
 * rule it binds, said plainly. Centered when props.align says so.
 */
export function StatementSection({ section: s, rules }: SectionProps) {
  const center = s.props.align === "center";
  const shown = rules.filter((r) => s.keys.includes(r.key));
  return (
    <div className={cn("space-y-6", center && "mx-auto text-center")}>
      <Body className="text-muted-foreground max-w-(--brand-measure) text-lg leading-relaxed @3xl:text-xl" />
      {shown.map((r) => (
        <div key={r.key} className={cn("max-w-(--brand-measure)", center && "mx-auto")}>
          <RuleSlot rule={r} />
        </div>
      ))}
    </div>
  );
}
