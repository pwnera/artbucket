"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { IconX as XIcon } from "@/components/icons"
import { Dialog as DialogPrimitive } from "radix-ui"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-100 data-[state=closed]:ease-in data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

const BESIDE = "[data-sonner-toaster], [data-assistant-panel]"

/**
 * A toast (its Undo), or the assistant docked beside (components/assistant.tsx): never outside a dialog. Also by where
 * the pointer was: a button its own click takes away (the assistant's Approve, which becomes "Approved") has left the
 * page by the time the dialog hears of it, so its target alone no longer says where it was.
 */
const inToaster = (e: { target: EventTarget | null; detail?: { originalEvent?: Event } }) => {
  if ((e.target as Element | null)?.closest?.(BESIDE)) return true
  const p = e.detail?.originalEvent
  if (!(p instanceof MouseEvent)) return false
  return [...document.querySelectorAll(BESIDE)].some((el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && p.clientX >= r.left && p.clientX <= r.right && p.clientY >= r.top && p.clientY <= r.bottom
  })
}

/**
 * A form dialog passes `guard` so typed edits are never lost by accident:
 * Esc in a field only leaves the field, and while `dirty`, Esc, a click
 * outside or the X ask "Discard changes?" before `onDiscard` closes it.
 * A click on a toast (its Undo) never counts as outside.
 */
function DialogContent({
  className,
  children,
  showCloseButton = true,
  guard,
  overlayClassName,
  onEscapeKeyDown,
  onPointerDownOutside,
  onInteractOutside,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  guard?: { dirty: boolean; onDiscard: () => void; onSave?: () => void }
  overlayClassName?: string
}) {
  const [asking, setAsking] = React.useState(false)
  // What had focus when it opened: Radix gives focus back to a DialogTrigger only, so a dialog opened otherwise (a
  // shortcut, a button with setOpen) would leave it on the page's body.
  const opener = React.useRef<HTMLElement | null>(null)
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-[50%] left-[50%] z-50 grid max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto overscroll-contain rounded-lg border bg-popover p-6 text-popover-foreground shadow-lg duration-200 ease-out outline-none data-[state=closed]:animate-out data-[state=closed]:duration-100 data-[state=closed]:ease-in data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg",
          className
        )}
        onEscapeKeyDown={(e) => {
          const field = document.activeElement
          // Escape in the assistant docked beside is the panel's: it closes the panel, not this.
          if (field?.closest("[data-assistant-panel]")) return e.preventDefault()
          if (guard && field instanceof HTMLElement && field.matches("input, textarea, select, [contenteditable=true]")) {
            e.preventDefault()
            field.blur()
          } else if (guard?.dirty) {
            e.preventDefault()
            setAsking(true)
          }
          onEscapeKeyDown?.(e)
        }}
        onPointerDownOutside={(e) => {
          if (guard?.dirty && !inToaster(e)) setAsking(true)
          onPointerDownOutside?.(e)
        }}
        onInteractOutside={(e) => {
          if (inToaster(e) || guard?.dirty) e.preventDefault()
          onInteractOutside?.(e)
        }}
        onOpenAutoFocus={(e) => {
          opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
          onOpenAutoFocus?.(e)
        }}
        onCloseAutoFocus={(e) => {
          onCloseAutoFocus?.(e)
          // Gone (a menu item that opened it): Radix's own, the trigger, if there is one.
          if (e.defaultPrevented || !opener.current?.isConnected) return
          e.preventDefault()
          opener.current.focus()
        }}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                // A prevented click stops Close from closing.
                if (guard?.dirty) {
                  e.preventDefault()
                  setAsking(true)
                }
              }}
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
        {guard && (
          <AlertDialog open={asking} onOpenChange={setAsking}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Discard changes?</AlertDialogTitle>
                <AlertDialogDescription>What you changed here has not been saved.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep editing</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={guard.onDiscard}>
                  Discard
                </AlertDialogAction>
                {guard.onSave && <AlertDialogAction onClick={guard.onSave}>Save</AlertDialogAction>}
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-base leading-none font-semibold tracking-tight", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
