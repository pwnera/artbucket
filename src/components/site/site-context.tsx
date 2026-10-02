"use client";

import { useTheme } from "next-themes";
import { createContext, useContext, useMemo, useState } from "react";
import { AssetUrl } from "@/components/site/asset-url";
import { withSignature } from "@/lib/asset-url";
import { fontFaceCss, nightTheme } from "@/lib/brand-theme";
import { resolve } from "@/lib/rules";
import type { Media, PageView, ViewRule } from "@/lib/site";

/**
 * What every part of a brand's site reads: the page's view, how links and
 * asset URLs are built where it is shown (the in-app reader, a portal, the
 * builder canvas, the dev page), and the context being read. One provider at
 * the site's root; renderers never take these as props.
 */
export type Site = {
  view: PageView;
  mode: "read" | "edit";
  /** The context rules resolve for: the view's, until the reader picks another. Null is the default. */
  context: string | null;
  setContext(c: string | null): void;
  /** A page of this brand, and a section on it, where the site is shown. */
  href(page: string, section?: string): string;
  /** An asset, and a rendition of it (`/w_480,f_webp`), signed from the view when a visitor needs it. */
  url(id: string, rest?: string): string;
  /** A section's DOM id: the builder prefixes them, so a canvas never clashes with the page around it. */
  idOf(sectionId: string): string;
  /** The portal the site is shown on, and the headers its visitor got in with; null in the app, where no one outside can ask. */
  portal: { slug: string; headers?: () => HeadersInit } | null;
};

const SiteContext = createContext<Site | null>(null);

export function SiteProvider({
  view,
  href,
  url,
  idPrefix = "",
  mode = "read",
  portal,
  headers,
  children,
}: {
  view: PageView;
  href: Site["href"];
  /** Left out, asset URLs are /a/{id} with the view's signature, if it has one. */
  url?: Site["url"];
  idPrefix?: string;
  mode?: Site["mode"];
  /** The portal's slug, on a portal. */
  portal?: string;
  headers?: () => HeadersInit;
  children: React.ReactNode;
}) {
  const [context, setContext] = useState(view.context);
  // A new view (another page, a refetch for another context) says the context again.
  const [asked, setAsked] = useState(view.context);
  if (asked !== view.context) {
    setAsked(view.context);
    setContext(view.context);
  }
  const signed = view.signed;
  const sign = useMemo(
    () =>
      url ??
      ((id: string, rest = "") => {
        const path = `/a/${id}${rest}`;
        return signed[id] ? withSignature(path, signed[id]) : path;
      }),
    [url, signed],
  );
  // The theme's faces as @font-face, so SSR and print show them. A family is the brand's words: no "<" ends the <style>.
  const faces = useMemo(() => fontFaceCss(view.theme.faces, sign).replaceAll("<", "\\3c "), [view.theme.faces, sign]);
  // A light surface the brand pins turns to its dark when the app is dark (nightTheme).
  // ponytail: the server can't know the scheme, so a dark reader's first paint is light until hydration; a scheme cookie would fix it.
  const { resolvedTheme } = useTheme();
  const night = useMemo(() => (resolvedTheme === "dark" ? nightTheme(view.theme) : null), [resolvedTheme, view.theme]);
  const shown = useMemo(() => (night ? { ...view, theme: { ...view.theme, ...night } } : view), [view, night]);
  const site = useMemo<Site>(
    () => ({ view: shown, mode, context, setContext, href, url: sign, idOf: (id) => idPrefix + id, portal: portal ? { slug: portal, headers } : null }),
    [shown, mode, context, href, sign, idPrefix, portal, headers],
  );
  return (
    <SiteContext.Provider value={site}>
      {faces && <style>{faces}</style>}
      {/* Moved parts (logo tiles, fonts) build URLs through useAssetUrl, so they sign from the view too. */}
      <AssetUrl.Provider value={sign}>{children}</AssetUrl.Provider>
    </SiteContext.Provider>
  );
}

/** Inside, rules resolve for `context`: a section's tab per context shows each as if the reader had picked it. */
export function ContextScope({ context, children }: { context: string | null; children: React.ReactNode }) {
  const site = useSite();
  const value = useMemo(() => ({ ...site, context }), [site, context]);
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite(): Site {
  const site = useContext(SiteContext);
  if (!site) throw new Error("useSite needs a SiteProvider above it");
  return site;
}

/** The rule for `key` in the context being read: its version there, else its default. */
export function useRule(key: string | undefined): ViewRule | undefined {
  const { view, context } = useSite();
  // A context is a slug, so "" matches none: the default versions.
  return useMemo(() => (key ? resolve(view.rules.filter((r) => r.key === key), context ?? "")[0] : undefined), [view.rules, key, context]);
}

/** An asset the page names, with its URLs, from the view. */
export function useMedia(id: string | undefined): Media | undefined {
  const { view } = useSite();
  return id ? view.media[id] : undefined;
}

/**
 * How the words and rules on the builder's canvas change (D12): slots read
 * it and edit where they draw; nothing else does. The canvas provides it
 * from the builder (components/builder/use-builder.ts); a reader has none.
 */
export type Edit = {
  /** Change a section of the page on the canvas: the fields named, null clearing one; props are replaced whole. One undo step per field typed within a second. */
  update(section: string, set: Record<string, unknown>): void;
  /** Make or change a rule version, whole, by its key and context. */
  setRule(rule: ViewRule): void;
  /** Assets just picked or uploaded for an item, so the canvas draws them before the page is loaded again. */
  addMedia(media: Media[]): void;
  /** Pick a section by id, a rule by key. Whether a slot's own section is picked is PickedContext. */
  select(to: { section?: string | null; rule?: string | null }): void;
  /** A color, face, logo or number was clicked: its rule card opens, anchored there. */
  openRule(key: string, at: HTMLElement): void;
  /** The language the canvas shows; null: as written. Words typed in another belong in the section's `translations`. */
  lang: string | null;
};

export const EditContext = createContext<Edit | null>(null);

/**
 * On the canvas, whether the section around is the one picked. Apart from
 * Edit, so a pick redraws the two sections it moves between, not every slot
 * on the page.
 */
export const PickedContext = createContext(false);
export const usePicked = () => useContext(PickedContext);

/** The canvas's edits, or null where the site is read. */
export const useEdit = () => useContext(EditContext);
