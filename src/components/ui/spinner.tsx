import { cn } from "@/lib/utils"

/**
 * The loading mark, GitHub's way: a faint full ring with a quarter of it
 * drawn in the current color, turning. Sized like an icon (16px, or what a
 * size- class or the button around it says) and colored by the text around it. With less
 * motion it still turns, slower: it is a status, not decoration (globals.css).
 */
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    // Hidden from screen readers unless it is given a name (aria-label): then it is that, an image.
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      data-slot="spinner"
      {...(props["aria-label"] ? { role: "img" } : { "aria-hidden": true })}
      className={cn("shrink-0 animate-spin", className)}
      {...props}
    >
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M15 8a7 7 0 0 0-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export { Spinner }
