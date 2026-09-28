"use client";

import { pictured } from "@/components/brand-sections/parts";
import { Body, Opens } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { useMedia, useSite } from "@/components/site/site-context";
import { colorsOf } from "@/lib/brand-theme";
import { ruleName } from "@/lib/rules";
import { cn } from "@/lib/utils";

/**
 * Pattern: the tile (props.asset, else a bound rule's picture, else the
 * theme's device) repeated at each of props.scales, on each bound color as
 * its ground; with no color bound, on the section's own ground.
 */

/** Swatches per row, up to the section's columns, as its container widens. */
const GRID: Record<number, string> = {
  1: "",
  2: "@md:grid-cols-2",
  3: "@md:grid-cols-2 @3xl:grid-cols-3",
  4: "@md:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4",
};

/** The tile at scale 1: the size the pattern ground tiles the device at (globals.css ground-pattern). */
const TILE = 6;

export function PatternSection({ section: s, rules }: SectionProps) {
  const { view, url } = useSite();
  const asked = s.props.asset as string | undefined;
  const id = asked ?? rules.flatMap((r) => r.assets).find(pictured)?.id ?? view.theme.device ?? undefined;
  const tile = useMedia(id);
  const scales = (s.props.scales as number[] | undefined) ?? [1];
  const grounds = colorsOf(rules);
  // An SVG tiles crisp at any scale as it is; a photo, as a rendition.
  const src = id && (!tile || tile.mime === "image/svg+xml" ? url(id) : url(id, "/w_720,f_webp"));
  const name = tile?.title ?? tile?.filename ?? "The pattern";
  const swatch = (hex: string | undefined, on: string | undefined, k: number) => (
    <figure className="space-y-2">
      <div
        role="img"
        aria-label={`${name} at ${k}×${on ? ` on ${on}` : ""}`}
        className="ring-border h-40 rounded-xl ring-1"
        style={{ backgroundColor: hex, backgroundImage: `url(${JSON.stringify(src)})`, backgroundSize: `calc(${TILE}rem * ${k}) auto`, backgroundRepeat: "repeat" }}
      />
      <figcaption className="flex items-center gap-2 text-xs">
        {on && <span>{on}</span>}
        {hex && <code className="text-muted-foreground font-mono">{hex}</code>}
        <span className="text-muted-foreground ms-auto tabular-nums">{k}×</span>
      </figcaption>
    </figure>
  );
  return (
    <div className="space-y-6">
      <Body />
      {/* Its own container: the frame's is the whole section, wider than a reading column. */}
      {src && (
        <div className="@container">
          <ul className={cn("grid gap-x-6 gap-y-8", GRID[s.columns])}>
            {grounds.length
              ? grounds.flatMap((g) =>
                  scales.map((k, n) => (
                    <li key={`${g.key}:${n}`} className="min-w-0">
                      <Opens rule={g}>{swatch((g.value as string).slice(0, 7), ruleName(g), k)}</Opens>
                    </li>
                  )),
                )
              : scales.map((k, n) => (
                  <li key={n} className="min-w-0">
                    {swatch(undefined, undefined, k)}
                  </li>
                ))}
          </ul>
        </div>
      )}
    </div>
  );
}
