"use client";

import { useState } from "react";
import { IconPhoto } from "@tabler/icons-react";
import { Skeleton } from "@/components/ui/skeleton";
import { isFont } from "@/lib/font";
import { cn } from "@/lib/utils";

/**
 * A lazy image that pulses until it arrives, then fades in. Its parent must be `relative`.
 * `src` names the size for a 1x screen (`/a/{id}/w_240,f_webp`); a 2x screen
 * gets the rendition twice as wide, so nothing is upscaled on a retina display.
 * `placeholder`, a small rendition already cached (the tile's), shows blurred
 * underneath until then; `eager` for the one image the page is about.
 */
export function Thumb({
  src,
  alt,
  className,
  placeholder,
  eager,
}: {
  src: string;
  alt: string;
  className?: string;
  placeholder?: string;
  eager?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const double = src.replace(/\/w_(\d+)/, (_, w) => `/w_${Math.min(Number(w) * 2, 8000)}`);
  // What sharp can't render, or a passing 5xx: the no-preview well, not a broken image.
  if (failed)
    return (
      <span role={alt ? "img" : undefined} aria-label={alt || undefined} className="text-muted-foreground absolute inset-0 flex items-center justify-center">
        <IconPhoto className="size-8" stroke={1.5} />
      </span>
    );
  return (
    <>
      {!loaded &&
        (placeholder ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={placeholder} alt="" aria-hidden draggable={false} className={cn("absolute inset-0 size-full scale-105 object-contain p-2 blur-sm", className)} />
        ) : (
          <Skeleton className="absolute inset-0 rounded-none" />
        ))}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        // A cached image can finish before hydration attaches onLoad.
        ref={(img) => {
          if (img?.complete && img.naturalWidth) setLoaded(true);
        }}
        src={src}
        srcSet={double === src ? undefined : `${src} 1x, ${double} 2x`}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined}
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={cn(
          // No zoom on hover: scaling a raster softens it. The card's shadow says hover.
          "relative size-full object-contain p-2 transition-opacity duration-200",
          loaded ? "opacity-100" : "opacity-0",
          className,
        )}
      />
    </>
  );
}

/**
 * A rule's file in a small tile: its picture, or for a font, which has none
 * to scale (its rendition answers 415), its letters. Its parent must be `relative`.
 */
export function FileThumb({ file, src, alt = "", className }: { file: { mime?: string | null; filename?: string | null }; src: string; alt?: string; className?: string }) {
  // By name too: a version's snapshot of a rule may not carry its files' types.
  if (isFont(file.mime ?? "", file.filename ?? ""))
    return (
      <span role={alt ? "img" : undefined} aria-label={alt || undefined} className="font-display bg-background absolute inset-0 grid place-items-center text-lg font-semibold">
        Aa
      </span>
    );
  return <Thumb src={src} alt={alt} className={className} />;
}
