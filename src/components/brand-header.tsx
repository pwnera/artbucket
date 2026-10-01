"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { IconChevronDown, IconCircleCheckFilled, IconCopy, IconDownload, IconLock, IconPencil, IconRobot, IconWorld, IconWorldUpload } from "@tabler/icons-react";
import { BrandDialog, brandHref, type BrandInfo } from "@/components/brand-switcher";
import { BrandTabs, type BrandTab } from "@/components/brand-tabs";
import type { Status } from "@/components/builder/use-status";
import { useCan } from "@/components/can";
import { CopyButton } from "@/components/copy-button";
import { ExternalLink } from "@/components/external-link";
import { TokensDialog, tokensPath } from "@/components/tokens-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import type { Release } from "@/lib/brand-head";
import { logoOf } from "@/lib/hub";
import { liveLine } from "@/lib/readiness";
import { cn } from "@/lib/utils";
import type { Rule } from "@/lib/rules";
import { brandPath, builderPath } from "@/lib/site";

/**
 * A brand's header, over every tab of its page (PRD section 12, the brand
 * card, as the prototype draws it): its mark, its name, whether its
 * organization is verified and whether it is public on BrandHub (a link to
 * its page there), then how
 * BrandHub names it, what is live and whether it is the latest (lib/readiness.ts
 * liveLine), when it was released, and the release's note. Use this brand,
 * Edit (the builder, where you are: the page on show, or its Rules panel
 * from Tokens and rules) and Release, while readers don't see the latest, sit
 * at its end, the tabs under it. The brand's page is read-only: Edit is the way into the builder.
 */
export type BrandHeaderProps = {
  brand: BrandInfo;
  /** This server's address (APP_URL): where agents reach it. */
  origin: string;
  rules: Rule[];
  /** Its BrandHub listing and where readers stand (GET .../status); null when it couldn't be read. */
  status: Pick<Status, "hub" | "publish"> | null;
  release: Release | null;
  at: BrandTab;
  /** One line (the Guidelines tab, so the pages get the screen): the mark, the name, what is live, BrandHub, the actions, then the tabs. */
  compact?: boolean;
};

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
  const line = [hub?.ref, live, release && releaseDate(release.publishedAt)].filter(Boolean);
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
  // On a phone the compact header's buttons are their icons, their words for screen readers.
  const word = compact ? "max-sm:sr-only" : undefined;
  const actions = (
    <div className="flex items-center gap-2">
      <UseThisBrand brand={brand} origin={origin} hub={hub && release ? hub : null} release={release} compact={compact} />
      {can("brand.edit") && (
        <Button asChild size="sm" variant="outline">
          <Link href={builderPath(brand.slug, editing)}>
            <IconPencil aria-hidden /> <span className={word}>Edit</span>
          </Link>
        </Button>
      )}
      {can("brand.edit") && status?.publish !== "current" && (
        <Button asChild size="sm">
          <Link href={brandPath(brand.slug, "/releases/new")}>
            <IconWorldUpload aria-hidden /> <span className={word}>Release</span>
          </Link>
        </Button>
      )}
    </div>
  );
  if (compact)
    return (
      <>
        <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-3 md:px-6">
          {mark}
          <h1 className="font-display min-w-0 truncate text-lg font-semibold tracking-tight">{brand.name}</h1>
          {/* What is live, short: the whole line is its title. */}
          <span className="text-muted-foreground text-sm whitespace-nowrap" title={line.join(" · ")}>
            {status?.publish === "behind" ? "Unreleased changes" : live.split(" · ")[0]}
          </span>
          {hub && (
            <ExternalLink href={hub.url} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm whitespace-nowrap">
              BrandHub
            </ExternalLink>
          )}
          <div className="ms-auto">{actions}</div>
        </header>
        <BrandTabs brand={brand} at={at} />
      </>
    );
  return (
    <>
      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-4 pt-6 md:px-6">
        <div className="flex min-w-0 items-center gap-3.5">
          {mark}
          <div className="grid min-w-0 gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display truncate text-2xl font-semibold tracking-tight">{brand.name}</h1>
              {hub?.verified && (
                <Badge variant="success" title={`Its organization proved it holds ${hub.verified}`}>
                  <IconCircleCheckFilled aria-hidden /> {hub.verified} verified
                </Badge>
              )}
              {hub && (
                <Badge variant="secondary" asChild>
                  <ExternalLink href={hub.url}>
                    {hub.visibility === "public" ? <IconWorld aria-hidden /> : <IconLock aria-hidden />}
                    {hub.visibility === "public" ? "Public on BrandHub" : "Private on BrandHub"}
                  </ExternalLink>
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground truncate text-sm">
              {line.join(" · ")}
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
 * Use this brand (PRD section 12): the addresses an agent or a build reads
 * it from. The MCP server the Connections page connects; on BrandHub, once
 * public, its brand.json at the release and its llms.txt; its tokens in
 * every format, and DESIGN.md for static agent setups, from BrandHub without
 * a key, else from the API with one. Start from this brand copies it into a
 * new brand. `hub`: the brand on BrandHub, once released there.
 */
function UseThisBrand({ brand, origin, hub, release, compact }: { brand: BrandInfo; origin: string; hub: Status["hub"]; release: Release | null; compact?: boolean }) {
  const router = useRouter();
  const can = useCan();
  const [copying, setCopying] = useState<{ open: boolean; n: number } | null>(null);
  const [tokens, setTokens] = useState(false);
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
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline">
            <IconRobot aria-hidden /> <span className={compact ? "max-sm:sr-only" : undefined}>Use this brand</span> <IconChevronDown aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="grid w-[min(26rem,calc(100vw-2rem))] gap-3 p-3">
          <ul className="grid gap-2.5">
            {rows.map((r) => (
              <li key={r.label} className="grid gap-1">
                <span className="text-sm font-medium">{r.label}</span>
                <div className="bg-muted/60 flex items-center gap-1 rounded-md border ps-2.5">
                  <code className="min-w-0 flex-1 truncate py-1.5 text-xs">{r.text}</code>
                  <CopyButton text={r.text} label={`Copy the ${r.label} address`} what="the address" />
                </div>
              </li>
            ))}
            <li className="flex items-center gap-3">
              <span className="grid min-w-0 flex-1">
                <span className="text-sm font-medium">Tokens</span>
                <span className="text-muted-foreground text-xs">CSS, Tailwind, shadcn/ui, DTCG and more</span>
              </span>
              <Button size="xs" variant="outline" onClick={() => setTokens(true)}>
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
