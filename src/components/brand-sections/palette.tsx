"use client";

import { Pairings } from "@/components/brand-sections/parts";
import { Body, RuleSlot } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { colorsOf } from "@/lib/brand-theme";
import { cn } from "@/lib/utils";

/**
 * A palette: a card per color, whose swatch copies its hex and whose
 * readouts copy theirs, with its contrast on white and black; then every
 * color on every other, once there are two.
 */

/** The section's columns, as many as its room takes: one on a phone. */
const GRID: Record<number, string> = {
  2: "@xl:grid-cols-2",
  3: "@xl:grid-cols-2 @4xl:grid-cols-3",
  4: "@xl:grid-cols-2 @4xl:grid-cols-3 @5xl:grid-cols-4",
};

export function PaletteSection({ section, rules }: SectionProps) {
  return (
    <div className="space-y-10">
      <Body />
      {rules.length > 0 && (
        // Its own container: the frame's is the whole section, wider than a reading column.
        <div className="@container">
          <div className={cn("grid gap-x-6 gap-y-8", GRID[section.columns])}>
            {rules.map((r) => (
              <RuleSlot key={r.key} rule={r} stacked />
            ))}
          </div>
        </div>
      )}
      <Pairings colors={colorsOf(rules)} />
    </div>
  );
}
