"use client";

import { cn } from "@/lib/utils";

/** An SVG's markup as a URL an <img> or a mask can load: data: is allowed where images are. */
export const svgDataUri = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

/**
 * An SVG icon, crisp at any size. One drawn in one ink (`mono`) is a mask
 * over the current text color, so it reads in both themes and takes any
 * color its parent sets; one with colors of its own shows as it is. Sized by
 * `className` (size-6); the art keeps its shape inside that box.
 */
export function IconGlyph({
  src,
  mono,
  label,
  className,
  style,
}: {
  src: string;
  mono?: boolean;
  /** What it shows, for a screen reader; left out, it is decoration. */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (mono) {
    const mask = `url(${JSON.stringify(src)})`;
    return (
      <span
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        className={cn("inline-block shrink-0 bg-current", className)}
        style={{
          maskImage: mask,
          WebkitMaskImage: mask,
          maskSize: "contain",
          WebkitMaskSize: "contain",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          maskPosition: "center",
          WebkitMaskPosition: "center",
          ...style,
        }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={label ?? ""} draggable={false} className={cn("inline-block shrink-0 object-contain", className)} style={style} />
  );
}
