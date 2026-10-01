"use client";

import { useState } from "react";
import { IconInfoCircle } from "@tabler/icons-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The words a field or a heading can do without, behind an (i) beside it:
 * the page keeps a label and the action, as pro apps do. Hover or focus
 * opens it, and a tap, since touch has no hover; a tap elsewhere closes it.
 * Inside a <label>, the tap doesn't reach the field.
 */
export function InfoTip({ children, label = "More info", side, className }: { children: React.ReactNode; label?: string; side?: "top" | "bottom" | "left" | "right"; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={(e) => {
            e.preventDefault();
            setOpen(true);
          }}
          className={cn(
            "text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-grid size-4 shrink-0 place-items-center rounded-full align-middle outline-none focus-visible:ring-2",
            className,
          )}
        >
          <IconInfoCircle aria-hidden className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-64 text-pretty">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
