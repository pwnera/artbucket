"use client";

import Link, { useLinkStatus } from "next/link";
import { useSelectedLayoutSegments } from "next/navigation";
import { useEffect, useRef } from "react";
import { IconLock, type Icon } from "@tabler/icons-react";
import { Spinner } from "@/components/ui/spinner";
import { useMe } from "@/components/can";
import { AppHeader, PageHeader } from "@/components/page";
import { allowedFor, contextTitle, CONTEXTS, find, hrefFor, locked } from "@/components/settings/sections";
import { cn } from "@/lib/utils";

/**
 * Settings' frame, mounted once by settings/layout.tsx: a menu of the
 * sections this person may open grouped by what they apply to, and the open
 * one's title. Only the pane beside it swaps when a section changes, and the
 * open one is read from the URL, so the menu moves the moment you click.
 */
export function SettingsShell({ children }: { children: React.ReactNode }) {
  const me = useMe()!;
  const [context, id] = useSelectedLayoutSegments();
  const sections = allowedFor(me);
  const current = context && id ? find(context, id) : undefined;
  const active = useRef<HTMLAnchorElement>(null);
  // On a phone the menu is a row that scrolls sideways: keep the open section in it, not off to the right.
  useEffect(() => {
    active.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [context, id]);
  return (
    <>
      <AppHeader
        trail={[{ label: "Settings", href: "/settings" }, ...(current ? [{ label: contextTitle(current.context, me) }, { label: current.label }] : [])]}
      />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pt-6 pb-16 md:flex-row md:px-6">
        <nav
          aria-label="Settings"
          // The edges fade on a phone, so it reads as a row that goes on.
          className="-mx-4 flex shrink-0 gap-6 overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(to_right,transparent,#000_1rem,#000_calc(100%-1rem),transparent)] [scrollbar-width:none] md:mx-0 md:w-52 md:flex-col md:overflow-visible md:px-0 md:[mask-image:none]"
        >
          {CONTEXTS.map((c) => {
            const here = sections.filter((s) => s.context === c);
            if (!here.length) return null;
            return (
              <div key={c} className="shrink-0 space-y-1 md:min-w-0 md:shrink">
                <p className="text-muted-foreground truncate px-2 text-xs font-medium">{contextTitle(c, me)}</p>
                <ul className="flex gap-1 md:flex-col">
                  {here.map((s) => {
                    const on = s.context === context && s.id === id;
                    // Its feature is a plan's: the link goes to take one (me.upgrade), and says so.
                    const plan = locked(me, s);
                    return (
                      <li key={s.id}>
                        <Link
                          ref={on ? active : undefined}
                          href={hrefFor(me, s)}
                          title={plan ? "On a paid plan: upgrade to use it" : undefined}
                          aria-current={on ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm whitespace-nowrap transition-colors",
                            on ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                          )}
                        >
                          <NavIcon icon={s.icon} /> {s.label}
                          {plan && <IconLock aria-label="Upgrade to use" className="text-muted-foreground/70 ml-auto size-3.5" />}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
        <div className="min-w-0 flex-1 space-y-6">
          {current && <PageHeader icon={<current.icon />} title={current.label} description={current.description} />}
          {children}
        </div>
      </div>
    </>
  );
}

/** The section's icon, a spinner in its place while its link is on its way: same size, so nothing moves. */
function NavIcon({ icon: I }: { icon: Icon }) {
  const { pending } = useLinkStatus();
  return pending ? <Spinner className="size-4 shrink-0" /> : <I className="size-4 shrink-0" />;
}
