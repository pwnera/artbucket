"use client";

import { useMemo } from "react";
import { useAssetFont } from "@/components/font-preview";
import { brandTheme, stack } from "@/lib/brand-theme";

/**
 * The page in the brand's own faces and accent (lib/brand-theme.ts), as CSS
 * variables on the page only: the header, menus and panels stay the app's.
 * Unset, each falls back to the app's own, so a brand with no fonts or colors
 * reads as before.
 */
export function useBrandLook(rules: Parameters<typeof brandTheme>[0]) {
  const t = useMemo(() => brandTheme(rules), [rules]);
  const head = useAssetFont(t.head?.file);
  const body = useAssetFont(t.body?.file);
  return {
    ...(t.head && { "--brand-head": stack(t.head, head), "--brand-head-weight": String(t.head.weight ?? 600) }),
    ...(t.body && { "--brand-body": stack(t.body, body) }),
    ...(t.accent && { "--brand-accent-l": t.accent.light, "--brand-accent-d": t.accent.dark }),
  } as React.CSSProperties;
}

/** On the page: body text in the brand's face, and the accent for the app's light or dark page. */
export const LOOK = "font-(family-name:--brand-body) [--brand-accent:var(--brand-accent-l)] dark:[--brand-accent:var(--brand-accent-d)]";

/** Headings in the brand's heading face and weight. */
export const HEAD = "font-(family-name:--brand-head) [font-weight:var(--brand-head-weight,600)] tracking-tight";

/**
 * Eyebrows, labels and running heads in the label face, cased and tracked.
 * The theme sets the variables (W3); until then, the text face in capitals at 0.08em.
 */
export const LABEL =
  "font-(family-name:--brand-label) text-2xs [text-transform:var(--brand-label-case,uppercase)] tracking-[var(--brand-label-tracking,0.08em)]";
