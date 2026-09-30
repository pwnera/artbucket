import { IconExternalLink } from "@tabler/icons-react";

/**
 * A link that leaves the app (BrandHub, a portal, GitHub, the docs), drawn
 * one way everywhere: a new tab, the external icon after its words, sized
 * to them, and "opens in a new tab" for screen readers. Links inside the app
 * never carry the icon. An anchor's props, so `<Button asChild>` and
 * `<Badge asChild>` wrap it.
 */
export function ExternalLink({ children, ...props }: React.ComponentProps<"a">) {
  return (
    <a target="_blank" rel="noreferrer" {...props}>
      {children}
      <IconExternalLink aria-hidden className="inline size-[1em] shrink-0 align-[-0.125em] opacity-60" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
