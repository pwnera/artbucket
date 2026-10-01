"use client";

import { useState } from "react";
import { IconCopy, IconDownload, IconTrash } from "@tabler/icons-react";
import { copy, GRADE_STYLE, MARKER } from "@/components/brand-values";
import { HEAD } from "@/components/brand-sections/look";
import { CopyButton } from "@/components/copy-button";
import { FontThumb } from "@/components/font-preview";
import { IconButton } from "@/components/icon-button";
import { RenditionMenu } from "@/components/rendition-menu";
import { useAssetUrl } from "@/components/site/asset-url";
import { Thumb } from "@/components/thumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ExternalLink } from "@/components/external-link";
import { colorsOf } from "@/lib/brand-theme";
import { contrast, grade, inkOn } from "@/lib/color";
import { isFont } from "@/lib/font";
import { contextLabel, ruleLabel as label, section, type Rule, type RuleAsset } from "@/lib/rules";
import { ago, exact } from "@/lib/time";
import { renditionLabel } from "@/lib/transform";
import { cn } from "@/lib/utils";

/**
 * The pieces a brand's page is drawn from, shared by the editor and the
 * site: the cover, section headings, contrast pairings, and a rule's
 * pictures and files.
 */

/** What these parts read of a rule: a site's view rule has no id. */
type Shown = Pick<Rule, "key" | "type" | "value" | "context" | "assets" | "updatedAt">;

/** The first image of a rule's assets. */
export const pictured = (a: RuleAsset) => a.preview ?? !a.mime;

/**
 * The brand's face, as a Notion page's icon: its logo on a tile that shows
 * its edges in both themes (the dark-background variant in dark mode, by
 * CSS alone), a wide mark as wide as it is. Without one, its initial on its
 * first color; editors click that to add the logo.
 */
/** The mark's height, and the letter's size on a brand with no logo yet. */
const ICON_SIZE = {
  small: ["h-12", "size-12 text-xl"],
  medium: ["h-16", "size-16 text-2xl"],
  large: ["h-24", "size-24 text-4xl"],
} as const;

/** `bare`: the logo alone on the ground, without the checkered, bordered square. */
export function BrandIcon({
  brand,
  rules,
  color,
  onAdd,
  size = "medium",
  bare,
}: {
  brand: { name: string };
  rules: Shown[];
  color?: string;
  onAdd?: () => void;
  size?: keyof typeof ICON_SIZE;
  bare?: boolean;
}) {
  const url = useAssetUrl();
  const logos = rules.filter((r) => section(r.key) === "logo" && r.assets.some(pictured));
  const named = logos.find((r) => /^logo\.(primary|mark|main|wordmark)/.test(r.key)) ?? logos[0];
  const base = named && (logos.find((r) => r.key === named.key && r.context === null) ?? named);
  const dark = named && logos.find((r) => r.key === named.key && r.context && /dark/.test(r.context));
  const a = base?.assets.find(pictured);
  const d = dark?.assets.find(pictured);
  if (a) {
    // As wide as the mark, from a square to three squares.
    const ratio = a.width && a.height ? Math.min(Math.max(a.width / a.height, 1), 3) : 1;
    return (
      <span className={cn("relative shrink-0 overflow-hidden", ICON_SIZE[size][0], !bare && "bg-card rounded-2xl border")} style={{ aspectRatio: ratio }}>
        <span className={cn("absolute inset-0", d && "dark:hidden")}>
          <Thumb src={url(a.id, "/w_192,f_webp")} alt={`${brand.name} logo`} eager />
        </span>
        {d && (
          <span className="absolute inset-0 hidden dark:block">
            <Thumb src={url(d.id, "/w_192,f_webp")} alt={`${brand.name} logo`} eager />
          </span>
        )}
      </span>
    );
  }
  const tile = cn("flex shrink-0 items-center justify-center rounded-2xl border font-semibold", ICON_SIZE[size][1], !color && "bg-muted");
  const style = color ? { backgroundColor: color, color: inkOn(color.slice(0, 7)) } : undefined;
  if (!onAdd)
    return (
      <span className={tile} style={style}>
        {brand.name[0]?.toUpperCase()}
      </span>
    );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Add the logo"
          onClick={onAdd}
          className={cn(tile, "transition-[box-shadow,transform] duration-150 hover:shadow-md active:scale-95")}
          style={style}
        >
          {brand.name[0]?.toUpperCase()}
        </button>
      </TooltipTrigger>
      <TooltipContent>Add the logo</TooltipContent>
    </Tooltip>
  );
}

