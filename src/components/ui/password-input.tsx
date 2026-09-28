"use client"

import * as React from "react"
import { IconCheck, IconEye, IconEyeOff } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { IconButton } from "@/components/icon-button"
import { Input } from "@/components/ui/input"

/**
 * A password field you can reveal, that says when Caps Lock is on. It hides
 * again when its form submits. `showLength` turns a length rule into a live
 * count ("7 of 10 characters"); keep minLength as the backstop.
 */
function PasswordInput({
  className,
  showLength,
  onChange,
  onKeyDown,
  onKeyUp,
  onBlur,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { showLength?: number }) {
  const [shown, setShown] = React.useState(false)
  const [caps, setCaps] = React.useState(false)
  const [length, setLength] = React.useState(String(props.value ?? props.defaultValue ?? "").length)
  const wrap = React.useRef<HTMLDivElement>(null)
  const hint = React.useId()

  React.useEffect(() => {
    const form = wrap.current?.closest("form")
    const hide = () => setShown(false)
    form?.addEventListener("submit", hide)
    return () => form?.removeEventListener("submit", hide)
  }, [])

  const readCaps = (e: React.KeyboardEvent) => setCaps(e.getModifierState("CapsLock"))
  const met = showLength !== undefined && length >= showLength
  const hints = caps || showLength !== undefined

  return (
    <div ref={wrap} className="grid gap-1.5">
      <div className="relative">
        <Input
          {...props}
          type={shown ? "text" : "password"}
          className={cn("pr-10", className)}
          aria-describedby={[props["aria-describedby"], hints && hint].filter(Boolean).join(" ") || undefined}
          onChange={(e) => {
            setLength(e.target.value.length)
            onChange?.(e)
          }}
          onKeyDown={(e) => {
            readCaps(e)
            onKeyDown?.(e)
          }}
          onKeyUp={(e) => {
            readCaps(e)
            onKeyUp?.(e)
          }}
          onBlur={(e) => {
            setCaps(false)
            onBlur?.(e)
          }}
        />
        <IconButton
          type="button"
          variant="ghost"
          label="Show password"
          aria-pressed={shown}
          className="absolute top-1/2 right-1 size-7 -translate-y-1/2 text-muted-foreground"
          onClick={() => setShown((s) => !s)}
        >
          {shown ? <IconEyeOff /> : <IconEye />}
        </IconButton>
      </div>
      {hints && (
        <div id={hint} className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {showLength !== undefined && (
            <span className={cn("inline-flex items-center gap-1 transition-colors", met && "text-success")}>
              {met ? (
                <>
                  <IconCheck className="size-3" />
                  {showLength}+ characters
                </>
              ) : (
                `${length} of ${showLength} characters`
              )}
            </span>
          )}
          {caps && <span className="text-warning">Caps Lock is on</span>}
        </div>
      )}
    </div>
  )
}

export { PasswordInput }
