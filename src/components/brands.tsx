"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconBook, IconDots, IconLayoutGrid, IconList, IconLock, IconPalette, IconPlus, IconSearch, IconStar, IconWorld } from "@tabler/icons-react";
import { toast } from "sonner";
import { brandHref, type BrandInfo } from "@/components/brand-switcher";
import { Confirm } from "@/components/confirm";
import { BrandTile, FACES, pill, Preview, type TileLook } from "@/components/hub";
import { LinkSpinner } from "@/components/link-pending";
import { InfoTip } from "@/components/info-tip";
import { NewBrand } from "@/components/new-brand";
import { AppHeader, PageHeader } from "@/components/page";
import { OfferBanners, type HubOffer } from "@/components/hub-offers";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ExternalLink } from "@/components/external-link";
import { ago } from "@/lib/hub";
import { send } from "@/lib/send";
import { builderPath } from "@/lib/site";
import { cn } from "@/lib/utils";
import { transition } from "@/lib/motion";

/**
 * The project's brands, as GitHub lists repositories: each one's name, who
 * sees it on BrandHub, its last publish and the portal it links. Make one
 * public or private, and pick that portal (PATCH /api/v1/brands/{slug}/hub).
 */

/** GET /api/v1/brands/{slug}/hub, as this page reads it; null with no hub. */
export type BrandHub = {
  visibility: "private" | "public";
  url: string;
  published: { number: number; publishedAt: string } | null;
  portal: { slug: string; name: string } | null;
  chosen: boolean;
  portals: { slug: string; name: string; access: "public" | "password" | "members" }[] | null;
  /** What its organization proved: a domain, or github.com/{login}; null: a community listing. */
  verified?: string | null;
};
/** How a brand looks on its card: its mark as a rendition URL, the color it is tinted with, its ground, palette and heading face. */
export type BrandLook = Omit<TileLook, "name">;
export type BrandRow = BrandInfo & { visibility: "private" | "public"; hub: BrandHub | null; look: BrandLook };

type Layout = "cards" | "list";
const LAYOUT_KEY = "artbucket:brands-layout";

type Show = "all" | "public" | "private";
const SHOW: Record<Show, string> = { all: "All", public: "Public", private: "Private" };

