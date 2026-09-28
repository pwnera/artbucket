"use client";

import { useMemo } from "react";
import { flushSync } from "react-dom";
import { LABEL } from "@/components/brand-sections/look";
import { goTo, useActiveSection } from "@/components/site/anchors";
import { plain } from "@/components/site/nav-tree";
import { useSite } from "@/components/site/site-context";
import { useOpenTab } from "@/components/site/tabs";
import type { Section } from "@/lib/pages";
import { groupTabs } from "@/lib/site";
import { cn } from "@/lib/utils";

export type OnThisPageProps = {
  /** The page's sections as drawn: the titled ones are listed, grouped by tab. */
  sections: Section[];
};

const titled = (ss: Section[]) => ss.filter((s) => s.title);

/**
 * The page's titled sections, grouped under their tabs, with the one being
 * read marked (aria-current="location"). Only what shows is spied on: a
 * closed tab's sections have no place on the page to pass. A click on one in
 * a closed tab opens the tab, then goes there.
 */
export function OnThisPage({ sections }: OnThisPageProps) {
  const { idOf } = useSite();
  const [open, setOpen] = useOpenTab();
  const { before, tabs, after } = useMemo(() => groupTabs(sections), [sections]);
  const shown = tabs.find((t) => t.name === open) ?? tabs[0];
  const active = useActiveSection([...before, ...(shown?.sections ?? []), ...after].filter((s) => s.title).map((s) => idOf(s.id)));

  const item = (s: Section, tab?: string) => {
    const id = idOf(s.id);
    return (
      <li key={s.id}>
        <a
          href={`#${id}`}
          aria-current={active === id ? "location" : undefined}
          onClick={(e) => {
            if (!plain(e)) return;
            e.preventDefault();
            // Shown before it's scrolled to: a closed panel has no place to go.
            if (tab && tab !== shown?.name) flushSync(() => setOpen(tab));
            goTo(id);
          }}
          className={cn(
            "focus-visible:ring-ring/50 block rounded-md border-s-2 py-1 ps-3 pe-2 outline-none focus-visible:ring-2",
            active === id ? "border-foreground text-foreground font-medium" : "text-muted-foreground hover:text-foreground border-transparent",
          )}
        >
          {s.title}
        </a>
      </li>
    );
  };

  return (
    <nav aria-label="On this page" className="text-sm">
      <ul className="space-y-0.5">
        {titled(before).map((s) => item(s))}
        {tabs.map(
          (t) =>
            titled(t.sections).length > 0 && (
              <li key={`tab:${t.name}`} className="pt-2">
                <span className={cn(LABEL, "text-muted-foreground block px-3 pb-1")}>{t.name}</span>
                <ul className="space-y-0.5">{titled(t.sections).map((s) => item(s, t.name))}</ul>
              </li>
            ),
        )}
        {titled(after).map((s) => item(s))}
      </ul>
    </nav>
  );
}
