"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconBook, IconDots, IconExternalLink, IconLock, IconPalette, IconPlus, IconSearch, IconStar, IconWorld } from "@tabler/icons-react";
import { toast } from "sonner";
import { brandHref, type BrandInfo } from "@/components/brand-switcher";
import { Confirm } from "@/components/confirm";
import { NewBrand } from "@/components/new-brand";
import { AppHeader, PageHeader } from "@/components/page";
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
import { ago } from "@/lib/hub";
import { send } from "@/lib/send";
import { guidelinesPath } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * The workspace's brands, as GitHub lists repositories: each one's name, who
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
};
export type BrandRow = BrandInfo & { visibility: "private" | "public"; hub: BrandHub | null };

type Show = "all" | "public" | "private";
const SHOW: Record<Show, string> = { all: "All", public: "Public", private: "Private" };

export function BrandsPage({ brands, canShare, canEdit, q: initialQ = "" }: { brands: BrandRow[]; canShare: boolean; canEdit: boolean; q?: string }) {
  const router = useRouter();
  // A brand's Settings tab lands here with its name in the search.
  const [q, setQ] = useState(initialQ);
  const [show, setShow] = useState<Show>("all");
  const [creating, setCreating] = useState(false);
  const [going, setGoing] = useState<BrandRow | null>(null);
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
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-6 pb-16 md:px-6">
        <PageHeader
          icon={<IconPalette />}
          title="Brands"
          aside={<span className="text-muted-foreground text-sm tabular-nums">{brands.length}</span>}
          description={
            hub
              ? "Every released brand is on BrandHub: private to this workspace until you make it public, for anyone and any agent to read."
              : "The workspace's brands, each with its own rules, pages and history."
          }
        >
          {canEdit && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <IconPlus /> New brand
            </Button>
          )}
        </PageHeader>

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
        </div>

        <ul className="divide-y rounded-lg border">
          {shown.map((b) => (
            <Row key={b.slug} b={b} canShare={canShare} onPublic={() => setGoing(b)} onHub={(patch) => setHub(b, patch)} />
          ))}
          {!shown.length && <li className="text-muted-foreground p-8 text-center text-sm">{q ? `No brand matches "${q}".` : "No brand here."}</li>}
        </ul>
      </div>

      <Confirm
        open={!!going}
        onOpenChange={(o) => !o && setGoing(null)}
        title={`Make ${going?.name ?? "it"} public?`}
        says={
          <>
            Anyone, and any agent, will read its latest release on BrandHub: its rules, logos, typefaces and voice, as a page, llms.txt, JSON and
            design tokens, with its usable files. Later releases show there too. You can make it private again.
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
          // A new brand starts from its setup, in the guidelines.
          router.push(guidelinesPath(b.slug));
        }}
      />
    </>
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
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-3 p-4">
      <div className="grid min-w-0 flex-1 gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={brandHref(b)} className="text-primary-ink truncate font-semibold hover:underline">
            {b.name}
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
                Release {hub.published.number}, {ago(hub.published.publishedAt)}
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
              <a href={hub.url} target="_blank" rel="noreferrer">
                BrandHub <IconExternalLink aria-hidden className="opacity-60" />
              </a>
            </Button>
          )}
          {canShare &&
            (open ? (
              <Button variant="outline" size="sm" onClick={() => void onHub({ visibility: "private" })}>
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
                <DropdownMenuRadioGroup value={hub.chosen && hub.portal ? hub.portal.slug : ""} onValueChange={(v) => void onHub({ portal: v || null })}>
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
