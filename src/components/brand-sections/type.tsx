"use client";

import { useId } from "react";
import { HEAD } from "@/components/brand-sections/look";
import { Body, RuleSlot } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { FontPlayground } from "@/components/font-preview";
import { fontFiles, pickFace } from "@/lib/font";
import { fontValue } from "@/lib/rules";
import type { ViewRule } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * A type specimen: each face set in itself, with its files to download, and
 * the scale as sizes to copy; then a playground per family the brand ships
 * files for, starting from the section's sample. A face without files gets
 * none: it could only show the reader's own copy, which its specimen does.
 */
export function TypeSection({ section, rules }: SectionProps) {
  const sample = typeof section.props.sample === "string" ? section.props.sample : undefined;
  return (
    <div className="space-y-10">
      <Body />
      {rules.length > 0 && (
        // Its own container: the frame's is the whole section, wider than a reading column.
        <div className="@container">
          <div className={cn("grid gap-x-10 gap-y-8", section.columns > 1 && "@3xl:grid-cols-2")}>
            {rules.map((r) => (
              <RuleSlot key={r.key} rule={r} />
            ))}
          </div>
        </div>
      )}
      {[...families(rules)].map(([family, id]) => (
        <Playground key={family} family={family} id={id} sample={sample} />
      ))}
    </div>
  );
}

/** Each family's Regular file, once: the playground's own weight slider covers what a heading and a text rule set apart. */
function families(rules: ViewRule[]) {
  const out = new Map<string, string>();
  for (const r of rules) {
    if (r.type !== "font") continue;
    const { family } = fontValue(r.value);
    const file = pickFace(fontFiles(r));
    if (file && !out.has(family)) out.set(family, file.id);
  }
  return out;
}

/** Named by its family, so two on a page tell their fields apart. */
function Playground({ family, id, sample }: { family: string; id: string; sample?: string }) {
  const title = useId();
  return (
    <div role="group" aria-labelledby={title} className="space-y-4 border-t pt-8">
      <h3 id={title} className={cn(HEAD, "text-(length:--brand-h3) leading-snug")}>
        Try {family}
      </h3>
      <FontPlayground id={id} sample={sample} flow />
    </div>
  );
}
