"use client";

import { useState } from "react";
import { IconPlayerPlayFilled } from "@tabler/icons-react";
import { HEAD } from "@/components/brand-sections/look";
import { Body, ItemCaption, ItemTitle, useRuleAnchor } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { KindIcon, Lightbox, type PublicItem } from "@/components/public-grid";
import { useSite } from "@/components/site/site-context";
import { Thumb } from "@/components/thumb";
import type { Item } from "@/lib/pages";
import type { Media } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * In-use pictures: the bound rules' pictures, then the section's own, each a
 * tile with its title, caption and credit that opens the lightbox. The
 * lightbox steps through this section only, and a picture marked
 * `download: false` is for reference: it offers no download there.
 */

/** Tiles per row, up to the section's columns, as its container widens. */
const GRID: Record<number, string> = {
  1: "",
  2: "@md:grid-cols-2",
  3: "@md:grid-cols-2 @3xl:grid-cols-3",
  4: "@md:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4",
};

type Picture = {
  m: Media;
  /** The item it comes from, by index for the slots; a rule's picture has none. */
  i?: number;
  it?: Item;
  /** `rule-{key}` on a rule's first picture, so v1's links land on it. */
  anchor?: string;
};

export function GallerySection({ section: s, rules }: SectionProps) {
  const { view } = useSite();
  const anchor = useRuleAnchor();
  const [openId, setOpenId] = useState<string | null>(null);
  const media = (id?: string) => (id ? view.media[id] : undefined);

  // An asset shown twice would open the lightbox on its first tile anyway: show it once.
  const pictures: Picture[] = [
    // Only its keys: `rules` also carries a background color and items' keys.
    ...rules
      .filter((r) => s.keys.includes(r.key))
      .flatMap((r) => r.assets.flatMap((a) => media(a.id) ?? []).map((m, j) => ({ m, anchor: j ? undefined : anchor(r.key) }))),
    ...(s.items ?? []).flatMap((it, i) => {
      const m = media(it.asset);
      return m ? [{ m, i, it }] : [];
    }),
  ].filter((p, n, all) => all.findIndex((q) => q.m.id === p.m.id) === n);

  const shown = pictures.map(
    ({ m, it }): PublicItem => ({
      ...m,
      title: it?.title ?? m.title,
      description: it?.caption ?? m.description,
      downloads: it?.download === false ? [] : m.downloads,
    }),
  );

  return (
    <div className="space-y-6">
      <Body />
      {pictures.length > 0 && (
        // Its own container: the frame's is the whole section, wider than a reading column or one beside an aside.
        <div className="@container">
          <ul className={cn("grid gap-x-6 gap-y-8", GRID[s.columns])}>
            {pictures.map((p, n) => {
              const alt = shown[n].title ?? shown[n].description ?? p.m.filename;
              const credit = p.m.creator ?? p.m.copyright;
              return (
                <li key={p.m.id} id={p.anchor} className="min-w-0 scroll-mt-20">
                  <figure className="space-y-3">
                    <Tile m={p.m} alt={alt} onOpen={() => setOpenId(p.m.id)} />
                    <figcaption className="space-y-1">
                      {p.i === undefined ? (
                        <>
                          {p.m.title && <p className={cn(HEAD, "text-base text-balance")}>{p.m.title}</p>}
                          {p.m.description && <p className="text-muted-foreground text-sm">{p.m.description}</p>}
                        </>
                      ) : (
                        <>
                          <ItemTitle i={p.i} as="p" className="text-base" />
                          <ItemCaption i={p.i} />
                        </>
                      )}
                      {credit && <p className="text-muted-foreground text-xs">{credit}</p>}
                    </figcaption>
                  </figure>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <Lightbox items={shown} openId={openId} onOpen={setOpenId} />
    </div>
  );
}

/**
 * A picture's tile. A photo (a JPEG, or one with a focal point) fills it
 * around its subject; a mark or a drawing is shown whole.
 */
function Tile({ m, alt, onOpen }: { m: Media; alt: string; onOpen: () => void }) {
  const fill = !!m.focus || m.mime === "image/jpeg";
  const focus = m.focus ? ({ "--focus": `${m.focus.x * 100}% ${m.focus.y * 100}%` } as React.CSSProperties) : undefined;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Look at ${alt}`}
      aria-haspopup="dialog"
      style={focus}
      className="bg-muted focus-visible:ring-ring/50 relative block aspect-[4/3] w-full overflow-hidden rounded-lg outline-none focus-visible:ring-[3px]"
    >
      {m.thumbnail ? (
        <Thumb src={m.thumbnail} alt={alt} className={fill ? "object-cover p-0 [object-position:var(--focus,center)]" : "p-4"} />
      ) : (
        <span className="text-muted-foreground absolute inset-0 flex items-center justify-center">
          <KindIcon item={m} />
        </span>
      )}
      {m.mime.startsWith("video/") && m.thumbnail && (
        <span aria-hidden className="absolute inset-0 flex items-center justify-center">
          <span className="bg-background/80 rounded-full p-3 shadow-sm backdrop-blur">
            <IconPlayerPlayFilled className="size-5" />
          </span>
        </span>
      )}
    </button>
  );
}
