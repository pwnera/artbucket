"use client"

import { useSyncExternalStore } from "react"
import { cn } from "@/lib/utils"

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform)
const never = () => () => {}

/**
 * A key or chord, as `keys={["mod", "K"]}`. "mod" is ⌘ on a Mac and Ctrl
 * elsewhere; the server guesses Mac and the client corrects it.
 */
function Kbd({ keys, className }: { keys: string[]; className?: string }) {
  const mac = useSyncExternalStore(never, isMac, () => true)
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded border bg-muted px-1 font-sans text-2xs font-medium text-muted-foreground",
        "in-data-[slot=tooltip-content]:border-transparent in-data-[slot=tooltip-content]:bg-background/15 in-data-[slot=tooltip-content]:text-background",
        className
      )}
    >
      {keys.map((k) => (k === "mod" ? (mac ? "⌘" : "Ctrl") : k)).join(mac ? "" : "+")}
    </kbd>
  )
}

export { Kbd }
