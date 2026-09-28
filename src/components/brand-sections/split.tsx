"use client";

import { useMemo } from "react";
import { pictured } from "@/components/brand-sections/parts";
import { Body, RuleSlot } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { useMedia, useSite } from "@/components/site/site-context";
import { Thumb } from "@/components/thumb";
import { cn } from "@/lib/utils";

/**
 * Words beside a picture: the body and the rules it binds on one side, and
 * props.image, else the first picture of those rules, on the other. A rule's
 * picture shown here leaves its block, so it shows once. `flip` puts the
 * picture on the start side; in a narrow container the words come first.
 * `ratio`, `align` and `fit` are the builder's say over the layout.
 */

/** Which side is wider, on a wide screen. */
const COLUMNS = {
  even: "@3xl:grid-cols-2",
  words: "@3xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]",
  picture: "@3xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]",
} as const;
/** The same, with the picture on the start side. */
const FLIPPED = { ...COLUMNS, words: COLUMNS.picture, picture: COLUMNS.words };
export function SplitSection({ section: s, rules }: SectionProps) {
  const { url } = useSite();
  const image = typeof s.props.image === "string" ? s.props.image : undefined;
  const media = useMedia(image);
  const { shown, asset } = useMemo(() => {
    // Only its keys: `rules` also carries a background color and items' keys.
    const own = rules.filter((r) => s.keys.includes(r.key));
    const asset = image ? undefined : own.flatMap((r) => r.assets).find(pictured);
    return { shown: asset ? own.map((r) => ({ ...r, assets: r.assets.filter((a) => a !== asset) })) : own, asset };
  }, [rules, s.keys, image]);

  // props.image is a picture, at its own shape; a rule's is a specimen (a logo, say), with room around it.
  const pic = image
    ? { id: image, alt: media?.title ?? media?.description ?? media?.filename ?? "", ratio: media?.width && media.height ? media.width / media.height : 4 / 3 }
    : asset && { id: asset.id, alt: asset.title ?? asset.filename, ratio: 4 / 3 };

  const words = (
    <div className="min-w-0 space-y-6">
      <Body className="leading-relaxed" />
      {shown.map((r) => (
        <RuleSlot key={r.key} rule={r} />
      ))}
    </div>
  );
  if (!pic) return words;
  const flip = s.props.flip === true;
  const ratio = (s.props.ratio as keyof typeof COLUMNS | undefined) ?? "even";
  // A picture fills its frame; a rule's (a logo, say) is a specimen, whole, with room around it.
  const fill = s.props.fit === "fill" || (s.props.fit !== "whole" && !!image);
  return (
    <div className={cn("grid gap-8 @3xl:gap-12", s.props.align === "center" ? "items-center" : "items-start", (flip ? FLIPPED : COLUMNS)[ratio])}>
      {words}
      <div
        className={cn("bg-muted relative max-h-[36rem] overflow-hidden rounded-xl", flip && "@3xl:order-first")}
        // Between portrait and wide, so neither a tall nor a thin picture takes over the section.
        style={{ aspectRatio: Math.min(Math.max(pic.ratio, 3 / 4), 16 / 9) }}
      >
        <Thumb src={url(pic.id, "/w_960,f_webp")} alt={pic.alt} className={fill ? "object-cover p-0" : "p-8"} />
      </div>
    </div>
  );
}
