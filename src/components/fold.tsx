import { IconChevronRight } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

/**
 * Settings folded under their name, with what they are set to beside it: the
 * few that matter stay open above, and the rest read at a glance before
 * anyone changes them. A native <details>, so it opens from the keyboard, and
 * a form can open it to show a field it refuses (onInvalidCapture).
 *
 * Props:
 * - title: the group's name.
 * - summary: what it is set to now, in a few words.
 * - open: starts open (something in it wants attention).
 * - bare: no border of its own, for a list of folds inside a panel.
 */
export function Fold({
  title,
  summary,
  open,
  bare,
  className,
  children,
}: {
  title: string;
  summary?: React.ReactNode;
  open?: boolean;
  bare?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <details open={open} className={cn("group min-w-0", bare ? "border-t" : "rounded-lg border", className)}>
      <summary
        className={cn(
          "hover:bg-muted/50 transition-colors focus-visible:ring-ring/50 flex cursor-pointer list-none items-center gap-2 py-2.5 text-sm outline-none focus-visible:ring-3 [&::-webkit-details-marker]:hidden",
          bare ? "px-1" : "rounded-lg px-3",
        )}
      >
        <IconChevronRight aria-hidden className="text-muted-foreground size-4 shrink-0 transition-transform duration-200 group-open:rotate-90" />
        <span className="shrink-0 font-medium">{title}</span>
        {summary && <span className="text-muted-foreground ms-auto min-w-0 truncate text-xs">{summary}</span>}
      </summary>
      <div className={cn("grid min-w-0 grid-cols-1 gap-5", bare ? "px-1 pt-1 pb-4" : "border-t p-3")}>{children}</div>
    </details>
  );
}
