"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconPlayerPauseFilled, IconPlayerPlayFilled } from "@tabler/icons-react";
import type { z } from "zod";
import { HEAD } from "@/components/brand-sections/look";
import { BrandIcon } from "@/components/brand-sections/parts";
import { Body, Eyebrow, Lede, Title } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { IconButton } from "@/components/icon-button";
import { useMedia, useRule, useSite } from "@/components/site/site-context";
import { colorsOf } from "@/lib/brand-theme";
import { inkOn, isHex } from "@/lib/color";
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
  text: "max-w-[var(--brand-measure,42rem)]",
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

/** What a picture says to someone who can't see it. */
const altOf = (m: Media) => m.title ?? m.description ?? m.filename;

export function CoverSection({ section: s }: SectionProps) {
  const { view, context, url, idOf } = useSite();
  const p = s.props as Props;
  const ground = useGround(s);
  const picture = useMedia(p.image ?? (s.tone === "image" ? s.background?.image : undefined));
  const still = picture?.preview ? picture : undefined;
  const loop = useMedia(p.video);
  const video = loop?.mime.startsWith("video/") ? loop : undefined;
  const colors = useMemo(() => colorsOf(resolve(view.rules, context ?? "")), [view.rules, context]);
  const sections = view.page?.sections;
  // The page's h1 when it opens the page; the page header then leaves its own out.
  const H = sections?.[0]?.id === s.id ? "h1" : "h2";
  const big = "text-4xl break-words @lg:text-5xl @3xl:text-6xl";
  const scrim = s.background?.scrim ?? 0.45;
  const focus = (still ?? video)?.focus;
  const position = focus ? `${focus.x * 100}% ${focus.y * 100}%` : undefined;

  return (
    <div
      className={cn(
        "relative isolate flex flex-col justify-end overflow-hidden",
        HEIGHT[p.height ?? "auto"],
        still || video ? "dark bg-background text-foreground" : ground.className,
      )}
      style={still || video ? undefined : ground.style}
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
      {(still || video) && <div aria-hidden className="absolute inset-0 -z-10" style={{ backgroundColor: `rgb(0 0 0 / ${scrim})` }} />}

      <div className={cn("mx-auto flex w-full flex-col gap-8 px-6 py-16 @3xl:px-10 @3xl:py-24", WIDTH[s.width], ALIGN[p.align ?? "start"])}>
        <BrandIcon brand={view.brand} rules={view.rules} color={colors[0]?.value as string | undefined} />
        <div className="space-y-4">
          <Eyebrow />
          {s.title ? <Title as={H} className={big} /> : <H className={cn(HEAD, big, "text-balance")}>{view.brand.name}</H>}
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
                      className="focus-visible:ring-ring flex-1 outline-none focus-visible:ring-2 focus-visible:ring-inset"
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

type Ground = { className?: string; style?: React.CSSProperties };

/**
 * The section's ground from its tone, as the frame draws it for every other
 * template (frame.tsx useGround).
 * ponytail: a copy until frame.tsx exports it; W3's sectionGround replaces both.
 */
function useGround(s: Section): Ground {
  const { view } = useSite();
  const color = useRule(s.background?.color);
  const image = useMedia(s.background?.image);
  switch (s.tone) {
    case "tint":
    case "pattern":
      return { className: "bg-[color-mix(in_oklab,var(--brand-accent,var(--primary))_7%,var(--background))]" };
    case "panel":
      return { className: "bg-muted" };
    case "dark":
      return { className: "dark bg-background text-foreground" };
    case "brand":
      return on(view.theme.v1.accent?.light);
    case "color":
      return on(typeof color?.value === "string" ? color.value : undefined);
    case "image": {
      if (!image?.preview) return { className: "dark bg-background text-foreground" };
      const scrim = `rgb(0 0 0 / ${s.background?.scrim ?? 0.45})`;
      return {
        className: "dark bg-cover bg-center text-foreground",
        style: { backgroundImage: `linear-gradient(${scrim}, ${scrim}), url("${image.preview}")` },
      };
    }
    default:
      return {};
  }
}

/** A ground of the section's own color: black or white ink, whichever reads, and the app's quiet text and lines mixed from the two. */
function on(hex: string | undefined): Ground {
  if (!hex || !isHex(hex)) return { className: "dark bg-primary text-primary-foreground" };
  const ink = inkOn(hex.slice(0, 7));
  return {
    className: cn(ink === "#ffffff" && "dark"),
    style: {
      backgroundColor: hex,
      color: ink,
      "--foreground": ink,
      "--muted-foreground": `color-mix(in oklab, ${ink} 72%, ${hex})`,
      "--border": `color-mix(in oklab, ${ink} 20%, ${hex})`,
    } as React.CSSProperties,
  };
}
