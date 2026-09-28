"use client";

import { useMemo } from "react";
import { useAssetFont } from "@/components/font-preview";
import { useSite } from "@/components/site/site-context";
import { brandTheme, stack, themeVars } from "@/lib/brand-theme";
import { luminance, rgb } from "@/lib/color";
import { cn } from "@/lib/utils";

/**
 * The page in the brand's own faces and accent (lib/brand-theme.ts), as CSS
 * variables on the page only: the header, menus and panels stay the app's.
 * Unset, each falls back to the app's own, so a brand with no fonts or colors
 * reads as before. The v1 rules page's; brand sites wear useSiteLook.
 * ponytail: goes with brand-editor.tsx in W6.
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

/**
 * On the page: body text in the brand's face, and the accent (marks) and its
 * text shade (links) for the app's light or dark page. A theme with a
 * surface sets both outright, inline, which wins over these.
 */
export const LOOK =
  "font-(family-name:--brand-body) [--brand-accent:var(--brand-accent-l)] dark:[--brand-accent:var(--brand-accent-d)] [--brand-accent-text:var(--brand-accent-text-l)] dark:[--brand-accent-text:var(--brand-accent-text-d)]";

/** Headings in the brand's heading face and weight. */
export const HEAD = "font-(family-name:--brand-head) [font-weight:var(--brand-head-weight,600)] tracking-tight";

/** Eyebrows, labels and running heads in the label face, cased and tracked as the theme says. */
export const LABEL =
  "font-(family-name:--brand-label) text-2xs [text-transform:var(--brand-label-case,uppercase)] tracking-[var(--brand-label-tracking,0.08em)]";

/**
 * Which of the app's schemes a ground reads as, so `dark:` variants (a logo's
 * light version, a button's fill) follow the ground, not the app: `light`
 * undoes an app in dark mode (globals.css).
 */
const scheme = (ink: string, ground: string) => (luminance(rgb(ink)) > luminance(rgb(ground)) ? "dark" : "light");

/**
 * The site root's look (build spec 3.3.3): the theme's variables, and with a
 * surface, its ground and ink, in the scheme they read as. Without one the
 * site follows the app's light and dark. The nav sheet, which portals out of
 * the root, wears it too.
 */
export function useSiteLook(): { className: string; style: React.CSSProperties } {
  const { view, url } = useSite();
  const t = view.theme;
  return useMemo(
    () => ({
      className: cn(LOOK, t.surface && ["bg-(--brand-surface) text-(--brand-ink)", scheme(t.ink, t.surface)]),
      style: themeVars(t, url) as React.CSSProperties,
    }),
    [t, url],
  );
}
