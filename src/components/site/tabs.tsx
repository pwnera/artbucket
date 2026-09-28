"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { LABEL } from "@/components/brand-sections/look";
import { useSite } from "@/components/site/site-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Section } from "@/lib/pages";
import { cn } from "@/lib/utils";

export type PageTabsProps = {
  /** From lib/site.ts groupTabs, in page order. */
  tabs: { name: string; sections: Section[] }[];
  /** Draws one section (brand-sections PageBody's SectionView). */
  render: (s: Section) => React.ReactNode;
};

type Open = readonly [string | null, (tab: string) => void];

const OpenTab = createContext<Open | null>(null);

/**
 * Which of the page's tabs is open, shared by its strip and on-this-page, so
 * a click on a section in another tab opens it first. Null is the first; a
 * new page opens on its first.
 */
export function OpenTabProvider({ page, children }: { page: string | null; children: React.ReactNode }) {
  const [state, setState] = useState<{ page: string | null; tab: string | null }>({ page, tab: null });
  if (state.page !== page) setState({ page, tab: null });
  const set = useCallback((tab: string) => setState({ page, tab }), [page]);
  const value = useMemo(() => [state.page === page ? state.tab : null, set] as const, [state, page, set]);
  return <OpenTab.Provider value={value}>{children}</OpenTab.Provider>;
}

/** The open tab and its setter: the site's, else this strip's own. */
export function useOpenTab(): Open {
  const shared = useContext(OpenTab);
  const own = useState<string | null>(null);
  return shared ?? own;
}

/** A tab's anchor, `#tab-print`: a link to the page with that tab open. */
export const tabAnchor = (name: string) =>
  `tab-${
    name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "") || "tab"
  }`;

/** The id the address points at, if any. */
export function hashId() {
  const id = location.hash.slice(1);
  try {
    return decodeURIComponent(id);
  } catch {
    // A stray % in a pasted link: read it as written.
    return id;
  }
}

/**
 * A page's tabs, as ARIA tabs (arrow keys move between them). Every panel
 * stays in the DOM, the closed ones hidden, so print shows them all and an
 * anchor inside one can be found: arriving at it (a shared link, Back) opens
 * its tab. Picking a tab puts `#tab-{name}` in the address, with no history
 * entry, so the tab can be linked to.
 */
export function PageTabs({ tabs, render }: PageTabsProps) {
  const { view, idOf } = useSite();
  const [open, setOpen] = useOpenTab();
  const value = tabs.find((t) => t.name === open)?.name ?? tabs[0]?.name;

  // Where to go once the tab holding it has opened.
  const land = useRef<string | null>(null);
  useEffect(() => {
    const id = land.current;
    land.current = null;
    if (id) document.getElementById(id)?.scrollIntoView();
  }, [value]);

  const names = tabs.map((t) => t.name).join("\n");
  const page = view.page?.slug;
  useEffect(() => {
    const onHash = () => {
      const id = hashId();
      const el = id ? document.getElementById(id) : null;
      const tab = el?.closest<HTMLElement>("[data-tab]")?.dataset.tab;
      // Not in a tab, or in the open one: the browser has already gone there.
      if (!el || tab === undefined || el.getClientRects().length) return;
      land.current = id;
      setOpen(tab);
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [names, page, setOpen]);

  if (!value) return null;
  return (
    // By anchor, not name: the strip's aria-controls is built from it, and a name may hold spaces.
    <Tabs
      value={tabAnchor(value)}
      onValueChange={(v) => {
        const t = tabs.find((x) => tabAnchor(x.name) === v);
        if (!t) return;
        setOpen(t.name);
        window.history.replaceState(null, "", `#${idOf(v)}`);
      }}
      className="gap-0"
    >
      <div data-chrome className="mx-auto w-full max-w-280 px-6 pt-6 @3xl:px-10 print:hidden">
        <TabsList variant="line" aria-label="Parts of this page" className="h-auto w-full justify-start overflow-x-auto overflow-y-hidden border-b pb-[5px]">
          {tabs.map((t) => (
            // The builder's canvas takes a section dropped on a tab by its name.
            <TabsTrigger key={t.name} value={tabAnchor(t.name)} data-tab-name={t.name} className="flex-none">
              {t.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((t) => (
        // The anchor and the hiding sit on a wrapper: the panel's own id is the strip's (aria-controls).
        <div key={t.name} id={idOf(tabAnchor(t.name))} data-tab={t.name} className={cn("scroll-mt-20", t.name !== value && "hidden print:block")}>
          <TabsContent value={tabAnchor(t.name)} forceMount>
            <p className={cn(LABEL, "mx-auto hidden max-w-280 px-6 pt-8 print:block")}>{t.name}</p>
            {t.sections.map(render)}
          </TabsContent>
        </div>
      ))}
    </Tabs>
  );
}
