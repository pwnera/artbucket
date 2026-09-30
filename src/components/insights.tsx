"use client";

import Link from "next/link";
import { IconAlertTriangle, IconChartBar, IconCheck } from "@tabler/icons-react";
import { AppHeader, PageHeader } from "@/components/page";
import { Group } from "@/components/settings/panels";
import { REASON } from "@/lib/insights";
import { formatSize } from "@/lib/limits";
import { ago, exact } from "@/lib/time";
import { cn } from "@/lib/utils";

type Asset = { id: string; title: string; version: number | null; preview: boolean; supersededBy: string | null };

/** GET /api/v1/insights, as lib/schemas.ts Insights has it. */
export type InsightsData = {
  days: number;
  weeks: number;
  answers: { week: string; person: number; agent: number; anonymous: number }[];
  adoption: { week: string; current: number; superseded: number }[];
  stale: { asset: Asset; replacement: Asset | null; referrer: string | null; fetches: number; last: string }[];
  top: { asset: Asset; total: number; surfaces: Partial<Record<string, number>> }[];
  gaps: { q: string; searches: number; last: string }[];
  checks: {
    allowed: number;
    refused: number;
    reasons: { code: string; count: number }[];
    log: { id: string; at: string; asset: Asset; surface: string; client: string | null; context: string | null; reasons: string[]; offered: { asset: Asset; taken: boolean }[] }[];
  };
  delivery: { day: string; requests: number; bytes: number }[];
  pageViews: { portal: { id: string; name: string }; brand: { slug: string; name: string }; page: string; views: number }[];
};

const SURFACE: Record<string, string> = { app: "App", api: "API", mcp: "MCP", portal: "Portal", share: "Share link", hub: "BrandHub", link: "Signed link", public: "Public" };

/** A UTC day, short: "Sep 28". */
const date = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** An asset, linked to where the library opens it, with its version when it has several. */
function AssetLink({ a }: { a: Asset }) {
  return (
    <Link href={`/?asset=${a.id}`} className="hover:underline">
      {a.title}
      {a.version !== null && <span className="text-muted-foreground"> v{a.version}</span>}
    </Link>
  );
}

type Series<R> = { key: keyof R & string; label: string; className: string };

/**
 * Stacked bars, one per row, oldest first: plain boxes, no chart library.
 * Each bar says its numbers on hover; the whole says its totals to screen readers.
 */
