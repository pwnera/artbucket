"use client";

import { IconChartBar, IconRobot, IconTypography } from "@tabler/icons-react";
import { BrandHeader } from "@/components/brand-header";
import type { BrandInfo } from "@/components/brand-switcher";
import type { Status } from "@/components/builder/use-status";
import { AppHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import type { Release } from "@/lib/brand-head";
import { inkOn } from "@/lib/color";
import { ago, taglineOf } from "@/lib/hub";
import { plainText } from "@/lib/markdown";
import { contextLabel, type FontValue, ruleName, type Rule } from "@/lib/rules";

/**
 * A brand's Overview, the tab it opens on (PRD section 12, the brand card, as
 * the prototype's repository page draws it): under the header, what it is
 * (its line, its usage terms, where it came from), its colors and its latest
 * release with what that changed; beside them the Brand Agent Score, the
 * signals that say it is read, and its typefaces. Everything comes from
 * /api/v1 like any client's.
 */

/** GET /api/v1/brands/{slug}/insights. */
export type BrandSignals = { days: number; pulls: number; views: number };
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
};

const HEX = /^#[0-9a-f]{6}$/i;
/** Swatches the card shows; the rest are counted. */
const SWATCHES = 8;

export function BrandOverview({ brand, origin, rules, status, release, changes, signals }: BrandOverviewProps) {
  const own = rules.filter((r) => !r.context);
  const colors = own.filter((r) => r.type === "color" && typeof r.value === "string");
  const contexts = [...new Set(rules.filter((r) => r.type === "color" && r.context).map((r) => contextLabel(r.context!)))];
  // The heading face first, as the card sets it large.
  const faces = own
    .filter((r) => r.type === "font" && typeof r.value === "object" && r.value && "family" in r.value)
    .sort((a, b) => Number(/head|display/.test(b.key)) - Number(/head|display/.test(a.key)));
  const tagline = taglineOf(rules);
  const terms = status?.hub?.terms ? plainText(status.hub.terms) : null;

  return (
    <>
      <AppHeader trail={[{ label: "Brands", href: "/brands" }, { label: brand.name }]} />
      <BrandHeader brand={brand} origin={origin} rules={rules} hub={status?.hub ?? null} release={release} at="overview" />
      <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 pt-6 pb-16 md:px-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 content-start gap-4">
          <Box title="About">
            <p className="text-sm">{tagline ?? <span className="text-muted-foreground">No line yet: say what the brand is in its voice rules.</span>}</p>
            {(terms || brand.from) && (
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                {terms && (
                  <div className="grid content-start gap-0.5">
                    <Label>Usage terms</Label>
                    <p className="line-clamp-3">{terms}</p>
                  </div>
                )}
                {brand.from && (
                  <div className="grid content-start gap-0.5">
                    <Label>Lineage</Label>
                    <p>
                      Started from <b className="font-medium">{brand.from}</b> on BrandHub
                    </p>
                  </div>
                )}
              </div>
            )}
          </Box>

          <Box title="Colors" aside={colors.length > 0 && `${Math.min(colors.length, SWATCHES)} of ${colors.length} · contexts: ${["Default", ...contexts].join(", ")}`}>
            {colors.length ? (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {colors.slice(0, SWATCHES).map((r) => {
                  const hex = String(r.value);
                  return (
                    <li key={r.key} className="grid gap-1">
                      <div className="flex h-14 items-end rounded-lg border p-2 font-mono text-xs" style={{ background: hex, color: HEX.test(hex) ? inkOn(hex) : undefined }}>
                        {hex}
                      </div>
                      <small className="text-muted-foreground truncate font-mono text-xs" title={ruleName(r)}>
                        {r.key}
                      </small>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">No colors yet: add them in the guidelines&apos; rules.</p>
            )}
          </Box>

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
          {status && <AgentScore status={status} />}

          {signals && (
            <Box title="Signals" icon={<IconChartBar />}>
              <dl className="grid grid-cols-2 gap-3">
                <Signal label={`hub pulls, ${signals.days} days`} value={signals.pulls} />
                <Signal label={`portal page views, ${signals.days} days`} value={signals.views} />
                {status?.portals && <Signal label={status.portals.length === 1 ? "portal" : "portals"} value={status.portals.length} />}
              </dl>
            </Box>
          )}

          <Box title="Typefaces" icon={<IconTypography />}>
            {faces.length ? (
              <>
                <p className="font-display truncate text-xl font-semibold" style={{ fontFamily: (faces[0].value as FontValue).family }}>
                  {(faces[0].value as FontValue).family}
                </p>
                {faces.slice(1).map((r) => (
                  <p key={r.key} className="truncate text-sm">
                    {(r.value as FontValue).family} <span className="text-muted-foreground">for {ruleName(r).toLowerCase()}</span>
                  </p>
                ))}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">No typefaces yet.</p>
            )}
          </Box>
        </aside>
      </div>
    </>
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
 * the most would make it.
 */
function AgentScore({ status }: { status: Status }) {
  const { fixes, to } = nextFixes(status);
  return (
    <section className="bg-card flex items-center gap-4 rounded-xl border p-4">
      <ScoreRing score={status.score} />
      <div className="grid gap-0.5">
        <h2 className="flex items-center gap-1.5 font-medium [&_svg]:size-4">
          <IconRobot aria-hidden /> Brand Agent Score
        </h2>
        <p className="text-muted-foreground text-sm">
          {fixes.length ? `${fixes.length} ${fixes.length === 1 ? "fix" : "fixes"} would get you to ${to}` : "Everything an agent needs is here."}
        </p>
      </div>
    </section>
  );
}

/** The score, of 100, as a ring filling up. */
export function ScoreRing({ score, size = 88 }: { score: number; size?: number }) {
  const r = 38;
  const c = 2 * Math.PI * r;
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
        strokeDashoffset={(c * (1 - score / 100)).toFixed(1)}
        transform="rotate(-90 46 46)"
        className="stroke-primary"
      />
      <text x="46" y="53" textAnchor="middle" className="fill-foreground font-display text-[22px] font-semibold">
        {score}
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

function Signal({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-display text-xl font-semibold tabular-nums">{value.toLocaleString()}</dd>
    </div>
  );
}