export function BrandsPage({
  brands,
  canShare,
  canEdit,
  q: initialQ = "",
  offers = [],
}: {
  brands: BrandRow[];
  canShare: boolean;
  canEdit: boolean;
  q?: string;
  /** Listings the organization's verified domains claim (GET /api/v1/hub/offers), for its admins. */
  offers?: HubOffer[];
}) {
  const router = useRouter();
  // A brand's Settings tab lands here with its name in the search.
  const [q, setQ] = useState(initialQ);
  const [show, setShow] = useState<Show>("all");
  const [creating, setCreating] = useState(false);
  const [going, setGoing] = useState<BrandRow | null>(null);
  // Cards until someone picks the list; kept per browser, like the library's layout. Storage may refuse.
  const stored = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return localStorage.getItem(LAYOUT_KEY);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const [picked, setPicked] = useState<Layout | null>(null);
  const layout: Layout = picked ?? (stored === "list" ? "list" : "cards");
  const pickLayout = (l: Layout) => {
    setPicked(l);
    try {
      localStorage.setItem(LAYOUT_KEY, l);
    } catch {}
  };
  const shown = useMemo(
    () => brands.filter((b) => (show === "all" || b.visibility === show) && b.name.toLowerCase().includes(q.trim().toLowerCase())),
    [brands, q, show],
  );
  const hub = brands.some((b) => b.hub);

  async function setHub(b: BrandRow, patch: { visibility?: "public" | "private"; portal?: string | null }) {
    const done = await send("PATCH", `/api/v1/brands/${encodeURIComponent(b.slug)}/hub`, patch);
    if (!done) return false;
    if (patch.visibility) toast.success(patch.visibility === "public" ? `${b.name} is public on BrandHub` : `${b.name} is private again`);
    router.refresh();
    return true;
  }

  return (
    <>
      <AppHeader trail={[{ label: "Brands" }]} />
      <div className={cn("mx-auto flex w-full flex-col gap-6 px-4 pt-6 pb-16 md:px-6", layout === "cards" ? "max-w-6xl" : "max-w-4xl")}>
        <PageHeader
          icon={<IconPalette />}
          title="Brands"
          aside={
            <>
              <span className="text-muted-foreground text-sm tabular-nums">{brands.length}</span>
              {hub && <InfoTip>Every released brand is on BrandHub: private to this project until you make it public, for anyone and any agent to read.</InfoTip>}
            </>
          }
        >
          {canEdit && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <IconPlus /> New brand
            </Button>
          )}
        </PageHeader>

        <OfferBanners offers={offers} />

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <IconSearch aria-hidden className="text-muted-foreground absolute start-2.5 top-1/2 size-4 -translate-y-1/2" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a brand" aria-label="Find a brand" className="h-8 ps-8" />
          </div>
          {hub && (
            <div role="radiogroup" aria-label="Show" className="bg-muted flex rounded-md p-0.5">
              {(Object.keys(SHOW) as Show[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={show === s}
                  onClick={() => setShow(s)}
                  className="text-muted-foreground aria-checked:bg-background aria-checked:text-foreground rounded px-2.5 py-1 text-xs font-medium aria-checked:shadow-sm"
                >
                  {SHOW[s]}
                </button>
              ))}
            </div>
          )}
          <div role="radiogroup" aria-label="Layout" className="bg-muted flex rounded-md p-0.5">
            {(
              [
                ["cards", "Cards", IconLayoutGrid],
                ["list", "List", IconList],
              ] as const
            ).map(([l, label, Icon]) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={layout === l}
                aria-label={label}
                title={label}
                onClick={() => transition(() => pickLayout(l))}
                className="text-muted-foreground aria-checked:text-foreground relative rounded px-2 py-1"
              >
                {/* One pill, named, so it slides to the layout picked. */}
                {layout === l && <span aria-hidden data-vt="layout-pill" className="bg-background absolute inset-0 rounded shadow-sm" />}
                <Icon className="relative size-4" />
              </button>
            ))}
          </div>
        </div>

        {!shown.length ? (
          <p className="text-muted-foreground rounded-lg border p-8 text-center text-sm">{q ? `No brand matches "${q}".` : "No brand here."}</p>
        ) : layout === "cards" ? (
          // One name for both layouts: switching, the list reshapes as one rather than swapping at once.
          <ul data-vt="brands-list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((b, i) => (
              <Card key={b.slug} b={b} face={i < FACES} />
            ))}
          </ul>
        ) : (
          <ul data-vt="brands-list" className="divide-y rounded-lg border">
            {shown.map((b) => (
              <Row key={b.slug} b={b} canShare={canShare} onPublic={() => setGoing(b)} onHub={(patch) => setHub(b, patch)} />
            ))}
          </ul>
        )}
      </div>

      <Confirm
        open={!!going}
        onOpenChange={(o) => !o && setGoing(null)}
        title={`Make ${going?.name ?? "it"} public?`}
        says={
          <>
            Anyone, and any agent, will read its latest release on BrandHub, with its usable files, and each release after. You can make it
            private again.
          </>
        }
        action="Make public"
        destructive={false}
        run={async () => {
          if (going && (await setHub(going, { visibility: "public" }))) setGoing(null);
        }}
      />
      <NewBrand
        open={creating}
        onClose={() => setCreating(false)}
        onDone={(b) => {
          setCreating(false);
          // A new brand starts from its setup, in the guidelines; the sidebar's list of brands gets it too.
          router.push(builderPath(b.slug));
          router.refresh();
        }}
      />
    </>
  );
}

