"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { IconCheck as CheckIcon, IconMinus } from "@tabler/icons-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-[background-color,border-color,box-shadow,scale] active:scale-90 active:duration-75 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground dark:data-[state=indeterminate]:bg-primary",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none data-[state=unchecked]:animate-out data-[state=unchecked]:fade-out-0 data-[state=unchecked]:zoom-out-75 data-[state=unchecked]:duration-100 data-[state=unchecked]:ease-in"
      >
        {props.checked === "indeterminate" ? <IconMinus className="size-3.5" stroke={2.5} /> : <CheckIcon className="size-3.5" stroke={2.5} />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
