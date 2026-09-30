"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconLock, IconPlus, IconUserQuestion, IconUsers, IconWorld } from "@tabler/icons-react";
import { Snippet } from "@/components/agent-access";
import { BrandAddresses } from "@/components/brand-header";
import type { BrandHub } from "@/components/brands";
import { useCan } from "@/components/can";
import { ExternalLink } from "@/components/external-link";
import type { Portal } from "@/components/portals";
import { Group } from "@/components/settings/panels";
import { TokensDialog } from "@/components/tokens-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { HeadBrand, Release } from "@/lib/brand-head";
import { send } from "@/lib/send";

const ACCESS: Record<Portal["access"], { label: string; icon: React.ReactNode }> = {
  public: { label: "Anyone with the address", icon: <IconWorld aria-hidden /> },
  password: { label: "With a password", icon: <IconLock aria-hidden /> },
  members: { label: "People in this workspace", icon: <IconUsers aria-hidden /> },
};

/**
 * A brand's Sharing tab: who reads it outside the team and where. BrandHub
 * (public or private, PATCH /api/v1/brands/{slug}/hub, for whoever may
 * publish), the portals showing it (for whoever manages portals: `portals`
 * is null otherwise), the one BrandHub links as its guidelines picked on its
 * row, and the addresses agents and code read. Portals are set up on the
 * Portals page, which Manage opens on this brand's.
 */
export function BrandSharing({
  brand,
  origin,
  hub: initialHub,
  portals,
  release,
}: {
  brand: HeadBrand;
  origin: string;
  hub: BrandHub | null;
  portals: Portal[] | null;
  release: Release | null;
}) {
  const router = useRouter();
  const can = useCan();
  const [hub, setHub] = useState(initialHub);
  const [busy, setBusy] = useState<string | null>(null);
  const [tokens, setTokens] = useState(false);
  const share = async (body: { visibility?: "public" | "private"; portal?: string | null }, what: string) => {
    setBusy(what);
    const done = (await send("PATCH", `/api/v1/brands/${encodeURIComponent(brand.slug)}/hub`, body)) as BrandHub | null;
    setBusy(null);
    if (done) {
      setHub(done);
      router.refresh();
    }
  };
  // Picking which portal BrandHub links takes publishing, as making it public does.
  const link = hub && can("brand.publish") ? (portal: string | null) => void share({ portal }, `link:${portal ?? "*"}`) : undefined;

  return (
    <div className="grid gap-4">
      {hub && (
        <Group
          title="BrandHub"
          description={
            hub.visibility === "public"
              ? "Public: anyone and any agent reads its latest release, its brand.json, llms.txt and tokens."
              : "Private: only people in this workspace see it there, signed in."
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            {can("brand.publish") &&
              (hub.visibility === "public" ? (
                <Button variant="outline" size="sm" pending={busy === "hub"} onClick={() => void share({ visibility: "private" }, "hub")}>
                  Make private
                </Button>
              ) : (
                <Button
                  size="sm"
                  pending={busy === "hub"}
                  disabled={!hub.published}
                  title={hub.published ? undefined : "Release it first"}
                  onClick={() => void share({ visibility: "public" }, "hub")}
                >
                  Make public
                </Button>
              ))}
            {hub.published && (
              <Button variant="ghost" size="sm" asChild>
                <ExternalLink href={hub.url}>See it on BrandHub</ExternalLink>
              </Button>
            )}
          </div>
          {hub.visibility === "public" && hub.published && (
            <div className="grid gap-1.5">
              <p className="text-sm font-medium">A badge for its README, with the release that is live</p>
              <Snippet text={`[![Brand on BrandHub](${hub.url}/badge.svg)](${hub.url})`} what="the badge's Markdown" />
            </div>
          )}
        </Group>
      )}

      {portals && <BrandPortals slug={brand.slug} portals={portals} hub={hub} busy={busy} onLink={link} />}

      <Group title="For agents and code" description="The addresses an agent or a build reads the brand from.">
        <BrandAddresses brand={brand} origin={origin} hub={hub?.published ? hub : null} release={release} onTokens={() => setTokens(true)} />
      </Group>
      <TokensDialog brand={brand} open={tokens} onOpenChange={setTokens} />
    </div>
  );
}

/**
 * The portals showing the brand: who gets in, where they are, what waits for
 * an answer, and the one BrandHub links as its guidelines, marked, with the
 * choice on each row for whoever may make it (`onLink`; null: its first
 * public one).
 */
function BrandPortals({
  slug,
  portals,
  hub,
  busy,
  onLink,
}: {
  slug: string;
  portals: Portal[];
  hub: BrandHub | null;
  busy: string | null;
  onLink?: (portal: string | null) => void;
}) {
  const linked = hub?.portal?.slug;
  return (
    <Group title="Portals" description="Where people outside the team read the brand and take its files.">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" asChild>
          <Link href={`/portals?${new URLSearchParams({ new: slug })}`}>
            <IconPlus aria-hidden /> New portal
          </Link>
        </Button>
        {portals.length > 0 && (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/portals?${new URLSearchParams({ brand: slug })}`}>Manage</Link>
          </Button>
        )}
      </div>
      {portals.length === 0 ? (
        <p className="text-muted-foreground text-sm">No portal shows this brand yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {portals.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {p.name}
                  {p.expired && <Badge variant="outline">Offline</Badge>}
                  {p.slug === linked && <Badge variant="secondary">BrandHub links it</Badge>}
                </span>
                <ExternalLink href={p.url} className="text-muted-foreground inline-flex items-center gap-1 truncate text-sm hover:underline">
                  {p.url.replace(/^https?:\/\//, "")}
                </ExternalLink>
              </div>
              <Badge variant="outline">
                {ACCESS[p.access].icon} {ACCESS[p.access].label}
              </Badge>
              {p.pending > 0 && (
                <Button size="xs" asChild>
                  <Link href={`/portals?${new URLSearchParams({ open: p.id })}`}>
                    <IconUserQuestion aria-hidden /> {p.pending} waiting
                  </Link>
                </Button>
              )}
              {onLink &&
                (p.slug !== linked ? (
                  <Button size="xs" variant="ghost" pending={busy === `link:${p.slug}`} onClick={() => onLink(p.slug)}>
                    Link from BrandHub
                  </Button>
                ) : (
                  hub?.chosen && (
                    <Button size="xs" variant="ghost" pending={busy === "link:*"} title="BrandHub then links its first public portal" onClick={() => onLink(null)}>
                      Let BrandHub pick
                    </Button>
                  )
                ))}
            </li>
          ))}
        </ul>
      )}
    </Group>
  );
}
