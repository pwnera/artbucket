"use client";

import Link from "next/link";
import { IconChartBar, IconGitCommit, IconMessage, IconRobot } from "@/components/icons";
import { BrandCard, type CardBrand } from "@/components/brand-card";
import type { BrandInfo } from "@/components/brand-switcher";
import type { Status } from "@/components/builder/use-status";
import { Badge } from "@/components/ui/badge";
import type { Release } from "@/lib/brand-head";
import { ago, taglineOf } from "@/lib/hub";
import type { Rule } from "@/lib/rules";
import { brandPath } from "@/lib/site";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/lib/motion";

/**
 * A brand's Overview, the tab it opens on (PRD section 12, the brand card, as
 * the prototype's repository page draws it): under the header ((tabs)/layout.tsx), what it is
 * (its line, where it came from), the card readers see
 * (components/brand-card.tsx, BrandHub's) and its latest release with what
 * that changed; beside them its health: the Brand Agent Score and the
 * signals that say it is read, each opening its own page.
 */

/** GET /api/v1/brands/{slug}/insights, as far as the Overview reads it. */
export type BrandSignals = { days: number; pulls: number; views: number; adoption: { release: { number: number }; share: number | null } | null };
export type { Release };

export type BrandOverviewProps = {
  brand: BrandInfo & { from?: string | null };
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

export function BrandOverview({ brand, rules, status, release, changes, signals, card, comments, links }: BrandOverviewProps) {
  const tagline = taglineOf(rules);

  return (
    <>
      <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 pt-6 pb-16 md:px-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <TeamStrip slug={brand.slug} status={status} signals={signals} comments={comments} links={links} />
        <div className="grid min-w-0 content-start gap-4">
          <Box title="About">
            <p className="text-sm">{tagline ?? <span className="text-muted-foreground">No line yet: add one in its voice rules.</span>}</p>
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
              {/* Never released: the strip above says so once, with Release. */}
              {(card.live || release) && <span className="text-muted-foreground text-xs">{card.live ? `@${card.live}` : "Unreleased"}</span>}
            </div>
            <BrandCard
              brand={card.brand}
              empty={<p className="text-muted-foreground border-t px-5 py-4 text-sm">Nothing yet: add colors, type and logos in the rules.</p>}
            />
          </section>

          {/* Never released: nothing to say here the strip doesn't. */}
          {release && (
            <Box title="Latest release" aside={<Badge variant="secondary">@{release.number}</Badge>}>
              {release.note && <p className="text-sm">{release.note}</p>}
              <p className="text-muted-foreground text-xs">{[...(changes ?? []), ago(release.publishedAt)].join(" · ")}</p>
              {status?.publish === "behind" && <p className="text-muted-foreground text-xs">Unreleased changes.</p>}
            </Box>
          )}
        </div>

        {/* Stays in view beside the draft, which runs long. */}
        <aside className="grid content-start gap-4 lg:sticky lg:top-6 lg:self-start">
          {(status || signals) && <Health slug={brand.slug} status={status} signals={signals} released={!!release} />}
        </aside>
      </div>
    </>
  );
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** Each step of the score as something to do, and the tab it is done on. */
const NEXT: Record<string, { label: string; tab: string }> = {
  colors: { label: "Add the main color", tab: "/rules" },
  type: { label: "Name the typefaces", tab: "/rules" },
  logo: { label: "Attach the logo", tab: "/rules" },
  voice: { label: "Describe the voice", tab: "/rules" },
  look: { label: "Pick a look", tab: "/theme" },
  pages: { label: "Fill in the pages", tab: "/guidelines" },
  portal: { label: "Share it on a portal", tab: "/sharing" },
};

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
          {/* A step this person can't see through (null) is not a fix to name. It links where the fix is made. */}
          {fix ? (
            <>
              <Link href={brandPath(slug, NEXT[fix.id]?.tab ?? "/score")} title={fix.detail} className={cn(link, "truncate")}>
                {NEXT[fix.id]?.label ?? fix.title}
              </Link>
              <span className="text-muted-foreground shrink-0 tabular-nums">+{fix.points} score</span>
            </>
          ) : (
            <Link href={brandPath(slug, "/score")} className={link}>
              Agent Score {status.score}
            </Link>
          )}
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
 * Is the brand in good shape, and is it read: one box. The Brand Agent Score
 * (lib/readiness.ts) as a ring with what the two fixes worth the most would
 * make it, then the signals (Insights' summary), each opening its own page.
 */
function Health({ slug, status, signals, released }: { slug: string; status: Status | null; signals: BrandSignals | null; released: boolean }) {
  const next = status && nextFixes(status);
  const link = "text-primary-ink text-sm font-medium hover:underline";
  return (
    <section aria-labelledby="health" className="bg-card grid gap-4 rounded-xl border p-4">
      <h2 id="health" className="font-medium">
        Health
      </h2>
      {status && next && (
        <div className="flex items-center gap-4">
          <ScoreRing score={status.score} size={72} />
          <div className="grid gap-1">
            <p className="flex items-center gap-1.5 text-sm font-medium [&_svg]:size-4">
              <IconRobot aria-hidden /> Brand Agent Score
            </p>
            <p className="text-muted-foreground text-sm">
              {next.fixes.length ? `${next.fixes.length} ${next.fixes.length === 1 ? "fix" : "fixes"} would get you to ${next.to}` : "Everything an agent needs is here."}
            </p>
            <Link href={brandPath(slug, "/score")} className={link}>
              Score details
            </Link>
          </div>
        </div>
      )}
      {signals && (
        <div className="grid gap-3 border-t pt-4">
          <p className="flex items-center gap-1.5 text-sm font-medium [&_svg]:size-4">
            <IconChartBar aria-hidden /> Read in the last {signals.days} days
          </p>
          {released ? (
            <dl className="grid grid-cols-2 gap-3">
              <Signal label="BrandHub pulls" value={signals.pulls} />
              <Signal label="Portal page views" value={signals.views} />
              {status?.portals && <Signal label={status.portals.length === 1 ? "Portal" : "Portals"} value={status.portals.length} />}
            </dl>
          ) : (
            <p className="text-muted-foreground text-sm">Nothing to read yet: portals, BrandHub and agents get it from its first release.</p>
          )}
          <Link href={brandPath(slug, "/insights")} className={link}>
            All insights
          </Link>
        </div>
      )}
    </section>
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
