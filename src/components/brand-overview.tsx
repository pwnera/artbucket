"use client";

import Link from "next/link";
import { IconChartBar, IconGitCommit, IconMessage, IconRobot } from "@tabler/icons-react";
import { BrandCard, type CardBrand } from "@/components/brand-card";
import { BrandHeader } from "@/components/brand-header";
import type { BrandInfo } from "@/components/brand-switcher";
import type { Status } from "@/components/builder/use-status";
import { AppHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import type { Release } from "@/lib/brand-head";
import { ago, taglineOf } from "@/lib/hub";
import type { Rule } from "@/lib/rules";
import { brandPath } from "@/lib/site";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/lib/motion";

/**
 * A brand's Overview, the tab it opens on (PRD section 12, the brand card, as
 * the prototype's repository page draws it): under the header, what it is
 * (its line, where it came from), the card readers see
 * (components/brand-card.tsx, BrandHub's) and its latest release with what
 * that changed; beside them the Brand Agent Score and the signals that say
 * it is read.
 */

/** GET /api/v1/brands/{slug}/insights, as far as the Overview reads it. */
export type BrandSignals = { days: number; pulls: number; views: number; adoption: { release: { number: number }; share: number | null } | null };
export type { Release };

export type BrandOverviewProps = {
  brand: BrandInfo & { from?: string | null };
  /** This server's address (APP_URL): where agents reach it. */
  origin: string;
  rules: Rule[];
  status: Status | null;
  release: Release | null;
  /** What the latest release changed since the one before it, in brief (lib/history.ts releaseSummary). */
  changes: string[] | null;
  /** null: this person may not read Insights. */
  signals: BrandSignals | null;
  /** The brand card: the live release (`live`, its number) as readers see it, else the draft. */
  card: { brand: CardBrand; live: number | null };
  /** Open comment threads (lib/comments.ts openCounts); null: this person may not read them. */
  comments: number | null;
  /** Where the strip's actions go, for whoever may take them: Release, and the builder to review comments. */
  links: { release?: string; review?: string };
};

export function BrandOverview({ brand, origin, rules, status, release, changes, signals, card, comments, links }: BrandOverviewProps) {
  const tagline = taglineOf(rules);

  return (
    <>
      <AppHeader trail={[{ label: "Brands", href: "/brands" }, { label: brand.name }]} />
      <BrandHeader brand={brand} origin={origin} rules={rules} status={status} release={release} at="overview" />
      <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 pt-6 pb-16 md:px-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <TeamStrip slug={brand.slug} status={status} signals={signals} comments={comments} links={links} />
        <div className="grid min-w-0 content-start gap-4">
          <Box title="About">
            <p className="text-sm">{tagline ?? <span className="text-muted-foreground">No line yet: say what the brand is in its voice rules.</span>}</p>
            {brand.from && (
              <div className="grid content-start gap-0.5 text-sm">
                <Label>Lineage</Label>
                <p>
                  Started from <b className="font-medium">{brand.from}</b> on BrandHub
                </p>
              </div>
            )}
          </Box>

          <section className="bg-card min-w-0 overflow-hidden rounded-xl border">
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <h2 className="font-medium">{card.live ? "What readers see" : "Draft"}</h2>
              <span className="text-muted-foreground text-xs">{card.live ? `@${card.live}` : release ? "Not what readers see yet" : "Never released"}</span>
            </div>
            <BrandCard
              brand={card.brand}
              empty={<p className="text-muted-foreground border-t px-5 py-4 text-sm">Nothing to show yet: add colors, typefaces and logos in the guidelines&apos; rules.</p>}
            />
          </section>

          <Box title="Latest release" aside={release && <Badge variant="secondary">@{release.number}</Badge>}>
            {release ? (
              <>
                {release.note && <p className="text-sm">{release.note}</p>}
                <p className="text-muted-foreground text-xs">
                  {[...(changes ?? []), ago(release.publishedAt)].join(" · ")}
                </p>
                {status?.publish === "behind" && <p className="text-muted-foreground text-xs">There are changes readers don&apos;t see yet.</p>}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">Never released: portals and BrandHub show nothing of it yet.</p>
            )}
          </Box>
        </div>

        <aside className="grid content-start gap-4">
          {status && <AgentScore status={status} slug={brand.slug} />}

          {signals && (
            <Box title="Signals" icon={<IconChartBar />}>
              <dl className="grid grid-cols-2 gap-3">
                <Signal label={`BrandHub pulls, ${signals.days} days`} value={signals.pulls} />
                <Signal label={`portal page views, ${signals.days} days`} value={signals.views} />
                {status?.portals && <Signal label={status.portals.length === 1 ? "portal" : "portals"} value={status.portals.length} />}
              </dl>
            </Box>
          )}
        </aside>
      </div>
    </>
  );
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * What the team has to do, above the card, one row: changes readers don't
 * see yet (Release, for whoever may), open comments, the score's next fix,
 * and how much of the fetching reads the live release. Each only when this
 * person may see it.
 */
function TeamStrip({ slug, status, signals, comments, links }: Pick<BrandOverviewProps, "status" | "signals" | "comments" | "links"> & { slug: string }) {
  // Releasing is the strip's first item already.
  const fix = status?.steps.find((s) => s.done === false && s.id !== "publish");
  const adoption = signals?.adoption?.share != null ? signals.adoption : null;
  const item = "bg-card flex min-w-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm [&_svg]:size-4 [&_svg]:shrink-0";
  const link = "text-primary-ink font-medium hover:underline";
  return (
    <ul aria-label="For the team" className="flex flex-wrap gap-2 lg:col-span-2">
      {status && (
        <li className={item}>
          <IconGitCommit aria-hidden className="text-muted-foreground" />
          {status.publish === "current" ? `Up to date with @${status.live}` : status.publish === "behind" ? "Unreleased changes" : "Never released"}
          {status.publish !== "current" && links.release && (
            <Link href={links.release} className={link}>
              Release
            </Link>
          )}
        </li>
      )}
      {comments !== null && (
        <li className={item}>
          <IconMessage aria-hidden className="text-muted-foreground" />
          {comments > 0 && links.review ? (
            <Link href={links.review} className={link}>
              {plural(comments, "open comment")}
            </Link>
          ) : comments > 0 ? (
            plural(comments, "open comment")
          ) : (
            "No open comments"
          )}
        </li>
      )}
      {status && (
        <li className={item}>
          <IconRobot aria-hidden className="text-muted-foreground" />
          {/* A step this person can't see through (null) is not a fix to name. */}
          <Link href={brandPath(slug, "/score")} title={fix?.detail} className={cn(link, "truncate")}>
            {fix ? `Next fix: ${fix.title}, +${fix.points}` : `Score ${status.score}`}
          </Link>
        </li>
      )}
      {adoption && (
        <li className={item}>
          <IconChartBar aria-hidden className="text-muted-foreground" />
          <span>
            <b className="font-medium tabular-nums">{adoption.share}%</b> of fetches on @{adoption.release.number}
          </span>
        </li>
      )}
    </ul>
  );
}

/** "2 fixes would get you to 90": the fixes worth the most, what the score would be once they are done. */
export function nextFixes(status: Pick<Status, "score" | "steps">, n = 2) {
  const fixes = status.steps.filter((s) => s.done === false).sort((a, b) => b.points - a.points).slice(0, n);
  return { fixes, to: Math.min(100, status.score + fixes.reduce((t, s) => t + s.points, 0)) };
}

/**
 * The Brand Agent Score (lib/readiness.ts), the brand's health meter in place
 * of the launch checklist: the score as a ring, and what the two fixes worth
 * the most would make it, opening the score's own page.
 */
function AgentScore({ status, slug }: { status: Status; slug: string }) {
  const { fixes, to } = nextFixes(status);
  return (
    <Link href={brandPath(slug, "/score")} className="bg-card hover:border-foreground/30 flex items-center gap-4 rounded-xl border p-4">
      <ScoreRing score={status.score} />
      <div className="grid gap-0.5">
        <h2 className="flex items-center gap-1.5 font-medium [&_svg]:size-4">
          <IconRobot aria-hidden /> Brand Agent Score
        </h2>
        <p className="text-muted-foreground text-sm">
          {fixes.length ? `${fixes.length} ${fixes.length === 1 ? "fix" : "fixes"} would get you to ${to}` : "Everything an agent needs is here."}
        </p>
      </div>
    </Link>
  );
}

/** The score, of 100, as a ring filling up. */
export function ScoreRing({ score, size = 88 }: { score: number; size?: number }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  // The ring fills and the number counts up to the score, the first time and whenever it moves.
  const shown = useCountUp(score);
  return (
    <svg viewBox="0 0 92 92" width={size} height={size} role="img" aria-label={`Score ${score} of 100`} className="shrink-0">
      <circle cx="46" cy="46" r={r} fill="none" strokeWidth="9" className="stroke-muted" />
      <circle
        cx="46"
        cy="46"
        r={r}
        fill="none"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={c.toFixed(1)}
        strokeDashoffset={(c * (1 - shown / 100)).toFixed(1)}
        transform="rotate(-90 46 46)"
        className="stroke-primary"
      />
      <text x="46" y="53" textAnchor="middle" className="fill-foreground font-display text-[22px] font-semibold tabular-nums">
        {shown}
      </text>
    </svg>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground text-2xs font-semibold tracking-wide uppercase">{children}</span>;
}

/** A card of the Overview: its title, what it says beside the title (`aside`), and its body. */
function Box({ title, icon, aside, children }: { title: string; icon?: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-card grid gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-medium [&_svg]:size-4">
          {icon} {title}
        </h2>
        {aside && <span className="text-muted-foreground text-xs">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Signal({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-display text-xl font-semibold tabular-nums">{value.toLocaleString()}</dd>
    </div>
  );
}
