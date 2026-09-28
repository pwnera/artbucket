"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * A button that is only its icon, for actions whose icon says enough in
 * context (share, edit, copy): the label is its tooltip and its accessible
 * name, so nothing is lost but width. Works as a menu or dialog trigger
 * (`asChild` on the trigger), since it passes everything it is given on.
 * `shortcut` shows its key in the tooltip, as `["mod", "B"]`.
 */
export function IconButton({
  label,
  variant = "outline",
  size = "icon-sm",
  side,
  shortcut,
  ...props
}: React.ComponentProps<typeof Button> & { label: string; side?: "top" | "bottom" | "left" | "right"; shortcut?: string[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <Tooltip
      open={open}
      // A menu hands focus back to its trigger when it closes; that focus is
      // neither keyboard nor hover, so it should not pop the tooltip. Matched
      // by our own id: a menu trigger overwrites data-slot.
      onOpenChange={(o) => setOpen(o && !document.activeElement?.matches(`[data-tip="${id}"]:not(:focus-visible):not(:hover)`))}
    >
      <TooltipTrigger asChild>
        <Button variant={variant} size={size} aria-label={label} data-tip={id} {...props} />
      </TooltipTrigger>
      <TooltipContent side={side}>
        {label}
        {shortcut && <Kbd keys={shortcut} className="ml-2" />}
      </TooltipContent>
    </Tooltip>
  );
}
