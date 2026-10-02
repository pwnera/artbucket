import Link from "next/link";
import { IconArrowUpRight, IconCircleCheckFilled, IconDownload, IconLock, IconUsersGroup } from "@tabler/icons-react";
import type { HubCard } from "@/lib/core/hub";
import { TileGround } from "@/components/hub-client";
import { contrast, inkOn, mix } from "@/lib/color";
import { ago, compact, type CardFace } from "@/lib/hub";
import { cn } from "@/lib/utils";
import { LinkSpinner } from "@/components/link-pending";

/**
 * The BrandHub's pieces (app/hub): a listing's card, the grid of them, who
 * listed it, and an owner's avatar. Server components: the hub is plain
 * pages, for anyone. A card previews the brand as the landing page's examples
 * do: its mark on a wash of its own color.
 */

/**
 * The wash behind a brand's mark: its color, faint over paper, the same in
 * either theme (as on the landing page): marks are drawn for light grounds,
 * and a black one would vanish on a dark wash.
 */
const PAPER = "#fafaf7";
const GREY = "#8a8a8a";
export const wash = (tint: string | null, strength = 14) => `color-mix(in oklab, ${tint ?? GREY} ${strength}%, ${PAPER})`;

/** How a card shows its palette: overlapping dots on its ground, spaced dots on a pill there, or dots under its name. */
const PALETTE_LOOK: "dots" | "pill" | "meta" = "dots";

/** Verified: the organization proved it holds `verified`, a domain or github.com/{login}. Else a community listing: anyone may list a brand under any name. */
export function Owner({ verified, className }: { verified: string | null; className?: string }) {
  return verified ? (
    <span title={`The owner proved it holds ${verified}`} className={cn("text-success inline-flex items-center gap-1 text-xs font-medium", className)}>
      <IconCircleCheckFilled aria-hidden className="size-3.5" /> {verified}
    </span>
  ) : (
    <span title="Not verified as the brand's owner" className={cn("text-muted-foreground inline-flex items-center gap-1 text-xs font-medium", className)}>
      <IconUsersGroup aria-hidden className="size-3.5" /> Community
    </span>
  );
}

/** Private: only its workspace's people see it, signed in (lib/core/hub.ts). */
export function Private({ className }: { className?: string }) {
  return (
    <span title="Only people in its workspace see it" className={cn("text-muted-foreground inline-flex items-center gap-1 text-xs font-medium", className)}>
      <IconLock aria-hidden className="size-3.5" /> Private
    </span>
  );
}

/** Its pulls (lib/core/events.ts pullCounts): its BrandHub files read in the last 30 days. */
export function Pulls({ n, className }: { n: number; className?: string }) {
  return (
    <span title={`${n.toLocaleString("en")} reads of its brand.json, llms.txt and tokens in the last 30 days`} className={cn("inline-flex items-center gap-1", className)}>
      <IconDownload aria-hidden className="size-3.5" /> {compact(n)} {n === 1 ? "pull" : "pulls"}
    </span>
  );
}

/** A brand's colors as dots, the way a repository shows its language. */
export function Dots({ colors, className }: { colors: string[]; className?: string }) {
  if (!colors.length) return null;
  return (
    <span aria-hidden className={cn("inline-flex -space-x-1", className)}>
      {colors.map((c, i) => (
        <span key={i} className="ring-card size-3 rounded-full ring-2" style={{ background: c }} />
      ))}
    </span>
  );
}

/**
 * A brand's mark on its ground (`background`, else its wash), swapped once it
 * loads for one of its colors the mark reads on (components/hub-client.tsx
 * TileGround), else its initial in the first of its colors that reads there:
 * the grid card's top, a list's picture, the banner and an owner's avatar.
 */
