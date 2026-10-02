"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { IconChevronDown, IconCircleCheckFilled, IconCopy, IconDownload, IconLock, IconPencil, IconRobot, IconWorld, IconWorldUpload } from "@tabler/icons-react";
import { BrandDialog, brandHref, type BrandInfo } from "@/components/brand-switcher";
import { BrandTabMenu, BrandTabs, useBrandTabs, type BrandTab } from "@/components/brand-tabs";
import { useSource, type Status } from "@/components/builder/use-status";
import { useCan } from "@/components/can";
import { CopyButton } from "@/components/copy-button";
import { ExternalLink } from "@/components/external-link";
import { GitSource } from "@/components/git-source";
import { TabNav } from "@/components/hub";
import { TokensDialog, tokensPath } from "@/components/tokens-dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { sendResult } from "@/lib/send";
import type { Release } from "@/lib/brand-head";
import { logoOf } from "@/lib/hub";
import { liveLine, livePlaces, liveWhere, type LivePlace } from "@/lib/readiness";
import { cn } from "@/lib/utils";
import type { Rule } from "@/lib/rules";
import { brandPath, builderPath } from "@/lib/site";
import { LinkIcon } from "@/components/link-pending";

/**
 * A brand's header, over every tab of its page (PRD section 12, the brand
 * card, as the prototype draws it): its mark, its name, whether its
 * organization is verified and whether it is public on BrandHub (a link to
 * its page there), then how
 * BrandHub names it, what is live, where (BrandHub, its portals: a popover
 * of links out) and whether it is the latest (lib/readiness.ts liveLine,
 * livePlaces), when it was released, and the release's note. Use this brand,
 * Edit (the builder, where you are: the page on show, or its Rules panel
 * from Tokens and rules) and Release, while readers don't see the latest, sit
 * at its end, the tabs under it. The brand's page is read-only: Edit is the way into the builder.
 */
export type BrandHeaderProps = {
  brand: BrandInfo;
  /** This server's address (APP_URL): where agents reach it. */
  origin: string;
  rules: Rule[];
  /** Its BrandHub listing, the portals showing it and where readers stand (GET .../status); null when it couldn't be read. */
  status: Pick<Status, "hub" | "publish" | "portals"> | null;
  release: Release | null;
  at: BrandTab;
  /** One line (the Guidelines tab, so the pages get the screen): the mark, the name and the tabs inline (in the name's menu when narrow), what is live with where in its popover, and the actions as icons. */
  compact?: boolean;
};

/** The header's reads: a brand it can't read the source of shows no Git button, and says nothing. */
const quietly = (method: string, url: string, body?: unknown) => sendResult(method, url, body, { quiet: true });