/** A brand as a card (components/hub.tsx BrandTile, BrandHub's): then when it was released and the portal it links. The whole card opens its Overview. */
function Card({ b, face }: { b: BrandRow; face: boolean }) {
  const hub = b.hub;
  return (
    <BrandTile
      id={b.slug}
      look={{ name: b.name, ...b.look }}
      href={brandHref(b)}
      face={face}
      badges={
        <>
          {hub && (
            <span className={cn(pill, "start-2.5 inline-flex items-center gap-1")}>
              {b.visibility === "public" ? <IconWorld aria-hidden className="size-3" /> : <IconLock aria-hidden className="size-3" />}
              {b.visibility === "public" ? "Public" : "Private"}
            </span>
          )}
          {b.default && (
            <span className={cn(pill, "end-2.5 px-1 py-1")}>
              <IconStar aria-label="default" className="size-3.5" />
            </span>
          )}
        </>
      }
    >
      <p className="text-muted-foreground mt-1 text-xs">
        {hub?.published ? `@${hub.published.number}, released ${ago(hub.published.publishedAt)}` : hub ? "Never released" : "\u00a0"}
      </p>
      <div className="mt-auto pt-3">
        <div className="text-muted-foreground flex items-center gap-3 border-t pt-3 text-xs">
          <span>
            {b.rules} {b.rules === 1 ? "rule" : "rules"}
          </span>
          {hub?.portal && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <IconBook aria-hidden className="size-3.5 shrink-0" /> <span className="truncate">{hub.portal.name}</span>
            </span>
          )}
        </div>
      </div>
    </BrandTile>
  );
}

function Row({
  b,
  canShare,
  onPublic,
  onHub,
}: {
  b: BrandRow;
  canShare: boolean;
  onPublic: () => void;
  onHub: (patch: { visibility?: "public" | "private"; portal?: string | null }) => Promise<boolean>;
}) {
  const hub = b.hub;
  const open = b.visibility === "public";
  // Until the change and the refresh after it land: the button spins rather than seeming dead.
  const [changing, change] = useTransition();
  const set = (patch: Parameters<typeof onHub>[0]) => change(async () => void (await onHub(patch)));
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-3 p-4">
      <Preview card={{ name: b.name, logo: b.look.logo, tint: b.look.tint, palette: b.look.palette }} className="size-10 shrink-0 overflow-hidden rounded-lg border text-[0.6rem] [&_span]:text-lg" />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={brandHref(b)} className="text-primary-ink inline-flex min-w-0 items-center gap-1.5 font-semibold hover:underline">
            <LinkSpinner className="text-current" />
            <span className="truncate">{b.name}</span>
          </Link>
          {hub && (
            <span className="text-muted-foreground inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium">
              {open ? <IconWorld aria-hidden className="size-3" /> : <IconLock aria-hidden className="size-3" />}
              {open ? "Public" : "Private"}
            </span>
          )}
          {b.default && <IconStar aria-label="default" className="text-muted-foreground size-3.5" />}
        </div>
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span>
            {b.rules} {b.rules === 1 ? "rule" : "rules"}
          </span>
          {hub &&
            (hub.published ? (
              <span>
                @{hub.published.number}, released {ago(hub.published.publishedAt)}
              </span>
            ) : (
              <span>Never released: BrandHub shows it once it is</span>
            ))}
          {hub?.portal && (
            <span className="inline-flex items-center gap-1">
              <IconBook aria-hidden className="size-3.5" /> {hub.portal.name}
            </span>
          )}
        </p>
      </div>

      {hub && (
        <div className="flex items-center gap-2">
          {hub.published && (
            <Button asChild variant="outline" size="sm">
              <ExternalLink href={hub.url}>BrandHub</ExternalLink>
            </Button>
          )}
          {canShare &&
            (open ? (
              <Button variant="outline" size="sm" pending={changing} onClick={() => set({ visibility: "private" })}>
                <IconLock aria-hidden /> Make private
              </Button>
            ) : (
              <Button size="sm" onClick={onPublic} disabled={!hub.published} title={hub.published ? undefined : "Release it first"}>
                <IconWorld aria-hidden /> Make public
              </Button>
            ))}
          {canShare && hub.portals && hub.portals.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`More for ${b.name}`}>
                  <IconDots />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Guidelines link on BrandHub</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={hub.chosen && hub.portal ? hub.portal.slug : ""} onValueChange={(v) => set({ portal: v || null })}>
                  <DropdownMenuRadioItem value="">Its first public portal</DropdownMenuRadioItem>
                  {hub.portals.map((p) => (
                    <DropdownMenuRadioItem key={p.slug} value={p.slug}>
                      <span className="truncate">{p.name}</span>
                      <span className={cn("text-muted-foreground ms-auto text-xs", p.access === "public" && "sr-only")}>{p.access}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={`/portals?${new URLSearchParams({ new: b.slug })}`}>New portal for it</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </li>
  );
}
