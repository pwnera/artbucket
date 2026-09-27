"use client";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * A button that is only its icon, for actions whose icon says enough in
 * context (share, edit, copy): the label is its tooltip and its accessible
 * name, so nothing is lost but width. Works as a menu or dialog trigger
 * (`asChild` on the trigger), since it passes everything it is given on.
 */
export function IconButton({
  label,
  variant = "outline",
  size = "icon-sm",
  side,
  ...props
}: React.ComponentProps<typeof Button> & { label: string; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant={variant} size={size} aria-label={label} {...props} />
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
