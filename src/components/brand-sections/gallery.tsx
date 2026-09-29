"use client";

import { useEffect, useRef, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconFile, IconPlayerPauseFilled, IconPlayerPlayFilled } from "@tabler/icons-react";
import { HEAD } from "@/components/brand-sections/look";
import { Body, ItemCaption, ItemTitle, itemRoot, useRuleAnchor } from "@/components/brand-sections/slots";
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
 * muted loop. Laid out as a grid, a bento (an item may span two cells), a
 * carousel that snaps from one to the next, a collage (columns of pictures
 * at their own shapes, masonry-like) or crops (each picture cut to the
 * shapes it gets used at, around its focus point).
 */

/** Tiles per row, up to the section's columns, as its container widens. */
const GRID: Record<number, string> = {
  1: "",
  2: "@md:grid-cols-2",
  3: "@md:grid-cols-2 @3xl:grid-cols-3",
  4: "@md:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4",
};

/** A tile's box: a bento's rows are one height, so a tile two cells wide lines up with its neighbours. A collage's is the picture's own. */
const SHAPE = { grid: "aspect-[4/3]", bento: "h-56 @3xl:h-72", carousel: "aspect-video", strip: "h-56 w-auto @3xl:h-72", collage: "", crops: "" };

/** A collage's columns: CSS columns fill top to bottom, so pictures of different heights pack without gaps. */
const COLUMNS: Record<number, string> = {
  1: "",
  2: "@md:columns-2",
  3: "@md:columns-2 @3xl:columns-3",
  4: "@md:columns-2 @3xl:columns-3 @5xl:columns-4",
};

/** The shapes a picture is cut to: a banner, a square (an avatar, a grid post), a portrait post and a story. */
const CROPS = [
  { ratio: 16 / 9, label: "16:9" },
  { ratio: 1, label: "1:1" },
  { ratio: 4 / 5, label: "4:5" },
  { ratio: 9 / 16, label: "9:16" },
];

/** A collage tile at the picture's own shape, held between a tall portrait and a wide landscape so none is a sliver. */
const shapeOf = (m: Media) => (m.width && m.height ? Math.min(2, Math.max(0.6, m.width / m.height)) : 4 / 3);

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
  const asked = s.props.layout as string | undefined;
  const layout = asked && asked in SHAPE && !(asked === "carousel" && pictures.length < 2) ? (asked as keyof typeof SHAPE) : "grid";

  const figure = (p: Picture, n: number) => {
    const alt = shown[n].title ?? shown[n].description ?? p.m.filename;
    const credit = p.m.creator ?? p.m.copyright;
    const shape = SHAPE[layout];
    const ratio = layout === "collage" ? { aspectRatio: shapeOf(p.m) } : undefined;
    return (
      <figure className="space-y-3">
        {layout === "crops" ? (
          // A row at one height; each crop as wide as its shape makes it, wrapping on a phone.
          <ul aria-label="Crops" className="flex flex-wrap items-end gap-3">
            {CROPS.map((c) => (
              <li key={c.label} className="space-y-1.5">
                {isVideo(p.m) ? (
                  <Clip m={p.m} alt={`${alt}, cropped to ${c.label}`} className="h-32 @3xl:h-44" style={{ aspectRatio: c.ratio }} />
                ) : (
                  <Tile
                    m={p.m}
                    alt={`${alt}, cropped to ${c.label}`}
                    cover
                    className="h-32 w-auto @3xl:h-44"
                    style={{ aspectRatio: c.ratio }}
                    onOpen={() => setOpenId(p.m.id)}
                  />
                )}
                <p className="text-muted-foreground text-xs tabular-nums">{c.label}</p>
              </li>
            ))}
          </ul>
        ) : isVideo(p.m) ? (
          <Clip m={p.m} alt={alt} className={shape} style={ratio} />
        ) : (
          <Tile m={p.m} alt={alt} className={shape} style={ratio} onOpen={() => setOpenId(p.m.id)} />
        )}
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
          {layout === "strip" ? (
            // A band of pictures at one height, each as wide as its shape makes it, scrolling sideways past the frame.
            <ul className="-mx-6 flex snap-x gap-4 overflow-x-auto px-6 pb-2 @3xl:-mx-10 @3xl:px-10 [scrollbar-width:thin]">
              {pictures.map((p, n) => (
                <li key={p.m.id} {...itemRoot(p.i)} id={p.anchor} className="shrink-0 snap-start scroll-mt-20 [&_img]:w-auto [&_figure]:h-56 @3xl:[&_figure]:h-72">
                  {figure(p, n)}
                </li>
              ))}
            </ul>
          ) : layout === "carousel" ? (
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
          ) : layout === "collage" ? (
            <ul className={cn("gap-x-4", COLUMNS[s.columns])}>
              {pictures.map((p, n) => (
                <li key={p.m.id} id={p.anchor} className="mb-6 min-w-0 scroll-mt-20 break-inside-avoid">
                  {figure(p, n)}
                </li>
              ))}
            </ul>
          ) : (
            <ul className={cn("grid gap-x-6 gap-y-8", layout !== "crops" && GRID[s.columns], layout === "bento" && "grid-flow-dense gap-x-4")}>
              {pictures.map((p, n) => (
                <li
                  key={p.m.id}
                  {...itemRoot(p.i)}
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
 * around its subject, as a crop (`cover`) does; a mark or a drawing is shown whole.
 */
function Tile({
  m,
  alt,
  className,
  style,
  cover,
  onOpen,
}: {
  m: Media;
  alt: string;
  className: string;
  style?: React.CSSProperties;
  cover?: boolean;
  onOpen: () => void;
}) {
  const fill = cover || !!m.focus || m.mime === "image/jpeg";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Look at ${alt}`}
      aria-haspopup="dialog"
      style={{ ...focusOf(m), ...style }}
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
function Clip({ m, alt, className, style }: { m: Media; alt: string; className: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const poster = m.preview ?? m.thumbnail ?? undefined;
  useEffect(() => {
    // A browser that won't autoplay leaves the poster, and the button.
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) ref.current?.play().catch(() => {});
  }, [m.original]);
  return (
    <div style={{ ...focusOf(m), ...style }} className={cn("bg-muted relative overflow-hidden rounded-lg", className)}>
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
