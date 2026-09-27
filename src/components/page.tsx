"use client";

import { IconActivity, IconInbox, IconPhoto } from "@tabler/icons-react";
import { NavLink } from "@/components/app-sidebar";
import { cn } from "@/lib/utils";

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
          <t.icon className={cn("size-4", at === t.id ? "text-primary" : "text-muted-foreground/70")} />
          {t.label}
          {"count" in t && t.count > 0 && (
            <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-xs leading-4 tabular-nums">
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
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {aside}
        </div>
        {description && <p className="text-muted-foreground text-sm text-pretty">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}
