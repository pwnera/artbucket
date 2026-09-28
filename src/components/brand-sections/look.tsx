"use client";

import { useMemo } from "react";
import { useAssetFont } from "@/components/font-preview";
import { useSite } from "@/components/site/site-context";
import { brandTheme, fontFaceCss, fontRoles, stack, type ThemeFace, themeVars } from "@/lib/brand-theme";
import { luminance, rgb } from "@/lib/color";
import { dirOf, type PageView, scriptOf, type ViewRule } from "@/lib/site";
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

const scriptIn = (r?: Pick<ViewRule, "spec">) => (r?.spec as { script?: string } | null | undefined)?.script;

/**
 * The faces a reader in `script` needs (build spec 1.6): font rules whose
 * spec.script is it, as heading and text face. Where the theme's own face is
 * already in the script it keeps its place; an untagged face counts as
 * Latin, as scriptOf does, so a Latin reader's page never changes.
 */
function scriptFaces(view: PageView, script: string): { head?: ThemeFace; body?: ThemeFace } {
  const base = view.rules.filter((r) => r.context === null);
  const own = fontRoles(base, view.theme.settings);
  const theirs = brandTheme(base.filter((r) => r.type === "font" && scriptIn(r) === script));
  const needs = (r?: ViewRule) => (scriptIn(r) ?? "Latn") !== script;
  return { head: needs(own.head) ? theirs.head : undefined, body: needs(own.body) ? theirs.body : undefined };
}

export type SiteLook = {
  className: string;
  style: React.CSSProperties;
  /** The reader's language and its direction, for the site root and what portals out of it. */
  lang?: string;
  dir?: "ltr" | "rtl";
  /** @font-face for the script's faces, as SiteProvider writes the theme's: render it in a <style>. */
  faces: string;
};

/**
 * The site root's look (build spec 3.3.3): the theme's variables, and with a
 * surface, its ground and ink, in the scheme they read as. Without one the
 * site follows the app's light and dark. The nav sheet, which portals out of
 * the root, wears it too. In a language with its own faces, they lead the
 * heading and text stacks (3.4 item 10).
 */
export function useSiteLook(): SiteLook {
  const { view, url } = useSite();
  return useMemo(() => {
    const t = view.theme;
    const vars = themeVars(t, url);
    const lang = view.lang || undefined;
    const lead = lang ? scriptFaces(view, scriptOf(lang)) : {};
    // The theme's stack becomes the script face's fallback, so words it lacks (Latin, digits) stay in the brand's face;
    // themeVars names the loaded family as fontFaceCss loads it.
    const over = (f: ThemeFace | undefined, then: string | undefined) => f && { ...f, fallback: then ?? f.fallback };
    const led = themeVars({ ...t, faces: { head: over(lead.head, vars["--brand-head"]), body: over(lead.body, vars["--brand-body"]) } }, url);
    return {
      className: cn(LOOK, t.surface && ["bg-(--brand-surface) text-(--brand-ink)", scheme(t.ink, t.surface)]),
      style: {
        ...vars,
        ...(lead.head && { "--brand-head": led["--brand-head"] }),
        ...(lead.body && { "--brand-body": led["--brand-body"] }),
      } as React.CSSProperties,
      lang,
      dir: lang ? (t.settings.languages?.find((l) => l.code === lang)?.dir ?? dirOf(lang)) : undefined,
      // A family is the brand's words: no "<" ends the <style>.
      faces: fontFaceCss(lead, url).replaceAll("<", "\\3c "),
    };
  }, [view, url]);
}
