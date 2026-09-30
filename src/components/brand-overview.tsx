"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconBook, IconChartBar, IconChevronDown, IconCopy, IconLock, IconRobot, IconStar, IconWorld } from "@tabler/icons-react";
import { BrandDialog, brandHref, type BrandInfo } from "@/components/brand-switcher";
import { BrandTabs } from "@/components/brand-tabs";
import type { Status } from "@/components/builder/use-status";
import { Preview } from "@/components/hub";
import { useCan } from "@/components/can";
import { CopyButton } from "@/components/copy-button";
import { AppHeader } from "@/components/page";
import { tokensPath } from "@/components/tokens-dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { inkOn } from "@/lib/color";
import { ago, logoOf, taglineOf, tintOf } from "@/lib/hub";
import { ruleName, type Rule } from "@/lib/rules";
import { guidelinesPath } from "@/lib/site";

/**
 * A brand's Overview, the tab it opens on (PRD section 12, the brand card):
 * who it is (its mark on its own color, its line, who sees it), its colors,
 * its latest release, and the signals that say it is read. Everything comes
 * from /api/v1 like any client's: the brand, its rules, its status, its
 * history, and its insights for whoever may read them.
 */

/** GET /api/v1/brands/{slug}/insights. */
export type BrandSignals = { days: number; pulls: number; views: number };
/** A release as GET /api/v1/brands/{slug}/versions lists it: only what the card reads. */
export type Release = { number: number; publishedAt: string; note: string | null };

export type BrandOverviewProps = {
  brand: BrandInfo;
  /** This server's address (APP_URL): where agents reach it. */
  origin: string;
  rules: Rule[];
  status: Status | null;
  release: Release | null;
  /** null: this person may not read Insights. */
  signals: BrandSignals | null;
};

const HEX = /^#[0-9a-f]{6}$/i;

