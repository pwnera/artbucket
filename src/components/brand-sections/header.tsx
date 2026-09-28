"use client";

import { useGround } from "@/components/brand-sections/frame";
import { HEAD } from "@/components/brand-sections/look";
import { Body, Eyebrow, Lede, Title } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { AnchorLink } from "@/components/site/anchors";
import { useMedia, useSite } from "@/components/site/site-context";
import { Thumb } from "@/components/thumb";
import type { Section } from "@/lib/pages";
import { trail, tree } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * A band that opens a part of a long page: its number, eyebrow, title and
 * lede on its tone, and a picture beside them when it has one.
 */

/** The words keep to a reading column, or the wide frame; the ground bleeds either way. */
const WIDTH: Record<Section["width"], string> = {
  text: "max-w-(--brand-measure)",
  wide: "max-w-280",
  full: "max-w-280",
};

export function HeaderSection({ section: s }: SectionProps) {
  const { view, idOf, url } = useSite();
  const ground = useGround(s);
  const number = useNumber(s);
  const picture = useMedia(s.props.image as string | undefined);
  const id = idOf(s.id);
  // Opening the page, its title is set at the h1's size; otherwise at Title's own, the h2's.
  const opens = view.page?.sections[0]?.id === s.id;
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
          {number && <p className={cn(HEAD, "text-muted-foreground text-[length:min(var(--brand-h1),10cqi)] leading-none tabular-nums")}>{number}</p>}
          <Eyebrow />
          {s.title && (
            <div className="flex items-center gap-1">
              <Title className={cn(opens && "text-[length:min(var(--brand-h1),10cqi)] leading-[1.1]")} />
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
  if (!view.theme.numbering || !page) return null;
  const at = trail(tree(view.nav, true), page.slug).at(-1)?.number;
  const n = page.sections.filter((x) => x.template === "header").findIndex((x) => x.id === s.id) + 1;
  return at && n ? `${at}.${n}` : null;
}
