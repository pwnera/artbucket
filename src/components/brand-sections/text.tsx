"use client";

import { Body, RuleSlot } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { isFontAsset } from "@/lib/font";
import { plainText } from "@/lib/markdown";
import type { ViewRule } from "@/lib/site";

/**
 * Prose: the section's Markdown (callouts, tables and code included), then
 * the rules it reads as words. A short text rule, a mission or a tagline, is
 * set large as a statement; a number, a list or a longer text reads as its
 * block.
 */

/** Under 140 characters as read, with nothing beside its words to show (a face it is set in is fine). */
const statement = (r: ViewRule) => r.type === "text" && plainText(String(r.value)).length < 140 && r.assets.every(isFontAsset);

// Only the value grows, in the heading face; the name, the note and the anchor stay as the block draws them.
const STATEMENT =
  "border-s-2 border-(--brand-accent) ps-4 [&_[data-field=value]_.rich]:font-(family-name:--brand-head) [&_[data-field=value]_.rich]:text-2xl [&_[data-field=value]_.rich]:leading-snug [&_[data-field=value]_.rich]:text-pretty @3xl:[&_[data-field=value]_.rich]:text-3xl";

export function TextSection({ section, rules }: SectionProps) {
  // Only its keys: `rules` also carries a background color and items' keys.
  const shown = rules.filter((r) => section.keys.includes(r.key));
  return (
    <div className="space-y-8">
      <Body className="leading-relaxed" />
      {shown.map((r) =>
        statement(r) ? (
          <div key={r.key} className={STATEMENT}>
            <RuleSlot rule={r} />
          </div>
        ) : (
          <RuleSlot key={r.key} rule={r} />
        ),
      )}
    </div>
  );
}
