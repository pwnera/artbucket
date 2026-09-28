"use client";

import { useState } from "react";
import { IconBolt, IconChevronDown, IconDownload, IconExternalLink, IconFileText } from "@tabler/icons-react";
import { SiteLink } from "@/components/site/nav-tree";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { PortalSite } from "@/lib/portal";
import { canonicalPath } from "@/lib/site";
import { cn } from "@/lib/utils";

/** A portal's own link: a /path is on the portal, under its base; the web and mail as they are. */
export const onPortal = (base: string, h: string) => (h.startsWith("/") ? `${base}${h}` : h);

/**
 * Quick grab: the few things readers come for, pinned in the site's bar. An
 * asset downloads from `href`, which the server signed; a page opens at its
 * canonical path on the portal (the first brand's pages at the top); a link
 * goes where it says. A menu, so it closes on a pick, Esc or a click away.
 */
export function QuickGrab({
  quick,
  base,
  first,
  onNavigate,
  className,
}: {
  quick: NonNullable<PortalSite["quick"]>;
  base: string;
  /** The portal's first brand. */
  first: string;
  onNavigate?: (href: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={className}>
          <IconBolt aria-hidden />
          Quick grab
          <IconChevronDown aria-hidden className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {quick.map((q, i) => {
          const web = /^https?:/i.test(q.href ?? "");
          return (
            <DropdownMenuItem key={i} asChild>
              {q.asset && q.href ? (
                <a href={q.href} download>
                  <IconDownload aria-hidden />
                  {q.label}
                </a>
              ) : q.page ? (
                // Its own click moves within the site, which skips the menu's close: the menu is closed here.
                <SiteLink
                  href={`${base}/${canonicalPath(first, q.brand ?? first, q.page).join("/")}`}
                  onNavigate={onNavigate && ((h) => (setOpen(false), onNavigate(h)))}
                >
                  <IconFileText aria-hidden />
                  {q.label}
                </SiteLink>
              ) : (
                <a href={onPortal(base, q.href ?? "/")} {...(web && { target: "_blank", rel: "noreferrer" })}>
                  <IconExternalLink aria-hidden className={cn(!web && "invisible")} />
                  {q.label}
                  {web && <span className="sr-only"> (opens in a new tab)</span>}
                </a>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