/**
 * The cover: the brand's icon and name, what the page is and covers, when it
 * last changed, and the palette as one strip. `title`: the name as an editor,
 * for someone who may rename the brand. `portal`: a portal's tab, whose page
 * has its own h1.
 */
export function Hero({
  brand,
  rules,
  all = rules,
  context,
  updated,
  title,
  portal,
  onAddLogo,
}: {
  brand: { name: string; default?: boolean };
  /** What the page shows: the context's view. */
  rules: Shown[];
  /** Every variant: the contexts covered, and the logo for dark mode. */
  all?: Shown[];
  context?: string;
  updated?: { at: string; who: string | null } | null;
  title?: React.ReactNode;
  portal?: boolean;
  onAddLogo?: () => void;
}) {
  const keys = new Set(rules.map((r) => r.key)).size;
  const assets = new Set(rules.flatMap((r) => r.assets.map((a) => a.id))).size;
  const sections = new Set(rules.map((r) => section(r.key))).size;
  const contexts = [...new Set(all.flatMap((r) => (r.context ? [r.context] : [])))];
  const colors = colorsOf(rules);
  const at =
    updated?.at ??
    rules
      .map((r) => r.updatedAt)
      .filter(Boolean)
      .sort()
      .at(-1);
  // Only what there is: an empty brand doesn't read "0 rules · 0 assets".
  const facts = (
    portal
      ? [sections && `${sections} ${sections === 1 ? "section" : "sections"}`]
      : [
          context && `as they apply to ${contextLabel(context)}`,
          keys && `${keys} ${keys === 1 ? "rule" : "rules"}`,
          assets && `${assets} ${assets === 1 ? "asset" : "assets"}`,
          !context && contexts.length && `for ${contexts.map(contextLabel).join(", ")}`,
        ]
  ).filter(Boolean);
  const H = portal ? "h2" : "h1";

  return (
    // Its own container: the name grows with the room the cover has, not the window's.
    <div id="top" className="@container scroll-mt-20 space-y-8">
      <div className="flex items-center gap-4">
        <BrandIcon brand={brand} rules={all} color={colors[0]?.value as string | undefined} onAdd={onAddLogo} />
        <div className="min-w-0 flex-1 space-y-2">
          <H className={cn(HEAD, "text-4xl text-balance break-words @lg:text-5xl")}>{title ?? brand.name}</H>
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
            <span>Brand guidelines</span>
            {brand.default && !portal && <Badge variant="secondary">Default</Badge>}
            {facts.map((f) => (
              <span key={String(f)}>· {f}</span>
            ))}
            {at && (
              <span suppressHydrationWarning title={exact(at)}>
                · Updated {ago(at)}
                {updated?.who && ` by ${updated.who}`}
              </span>
            )}
          </p>
        </div>
      </div>

      {colors.length > 0 && (
        // The palette at a glance: a stripe per color, each a link to its rule. Hover widens one; the strip never moves.
        <div className="ring-border flex h-12 overflow-hidden rounded-xl ring-1">
          {colors.map((c) => (
            <Tooltip key={c.key}>
              <TooltipTrigger asChild>
                <a
                  href={`#rule-${c.key}`}
                  aria-label={`${label(c.key)}, ${c.value}`}
                  className="focus-visible:ring-ring min-w-3 flex-1 transition-[flex-grow] duration-200 ease-out outline-none hover:grow-[1.6] focus-visible:grow-[1.6] focus-visible:ring-2 focus-visible:ring-inset"
                  style={{ backgroundColor: c.value as string }}
                />
              </TooltipTrigger>
              <TooltipContent>
                {label(c.key)} <span className="font-mono opacity-70">{c.value as string}</span>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Every color on every other, as text on a background: the ratio and its
 * WCAG grade, so "can white go on Secondary?" has its answer on the page.
 * The hovered cell's row and column light up. From two colors to ten; view
 * only. One color per key (colorsOf), so a key names a row.
 */
export function Pairings({ colors, className }: { colors: Pick<Rule, "key" | "value">[]; className?: string }) {
  const [at, setAt] = useState<[number, number] | null>(null);
  if (colors.length < 2 || colors.length > 10) return null;
  const hexes = colors.map((c) => (c.value as string).slice(0, 7));
  const head = (c: Pick<Rule, "key">, i: number, on: boolean) => (
    <span className={cn("flex items-center gap-1.5 transition-colors", on ? "text-foreground" : "text-muted-foreground")}>
      <span className="size-3 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15" style={{ backgroundColor: hexes[i] }} />
      <span className="truncate">{label(c.key)}</span>
    </span>
  );
  return (
    <div className={cn("space-y-3 py-3", className)}>
      <div>
        <h3 className="text-lg font-semibold tracking-tight">Contrast pairings</h3>
        <p className="text-muted-foreground text-sm">
          Text in each row&apos;s color on each column&apos;s, graded for WCAG 2 at full opacity.
        </p>
      </div>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <table className="border-separate border-spacing-1 text-xs" onMouseLeave={() => setAt(null)}>
          <thead>
            <tr>
              <td />
              {colors.map((c, j) => (
                <th key={c.key} scope="col" className="max-w-24 px-1 pb-1 text-start font-medium">
                  {head(c, j, at?.[1] === j)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {colors.map((fg, i) => (
              <tr key={fg.key}>
                <th scope="row" className="max-w-28 pe-2 text-start font-medium">
                  {head(fg, i, at?.[0] === i)}
                </th>
                {colors.map((bg, j) => {
                  if (i === j) return <td key={bg.key} />;
                  const ratio = contrast(hexes[i], hexes[j]);
                  const g = grade(ratio);
                  return (
                    <td
                      key={bg.key}
                      onMouseEnter={() => setAt([i, j])}
                      className={cn(
                        "h-16 min-w-20 rounded-lg p-2 align-top ring-1 ring-black/5 transition-opacity dark:ring-white/10",
                        g === "fail" && "opacity-40",
                      )}
                      style={{ backgroundColor: hexes[j], color: hexes[i] }}
                    >
                      <span className="block text-lg leading-none font-semibold">Aa</span>
                      <span className="bg-background text-foreground mt-2 inline-flex items-center gap-1 rounded px-1 py-0.5">
                        <span className="font-mono tabular-nums">{ratio.toFixed(1)}</span>
                        <span className={cn("rounded px-1 text-2xs font-semibold tracking-wide uppercase", GRADE_STYLE[g])}>{g}</span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type Backdrop = "checker" | "light" | "dark";
const BACKDROPS: Record<Backdrop, { label: string; bg: string }> = {
  checker: { label: "Transparent", bg: "bg-checker" },
  light: { label: "On light", bg: "bg-white" },
  dark: { label: "On dark", bg: "bg-neutral-950" },
};

/**
 * A logo or an image as a brand guide shows it: big, on a transparent, light
 * or dark backdrop (dark first for a dark-background variant), with its
 * download and its URL on the tile.
 */
/** Room around a mark in its tile: the less room, the more of the tile it fills. */
const ROOM = { small: "p-12", medium: "p-6", large: "p-3" } as const;

export function LogoTile({
  asset: a,
  dark,
  size = "medium",
  backdrop = "checker",
}: {
  asset: RuleAsset;
  dark: boolean;
  size?: keyof typeof ROOM;
  /** Where it starts, unless it's a dark-background version. */
  backdrop?: Backdrop;
}) {
  const url = useAssetUrl();
  const [on, setOn] = useState<Backdrop>(dark ? "dark" : backdrop);
  const path = a.rendition ? url(a.id, `/${a.rendition}`) : url(a.id);
  const name = a.title || a.filename || "Asset";
  // With a mouse, on hover or focus; on touch, always.
  const reveal =
    "transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover/tile:opacity-100 pointer-fine:group-focus-within/tile:opacity-100";
  return (
    <figure className="grid min-w-0 gap-1.5">
      <div className={cn("group/tile relative aspect-[4/3] overflow-hidden rounded-xl border transition-colors", BACKDROPS[on].bg)}>
        <Thumb src={url(a.id, "/w_480,f_webp")} alt={name} className={ROOM[size]} />
        <div className={cn("absolute top-2 end-2 flex gap-1", reveal)}>
          <IconButton variant="secondary" size="icon-xs" label={`Download ${name}`} asChild>
            {/* The original with its metadata; a rendition under the name the server gives it. */}
            <a href={a.rendition ? path : url(a.id, "?download")} download={a.rendition ? "" : (a.filename ?? name)}>
              <IconDownload className="size-3.5" />
            </a>
          </IconButton>
          <CopyButton variant="secondary" label="Copy the URL" what="URL" text={async () => new URL(path, location.origin).href} />
        </div>
        <div role="radiogroup" aria-label="Backdrop" className={cn("bg-background/80 absolute bottom-2 start-2 flex gap-1 rounded-full p-1 shadow-sm backdrop-blur", reveal)}>
          {(Object.keys(BACKDROPS) as Backdrop[]).map((b) => (
            <Tooltip key={b}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on === b}
                  aria-label={BACKDROPS[b].label}
                  onClick={() => setOn(b)}
                  className={cn("size-4 rounded-full ring-1 transition-shadow", BACKDROPS[b].bg, on === b ? "ring-primary ring-2" : "ring-border")}
                />
              </TooltipTrigger>
              <TooltipContent>{BACKDROPS[b].label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
      <figcaption className="flex min-w-0 items-baseline gap-2 text-xs">
        <span className="truncate">{name}</span>
        {a.rendition && <span className="text-muted-foreground truncate">{renditionLabel(a.rendition)}</span>}
      </figcaption>
    </figure>
  );
}

/**
 * A do or don't list's example images as cards: a green or red bar, the
 * image on a checker, and the mark. Each is captioned by its own title, never
 * by the list item at its index, which may be about something else.
 */
export function DoCards({ assets, look }: { assets: RuleAsset[]; look: "do" | "dont" }) {
  const url = useAssetUrl();
  return (
    <div className="grid grid-cols-2 gap-3 @xl:grid-cols-3">
      {assets.map((a) => {
        const name = a.title || a.filename || (a.rendition ? renditionLabel(a.rendition) : "Example");
        return (
          <figure key={a.id} className="bg-card overflow-hidden rounded-xl border">
            <div aria-hidden className={cn("h-1", look === "do" ? "bg-emerald-500" : "bg-red-500")} />
            <div className="bg-checker relative aspect-[4/3]">
              <Thumb src={url(a.id, "/w_480,f_webp")} alt={name} className="p-4" />
            </div>
            <figcaption className="flex min-w-0 items-center gap-2 border-t px-3 py-2 text-sm">
              {MARKER[look]}
              <span className="sr-only">{look === "do" ? "Do:" : "Don't:"}</span>
              <span className="truncate">{name}</span>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

/**
 * An asset on a rule: its thumbnail and the rendition the rule means. On the
 * page it opens the asset; in the panel, a menu changes the size, copies the
 * URL, or takes it off the rule.
 */
export function AssetTile({
  asset: a,
  onChange,
  onRemove,
}: {
  asset: RuleAsset;
  /** Both left out: read only. */
  onChange?: (rendition: string | null) => void;
  onRemove?: () => void;
}) {
  const url = useAssetUrl();
  const path = a.rendition ? url(a.id, `/${a.rendition}`) : url(a.id);
  const name = a.title || a.filename || "Asset";
  const tile =
    "bg-checker focus-visible:ring-ring/50 hover:border-foreground/30 relative block size-28 overflow-hidden rounded-lg border transition-colors outline-none focus-visible:ring-2";
  const face =
    a.mime && isFont(a.mime, a.filename ?? "") ? (
      <span className="absolute inset-0 flex items-center justify-center">
        <FontThumb id={a.id} className="text-4xl" />
      </span>
    ) : (
      <Thumb src={url(a.id, "/w_112,f_webp")} alt="" className="p-2" />
    );
  // What it is first; the size only when the rule means a particular one.
  const caption = (
    <>
      <span className="truncate text-center text-xs" title={a.filename ?? name}>
        {name}
      </span>
      {a.rendition && (
        <span className="text-muted-foreground truncate text-center text-xs" title={a.rendition}>
          {renditionLabel(a.rendition)}
        </span>
      )}
    </>
  );
  if (!onChange || !onRemove)
    return (
      <a href={path} target="_blank" rel="noreferrer" className="grid w-28 gap-0.5" title={`Open ${name}`}>
        <span className={tile}>{face}</span>
        {caption}
      </a>
    );
  return (
    <Popover>
      <div className="grid w-28 gap-0.5">
        <PopoverTrigger asChild>
          <button type="button" aria-label={`${name}, ${renditionLabel(a.rendition)}. Change the size`} className={tile}>
            {face}
          </button>
        </PopoverTrigger>
        {caption}
      </div>
      <PopoverContent align="start" className="w-80 p-0">
        <RenditionMenu value={a.rendition} onChange={onChange} />
        <Separator />
        <div className="flex items-center gap-1 p-1">
          <Button variant="ghost" size="sm" asChild>
            <ExternalLink href={path}>Open</ExternalLink>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => copy(new URL(path, window.location.origin).href, "URL")}>
            <IconCopy /> Copy URL
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive ms-auto" onClick={onRemove}>
            <IconTrash /> Remove
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
