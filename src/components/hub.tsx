import Link from "next/link";
import { IconArrowUpRight, IconCircleCheckFilled, IconDownload, IconLock, IconUsersGroup } from "@tabler/icons-react";
import type { HubCard } from "@/lib/core/hub";
import { ago, compact, type CardFace } from "@/lib/hub";
import { cn } from "@/lib/utils";

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
export const wash = (tint: string | null, strength = 14) => `color-mix(in oklab, ${tint ?? "#8a8a8a"} ${strength}%, ${PAPER})`;

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

/** An organization's picture: its first brand's mark on that brand's wash, else its initial. */
export function Avatar({ name, logo, tint, className }: { name: string; logo?: string | null; tint?: string | null; className?: string }) {
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center overflow-hidden rounded-lg border", className)} style={{ background: wash(tint ?? null, 18) }}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- a signed rendition, already sized
        <img src={logo} alt="" className="size-3/5 object-contain" />
      ) : (
        <span className="font-display text-[0.45em] font-semibold" style={{ color: tint ?? undefined }}>
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}

/** A brand's mark on its wash: the card's top, and the listing's banner. */
export function Preview({ card, className, children }: { card: Pick<HubCard, "logo" | "tint" | "name">; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("relative grid place-items-center", className)} style={{ background: wash(card.tint) }}>
      {card.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- a signed rendition, already sized
        <img src={card.logo} alt="" className="absolute inset-[27%] size-[46%] object-contain transition-transform duration-300 group-hover:scale-105" loading="lazy" />
      ) : (
        <span className="font-display text-5xl font-semibold" style={{ color: card.tint ?? undefined }}>
          {card.name.slice(0, 1)}
        </span>
      )}
      {children}
    </div>
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
 * own ground (color.background, else its wash) beside a band of its colors,
 * each named on hover, then its name in its heading face when that loads
 * cheaply (`face`, the first FACES of a grid), else the family named beside
 * it. `badges` sit on the ground; the rest of the card is `children`. The
 * whole card is the link.
 */
export function BrandTile({ id, look, href, face, badges, children }: { id: string; look: TileLook; href: string; face: boolean; badges?: React.ReactNode; children?: React.ReactNode }) {
  const f = look.face;
  const loads = face && !!f && !!(f.src || f.css);
  const name = `card-face-${id.replace(/[^a-z0-9-]/gi, "-")}`;
  return (
    <li className="group bg-card focus-within:ring-ring relative flex flex-col overflow-hidden rounded-xl border transition-[transform,box-shadow] duration-200 focus-within:ring-2 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-8px_rgb(0_0_0/0.12)]">
      {loads && f.src && <style>{`@font-face{font-family:"${name}";src:url("${f.src}");font-weight:100 900;font-display:swap}`}</style>}
      {loads && f.css && <link rel="stylesheet" href={f.css} precedence="default" />}
      <div className="relative flex h-28">
        <div className="relative grid min-w-0 flex-1 place-items-center" style={{ background: look.background ?? wash(look.tint) }}>
          {look.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- a signed rendition, already sized
            <img src={look.logo} alt="" className="absolute inset-0 size-full object-contain px-6 py-5 transition-transform duration-300 group-hover:scale-105" loading="lazy" />
          ) : (
            <span className="font-display text-4xl font-semibold" style={{ color: look.tint ?? undefined }}>
              {look.name.slice(0, 1)}
            </span>
          )}
        </div>
        {look.palette.length > 0 && (
          // Above the card's link, so each stripe names its color on hover.
          <ul aria-label="Colors" className="relative z-10 flex w-1/4 shrink-0">
            {look.palette.map((c, i) => (
              <li key={i} title={`${c.name} ${c.hex}`} className="flex-1" style={{ background: c.hex }}>
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
            className="font-display truncate text-base font-semibold tracking-tight outline-none after:absolute after:inset-0"
            style={loads ? { fontFamily: `"${f.src ? name : f.family.replace(/["\\]/g, "")}", var(--font-display)`, fontWeight: f.src ? undefined : (f.weight ?? undefined) } : undefined}
          >
            {look.name}
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
    <nav aria-label={label} className={cn("-mb-px flex gap-1 overflow-x-auto", className)}>
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.current ? "page" : undefined}
          className="text-muted-foreground hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium"
        >
          {t.label}
          {t.count !== undefined && <span className="bg-muted rounded-full px-1.5 text-xs tabular-nums">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
