"use client";

import { HEAD } from "@/components/brand-sections/look";
import { Body, Eyebrow, Lede, Title } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { AnchorLink } from "@/components/site/anchors";
import { useMedia, useRule, useSite } from "@/components/site/site-context";
import { Thumb } from "@/components/thumb";
import { inkOn, isHex } from "@/lib/color";
import type { Section } from "@/lib/pages";
import { trail, tree } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * A band that opens a part of a long page: its number, eyebrow, title and
 * lede on its tone, and a picture beside them when it has one.
 */

/** The words keep to a reading column, or the wide frame; the ground bleeds either way. */
const WIDTH: Record<Section["width"], string> = {
  text: "max-w-[var(--brand-measure,42rem)]",
  wide: "max-w-280",
  full: "max-w-280",
};

export function HeaderSection({ section: s }: SectionProps) {
  const { idOf, url } = useSite();
  const ground = useGround(s);
  const number = useNumber(s);
  const picture = useMedia(s.props.image as string | undefined);
  const id = idOf(s.id);
  return (
    <div className={ground.className} style={ground.style}>
      <div
        className={cn(
          "mx-auto grid gap-8 px-6 py-14 @3xl:px-10 @3xl:py-20",
          WIDTH[s.width],
          picture?.preview && "@3xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] @3xl:items-center @3xl:gap-12",
        )}
      >
        <div className="group/section min-w-0 space-y-3">
          {number && <p className={cn(HEAD, "text-muted-foreground text-5xl tabular-nums @3xl:text-6xl")}>{number}</p>}
          <Eyebrow />
          {s.title && (
            <div className="flex items-center gap-1">
              <Title className="text-4xl @3xl:text-5xl" />
              <AnchorLink id={id} label={`Copy a link to ${s.title}`} className="group-hover/section:opacity-100" />
            </div>
          )}
          <Lede className="max-w-2xl" />
          <Body className="max-w-2xl" />
        </div>
        {picture?.preview && (
          <div className="relative aspect-4/3 overflow-hidden rounded-xl">
            <Thumb src={url(picture.id, "/w_720,f_webp")} alt={picture.title ?? picture.description ?? picture.filename} className="object-cover p-0" />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The band's number when the brand numbers its pages: the page's own, then
 * the band's place among the page's bands, as a child page counts (04.1).
 * None on a page without a number, the home, so no band reads as page 01.
 */
function useNumber(s: Section): string | null {
  const { view } = useSite();
  const page = view.page;
  if (!view.theme.settings.numbering || !page) return null;
  const at = trail(tree(view.nav, true), page.slug).at(-1)?.number;
  const n = page.sections.filter((x) => x.template === "header").findIndex((x) => x.id === s.id) + 1;
  return at && n ? `${at}.${n}` : null;
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
