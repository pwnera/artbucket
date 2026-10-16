"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconLock, IconPlus, IconUserQuestion, IconUsers, IconWorld } from "@/components/icons";
import { Snippet } from "@/components/agent-access";
import { BrandAddresses } from "@/components/brand-header";
import type { BrandHub } from "@/components/brands";
import { useCan } from "@/components/can";
import { ExternalLink } from "@/components/external-link";
import { FilesOut } from "@/components/files-out";
import { InfoTip } from "@/components/info-tip";
import type { Status } from "@/components/builder/use-status";
import { PortalDialog, toastSaved, type Portal } from "@/components/portals";
import { Group } from "@/components/settings/panels";
import { useShell } from "@/components/shell";
import { TokensView } from "@/components/tokens-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Confirm } from "@/components/confirm";
import type { HeadBrand, Release } from "@/lib/brand-head";
import { ACCESS_WORDS } from "@/lib/portal";
import { send } from "@/lib/send";

const ACCESS: Record<Portal["access"], { label: string; icon: React.ReactNode }> = {
  public: { label: ACCESS_WORDS.public.label, icon: <IconWorld aria-hidden /> },
  password: { label: ACCESS_WORDS.password.label, icon: <IconLock aria-hidden /> },
  members: { label: ACCESS_WORDS.members.label, icon: <IconUsers aria-hidden /> },
};

/**
 * A brand's Sharing tab: who reads it outside the team and where. BrandHub
 * (public or private, PATCH /api/v1/brands/{slug}/hub, for whoever may
 * publish), the portals showing it (for whoever manages portals: `portals`
 * is null otherwise), the one BrandHub links as its guidelines picked on its
 * row, and the addresses agents and code read. A portal is made or changed
 * here in the Portals page's dialog, the brand picked; Manage opens that page
 * on this brand's.
 */
