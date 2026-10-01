"use client";

import { IconActivity, IconInbox, IconPhoto, IconSearch, IconSparkles } from "@tabler/icons-react";
import { NavLink } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/brand";
import { useMe } from "@/components/can";
import { IconButton } from "@/components/icon-button";
import { useShell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export type Crumb = { label: string; href?: string };

const isTrail = (t: Crumb[] | React.ReactNode): t is Crumb[] =>
  Array.isArray(t) && t.every((c) => typeof c === "object" && c !== null && "label" in c);

/**
 * Every page's top bar, Linear style: where you are on the left, as a trail
 * whose last step is this page, and what you can do here on the right.
 * `trail` is crumbs, or a node for a page that draws its own.
 */
export function AppHeader({ trail, children }: { trail: Crumb[] | React.ReactNode; children?: React.ReactNode }) {
  const { openPalette } = useShell();
  const me = useMe();
  return (
    <header className="bg-background sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
      {isTrail(trail) ? <Trail crumbs={trail} /> : trail}
      {/* On a phone the actions give way rather than push the page wider: each keeps its size, but what says it may shrink (shrink!: a search box, a status badge). */}
      <div className="ml-auto flex min-w-0 items-center gap-2 *:shrink-0">
        {/* An admin on the server's own limits, where the server sells plans (BILLING_URL). */}
        {me?.upgrade && (
          <Button asChild size="sm" variant="outline" className="upgrade">
            <a href={me.upgrade}>
              <IconSparkles aria-hidden className="text-primary" />
              Upgrade
            </a>
          </Button>
        )}
        {children}
        {/* The sidebar's search sits in the phone's sheet; this opens it in one tap. */}
        <IconButton variant="ghost" label="Search" className="md:hidden" onClick={openPalette}>
          <IconSearch />
        </IconButton>
        {/* Signed in, the theme lives in the account menu and ⌘K. */}
        {!me?.user && <ThemeToggle />}
      </div>
    </header>
  );
}

function Trail({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 overflow-hidden">
      <ol className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm whitespace-nowrap">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={i} className={cn("flex min-w-0 items-center gap-1.5", last ? "text-foreground truncate font-medium" : "hidden sm:flex")}>
              {i > 0 && <span aria-hidden className={cn(last && "hidden sm:inline")}>/</span>}
              {c.href && !last ? (
                <NavLink href={c.href} className="hover:text-foreground">
                  {c.label}
                </NavLink>
              ) : (
                <span className="truncate" aria-current={last ? "page" : undefined}>
                  {c.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * The library's three views, PostHog style: what's in it, what waits on you,
 * and what happened. Each is a URL; the first two move within the page.
 */
export function LibraryTabs({ at, reviewCount }: { at: "assets" | "review" | "activity"; reviewCount: number }) {
  const tabs = [
    { id: "assets", href: "/", label: "Assets", icon: IconPhoto },
    { id: "review", href: "/?review", label: "Review", icon: IconInbox, count: reviewCount },
    { id: "activity", href: "/activity", label: "Activity", icon: IconActivity },
  ] as const;
  return (
    <nav aria-label="Library" className="-mx-4 flex gap-5 border-b px-4 md:-mx-6 md:px-6">
      {tabs.map((t) => (
        <NavLink
          key={t.id}
          href={t.href}
          aria-current={at === t.id ? "page" : undefined}
          className={cn(
            "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 py-2.5 text-sm transition-colors",
            at === t.id
              ? "border-primary text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground border-transparent",
          )}
        >
          <t.icon className={cn("size-4", at === t.id ? "text-primary-ink" : "text-muted-foreground/70")} />
          {t.label}
          {"count" in t && t.count > 0 && (
            // Keyed so each change pops in: approving an item visibly ticks it down.
            <span
              key={t.count}
              className="bg-primary text-primary-foreground animate-in zoom-in-50 rounded-full px-1.5 text-xs leading-4 tabular-nums duration-200"
            >
              {t.count}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/** Every page opens the same way: what this is, in one line, and what you can do here. */
export function PageHeader({
  icon,
  title,
  description,
  aside,
  children,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Beside the title: a count. */
  aside?: React.ReactNode;
  /** Actions, on the right. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2.5">
          <span className="text-muted-foreground [&_svg]:size-5">{icon}</span>
          <h1 className="font-display truncate text-xl font-semibold tracking-tight">{title}</h1>
          {aside}
        </div>
        {description && <p className="text-muted-foreground text-sm text-pretty">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}
