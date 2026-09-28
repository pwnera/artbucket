"use client";

import { useEffect, useRef, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconFile, IconPlayerPauseFilled, IconPlayerPlayFilled } from "@tabler/icons-react";
import { HEAD } from "@/components/brand-sections/look";
import { Body, ItemCaption, ItemTitle, useRuleAnchor } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { IconButton } from "@/components/icon-button";
import { Lightbox, type PublicItem } from "@/components/public-grid";
import { behavior } from "@/components/site/anchors";
import { useSite } from "@/components/site/site-context";
import { Thumb } from "@/components/thumb";
import type { Item } from "@/lib/pages";
import type { Media } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * In-use pictures: the bound rules' pictures, then the section's own, each a
 * tile with its title, caption and credit. A still opens the lightbox, which
 * steps through this section's stills only, and one marked `download: false`
 * is for reference: it offers no download there. A video plays in place, a
 * muted loop. Laid out as a grid, a bento (an item may span two cells) or a
 * carousel that snaps from one to the next.
 */

/** Tiles per row, up to the section's columns, as its container widens. */
const GRID: Record<number, string> = {
  1: "",
  2: "@md:grid-cols-2",
  3: "@md:grid-cols-2 @3xl:grid-cols-3",
  4: "@md:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4",
};

/** A tile's box: a bento's rows are one height, so a tile two cells wide lines up with its neighbours. */
const SHAPE = { grid: "aspect-[4/3]", bento: "h-56 @3xl:h-72", carousel: "aspect-video" };

type Picture = {
  m: Media;
  /** The item it comes from, by index for the slots; a rule's picture has none. */
  i?: number;
  it?: Item;
  /** `rule-{key}` on a rule's first picture, so v1's links land on it. */
  anchor?: string;
};