export function BrandSharing({
  brand,
  origin,
  hub: initialHub,
  portals,
  portalDomain,
  release,
  files,
}: {
  brand: HeadBrand;
  origin: string;
  hub: BrandHub | null;
  portals: Portal[] | null;
  /** The server's PORTAL_DOMAIN, for the portal dialog. */
  portalDomain?: string;
  release: Release | null;
  /** Its files as people outside get them (lib/core/brand-status.ts); null when unread. */
  files: NonNullable<Status["files"]> | null;
}) {
  const router = useRouter();
  const can = useCan();
  // Follows the server's, and takes a change at once rather than after a refresh.
  const [hub, setHub] = useState(initialHub);
  const [seen, setSeen] = useState(initialHub);
  if (initialHub !== seen) {
    setSeen(initialHub);
    setHub(initialHub);
  }
  const [busy, setBusy] = useState<string | null>(null);
  const share = async (body: { visibility?: "public" | "private"; portal?: string | null }, what: string) => {
    setBusy(what);
    const done = (await send("PATCH", `/api/v1/brands/${encodeURIComponent(brand.slug)}/hub`, body)) as BrandHub | null;
    setBusy(null);
    if (done) {
      setHub(done);
      router.refresh();
    }
    return !!done;
  };
  // Picking which portal BrandHub links takes publishing, as making it public does.
  const link = hub && can("brand.publish", brand) ? (portal: string | null) => void share({ portal }, `link:${portal ?? "*"}`) : undefined;

  // Said while anyone outside the team reads it: public on BrandHub, or on a portal not just for members.
  const outside = hub?.visibility === "public" || !!portals?.some((p) => p.access !== "members");
  const publicly = hub?.visibility === "public" || !!portals?.some((p) => p.access === "public" && !p.expired);
  return (
    <div className="grid gap-4">
      {!publicly && portals && hub && can("brand.publish", brand) && can("portal.manage") && (
        <SharePublicly brand={brand} released={!!release} onDone={() => router.refresh()} />
      )}
      {outside && files && <FilesOut name={brand.name} files={files} />}
      {hub && (
        <Group
          title="BrandHub"
          description={
            hub.visibility === "public"
              ? "Public on BrandHub: anyone and any agent reads its latest release."
              : "Only people given access: this project's people, signed in."
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            {can("brand.publish", brand) &&
              (hub.visibility === "public" ? (
                <Button variant="outline" size="sm" pending={busy === "hub"} onClick={() => void share({ visibility: "private" }, "hub")}>
                  Hide from the public
                </Button>
              ) : (
                // Asked first, as on the Brands page: it is the brand's latest release, for anyone and any agent.
                <Confirm
                  title={`Make ${brand.name} public?`}
                  says="Anyone, and any agent, will read its latest release on BrandHub, with its usable files, and each release after. You can hide it from the public again."
                  action="Make public on BrandHub"
                  destructive={false}
                  run={() => share({ visibility: "public" }, "hub")}
                >
                  <Button size="sm" disabled={!hub.published} title={hub.published ? undefined : "Release it first"}>
                    Make public on BrandHub
                  </Button>
                </Confirm>
              ))}
            {hub.published && (
              <Button variant="ghost" size="sm" asChild>
                <ExternalLink href={hub.url}>See it on BrandHub</ExternalLink>
              </Button>
            )}
          </div>
          {hub.visibility === "public" && hub.published && (
            <div className="grid gap-1.5">
              <p className="text-sm font-medium">A badge for its README, in its color, with the release that is live</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${hub.url}/badge.svg`} alt="The brand's README badge" className="h-5 w-fit" />
              <Snippet text={`[![Brand on BrandHub](${hub.url}/badge.svg)](${hub.url})`} what="the badge's Markdown" />
            </div>
          )}
          {hub.visibility === "public" && hub.published && <WellKnown hub={hub} domain={brand.domain ?? (hub.verified?.includes("/") ? null : hub.verified) ?? null} />}
        </Group>
      )}

      {/* Its share card, slides and documents have a page of their own, for every brand. */}
      {release && (
        <Group title="Share card and templates" description="A link preview in the brand's look, PowerPoint and Word templates, and the press kit, all from its latest release.">
          <Button size="sm" variant="outline" asChild className="w-fit">
            <Link href={`/templates?${new URLSearchParams({ brand: brand.slug })}`}>Open Templates</Link>
          </Button>
        </Group>
      )}

      {portals && <BrandPortals brand={brand} portals={portals} portalDomain={portalDomain} hub={hub} busy={busy} onLink={link} />}

      <Group title="For agents and code" info="The addresses an agent or a build reads the brand from.">
        <BrandAddresses
          brand={brand}
          origin={origin}
          hub={hub?.published ? hub : null}
          release={release}
          onTokens={() => document.getElementById("tokens")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
      </Group>
      {/* The one place for its tokens: the header's "Use this brand" and Rules link here. */}
      <section id="tokens" className="scroll-mt-20">
        <Group title="Design tokens" description="Each format is also a link that stays current: a build or an agent reads the brand as it is now.">
          <TokensView brand={brand} className="h-[28rem]" />
        </Group>
      </section>
    </div>
  );
}

/**
 * Shared with everyone in one step: released first when it never was, a
 * public portal showing it (POST /api/v1/sites, at the first free address of
 * its slug), and, when asked, public on BrandHub for agents.
 */
function SharePublicly({ brand, released, onDone }: { brand: HeadBrand; released: boolean; onDone: () => void }) {
  const [hub, setHub] = useState(true);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      const at = encodeURIComponent(brand.slug);
      if (!released && !(await send("POST", `/api/v1/brands/${at}/publish`, { note: "First release" }))) return;
      // Its slug, or the first free one after it: brand, brand-2, brand-3...
      let slug = brand.slug;
      for (let n = 2; n < 10; n++) {
        const free = (await send("GET", `/api/v1/sites/address?${new URLSearchParams({ slug })}`)) as { available: boolean } | null;
        if (!free || free.available) break;
        slug = `${brand.slug}-${n}`;
      }
      const portal = (await send("POST", "/api/v1/sites", { name: brand.name, slug, access: "public", brands: [brand.slug] })) as Portal | null;
      if (!portal) return;
      if (hub) await send("PATCH", `/api/v1/brands/${at}/hub`, { visibility: "public" });
      toast.success(`${brand.name} is public`, { description: portal.url, action: { label: "Open", onClick: () => window.open(portal.url, "_blank", "noopener") } });
      onDone();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Group title="Share publicly" description={`A public portal where anyone reads ${brand.name} and takes its files${released ? "" : ", after its first release"}. You can close it, or hide it again, any time.`}>
      <div className="flex flex-wrap items-center gap-4">
        <Button size="sm" pending={busy} onClick={() => void go()}>
          <IconWorld aria-hidden /> Share publicly
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={hub} onCheckedChange={(v) => setHub(v === true)} />
          Also on BrandHub, for agents
        </label>
      </div>
    </Group>
  );
}

/**
 * The one file a brand's owner hosts on their own site, so agents reading
 * AdCP's brand.json at their domain find the brand on BrandHub: an
 * Authoritative Location Redirect. A verified domain serving this app answers
 * it already (app/.well-known/brand.json).
 */
function WellKnown({ hub, domain }: { hub: BrandHub; domain: string | null }) {
  const file = JSON.stringify({ $schema: "https://adcontextprotocol.org/schemas/v3/brand.json", authoritative_location: `${hub.url}/brand.json` });
  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-medium break-words">
        On {domain ?? "your own site"}, at <code className="font-mono text-xs">{domain ? `https://${domain}` : ""}/.well-known/brand.json</code>{" "}
        <InfoTip>Agents that read AdCP&apos;s brand.json from a domain then find this brand, its latest release, here.</InfoTip>
      </p>
      <p className="text-muted-foreground text-sm">One static file, as it is:</p>
      <Snippet text={file} what="the brand.json" />
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
  brand,
  portals,
  portalDomain,
  hub,
  busy,
  onLink,
}: {
  brand: HeadBrand;
  portals: Portal[];
  portalDomain?: string;
  hub: BrandHub | null;
  busy: string | null;
  onLink?: (portal: string | null) => void;
}) {
  const router = useRouter();
  const { collections, brands } = useShell();
  const [editing, setEditing] = useState<"new" | null>(null);
  const linked = hub?.portal?.slug;
  return (
    <Group title="Sites" info="Where people outside the team read the brand and take its files.">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setEditing("new")}>
          <IconPlus aria-hidden /> New portal
        </Button>
        {portals.length > 0 && (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/sites?${new URLSearchParams({ brand: brand.slug })}`}>Manage</Link>
          </Button>
        )}
      </div>
      {portals.length === 0 ? (
        <p className="text-muted-foreground text-sm">No portal shows this brand yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {portals.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="grid min-w-0 flex-1 basis-40 gap-0.5">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {/* Its settings are a page of their own; a new one is made here, in a dialog. */}
                  <Button variant="link" onClick={() => router.push(`/sites/${p.id}`)} className="text-foreground h-auto min-w-0 justify-start p-0 text-start">
                    <span className="truncate">{p.name}</span>
                  </Button>
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
                  <Link href={`/sites?${new URLSearchParams({ open: p.id })}`}>
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
      {editing && (
        <PortalDialog
          portal={null}
          collections={collections}
          brands={brands}
          showing={brand}
          portalDomain={portalDomain}
          onClose={() => setEditing(null)}
          onSaved={(saved, said) => {
            if (said) toastSaved(saved, said);
            router.refresh();
          }}
          onDeleted={() => router.refresh()}
        />
      )}
    </Group>
  );
}
