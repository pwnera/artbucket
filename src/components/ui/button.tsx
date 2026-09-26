import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Every button is a pill. The coral variant is the one CTA on a view; its label
 * is `on-coral`, never white.
 */
const buttonVariants = cva(
  "text-control inline-flex shrink-0 items-center justify-center gap-2 rounded-pill whitespace-nowrap transition-all disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-coral text-on-coral shadow-card hover:brightness-[0.97]",
        secondary:
          "bg-surface-raised text-ink border border-line-strong shadow-card hover:bg-teal-soft hover:text-teal-ink",
        ghost: "text-ink-muted hover:bg-teal-soft hover:text-teal-ink",
      },
      size: {
        sm: "h-[28px] px-3",
        md: "h-[36px] px-4",
        lg: "h-[44px] px-6",
        icon: "size-[36px] px-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
