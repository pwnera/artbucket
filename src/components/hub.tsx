import Link from "next/link";
import { IconArrowUpRight, IconCircleCheckFilled, IconDownload, IconLock, IconUsersGroup } from "@tabler/icons-react";
import type { HubCard } from "@/lib/core/hub";
import { ago, compact } from "@/lib/hub";
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

function Card({ card, base }: { card: HubCard; base: string }) {
  return (
    <li className="group bg-card focus-within:ring-ring relative flex flex-col overflow-hidden rounded-xl border transition-[transform,box-shadow] duration-200 focus-within:ring-2 hover:-translate-y-1 hover:shadow-[0_12px_28px_-8px_rgb(0_0_0/0.12)]">
      <Preview card={card} className="h-40">
        <IconArrowUpRight aria-hidden className="absolute end-3 top-3 size-4 text-black/40 transition-colors group-hover:text-black/80" />
        {card.visibility === "private" ? (
          <Private className="absolute start-3 top-3 rounded-full bg-white/80 px-2 py-0.5 text-black/70 backdrop-blur" />
        ) : (
          <Owner
            verified={card.verified}
            // On the wash, which stays light: the light theme's inks, in either theme.
            className={cn("absolute start-3 top-3 rounded-full bg-white/80 px-2 py-0.5 backdrop-blur", card.verified ? "text-[#2f6b2a]" : "text-black/70")}
          />
        )}
      </Preview>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-lg font-semibold tracking-tight">
          <Link href={base + card.path} className="outline-none after:absolute after:inset-0">
            {card.name}
          </Link>
        </h3>
        {card.tagline && <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">{card.tagline}</p>}
        <p className="text-muted-foreground mt-auto pt-5 text-[11px] font-semibold tracking-[.12em] uppercase">
          {card.org} / {card.brand}
        </p>
        <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <Dots colors={card.swatches} />
            {card.colors} {card.colors === 1 ? "color" : "colors"}
          </span>
          {card.families[0] && <span className="max-w-32 truncate">{card.families[0]}</span>}
          <span>v{card.version}</span>
          {card.pulls > 0 && <Pulls n={card.pulls} />}
          {card.publishedAt && <span>Updated {ago(card.publishedAt)}</span>}
        </div>
      </div>
    </li>
  );
}

export function Cards({ cards, base, className }: { cards: HubCard[]; base: string; className?: string }) {
  return (
    <ul className={cn("grid gap-5 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {cards.map((c) => (
        <Card key={c.path} card={c} base={base} />
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