export function BrandOverview({ brand, origin, rules, status, release, signals }: BrandOverviewProps) {
  const own = rules.filter((r) => !r.context);
  const colors = own.filter((r) => r.type === "color" && typeof r.value === "string");
  const logo = logoOf(rules.map((r) => ({ ...r, assets: r.assets.map((a) => ({ ...a, mime: a.mime ?? "" })) })));
  const card = {
    name: brand.name,
    tint: tintOf(rules),
    logo: logo && (logo.mime === "image/svg+xml" ? `/a/${logo.id}` : `/a/${logo.id}/h_320,f_webp`),
  };
  const tagline = taglineOf(rules);
  const hub = status?.hub;

  return (
    <>
      <AppHeader trail={[{ label: "Brands", href: "/brands" }, { label: brand.name }]} />
      <BrandTabs brand={brand} at="overview">
        <UseThisBrand brand={brand} origin={origin} hub={status?.hub && release ? status.hub : null} />
      </BrandTabs>
      <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 pt-6 pb-16 md:px-6 lg:grid-cols-[1fr_18rem]">
        <article className="bg-card min-w-0 overflow-hidden rounded-xl border">
          <Preview card={card} className="h-44">
            <div className="absolute inset-x-0 bottom-0 flex h-2">
              {colors.slice(0, 8).map((r) => (
                <span key={r.key} className="flex-1" style={{ background: String(r.value) }} />
              ))}
            </div>
          </Preview>
          <header className="grid gap-2 px-5 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-semibold tracking-tight">{brand.name}</h1>
              {hub && (
                <span className="text-muted-foreground inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium">
                  {hub.visibility === "public" ? <IconWorld aria-hidden className="size-3" /> : <IconLock aria-hidden className="size-3" />}
                  {hub.visibility === "public" ? "Public" : "Private"}
                </span>
              )}
              {brand.default && <IconStar aria-label="default" className="text-muted-foreground size-3.5" />}
            </div>
            {tagline && <p className="text-muted-foreground">{tagline}</p>}
          </header>
          <section aria-labelledby="colors" className="grid gap-3 border-t px-5 py-5">
            <h2 id="colors" className="text-sm font-medium">
              Colors
            </h2>
            {colors.length ? (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {colors.map((r) => {
                  const hex = String(r.value);
                  return (
                    <li key={r.key} className="overflow-hidden rounded-lg border">
                      <div className="flex h-14 items-end p-2 font-mono text-xs" style={{ background: hex, color: HEX.test(hex) ? inkOn(hex) : undefined }}>
                        {hex}
                      </div>
                      <p className="truncate px-2 py-1.5 text-xs font-medium">{ruleName(r)}</p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">No colors yet: add them in the guidelines&apos; rules.</p>
            )}
          </section>
        </article>

        <aside className="grid content-start gap-4">
          <Box title="Latest release" icon={<IconBook />}>
            {release ? (
              <>
                <p className="text-sm">
                  Release {release.number}, <span className="text-muted-foreground">{ago(release.publishedAt)}</span>
                </p>
                {release.note && <p className="text-muted-foreground line-clamp-3 text-sm">{release.note}</p>}
                {status?.publish === "behind" && <p className="text-muted-foreground text-xs">There are changes readers don&apos;t see yet.</p>}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">Never released: portals and BrandHub show nothing of it yet.</p>
            )}
            {status?.portals && status.portals.length > 0 && (
              <p className="text-muted-foreground text-xs">On {status.portals.map((p) => p.name).join(", ")}</p>
            )}
          </Box>

          {signals && (
            <Box title={`Last ${signals.days} days`} icon={<IconChartBar />}>
              <dl className="grid grid-cols-2 gap-2">
                <Signal label="BrandHub reads" value={signals.pulls} />
                <Signal label="Portal page views" value={signals.views} />
              </dl>
            </Box>
          )}

          {status && <AgentScore status={status} slug={brand.slug} />}
        </aside>
      </div>
    </>
  );
}

/**
 * The Brand Agent Score (lib/readiness.ts), the brand's health meter in place
 * of the launch checklist: the score, then what raises it, the most first,
 * each step with what it adds and where it is done.
 */
function AgentScore({ status, slug }: { status: Status; slug: string }) {
  const raises = status.steps.filter((s) => s.done === false).sort((a, b) => b.points - a.points);
  return (
    <Box title="Brand Agent Score" icon={<IconRobot />}>
      <div className="flex items-baseline gap-1">
        <span className="font-display text-3xl font-semibold tabular-nums">{status.score}</span>
        <span className="text-muted-foreground text-sm">/ 100</span>
      </div>
      <Progress value={status.score} className="h-1.5" aria-label="Brand Agent Score" />
      {raises.length ? (
        <>
          <p className="text-muted-foreground mt-1 text-xs">What raises it</p>
          <ol className="grid gap-1.5">
            {raises.map((s) => (
              <li key={s.id} className="grid gap-0.5 text-sm">
                <span className="flex items-baseline gap-2">
                  <Link href={s.id === "portal" ? `/portals?${new URLSearchParams({ new: slug })}` : guidelinesPath(slug)} className="hover:underline">
                    {s.title}
                  </Link>
                  <span className="text-success ms-auto text-xs font-medium tabular-nums">+{s.points}</span>
                </span>
                <span className="text-muted-foreground text-xs">{s.detail}</span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">Everything an agent needs is here.</p>
      )}
    </Box>
  );
}

function Box({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-card grid gap-2 rounded-xl border p-4">
      <h2 className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium [&_svg]:size-3.5">
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}

function Signal({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-display text-xl font-semibold tabular-nums">{value.toLocaleString()}</dd>
    </div>
  );
}

/**
 * Use this brand (PRD section 12), in the brand's header: the addresses an
 * agent or a build reads it from, one to copy at a time. The MCP server the
 * Agents page connects; on BrandHub, once public, its brand.json and
 * llms.txt, and its tokens and DESIGN.md there without a key, else from the
 * API with one. Duplicate starts another brand from a copy of this one.
 * `hub`: the brand on BrandHub, once released there.
 */
function UseThisBrand({ brand, origin, hub }: { brand: BrandInfo; origin: string; hub: { visibility: "private" | "public"; url: string } | null }) {
  const router = useRouter();
  const can = useCan();
  const [copying, setCopying] = useState<{ open: boolean; n: number } | null>(null);
  const open = hub?.visibility === "public" ? hub.url : null;
  const tokens = (format: "css" | "designmd") => (open ? `${open}/tokens?format=${format}` : `${origin}${tokensPath(brand, undefined, format)}`);
  const rows = [
    { label: "MCP server", text: `${origin}/api/v1/mcp` },
    ...(open ? [{ label: "brand.json", text: `${open}/brand.json` }, { label: "llms.txt", text: `${open}/llms.txt` }] : []),
    { label: "Design tokens", text: tokens("css") },
    { label: "DESIGN.md", text: tokens("designmd") },
  ];
  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" className="my-1.5 shrink-0">
            <IconRobot aria-hidden /> Use this brand <IconChevronDown aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="grid w-[min(26rem,calc(100vw-2rem))] gap-3 p-3">
          <ul className="grid gap-2">
            {rows.map((r) => (
              <li key={r.label} className="grid gap-1">
                <span className="text-muted-foreground text-xs">{r.label}</span>
                <div className="bg-muted/60 flex items-center gap-1 rounded-md border ps-2.5">
                  <code className="min-w-0 flex-1 truncate py-1.5 text-xs">{r.text}</code>
                  <CopyButton text={r.text} label={`Copy the ${r.label} address`} what="the address" />
                </div>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            {open ? "Its BrandHub files are public: no key. " : "With a key: "}
            <Link href="/agents" className="text-foreground underline underline-offset-2">
              connect an agent
            </Link>{" "}
            for the MCP server and the API.
          </p>
          {can("brand.edit") && (
            <Button variant="outline" size="sm" onClick={() => setCopying((c) => ({ open: true, n: (c?.n ?? 0) + 1 }))}>
              <IconCopy aria-hidden /> Duplicate as a new brand
            </Button>
          )}
        </PopoverContent>
      </Popover>
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