function Bars<R extends Record<string, number | string>>({ rows, series, x }: { rows: R[]; series: Series<R>[]; x: (r: R) => string }) {
  const total = (r: R) => sum(series.map((s) => Number(r[s.key])));
  const max = Math.max(1, ...rows.map(total));
  const label = series.map((s) => `${s.label}: ${sum(rows.map((r) => Number(r[s.key]))).toLocaleString()}`).join(", ");
  return (
    <div className="grid gap-2">
      <div role="img" aria-label={`From ${x(rows[0])} to ${x(rows.at(-1)!)}. ${label}`} className="flex h-32 items-end gap-1 border-b">
        {rows.map((r, i) => (
          <div
            key={i}
            title={`${x(r)}: ${series.map((s) => `${s.label} ${Number(r[s.key]).toLocaleString()}`).join(", ")}`}
            className="flex h-full min-w-0 flex-1 flex-col-reverse"
          >
            {series.map((s) => (
              <div key={s.key} className={cn("w-full first:rounded-b-none last:rounded-t-sm", s.className)} style={{ height: `${(Number(r[s.key]) / max) * 100}%` }} />
            ))}
          </div>
        ))}
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="tabular-nums">
          {x(rows[0])} to {x(rows.at(-1)!)}
        </span>
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("size-2.5 rounded-sm", s.className)} />
            {s.label} <span className="tabular-nums">{sum(rows.map((r) => Number(r[s.key]))).toLocaleString()}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const None = ({ children }: { children: React.ReactNode }) => <p className="text-muted-foreground text-sm">{children}</p>;

/** A table's cells, the one way. */
const th = "py-1.5 font-medium";
const td = "py-1.5";

/**
 * Insights v1 (PRD section 11): brand answers, release adoption and who is
 * still on an old version, the most used assets by surface, search gaps,
 * and the delivery and page-view counts that lived in Usage and Portals.
 */
export function Insights({ data }: { data: InsightsData | null }) {
  const sites = new Set(data?.stale.flatMap((s) => s.referrer ?? []) ?? []);
  return (
    <>
      <AppHeader trail={[{ label: "Insights" }]} />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-6 pb-16 md:px-6">
        <PageHeader
          icon={<IconChartBar />}
          title="Insights"
          description="What gets used, by whom and through which surface. Counted in this server's own database: no IP addresses, no names of people, no full URLs, and nothing sent anywhere."
        />
        {!data ? (
          <None>Insights couldn&apos;t load. Nothing has changed; try again in a moment.</None>
        ) : (
          <>
            {sites.size > 0 && (
              <p role="status" className="border-warning/40 bg-warning/10 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <IconAlertTriangle aria-hidden className="text-warning size-4 shrink-0" />
                {sites.size === 1 ? "1 site still loads" : `${sites.size} sites still load`} a replaced version. See who below.
              </p>
            )}

            <Group
              title="Brand answers per week"
              description="Every time a person, a portal visitor or an agent got something from the brand: a file, a hub listing, a use checked, a search that found something."
            >
              <Bars
                rows={data.answers}
                x={(r) => date(r.week)}
                series={[
                  { key: "person", label: "People", className: "bg-primary" },
                  { key: "agent", label: "Agents", className: "bg-primary/50" },
                  { key: "anonymous", label: "Visitors", className: "bg-muted-foreground/40" },
                ]}
              />
            </Group>

            <Group title="Release adoption" description="Fetches per week of the current version of an asset, and of one that was already replaced when it went out.">
              <Bars
                rows={data.adoption}
                x={(r) => date(r.week)}
                series={[
                  { key: "current", label: "Current", className: "bg-success" },
                  { key: "superseded", label: "Replaced", className: "bg-warning" },
                ]}
              />
            </Group>

            <Group title="Still on the old release" description={`Replaced versions fetched in the last ${data.days} days, and the sites that load them.`}>
              {data.stale.length === 0 ? (
                <None>Nobody loaded a replaced version lately.</None>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-muted-foreground text-left text-xs">
                      <tr>
                        <th className={th}>Version</th>
                        <th className={th}>Replaced by</th>
                        <th className={th}>Loaded from</th>
                        <th className={cn(th, "text-right")}>Fetches</th>
                        <th className={cn(th, "text-right")}>Last</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.stale.map((s) => (
                        <tr key={`${s.asset.id}/${s.referrer}`}>
                          <td className={td}>
                            <AssetLink a={s.asset} />
                          </td>
                          <td className={td}>{s.replacement ? <AssetLink a={s.replacement} /> : <span className="text-muted-foreground">Gone</span>}</td>
                          <td className={td}>{s.referrer ?? <span className="text-muted-foreground">Not said</span>}</td>
                          <td className={cn(td, "text-right tabular-nums")}>{s.fetches.toLocaleString()}</td>
                          <td className={cn(td, "text-right tabular-nums")}>{date(s.last)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Group>

            <Group title="Most used assets" description={`The ten most fetched in the last ${data.days} days, and through what: the app, an agent's key, a portal, a signed link, a public embed.`}>
              {data.top.length === 0 ? (
                <None>Nothing fetched yet. Each file served outside the library&apos;s own pages counts here.</None>
              ) : (
                <ol className="divide-y text-sm">
                  {data.top.map((t) => (
                    <li key={t.asset.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5">
                      <span className="min-w-0 flex-1 truncate">
                        <AssetLink a={t.asset} />
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {Object.entries(t.surfaces)
                          .sort(([, a], [, b]) => b! - a!)
                          .map(([s, count]) => `${SURFACE[s] ?? s} ${count!.toLocaleString()}`)
                          .join(" · ")}
                      </span>
                      <span className="w-16 text-right font-medium tabular-nums">{t.total.toLocaleString()}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Group>

            <Group title="Search gaps" description={`What people and agents searched for in the last ${data.days} days and didn't find, in the app, on portals and over MCP.`}>
              {data.gaps.length === 0 ? (
                <None>Every search found something.</None>
              ) : (
                <ol className="divide-y text-sm">
                  {data.gaps.map((g) => (
                    <li key={g.q} className="flex items-baseline gap-3 py-1.5">
                      <span className="min-w-0 flex-1 truncate">&ldquo;{g.q}&rdquo;</span>
                      <span className="text-muted-foreground text-xs tabular-nums">{date(g.last)}</span>
                      <span className="w-16 text-right tabular-nums">{g.searches.toLocaleString()}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Group>

            <Group
              title="Use checks"
              description={`What check_use and the check API answered in the last ${data.days} days: ${data.checks.allowed.toLocaleString()} allowed, ${data.checks.refused.toLocaleString()} refused. Each refusal names what to use instead; taken means the same client used it afterwards.`}
            >
              {data.checks.refused === 0 ? (
                <None>Nothing refused.</None>
              ) : (
                <>
                  <ul aria-label="Refusals by reason" className="flex flex-wrap gap-2 text-sm">
                    {data.checks.reasons.map((r) => (
                      <li key={r.code} className="rounded-md border px-2 py-0.5">
                        {REASON[r.code] ?? r.code} <span className="text-muted-foreground tabular-nums">{r.count.toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                  <ol aria-label="Latest refusals" className="divide-y text-sm">
                    {data.checks.log.map((c) => (
                      <li key={c.id} className="grid gap-0.5 py-2">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <AssetLink a={c.asset} />
                          <span className="text-muted-foreground text-xs">
                            {c.reasons.map((r) => REASON[r] ?? r).join(", ")}
                            {c.context && `, for ${c.context}`}
                          </span>
                          <span className="text-muted-foreground ml-auto text-xs" title={exact(c.at)} suppressHydrationWarning>
                            {c.client ?? SURFACE[c.surface] ?? c.surface}, {ago(c.at)}
                          </span>
                        </div>
                        {c.offered.length > 0 && (
                          <p className="text-muted-foreground text-xs">
                            Offered{" "}
                            {c.offered.map((o, i) => (
                              <span key={o.asset.id}>
                                {i > 0 && ", "}
                                <AssetLink a={o.asset} />
                                {o.taken && (
                                  <span className="text-success">
                                    {" "}
                                    <IconCheck aria-hidden className="inline size-3.5" />
                                    taken
                                  </span>
                                )}
                              </span>
                            ))}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </Group>

            <Group title={`Delivery, last ${data.days} days`} description="What asset URLs served from this workspace per day: originals, renditions and downloads, the app's own thumbnails included.">
              {data.delivery.length === 0 ? (
                <None>Nothing served in the last {data.days} days.</None>
              ) : (
                <>
                  <Bars rows={data.delivery} x={(r) => date(r.day)} series={[{ key: "requests", label: "Requests", className: "bg-primary" }]} />
                  <p className="text-muted-foreground text-xs">{formatSize(sum(data.delivery.map((d) => d.bytes)))} served.</p>
                </>
              )}
            </Group>

            <Group title={`Portal page views, last ${data.days} days`} description="Each page a portal visitor opens counts, a day at a time.">
              {data.pageViews.length === 0 ? (
                <None>None yet.</None>
              ) : (
                <ol aria-label="Page views" className="divide-y text-sm">
                  {data.pageViews.map((p) => (
                    <li key={`${p.portal.id}/${p.brand.slug}/${p.page}`} className="flex items-baseline gap-3 py-1.5">
                      <span className="min-w-0 flex-1 truncate">
                        <span className="text-muted-foreground">
                          {p.portal.name}, {p.brand.name}:{" "}
                        </span>
                        {p.page}
                      </span>
                      <span className="w-16 text-right tabular-nums">{p.views.toLocaleString()}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Group>
          </>
        )}
      </div>
    </>
  );
}
