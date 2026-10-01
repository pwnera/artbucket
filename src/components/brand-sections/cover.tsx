"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconPlayerPauseFilled, IconPlayerPlayFilled } from "@tabler/icons-react";
import type { z } from "zod";
import { useGround } from "@/components/brand-sections/frame";
import { HEAD } from "@/components/brand-sections/look";
import { BrandIcon } from "@/components/brand-sections/parts";
import { Body, Eyebrow, Lede, Title } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { IconButton } from "@/components/icon-button";
import { useMedia, useSite } from "@/components/site/site-context";
import { colorsOf, sectionGround } from "@/lib/brand-theme";
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

/** The title on the theme's h1, held to the cover's width so a long name never overflows. */
const TITLE: Record<NonNullable<Props["titleSize"]>, string> = {
  medium: "text-[length:min(calc(var(--brand-h1)*0.75),8cqi)]",
  large: "text-[length:min(var(--brand-h1),10cqi)]",
  huge: "text-[length:min(calc(var(--brand-h1)*1.6),16cqi)]",
};

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
  const big = cn(TITLE[p.titleSize ?? "large"], "leading-[1.1] break-words");
  const focus = (still ?? video)?.focus;
  const position = focus ? `${focus.x * 100}% ${focus.y * 100}%` : undefined;

  return (
    <div className={cn("relative isolate flex flex-col justify-end overflow-hidden", HEIGHT[p.height ?? "auto"], ground.className)} style={ground.style}>
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
        {mark && <BrandIcon brand={view.brand} rules={view.rules} color={colors[0]?.value as string | undefined} size={p.markSize} bare={p.markFrame === "bare"} />}
        <div className="max-w-full space-y-4">
          <Eyebrow />
          {s.title ? <Title as={H} className={big} /> : <H className={cn(HEAD, big, "text-balance")}>{heading}</H>}
          <Lede className="max-w-2xl @3xl:text-2xl" />
        </div>
        <Body className="max-w-2xl" />
        {p.strip !== false && colors.length > 0 && (
          // The palette at a glance: a stripe per color, a link to it where this page shows it. Hover widens one; the strip never moves.
          <ul aria-label="Palette" className="ring-border flex h-12 self-stretch overflow-hidden rounded-xl ring-1">
            {colors.map((c) => {
              const hex = c.value as string;
              const name = `${ruleName(c)}, ${hex}`;
              const shown = sections && firstBinding(sections, c.key);
              return (
                <li
                  key={c.key}
                  title={name}
                  className="has-focus-visible:grow-[1.6] flex min-w-3 flex-1 transition-[flex-grow] duration-200 ease-out hover:grow-[1.6]"
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
