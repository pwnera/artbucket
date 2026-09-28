"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { AssetUrl } from "@/components/site/asset-url";
import { withSignature } from "@/lib/asset-url";
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
};

const SiteContext = createContext<Site | null>(null);

export function SiteProvider({
  view,
  href,
  url,
  idPrefix = "",
  mode = "read",
  children,
}: {
  view: PageView;
  href: Site["href"];
  /** Left out, asset URLs are /a/{id} with the view's signature, if it has one. */
  url?: Site["url"];
  idPrefix?: string;
  mode?: Site["mode"];
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
  const site = useMemo<Site>(
    () => ({ view, mode, context, setContext, href, url: sign, idOf: (id) => idPrefix + id }),
    [view, mode, context, href, sign, idPrefix],
  );
  return (
    <SiteContext.Provider value={site}>
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