function Mark({ name, logo, tint, palette = [], background = null, strength = 14, className, img, letter, children }: { name: string; logo?: string | null; tint?: string | null; palette?: { hex: string }[]; background?: string | null; strength?: number; className?: string; img: string; letter: string; children?: React.ReactNode }) {
  const ground = background ?? wash(tint ?? null, strength);
  const groundHex = background ?? mix(PAPER, tint ?? GREY, strength / 100);
  const hexes = palette.map((c) => c.hex);
  if (logo)
    return (
      <TileGround logo={logo} ground={ground} groundHex={groundHex} palette={hexes} className={className} img={img}>
        {children}
      </TileGround>
    );
  const ink = [tint, ...hexes].find((c) => c && contrast(c, groundHex) >= 3) ?? inkOn(groundHex);
  return (
    <span className={cn("relative grid place-items-center", className)} style={{ background: ground }}>
      <span className={cn("font-display font-semibold", letter)} style={{ color: ink }}>
        {name.slice(0, 1).toUpperCase()}
      </span>
      {children}
    </span>
  );
}

/** An organization's picture: its first brand's mark on that brand's ground, else its initial. */
export function Avatar({ name, logo, tint, palette, className }: { name: string; logo?: string | null; tint?: string | null; palette?: { hex: string }[]; className?: string }) {
  return <Mark name={name} logo={logo} tint={tint} palette={palette} strength={18} className={cn("shrink-0 overflow-hidden rounded-lg border", className)} img="absolute inset-[20%] size-3/5 object-contain" letter="text-[0.45em]" />;
}

/** A brand's mark on its ground: a list's picture, and the listing's banner. */
export function Preview({ card, className, children }: { card: Pick<HubCard, "logo" | "tint" | "name"> & { palette?: { hex: string }[] }; className?: string; children?: React.ReactNode }) {
  return (
    <Mark name={card.name} logo={card.logo} tint={card.tint} palette={card.palette} className={className} img="absolute inset-[27%] size-[46%] object-contain transition-transform duration-300 group-hover:scale-105" letter="text-5xl">
      {children}
    </Mark>
  );
}

/** How a grid card draws a brand: its mark on its ground, its palette, and the face its name is set in (lib/hub.ts). */
export type TileLook = { name: string; logo: string | null; tint: string | null; background: string | null; palette: { hex: string; name: string }[]; face: CardFace | null };

/**
 * The cards of a grid that load their brand's face: the first screen, two
 * rows of four. The rest name the family.
 *
 * ponytail: a fixed count, not what is on screen; load faces as cards scroll in if a grid's second screen should show them too.
 */
export const FACES = 8;

/**
 * A brand as a grid card, on the Brands page and BrandHub: its mark on its
 * own ground (color.background, else its wash, else a palette color the
 * mark reads on), its colors as dots, each named on hover, then its name in its heading face when that loads
 * cheaply (`face`, the first FACES of a grid), else the family named beside
 * it. `badges` sit on the ground; the rest of the card is `children`. The
 * whole card is the link.
 */
export function BrandTile({ id, look, href, face, badges, children }: { id: string; look: TileLook; href: string; face: boolean; badges?: React.ReactNode; children?: React.ReactNode }) {
  const f = look.face;
  const colors = PALETTE_LOOK;
  const loads = face && !!f && !!(f.src || f.css);
  const name = `card-face-${id.replace(/[^a-z0-9-]/gi, "-")}`;
  return (
    <li className="group bg-card focus-within:ring-ring relative flex flex-col overflow-hidden rounded-xl border transition-[transform,box-shadow] duration-200 focus-within:ring-2 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-8px_rgb(0_0_0/0.12)]">
      {loads && f.src && <style>{`@font-face{font-family:"${name}";src:url("${f.src}");font-weight:100 900;font-display:swap}`}</style>}
      {loads && f.css && <link rel="stylesheet" href={f.css} precedence="default" />}
      <div className="relative h-32">
        <Mark
          name={look.name}
          logo={look.logo}
          tint={look.tint}
          palette={look.palette}
          background={look.background}
          className="size-full"
          img="absolute inset-0 size-full object-contain px-6 pt-6 pb-9 transition-transform duration-300 group-hover:scale-105"
          letter="text-4xl"
        />
        {look.palette.length > 0 && colors !== "meta" && (
          // Above the card's link, so each dot names its color on hover.
          <ul aria-label="Colors" className={cn("absolute bottom-2.5 start-2.5 z-10 flex", colors === "dots" ? "-space-x-1.5" : "gap-1 rounded-full bg-white/85 p-1 backdrop-blur")}>
            {look.palette.map((c, i) => (
              <li key={i} title={`${c.name} ${c.hex}`} className={cn("rounded-full", colors === "dots" ? "size-4 ring-2 ring-white/90" : "size-3 ring-1 ring-black/10")} style={{ background: c.hex }}>
                <span className="sr-only">{c.name}</span>
              </li>
            ))}
          </ul>
        )}
        {badges}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="flex min-w-0 items-baseline gap-2">
          <Link
            href={href}
            className="font-display inline-flex min-w-0 items-center gap-1.5 text-base font-semibold tracking-tight outline-none after:absolute after:inset-0"
            style={loads ? { fontFamily: `"${f.src ? name : f.family.replace(/["\\]/g, "")}", var(--font-display)`, fontWeight: f.src ? undefined : (f.weight ?? undefined) } : undefined}
          >
            <LinkSpinner className="text-current" />
            <span className="truncate">{look.name}</span>
          </Link>
          {f && !loads && <span className="text-muted-foreground truncate text-xs">{f.family}</span>}
          {/* A free look-alike stands in for a face that can't load here: said, never passed off as the brand's. */}
          {f && loads && f.named && (
            <span className="text-muted-foreground truncate text-xs" title={`${f.named} isn't served here: the name is set in ${f.family}, a free look-alike`}>
              {f.named} · shown in {f.family}
            </span>
          )}
        </h3>
        {children}
        {colors === "meta" && <Dots colors={look.palette.map((c) => c.hex)} className="mt-3" />}
      </div>
    </li>
  );
}