/** "12 Sep 2026", as the header dates a release. */
export const releaseDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export function BrandHeader({ brand, origin, rules, status, release, at, compact }: BrandHeaderProps) {
  const can = useCan();
  const params = useSearchParams();
  // Edit opens where you are: the page on show, the rules in the builder's Rules panel, else the builder.
  const editing = at === "guidelines" ? { page: params.get("page"), context: params.get("context") } : at === "rules" ? { panel: "rules" } : {};
  const hub = status?.hub ?? null;
  const logo = logoOf(rules.map((r) => ({ ...r, assets: r.assets.map((a) => ({ ...a, mime: a.mime ?? "" })) })));
  const live = status ? liveLine(status.publish, release?.number ?? null) : release ? `@${release.number} live` : "Never released";
  // Where readers get the release: once there is one, and as far as this person is told.
  const places = release ? livePlaces(hub, status?.portals ?? null) : null;
  const [head, ...rest] = live.split(" · ");
  const date = release && releaseDate(release.publishedAt);
  const line = [hub?.ref, places?.length ? `${head} ${liveWhere(places)}` : head, places && !places.length && liveWhere(places), ...rest, date].filter(Boolean);
  const where = places && <LivePlaces places={places} hub={hub} label={liveWhere(places)} className="hover:text-foreground underline decoration-dotted underline-offset-4" />;
  const tabs = useBrandTabs(brand);
  // Brand as code: the repository it is kept in, or where to connect one.
  const source = useSource(brand.slug, quietly);
  const parts = [hub?.ref, places?.length ? <>{head} {where}</> : head, places && !places.length && where, ...rest, date].filter(Boolean);
  const mark = (
    <span className={cn("bg-muted grid shrink-0 place-items-center overflow-hidden border", compact ? "size-7 rounded-md" : "size-13 rounded-xl")}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- a rendition, already sized
        <img src={logo.mime === "image/svg+xml" ? `/a/${logo.id}` : `/a/${logo.id}/h_160,f_webp`} alt="" className={cn("size-full object-contain", compact ? "p-0.5" : "p-1.5")} />
      ) : (
        <span className={cn("font-display font-semibold", compact ? "text-sm" : "text-xl")}>{brand.name.slice(0, 1)}</span>
      )}
    </span>
  );
  // The compact header's buttons are their icons: their words are their tooltips, and for screen readers.
  const word = compact ? "sr-only" : undefined;
  const actions = (
    <div className="flex items-center gap-2">
      <GitSource source={source} slug={brand.slug} editor={can("brand.edit")} compact />
      <UseThisBrand brand={brand} origin={origin} hub={hub && release ? hub : null} release={release} compact={compact} />
      {can("brand.edit") && (
        <Button asChild size="sm" variant="outline" title={compact ? "Edit" : undefined}>
          <Link href={builderPath(brand.slug, editing)}>
            <LinkIcon icon={<IconPencil aria-hidden />} /> <span className={word}>Edit</span>
          </Link>
        </Button>
      )}
      {can("brand.edit") && status?.publish !== "current" && (
        <Button asChild size="sm" title={compact ? "Release" : undefined}>
          <Link href={brandPath(brand.slug, "/releases/new")}>
            <LinkIcon icon={<IconWorldUpload aria-hidden />} /> <span className={word}>Release</span>
          </Link>
        </Button>
      )}
    </div>
  );
  // One line over the guidelines: the tabs inline while they fit the header (a container query), else in the menu on the brand's name.
  if (compact)
    return (
      <header className="@container border-b">
        <div className="flex h-12 items-center gap-2 px-4 md:px-6">
          {mark}
          <h1 className="font-display sr-only max-w-48 min-w-0 truncate font-semibold tracking-tight @min-[64rem]:not-sr-only">{brand.name}</h1>
          <div className="min-w-0 @min-[64rem]:hidden">
            <BrandTabMenu brand={brand} at={at} />
          </div>
          <TabNav
            label={brand.name}
            items={tabs.map((t) => ({ href: t.href, label: t.label, current: t.id === at }))}
            className="ms-2 hidden self-stretch *:px-2 *:text-[13px] @min-[64rem]:flex"
          />
          <div className="ms-auto flex shrink-0 items-center gap-2">
            {/* What is live, short; the popover says the rest and where, BrandHub included. */}
            <LivePlaces
              places={places ?? []}
              hub={hub}
              summary={line.join(" · ")}
              label={
                <>
                  {head}
                  {status?.publish === "behind" && (
                    <span className="bg-warning size-1.5 rounded-full">
                      <span className="sr-only">, unreleased changes</span>
                    </span>
                  )}
                </>
              }
              className="text-muted-foreground hover:text-foreground hidden items-center gap-1 text-[13px] whitespace-nowrap @min-[28rem]:inline-flex"
              chevron
            />
            {actions}
          </div>
        </div>
      </header>
    );
  return (
    <>
      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-4 pt-6 md:flex-nowrap md:px-6">
        <div className="flex min-w-0 flex-[1_1_18rem] items-center gap-3.5">
          {mark}
          <div className="grid min-w-0 gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display truncate text-2xl font-semibold tracking-tight">{brand.name}</h1>
              {/* Icons, their words their tooltips: the badges crowded the actions. */}
              {hub?.verified && (
                <span role="img" aria-label={`${hub.verified} verified`} title={`${hub.verified} verified: its organization proved it holds the domain`} className="text-success">
                  <IconCircleCheckFilled aria-hidden className="size-5" />
                </span>
              )}
              {hub && (
                <a
                  href={hub.url}
                  target="_blank"
                  rel="noreferrer"
                  title={hub.visibility === "public" ? "Public on BrandHub: open its page" : "Private on BrandHub: open its page"}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {hub.visibility === "public" ? <IconWorld aria-hidden className="size-5" /> : <IconLock aria-hidden className="size-5" />}
                  <span className="sr-only">{hub.visibility === "public" ? "Public on BrandHub" : "Private on BrandHub"} (opens in a new tab)</span>
                </a>
              )}
            </div>
            <p className="text-muted-foreground truncate text-sm">
              {parts.map((x, i) => (
                <Fragment key={i}>
                  {i > 0 && " · "}
                  {x}
                </Fragment>
              ))}
              {release?.note && <> · &ldquo;{release.note.split("\n")[0]}&rdquo;</>}
            </p>
          </div>
        </div>
        {actions}
      </header>
      <BrandTabs brand={brand} at={at} />
    </>
  );
}

/**
 * Where readers get the live release (lib/readiness.ts livePlaces), each a
 * link out; a listing private on BrandHub too, for the team. With nowhere
 * to link and nothing to sum up, the label alone.
 */