const isVideo = (m: { mime: string }) => m.mime.startsWith("video/");

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

  // One picture needs no carousel.
  const asked = s.props.layout;
  const layout: keyof typeof SHAPE = asked === "bento" || (asked === "carousel" && pictures.length > 1) ? asked : "grid";

  const figure = (p: Picture, n: number) => {
    const alt = shown[n].title ?? shown[n].description ?? p.m.filename;
    const credit = p.m.creator ?? p.m.copyright;
    const shape = SHAPE[layout];
    return (
      <figure className="space-y-3">
        {isVideo(p.m) ? <Clip m={p.m} alt={alt} className={shape} /> : <Tile m={p.m} alt={alt} className={shape} onOpen={() => setOpenId(p.m.id)} />}
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
    );
  };

  return (
    <div className="space-y-6">
      <Body />
      {pictures.length > 0 && (
        // Its own container: the frame's is the whole section, wider than a reading column or one beside an aside.
        <div className="@container">
          {layout === "carousel" ? (
            <Carousel count={pictures.length}>
              {pictures.map((p, n) => (
                <div
                  key={p.m.id}
                  id={p.anchor}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${n + 1} of ${pictures.length}`}
                  className="min-w-0 shrink-0 basis-[85%] snap-start scroll-mt-20 @3xl:basis-[70%]"
                >
                  {figure(p, n)}
                </div>
              ))}
            </Carousel>
          ) : (
            <ul className={cn("grid gap-x-6 gap-y-8", GRID[s.columns], layout === "bento" && "grid-flow-dense gap-x-4")}>
              {pictures.map((p, n) => (
                <li
                  key={p.m.id}
                  id={p.anchor}
                  // Two cells where the grid has two; a single column has nothing to span.
                  className={cn("min-w-0 scroll-mt-20", layout === "bento" && s.columns > 1 && p.it?.span === 2 && "@md:col-span-2")}
                >
                  {figure(p, n)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <Lightbox items={shown.filter((m) => !isVideo(m))} openId={openId} onOpen={setOpenId} />
    </div>
  );
}

/**
 * Slides in a row that scrolls and snaps, with previous and next, a dot per
 * slide, and the arrow keys (Home, End) once it has focus. Its start follows
 * the page's direction, so in RTL the next slide is to the left. Scrolling is
 * smooth unless the reader asked for less motion.
 */
function Carousel({ count, children }: { count: number; children: React.ReactNode }) {
  const list = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);

  const go = (n: number) => {
    const el = list.current;
    const slide = el?.children[Math.max(0, Math.min(n, count - 1))];
    if (!el || !slide) return;
    // By the scroller alone, never the page: the slide's start edge onto the scroller's.
    const a = slide.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const rtl = getComputedStyle(el).direction === "rtl";
    el.scrollBy({ left: rtl ? a.right - b.right : a.left - b.left, behavior: behavior() });
  };

  // The slide at the start, or the last once scrolled to the end (a wide scroller shows the last two together).
  const onScroll = () => {
    const el = list.current;
    const [a, b] = el?.children ?? [];
    if (!el || !(a instanceof HTMLElement) || !(b instanceof HTMLElement)) return;
    const x = Math.abs(el.scrollLeft); // negative in RTL
    setAt(x + el.clientWidth >= el.scrollWidth - 2 ? count - 1 : Math.round(x / Math.abs(b.offsetLeft - a.offsetLeft)));
  };

  return (
    <div role="region" aria-roledescription="carousel" aria-label="Pictures" className="space-y-3">
      <div
        ref={list}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={(e) => {
          // Its own keys only while it has focus: a tile inside keeps Enter and Space.
          if (e.target !== e.currentTarget) return;
          const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
          const keys: Record<string, number> = { ArrowLeft: rtl ? at + 1 : at - 1, ArrowRight: rtl ? at - 1 : at + 1, Home: 0, End: count - 1 };
          const to = keys[e.key];
          if (to === undefined) return;
          e.preventDefault();
          go(to);
        }}
        // Padded so a focused tile's ring isn't clipped; the snap keeps to the padding.
        className="-m-1 flex snap-x snap-mandatory scroll-px-1 gap-4 overflow-x-auto overscroll-x-contain rounded-lg p-1 outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-(--brand-accent)"
      >
        {children}
      </div>
      <div className="flex items-center gap-2 print:hidden">
        <div className="me-auto flex flex-wrap">
          {Array.from({ length: count }, (_, n) => (
            <button
              key={n}
              type="button"
              aria-label={`Show ${n + 1} of ${count}`}
              aria-current={n === at || undefined}
              onClick={() => go(n)}
              className="group rounded-full p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-(--brand-accent)"
            >
              <span className="bg-foreground/25 group-aria-[current=true]:bg-foreground block size-2 rounded-full transition-colors" />
            </button>
          ))}
        </div>
        {/* aria-disabled, not disabled, at the ends: a disabled button drops focus to <body>. */}
        <IconButton label="Previous" aria-disabled={at === 0 || undefined} className="aria-disabled:opacity-50" onClick={() => go(at - 1)}>
          <IconChevronLeft className="rtl:-scale-x-100" />
        </IconButton>
        <IconButton label="Next" aria-disabled={at === count - 1 || undefined} className="aria-disabled:opacity-50" onClick={() => go(at + 1)}>
          <IconChevronRight className="rtl:-scale-x-100" />
        </IconButton>
      </div>
    </div>
  );
}

/**
 * A picture's tile. A photo (a JPEG, or one with a focal point) fills it
 * around its subject; a mark or a drawing is shown whole.
 */
function Tile({ m, alt, className, onOpen }: { m: Media; alt: string; className: string; onOpen: () => void }) {
  const fill = !!m.focus || m.mime === "image/jpeg";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Look at ${alt}`}
      aria-haspopup="dialog"
      style={focusOf(m)}
      className={cn("bg-muted relative block w-full overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-(--brand-accent)", className)}
    >
      {m.thumbnail ? (
        <Thumb src={m.thumbnail} alt={alt} className={fill ? "object-cover p-0 [object-position:var(--focus,center)]" : "p-4"} />
      ) : (
        <span className="text-muted-foreground absolute inset-0 flex items-center justify-center">
          <IconFile className="size-8" stroke={1.5} />
        </span>
      )}
    </button>
  );
}

/**
 * A video's tile: a muted loop over its poster. It starts on its own only
 * when the reader hasn't asked for less motion, and a button pauses and plays
 * it either way (WCAG 2.2.2).
 * ponytail: every loop on the page plays at once; play only those in view (IntersectionObserver) if a gallery of many gets heavy.
 */
function Clip({ m, alt, className }: { m: Media; alt: string; className: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const poster = m.preview ?? m.thumbnail ?? undefined;
  useEffect(() => {
    // A browser that won't autoplay leaves the poster, and the button.
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) ref.current?.play().catch(() => {});
  }, [m.original]);
  return (
    <div style={focusOf(m)} className={cn("bg-muted relative overflow-hidden rounded-lg", className)}>
      <video
        ref={ref}
        src={m.original}
        poster={poster}
        muted
        loop
        playsInline
        preload={poster ? "none" : "metadata"}
        aria-label={alt}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="size-full object-cover [object-position:var(--focus,center)]"
      />
      <IconButton
        label={playing ? "Pause the video" : "Play the video"}
        variant="secondary"
        className="absolute end-3 bottom-3 print:hidden"
        onClick={() => {
          const v = ref.current;
          if (v?.paused) v.play().catch(() => {});
          else v?.pause();
        }}
      >
        {playing ? <IconPlayerPauseFilled /> : <IconPlayerPlayFilled />}
      </IconButton>
    </div>
  );
}

const focusOf = (m: Media) => (m.focus ? ({ "--focus": `${m.focus.x * 100}% ${m.focus.y * 100}%` } as React.CSSProperties) : undefined);
