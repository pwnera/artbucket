"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconPlayerPauseFilled, IconPlayerPlayFilled } from "@/components/icons";
import type { z } from "zod";
import { useGround } from "@/components/brand-sections/frame";
import { HEAD } from "@/components/brand-sections/look";
import { markOf } from "@/components/brand-sections/parts";
import { Body, Eyebrow, Lede, Mark, Title } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { IconButton } from "@/components/icon-button";
import { useMedia, useSite } from "@/components/site/site-context";
import { colorsOf, sectionGround, type Theme } from "@/lib/brand-theme";
import type { Section, TEMPLATE_PROPS } from "@/lib/pages";
import { resolve, ruleName } from "@/lib/rules";
import { firstBinding, type Media } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * The page's opening: the brand's mark, the title set big, a line under it,
 * and the palette as a strip, on the brand's color or over a picture or a
 * muted loop darkened to read on.
 */

type Props = z.output<typeof TEMPLATE_PROPS.cover>;

/** The words keep to a reading column, or the wide frame; the ground bleeds either way. */
const WIDTH: Record<Section["width"], string> = {
  text: "max-w-(--brand-measure)",
  wide: "max-w-280",
  full: "max-w-280",
};

const HEIGHT: Record<NonNullable<Props["height"]>, string> = {
  auto: "",
  tall: "min-h-[70svh] print:min-h-0",
  screen: "min-h-svh print:min-h-0",
};

const ALIGN: Record<NonNullable<Props["align"]>, string> = {
  start: "items-start text-start",
  center: "items-center text-center",
  end: "items-end text-end",
};

/**
 * The title on the theme's h1, held to the cover's width so a long name never
 * overflows. A first screen's headline on any scale: large never under
 * 3.5rem, huge never under 5rem, so a tight scale (Documentation's 1.2)
 * still opens with confidence.
 */
const TITLE: Record<NonNullable<Props["titleSize"]>, string> = {
  medium: "text-[length:min(calc(var(--brand-h1)*0.75),8cqi)]",
  large: "text-[length:min(max(var(--brand-h1),3.5rem),10cqi)]",
  huge: "text-[length:min(max(calc(var(--brand-h1)*1.6),5rem),16cqi)]",
};

/** On a grid of hairlines with headlines (Swiss), a title is a poster's, set tight; a huge one as big as the frame takes. */
const POSTER = "text-[length:min(9.5rem,17cqi)]";

/**
 * What a cover takes from the look, beyond its scale and grounds, read from
 * the settings that set the looks apart (lib/brand-theme.ts LOOKS):
 * - canvas (Board): a two-line headline, tight, its second line muted;
 * - hairline separation (Documentation, Swiss): its words under a hairline,
 *   and with huge titles (Swiss) the title a poster's, the body on the grid's
 *   second half and the palette a taller strip;
 * - round corners, 20px and up (Playful): the cover a rounded field inset
 *   from the page, its palette in dots.
 */
function coverLook(t: Pick<Theme, "grounds" | "separation" | "titles" | "radius">) {
  const board = t.grounds === "canvas";
  const grid = !board && t.separation === "hairline";
  return { board, grid, poster: grid && t.titles === "huge", round: !board && t.radius >= 20 };
}

/** What a picture says to someone who can't see it. */
const altOf = (m: Media) => m.title ?? m.description ?? m.filename;

