"use client";

import { useEffect, useRef, useState } from "react";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { toast } from "sonner";
import { IconButton } from "@/components/icon-button";
import { cn } from "@/lib/utils";

/**
 * Puts `text` on the clipboard; true when it got there. A promise (a link
 * still being signed) is handed to the clipboard inside the click, since
 * Safari refuses a write that starts after a network round trip. Failing,
 * it toasts the text itself, and keeps it up, so it can be copied by hand.
 */
export async function copyText(text: string | Promise<string | null>, { what, quiet }: { what?: string; quiet?: boolean } = {}) {
  try {
    if (typeof text === "string") await navigator.clipboard.writeText(text);
    else if (typeof ClipboardItem === "undefined") {
      const t = await text;
      if (!t) throw new Error("nothing to copy");
      await navigator.clipboard.writeText(t);
    } else {
      // Synchronously, before any await: the write must start inside the gesture.
      const blob = text.then((t) => {
        if (!t) throw new Error("nothing to copy");
        return new Blob([t], { type: "text/plain" });
      });
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
    }
    return true;
  } catch {
    if (!quiet) {
      const shown = typeof text === "string" ? text : await text.catch(() => null);
      toast.error(`Couldn't copy${what ? ` ${what}` : ""}`, shown ? { description: shown, duration: Infinity } : { duration: 10_000 });
    }
    return false;
  }
}

/**
 * A copy icon that turns into a check where you clicked, for 1.5s: no toast
 * unless the clipboard refuses. `text` may be a function returning a promise
 * (a link signed on demand); it is called in the click, not before.
 */
export function CopyButton({
  text,
  label,
  what,
  size = "icon-xs",
  variant = "ghost",
  icon: Icon = IconCopy,
  shortcut,
  className,
}: {
  text: string | (() => Promise<string | null>);
  label: string;
  what?: string;
  size?: "icon-xs" | "icon-sm" | "icon" | "icon-lg";
  variant?: "ghost" | "outline" | "secondary";
  /** The icon before the check: a link's, where a plain copy icon sits beside it. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Its key, shown in the tooltip, as IconButton's. */
  shortcut?: string[];
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <>
      <IconButton
        label={label}
        shortcut={shortcut}
        size={size}
        variant={variant}
        className={cn("text-muted-foreground hover:text-foreground", className)}
        onClick={async () => {
          if (!(await copyText(typeof text === "string" ? text : text(), { what }))) return;
          setCopied(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1500);
        }}
      >
        {/* Both drawn in one cell, so each crossfades and scales, there and back. */}
        <span className="grid *:col-start-1 *:row-start-1 *:transition-[opacity,scale] *:duration-150">
          <IconCheck className={cn("text-success", size === "icon-xs" && "size-3.5", !copied && "scale-50 opacity-0")} />
          <Icon className={cn(size === "icon-xs" && "size-3.5", copied && "scale-50 opacity-0")} />
        </span>
      </IconButton>
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </>
  );
}