/** A pill on a card's ground, which is the brand's own: the light theme's inks, in either theme, legible on any color. */
export const pill = "absolute top-2.5 z-20 rounded-full bg-white/85 px-2 py-0.5 text-xs font-medium text-black/70 backdrop-blur";

function Card({ card, base, face }: { card: HubCard; base: string; face: boolean }) {
  return (
    <BrandTile
      id={card.path}
      look={card}
      href={base + card.path}
      face={face}
      badges={
        <>
          {card.visibility === "private" ? (
            <Private className={cn(pill, "start-2.5")} />
          ) : (
            <Owner verified={card.verified} className={cn(pill, "start-2.5", card.verified && "text-[#2f6b2a]")} />
          )}
          <span aria-hidden className={cn(pill, "end-2.5 px-1 py-1")}>
            <IconArrowUpRight className="size-3.5 transition-colors group-hover:text-black" />
          </span>
        </>
      }
    >
      {card.tagline && <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">{card.tagline}</p>}
      {/* Anyone may list a brand under any name: a community listing says so where it is picked. */}
      {card.visibility === "public" && !card.verified && <p className="text-muted-foreground mt-1 text-xs">May not come from the brand&apos;s owner.</p>}
      <div className="mt-auto pt-3">
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-xs">
          <span className="min-w-0 truncate">
            {card.org}/{card.brand}
          </span>
          {/* The release it serves, as releases are named everywhere: @n. */}
          <span className="font-mono">@{card.version}</span>
          {card.pulls > 0 && <Pulls n={card.pulls} />}
          {card.publishedAt && <span>{ago(card.publishedAt)}</span>}
        </div>
      </div>
    </BrandTile>
  );
}

export function Cards({ cards, base, className }: { cards: HubCard[]; base: string; className?: string }) {
  return (
    <ul className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", className)}>
      {cards.map((c, i) => (
        <Card key={c.path} card={c} base={base} face={i < FACES} />
      ))}
    </ul>
  );
}

/** A row of underlined tabs, GitHub's: links, the current one marked. */
export function TabNav({ label, items, className }: { label: string; items: { href: string; label: string; count?: number; current?: boolean }[]; className?: string }) {
  return (
    // Scrolls sideways when narrow, with no scrollbar drawn under the tabs.
    <nav aria-label={label} className={cn("-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]", className)}>
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.current ? "page" : undefined}
          className="text-muted-foreground hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground relative flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium transition-colors"
        >
          {t.label}
          {t.count !== undefined && <span className="bg-muted rounded-full px-1.5 text-xs tabular-nums">{t.count}</span>}
          {/* In the padding at its end, so the tab doesn't widen while its page comes. */}
          <LinkSpinner className="absolute end-0.5 top-1/2 size-2.5 -translate-y-1/2" />
        </Link>
      ))}
    </nav>
  );
}