function LivePlaces({
  places,
  hub,
  label,
  summary,
  className,
  chevron,
}: {
  places: LivePlace[];
  hub: Status["hub"];
  label: React.ReactNode;
  /** The whole live line, atop the places: the compact header's trigger says only what is live. */
  summary?: string;
  className?: string;
  chevron?: boolean;
}) {
  const team = hub?.visibility === "private" ? hub : null;
  if (!places.length && !team && !summary) return <span className={className}>{label}</span>;
  const row = (href: string, name: string, sub: string) => (
    <ExternalLink key={href} href={href} className="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
      <span className="grid min-w-0 flex-1">
        <span className="font-medium">{name}</span>
        <span className="text-muted-foreground truncate text-xs">{sub}</span>
      </span>
    </ExternalLink>
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={className}>
          {label}
          {chevron && <IconChevronDown aria-hidden className="size-3.5" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-72 gap-0.5 p-1.5">
        {summary && <p className="text-muted-foreground px-2 py-1.5 text-xs">{summary}</p>}
        {places.map((p) => row(p.url, p.name, p.url.replace(/^https?:\/\//, "")))}
        {team && row(team.url, "BrandHub", "Private: the team, signed in")}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Use this brand (PRD section 12): the addresses an agent or a build reads
 * it from (BrandAddresses), and Start from this brand, which copies it into
 * a new brand. `hub`: the brand on BrandHub, once released there.
 */
function UseThisBrand({ brand, origin, hub, release, compact }: { brand: BrandInfo; origin: string; hub: Status["hub"]; release: Release | null; compact?: boolean }) {
  const router = useRouter();
  const can = useCan();
  const [copying, setCopying] = useState<{ open: boolean; n: number } | null>(null);
  const [tokens, setTokens] = useState(false);
  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" title={compact ? "Use this brand" : undefined}>
            <IconRobot aria-hidden /> <span className={compact ? "sr-only" : undefined}>Use this brand</span> {!compact && <IconChevronDown aria-hidden />}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="grid w-[min(26rem,calc(100vw-2rem))] gap-3 p-3">
          <BrandAddresses brand={brand} origin={origin} hub={hub} release={release} onTokens={() => setTokens(true)} />
          {can("brand.edit") && (
            <>
              <Separator />
              <div className="flex items-center gap-3">
                <span className="grid min-w-0 flex-1">
                  <span className="text-sm font-medium">Start from this brand</span>
                  <span className="text-muted-foreground text-xs">Copy its rules into a new brand</span>
                </span>
                <Button size="xs" variant="outline" onClick={() => setCopying((c) => ({ open: true, n: (c?.n ?? 0) + 1 }))}>
                  <IconCopy aria-hidden /> Duplicate
                </Button>
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>
      <TokensDialog brand={brand} open={tokens} onOpenChange={setTokens} />
      {copying && (
        <BrandDialog
          key={copying.n}
          open={copying.open}
          editing={{ kind: "copy", brand }}
          onClose={() => setCopying((c) => c && { ...c, open: false })}
          onDone={(b) => {
            setCopying((c) => c && { ...c, open: false });
            toast.success(`Created ${b.name}`);
            router.push(brandHref(b));
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/**
 * The addresses agents and code read a brand from: the MCP server the
 * Connections page connects; on BrandHub, once public, its brand.json at the
 * release and its llms.txt; its tokens in every format (`onTokens` opens
 * them), and DESIGN.md for static agent setups, from BrandHub without a key,
 * else from the API with one. Use this brand and the Sharing tab both show it.
 * `hub`: the brand on BrandHub, once released there.
 */
export function BrandAddresses({ brand, origin, hub, release, onTokens }: { brand: BrandInfo; origin: string; hub: Pick<NonNullable<Status["hub"]>, "visibility" | "url"> | null; release: Release | null; onTokens: () => void }) {
  const open = hub?.visibility === "public" ? hub.url : null;
  const designMd = open ? `${open}/tokens?format=designmd` : `${origin}${tokensPath(brand, undefined, "designmd")}`;
  const rows = [
    { label: "Connect an agent (MCP)", text: `${origin}/api/v1/mcp` },
    ...(open
      ? [
          { label: "brand.json", text: `${open}${release ? `@${release.number}` : ""}/brand.json` },
          { label: "llms.txt", text: `${open}/llms.txt` },
        ]
      : []),
  ];
  return (
    <>
      <ul className="grid gap-2.5">
        {rows.map((r) => (
          <li key={r.label} className="grid gap-1">
            <span className="text-sm font-medium">{r.label}</span>
            <div className="bg-muted/60 flex items-center gap-1 rounded-md border ps-2.5">
              <code className="w-0 min-w-0 flex-1 truncate py-1.5 text-xs">{r.text}</code>
              <CopyButton text={r.text} label={`Copy the ${r.label} address`} what="the address" />
            </div>
          </li>
        ))}
        <li className="flex items-center gap-3">
          <span className="grid min-w-0 flex-1">
            <span className="text-sm font-medium">Tokens</span>
            <span className="text-muted-foreground text-xs">CSS, Tailwind, shadcn/ui, DTCG and more</span>
          </span>
          <Button size="xs" variant="outline" onClick={onTokens}>
            Get
          </Button>
        </li>
        <li className="flex items-center gap-3">
          <span className="grid min-w-0 flex-1">
            <span className="text-sm font-medium">DESIGN.md</span>
            <span className="text-muted-foreground text-xs">One file for static agent setups</span>
          </span>
          <Button size="xs" variant="outline" asChild>
            <a href={designMd} download={`${brand.slug}-DESIGN.md`}>
              <IconDownload aria-hidden /> Get
            </a>
          </Button>
        </li>
      </ul>
      <p className="text-muted-foreground text-xs">
        {open ? "Its BrandHub files are public: no key. " : "With a key: "}
        <Link href="/connections" className="text-foreground underline underline-offset-2">
          connect an agent
        </Link>{" "}
        for the MCP server and the API.
      </p>
    </>
  );
}
