"use client";

import Link from "next/link";
import { IconSettings } from "@tabler/icons-react";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/brand";
import { PageHeader } from "@/components/page";
import { allowedFor, contextTitle, CONTEXTS, find, hrefOf } from "@/components/settings/sections";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import type { SidebarData } from "@/lib/sidebar";
import { cn } from "@/lib/utils";

/**
 * Settings' frame: the app's sidebar, a menu of the sections this person may
 * open grouped by what they apply to, and the open one.
 */
export function SettingsShell({
  sidebar,
  at,
  children,
}: {
  sidebar: SidebarData;
  at: { context: string; id: string };
  children: React.ReactNode;
}) {
  const me = sidebar.me;
  const sections = allowedFor(me);
  const current = find(at.context, at.id)!;
  return (
    <SidebarProvider>
      <AppSidebar me={me} collections={sidebar.collections} brands={sidebar.brands} searches={sidebar.searches} reviewCount={sidebar.reviewCount} />
      <SidebarInset className="min-w-0">
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <IconSettings className="text-muted-foreground size-4" />
          <span className="text-sm font-semibold">Settings</span>
          <ThemeToggle className="ml-auto" />
        </header>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pt-6 pb-16 md:flex-row md:px-6">
          <nav aria-label="Settings" className="-mx-4 flex shrink-0 gap-6 overflow-x-auto px-4 pb-1 md:mx-0 md:w-52 md:flex-col md:overflow-visible md:px-0">
            {CONTEXTS.map((c) => {
              const here = sections.filter((s) => s.context === c);
              if (!here.length) return null;
              return (
                <div key={c} className="shrink-0 space-y-1 md:min-w-0 md:shrink">
                  <p className="text-muted-foreground truncate px-2 text-xs font-medium">{contextTitle(c, me)}</p>
                  <ul className="flex gap-1 md:flex-col">
                    {here.map((s) => {
                      const active = s.context === at.context && s.id === at.id;
                      return (
                        <li key={s.id}>
                          <Link
                            href={hrefOf(s)}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm whitespace-nowrap transition-colors",
                              active ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                            )}
                          >
                            <s.icon className="size-4 shrink-0" /> {s.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </nav>
          <main className="min-w-0 flex-1 space-y-6">
            <PageHeader icon={<current.icon />} title={current.label} description={current.description} />
            {children}
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
