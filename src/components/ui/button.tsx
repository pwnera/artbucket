"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"
import { Spinner } from "@/components/ui/spinner"

const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,opacity,scale] active:scale-[0.97] data-[size^=icon]:active:scale-[0.92] active:duration-75 focus-visible:border-ring disabled:pointer-events-none disabled:opacity-50 data-[pending]:disabled:opacity-100 [&>[data-spinner]+svg]:hidden aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary-ink underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg:not([data-spinner])]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg:not([data-spinner])]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg:not([data-spinner])]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg:not([data-spinner])]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * `pending` reads as working, not unavailable: disabled at full strength,
 * with a small spinner before the label, in the leading icon's place when
 * there is one. Keep the label as it is while pending: the spinner says
 * working, and the words say what.
 *
 * A button that is a link (`asChild` around an <a> or a <Link>) shows the
 * same from a plain click until the next page shows: within the app, when
 * the address changes; leaving it (GitHub, Stripe), until the page goes.
 * Back from the browser's cache, or a wait past a while, clears it.
 */
function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  pending = false,
  disabled,
  children,
  onClick,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    pending?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"
  const link = asChild && React.isValidElement<{ href?: unknown; target?: string; download?: unknown; children?: React.ReactNode }>(children) ? children : null
  const [going, setGoing] = React.useState(false)
  React.useEffect(() => {
    if (!going) return
    const done = () => setGoing(false)
    // The Navigation API reports the address changing (a client move commits); older browsers rely on the rest.
    const nav = (window as { navigation?: EventTarget }).navigation
    nav?.addEventListener("navigatesuccess", done)
    window.addEventListener("pageshow", done)
    window.addEventListener("popstate", done)
    const late = setTimeout(done, 15000)
    return () => {
      nav?.removeEventListener("navigatesuccess", done)
      window.removeEventListener("pageshow", done)
      window.removeEventListener("popstate", done)
      clearTimeout(late)
    }
  }, [going])
  const busy = pending || going

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-pending={busy ? "" : undefined}
      aria-busy={busy || undefined}
      disabled={disabled || pending || undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(e)
        const href = link?.props.href
        // A link to a page in this tab: not a new tab or window, a download, an anchor on this page or an email.
        const goes =
          !!href &&
          !link.props.target &&
          link.props.download === undefined &&
          !(typeof href === "string" && /^(#|mailto:|tel:)/.test(href)) &&
          e.button === 0 &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.shiftKey &&
          !e.altKey
        if (goes) setGoing(true)
      }}
      {...props}
    >
      {/* Slot takes exactly one child: a link gets the spinner inside it, before its label. */}
      {link ? (going ? React.cloneElement(link, undefined, <>{<Spinner data-spinner />}{link.props.children}</>) : link) : asChild ? children : <>{pending && <Spinner data-spinner />}{children}</>}
    </Comp>
  )
}

export { Button, buttonVariants }
