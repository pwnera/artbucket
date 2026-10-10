"use client"

import { IconCircleCheck as CircleCheckIcon, IconInfoCircle as InfoIcon, IconAlertOctagon as OctagonXIcon, IconAlertTriangle as TriangleAlertIcon } from "@/components/icons"
import { Spinner } from "@/components/ui/spinner"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // Near the action that caused it (the selection bar), and clear of the upload tray at bottom right.
      position="bottom-center"
      gap={8}
      closeButton
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4 text-warning" />,
        error: <OctagonXIcon className="size-4 text-destructive" />,
        loading: <Spinner className="size-4" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          // Sonner sets the system font on its own unlayered rule; only inline style outranks it.
          fontFamily: "var(--font-funnel-sans)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
