"use client";

import { Body } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { useSite } from "@/components/site/site-context";
import { UpdateList } from "@/components/site/updates";

/**
 * What's new: the brand's latest publishes, newest first, from the view's
 * `updates` (lib/site.ts PageView), at most `props.limit` (5 when left out).
 */
export function UpdatesSection({ section }: SectionProps) {
  const { view } = useSite();
  const limit = (section.props.limit as number | undefined) ?? 5;
  return (
    <div className="space-y-8">
      <Body />
      <UpdateList updates={(view.updates ?? []).slice(0, limit)} media={view.media} />
    </div>
  );
}