export function CoverSection({ section: s }: SectionProps) {
  const { view, context, url, idOf } = useSite();
  const p = s.props as Props;
  const picture = useMedia(p.image ?? (s.tone === "image" ? s.background?.image : undefined));
  const still = picture?.preview ? picture : undefined;
  const loop = useMedia(p.video);
  const video = loop?.mime.startsWith("video/") ? loop : undefined;
  // Over a picture or a loop, the image ground: its text graded on the worst picture under the scrim, drawn here over the <img> or <video>.
  const over = useMemo(() => ({ tone: "image" as const, background: { scrim: s.background?.scrim } }), [s.background?.scrim]);
  const ground = useGround(still || video ? over : s);
  const scrim = sectionGround(view.theme, over, () => undefined).scrim;
  const colors = useMemo(() => colorsOf(resolve(view.rules, context ?? "")), [view.rules, context]);
  const sections = view.page?.sections;
  // The page's h1 when it opens the page; the page header then leaves its own out.
  const H = sections?.[0]?.id === s.id ? "h1" : "h2";
  // The home is the brand's own: its mark and name. Anywhere else the cover opens a chapter, named for its page.
  const home = view.page?.home ?? true;
  const mark = p.mark === "always" || (p.mark !== "never" && home);
  const heading = home ? view.brand.name : (view.page?.title ?? view.brand.name);
  // A wordmark or lockup already spells the name: the heading saying it again stays for readers of the outline only.
  const spelled = mark && !/mark|icon|symbol|glyph/.test(markOf(view.rules.filter((r) => r.context === null))?.key ?? "mark");
  const echo = spelled && (s.title ?? heading).trim().toLowerCase() === view.brand.name.trim().toLowerCase();
  const look = coverLook(view.theme);
  // On the Board look (grounds: canvas) a two-line headline reads as the brand's: tight, its second line muted.
  const board = look.board && !!s.title?.includes("\n");
  const size = p.titleSize ?? "large";
  const big = cn(
    "break-words",
    look.poster && size === "huge" ? POSTER : TITLE[size],
    look.poster ? "leading-[0.9] tracking-[-0.035em]" : board ? "leading-[0.95]" : "leading-[1.05]",
  );
  const start = (p.align ?? "start") === "start";
  const focus = (still ?? video)?.focus;
  const position = focus ? `${focus.x * 100}% ${focus.y * 100}%` : undefined;

  return (
    <div
      className={cn(
        "relative isolate flex flex-col justify-end overflow-hidden",
        HEIGHT[p.height ?? "auto"],
        // Round: a field inset from the page, its corners a step rounder than the cards'.
        look.round && "m-2 rounded-[calc(var(--brand-radius)*1.5)] @3xl:m-4",
        ground.className,
      )}
      style={ground.style}
    >
      {video ? (
        <Loop
          src={video.original}
          poster={still ? url(still.id, "/w_1600,f_webp") : (video.preview ?? video.thumbnail ?? undefined)}
          label={altOf(still ?? video)}
          position={position}
        />
      ) : (
        still && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url(still.id, "/w_1600,f_webp")}
            srcSet={`${url(still.id, "/w_800,f_webp")} 800w, ${url(still.id, "/w_1600,f_webp")} 1600w, ${url(still.id, "/w_2400,f_webp")} 2400w`}
            sizes="100vw"
            alt={altOf(still)}
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 -z-10 size-full object-cover"
            style={{ objectPosition: position }}
          />
        )
      )}
      {(still || video) && <div aria-hidden className="absolute inset-0 -z-10 bg-black" style={{ opacity: scrim }} />}

      <div className={cn("mx-auto flex w-full flex-col gap-8 px-6 py-16 @3xl:px-10 @3xl:py-24", WIDTH[s.width], ALIGN[p.align ?? "start"])}>
        {mark && <Mark brand={view.brand} rules={view.rules} color={colors[0]?.value as string | undefined} size={p.markSize} bare={p.markFrame === "bare"} />}
        <div className={cn("max-w-full space-y-4", look.grid && "self-stretch border-t border-current/25 pt-4")}>
          <Eyebrow />
          {s.title ? <Title as={H} muted={board} className={cn(big, echo && "sr-only")} /> : <H className={cn(HEAD, big, "text-balance", echo && "sr-only")}>{heading}</H>}
          <Lede className="max-w-2xl @3xl:text-2xl" />
        </div>
        {/* On the poster's grid the body takes the second half, under the headline's end. */}
        <Body className={cn("max-w-2xl", look.poster && start && "@3xl:ms-[50%] @3xl:max-w-none")} />
        {p.strip !== false && colors.length > 0 && (
          // The palette at a glance: a stripe per color (a dot when round), a link to it where this page shows it.
          // Hover widens a stripe or lifts a dot; the strip never moves.
          <ul
            aria-label="Palette"
            className={cn(
              look.round
                ? "flex flex-wrap gap-2"
                : ["ring-border flex self-stretch overflow-hidden rounded-xl ring-1", look.poster ? "h-20" : "h-12"],
            )}
          >
            {colors.map((c) => {
              const hex = c.value as string;
              const name = `${ruleName(c)}, ${hex}`;
              const shown = sections && firstBinding(sections, c.key);
              return (
                <li
                  key={c.key}
                  title={name}
                  className={cn(
                    "flex duration-200 ease-out",
                    look.round
                      ? "size-12 overflow-hidden rounded-full ring-1 ring-current/25 transition-transform hover:-translate-y-1 has-focus-visible:-translate-y-1 @3xl:size-14"
                      : "has-focus-visible:grow-[1.6] min-w-3 flex-1 transition-[flex-grow] hover:grow-[1.6]",
                  )}
                  style={{ backgroundColor: hex }}
                >
                  {shown ? (
                    <a
                      href={`#${idOf(`rule-${c.key}`)}`}
                      aria-label={name}
                      className="flex-1 outline-none focus-visible:ring-2 focus-visible:ring-(--brand-accent) focus-visible:ring-inset"
                    />
                  ) : (
                    <span className="sr-only">{name}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * A muted loop behind the cover, its poster the cover's picture. It starts on
 * its own only when the reader hasn't asked for less motion, and a button
 * pauses and plays it either way (WCAG 2.2.2).
 */
function Loop({ src, poster, label, position }: { src: string; poster?: string; label: string; position?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    // A browser that won't autoplay leaves the poster, and the button.
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) ref.current?.play().catch(() => {});
  }, [src]);
  return (
    <>
      <video
        ref={ref}
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        preload={poster ? "none" : "metadata"}
        aria-label={label}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="absolute inset-0 -z-10 size-full object-cover"
        style={{ objectPosition: position }}
      />
      <IconButton
        label={playing ? "Pause the video" : "Play the video"}
        variant="secondary"
        className="absolute end-4 bottom-4 print:hidden"
        onClick={() => {
          const v = ref.current;
          if (v?.paused) v.play().catch(() => {});
          else v?.pause();
        }}
      >
        {playing ? <IconPlayerPauseFilled /> : <IconPlayerPlayFilled />}
      </IconButton>
    </>
  );
}
