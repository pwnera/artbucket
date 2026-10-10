"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconArrowUp, IconPalette, IconPencil } from "@/components/icons";
import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import { behavior } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * For someone who may edit the brand being read: Edit this page (the
 * builder, `href`), the theme when the host has it (`onTheme`), and back to
 * the top, floating at the bottom of the window. In the app's reader, whose
 * header has Edit, it comes once that header has scrolled away; on BrandHub
 * and portals, which have none, it is there from the start (`always`). The
 * app's own chrome, in the app's look, whatever the brand's. Never in print.
 */
export function FloatingEdit({ href, label = "Edit this page", onTheme, always = false }: { href: string; label?: string; onTheme?: () => void; always?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (always) return;
    const on = () => setScrolled(window.scrollY > 240);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [always]);
  const shown = always || scrolled;
  return (
    <div
      inert={!shown}
      data-chrome
      className={cn(
        "app-tokens bg-popover text-popover-foreground fixed end-6 bottom-6 z-30 flex items-center gap-1 rounded-full border p-1 font-sans shadow-lg transition-[opacity,translate] duration-200 ease-out motion-reduce:transition-none print:hidden",
        shown ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <Button asChild size="sm" className="rounded-full">
        {/* Within the app, a client move; from BrandHub or a portal, an absolute address: a plain load of the app. */}
        <Link href={href}>
          <IconPencil aria-hidden /> {label}
        </Link>
      </Button>
      {onTheme && (
        <IconButton label="Theme" variant="ghost" className="rounded-full" onClick={onTheme}>
          <IconPalette aria-hidden />
        </IconButton>
      )}
      <IconButton label="Back to the top" variant="ghost" className="rounded-full" onClick={() => window.scrollTo({ top: 0, behavior: behavior() })}>
        <IconArrowUp aria-hidden />
      </IconButton>
    </div>
  );
}
