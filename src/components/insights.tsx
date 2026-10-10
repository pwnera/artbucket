"use client";

import { useState } from "react";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { IconAlertTriangle, IconChartBar, IconCheck, IconDownload } from "@tabler/icons-react";
import { BarList, Breakdown, change, ComboChart, halves, Kpis, short, type Kpi } from "@/components/analytics";
import { TabNav } from "@/components/hub";
import { InfoTip } from "@/components/info-tip";
import { AppHeader, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Group } from "@/components/settings/panels";
import { REASON } from "@/lib/insights";
import { formatSize } from "@/lib/limits";
import { ago, exact } from "@/lib/time";
import { cn } from "@/lib/utils";

export type Asset = { id: string; title: string; version: number | null; preview: boolean; supersededBy: string | null };

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

export const SURFACE: Record<string, string> = { app: "App", api: "API", mcp: "MCP", portal: "Portal", share: "Share link", hub: "BrandHub", link: "Signed link", public: "Public" };

/** A UTC day, short: "Sep 28". */
export const date = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** An asset, linked to where the library opens it, with its version when it has several. */
export function AssetLink({ a }: { a: Asset }) {
  return (
    <Link href={`/?asset=${a.id}`} className="hover:underline">
      {a.title}
      {a.version !== null && <span className="text-muted-foreground"> v{a.version}</span>}
    </Link>
  );
}

export const None = ({ children }: { children: React.ReactNode }) => <p className="text-muted-foreground text-sm">{children}</p>;

/** A table's cells, the one way. */
export const th = "py-1.5 font-medium";
export const td = "py-1.5";

export type InsightsTab = "overview" | "checks";

/**
 * Insights v1 (PRD section 11), in two tabs. Overview: brand answers,
 * release adoption and who is still on an old version, the most used assets
 * by surface, search gaps, and the delivery and page-view counts that lived
 * in Usage and Portals. Use checks (/insights/checks): the use-check log.
 * The frame (header and tabs) is the layout's, so it stays while a tab
 * changes; the tab on show is read from the address.
 */
export function InsightsFrame({ refused, children }: { refused: number | undefined; children: React.ReactNode }) {
  const tab = useSelectedLayoutSegment();
  const checks = tab === "checks";
  const activity = tab === "activity";
  const title = checks ? "Use checks" : activity ? "Activity" : null;
  return (
    <>
      <AppHeader trail={title ? [{ label: "Insights", href: "/insights" }, { label: title }] : [{ label: "Insights" }]} />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 pb-16 md:px-6">
        <PageHeader
          icon={<IconChartBar />}
          title={title ?? "Insights"}
          aside={
            <InfoTip>
              {checks
                ? "Every use checked, by a person, a portal visitor or an agent: what was refused, why, what was offered instead, and whether it was taken."
                : activity
                  ? "Who did what in this project: uploads, reviews, deletes and brand changes, by people and by agents."
                  : "Brand answers count every file served, listing read, use checked and search that finds something. Counted in this server's own database: no IP addresses, no names of people, no full URLs, nothing sent anywhere."}
            </InfoTip>
          }
        />
        <div className="-mt-2 border-b">
          <TabNav
            label="Insights"
            items={[
              { href: "/insights", label: "Overview", current: !title },
              { href: "/insights/checks", label: "Use checks", current: checks, count: refused || undefined },
              { href: "/insights/activity", label: "Activity", current: activity },
            ]}
          />
        </div>
        {children}
      </div>
    </>
  );
}

/** A tab's body, under the frame. */
export function InsightsBody({ data, tab = "overview" }: { data: InsightsData | null; tab?: InsightsTab }) {
  if (!data) return <None>Insights couldn&apos;t load. Try again in a moment.</None>;
  return tab === "checks" ? <UseChecks data={data} /> : <Overview data={data} />;
}

type Chart = "answers" | "delivery" | "adoption";
const CHART: Record<string, Chart> = { answers: "answers", agents: "answers", requests: "delivery", bytes: "delivery", current: "adoption" };

/** How the share of fetches on the current version moved, the second half of the weeks against the first. */
function share(weeks: InsightsData["adoption"]) {
  const h = Math.floor(weeks.length / 2);
  const of = (ws: InsightsData["adoption"]) => {
    const [c, r] = [sum(ws.map((w) => w.current)), sum(ws.map((w) => w.superseded))];
    return c + r ? c / (c + r) : 0;
  };
  return change(of(weeks.slice(weeks.length - h)), of(weeks.slice(0, h)));
}

/** Rows summed by a key: the same rows, regrouped for another tab. */
function regroup<T>(xs: T[], key: (x: T) => string, value: (x: T) => number) {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + value(x));
  return [...m].sort((a, b) => b[1] - a[1]);
}

/**
 * The overview, as DataFast lays out a site's traffic: the numbers across
 * the top of one card, each picking the chart under it (brand answers a
 * week, delivery a day, release adoption a week), then breakdowns, a card
 * each: assets, where answers went, portal pages, and what people and
 * agents asked for and didn't get.
 */
function Overview({ data }: { data: InsightsData }) {
  const [picked, setPicked] = useState("answers");
  const sites = new Set(data.stale.flatMap((s) => s.referrer ?? []));
  const answers = data.answers.map((a) => ({ ...a, total: a.person + a.agent + a.anonymous }));
  const total = sum(answers.map((a) => a.total));
  const agents = sum(answers.map((a) => a.agent));
  const [current, replaced] = [sum(data.adoption.map((a) => a.current)), sum(data.adoption.map((a) => a.superseded))];
  const weeks = `vs the ${Math.floor(data.weeks / 2)} weeks before`;
  const days = `vs the ${Math.floor(data.days / 2)} days before`;
  const kpis: Kpi[] = [
    { id: "answers", label: "Brand answers", value: short(total), delta: halves(answers.map((a) => a.total)), against: weeks, chart: true },
    { id: "agents", label: "By agents", value: total ? `${Math.round((100 * agents) / total)}%` : "0%", delta: halves(answers.map((a) => a.agent)), against: weeks, chart: true },
    { id: "requests", label: "Requests", value: short(sum(data.delivery.map((d) => d.requests))), delta: halves(data.delivery.map((d) => d.requests)), against: days, chart: true },
    { id: "bytes", label: "Served", value: formatSize(sum(data.delivery.map((d) => d.bytes))), delta: halves(data.delivery.map((d) => d.bytes)), against: days, chart: true },
    {
      id: "current",
      label: "On the current version",
      value: current + replaced ? `${Math.round((100 * current) / (current + replaced))}%` : "None",
      delta: share(data.adoption),
      against: weeks,
      chart: true,
    },
    { id: "refused", label: "Uses refused", value: short(data.checks.refused), delta: undefined },
  ];
  const chart = CHART[picked] ?? "answers";
  const surfaces = regroup(
    data.top.flatMap((t) => Object.entries(t.surfaces)),
    ([s]) => s,
    ([, n]) => n ?? 0,
  );
  const on = (n: number) => `${n.toLocaleString()} ${n === 1 ? "fetch" : "fetches"}`;
  return (
    <>
      {sites.size > 0 && (
        <p role="status" className="border-warning/40 bg-warning/10 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <IconAlertTriangle aria-hidden className="text-warning size-4 shrink-0" />
          {sites.size === 1 ? "1 site still loads" : `${sites.size} sites still load`} a replaced version: see Where from, Old versions.
        </p>
      )}

      <section aria-label="Overview" className="bg-card grid gap-2 rounded-xl border p-2 sm:p-3">
        <Kpis items={kpis} picked={picked} onPick={setPicked} />
        {/* Keyed on the chart picked, so a new one draws itself in rather than morphing the last. */}
        <div key={chart} className="border-t px-1 pt-4 pb-1 sm:px-2">
          {chart === "answers" ? (
            answers.length ? (
              <ComboChart
                rows={answers}
                x={(r) => `Week of ${date(r.week)}`}
                tick={(r) => date(r.week)}
                partial
                line={{ key: "total", label: "Brand answers" }}
                bars={{ key: "agent", label: "By agents" }}
                detail={(r) => [
                  { label: "People", value: r.person.toLocaleString() },
                  { label: "Portal and hub visitors", value: r.anonymous.toLocaleString() },
                ]}
              />
            ) : (
              <None>No answers yet.</None>
            )
          ) : chart === "delivery" ? (
            data.delivery.length ? (
              <ComboChart
                rows={data.delivery}
                x={(r) => date(r.day)}
                partial={data.delivery.at(-1)!.day === new Date().toISOString().slice(0, 10)}
                line={{ key: "requests", label: "Requests" }}
                bars={{ key: "bytes", label: "Served", format: formatSize }}
              />
            ) : (
              <None>Nothing served in the last {data.days} days.</None>
            )
          ) : data.adoption.length ? (
            <ComboChart rows={data.adoption} x={(r) => `Week of ${date(r.week)}`}
                tick={(r) => date(r.week)} partial line={{ key: "current", label: "Current versions" }} bars={{ key: "superseded", label: "Replaced versions" }} />
          ) : (
            <None>No file fetched yet.</None>
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Breakdown
          title="Assets"
          tabs={[
            {
              id: "top",
              label: "Most used",
              column: "Fetches",
              empty: "Nothing fetched yet.",
              rows: data.top.map((t) => ({
                key: t.asset.id,
                label: <AssetLink a={t.asset} />,
                sub: Object.entries(t.surfaces)
                  .sort(([, a], [, b]) => b! - a!)
                  .map(([s, count]) => `${SURFACE[s] ?? s} ${short(count!)}`)
                  .join(" · "),
                value: t.total,
              })),
            },
            {
              id: "stale",
              label: "Replaced",
              column: "Fetches",
              empty: "Nobody loaded a replaced version lately.",
              rows: regroup(data.stale, (s) => s.asset.id, (s) => s.fetches).map(([id, n]) => {
                const s = data.stale.find((x) => x.asset.id === id)!;
                return {
                  key: id,
                  label: (
                    <>
                      <AssetLink a={s.asset} />
                      <span className="text-muted-foreground"> → </span>
                      {s.replacement ? <AssetLink a={s.replacement} /> : <span className="text-muted-foreground">gone</span>}
                    </>
                  ),
                  sub: `Last on ${date(s.last)}`,
                  value: n,
                  tone: "warning" as const,
                };
              }),
            },
          ]}
        />
        <Breakdown
          title="Where from"
          tabs={[
            {
              id: "surface",
              label: "Surface",
              column: "Fetches",
              empty: "Nothing fetched yet.",
              rows: surfaces.map(([s, n]) => ({ key: s, label: SURFACE[s] ?? s, value: n })),
            },
            {
              id: "who",
              label: "Who",
              column: "Answers",
              empty: "No answers yet.",
              rows: [
                { key: "person", label: "People, in the app", value: sum(answers.map((a) => a.person)) },
                { key: "agent", label: "Agents, with a key or over MCP", value: agents },
                { key: "anonymous", label: "Visitors of portals and BrandHub", value: sum(answers.map((a) => a.anonymous)) },
              ].filter((r) => r.value > 0),
            },
            {
              id: "sites",
              label: "Old versions",
              column: "Fetches",
              empty: "No site loads a replaced version.",
              rows: regroup(data.stale, (s) => s.referrer ?? "", (s) => s.fetches).map(([site, n]) => ({
                key: site || "-",
                label: site || <span className="text-muted-foreground">Not said</span>,
                sub: data.stale
                  .filter((s) => (s.referrer ?? "") === site)
                  .map((s) => s.asset.title)
                  .join(", "),
                value: n,
                tone: "warning" as const,
              })),
            },
          ]}
        />
        <Breakdown
          title="Portals"
          tabs={[
            {
              id: "page",
              label: "Page",
              column: "Views",
              empty: "No page viewed yet.",
              rows: data.pageViews.map((p) => ({ key: `${p.portal.id}/${p.brand.slug}/${p.page}`, label: p.page, sub: `${p.portal.name}, ${p.brand.name}`, value: p.views })),
            },
            {
              id: "portal",
              label: "Portal",
              column: "Views",
              empty: "No page viewed yet.",
              rows: regroup(data.pageViews, (p) => p.portal.name, (p) => p.views).map(([name, n]) => ({ key: name, label: name, value: n })),
            },
            {
              id: "brand",
              label: "Brand",
              column: "Views",
              empty: "No page viewed yet.",
              rows: regroup(data.pageViews, (p) => p.brand.name, (p) => p.views).map(([name, n]) => ({ key: name, label: name, value: n })),
            },
          ]}
        />
        <Breakdown
          title="Asked for"
          action={
            <Link href="/insights/checks" className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2">
              Use checks
            </Link>
          }
          tabs={[
            {
              id: "gaps",
              label: "Not found",
              column: "Searches",
              empty: "Every search found something.",
              rows: data.gaps.map((g) => ({ key: g.q, label: <>&ldquo;{g.q}&rdquo;</>, sub: `Last on ${date(g.last)}`, value: g.searches })),
            },
            {
              id: "refused",
              label: "Refused",
              column: "Checks",
              empty: "Nothing refused.",
              rows: data.checks.reasons.map((r) => ({ key: r.code, label: REASON[r.code] ?? r.code, value: r.count, tone: "warning" as const })),
            },
          ]}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        Answers and adoption: last {data.weeks} weeks. The rest: last {data.days} days. {on(current + replaced)} in all.
      </p>
    </>
  );
}

/** A refusal's row, as a spreadsheet reads it. */
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);

/**
 * The use-check log (PRD INS-1, the prototype's /insights/checks): how many
 * checks, refused and taken, refusals by reason, and the latest refusals with
 * who asked, what was offered and whether they took it. Export CSV is the
 * rows on show, built here: nothing the API doesn't already answer.
 */
function UseChecks({ data }: { data: InsightsData }) {
  const c = data.checks;
  const took = c.log.filter((l) => l.offered.some((o) => o.taken)).length;
  const asker = (l: InsightsData["checks"]["log"][number]) => l.client ?? SURFACE[l.surface] ?? l.surface;
  const csv = () => {
    const rows = [
      ["When", "Asked by", "Asset", "Reason", "Offered", "Took it"],
      ...c.log.map((l) => [
        l.at,
        asker(l),
        l.asset.title,
        l.reasons.map((r) => REASON[r] ?? r).join("; "),
        l.offered.map((o) => o.asset.title).join("; "),
        l.offered.length ? (l.offered.some((o) => o.taken) ? "yes" : "no") : "",
      ]),
    ];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv" }));
    a.download = "use-checks.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };
  return (
    <>
      <section aria-label="Use checks" className="bg-card flex flex-wrap items-center gap-2 rounded-xl border p-2 sm:p-3">
        <div className="min-w-0 flex-1">
          <Kpis
            items={[
              { id: "checks", label: `Checks, last ${data.days} days`, value: short(c.allowed + c.refused) },
              { id: "refused", label: "Refused", value: short(c.refused) },
              { id: "rate", label: "Refusal rate", value: c.allowed + c.refused ? `${Math.round((100 * c.refused) / (c.allowed + c.refused))}%` : "0%" },
              ...(c.log.length ? [{ id: "took", label: c.log.length < c.refused ? `Took the replacement, latest ${c.log.length}` : "Took the replacement", value: short(took) }] : []),
            ]}
          />
        </div>
        {c.log.length > 0 && (
          <Button variant="outline" size="sm" className="me-1" onClick={csv}>
            <IconDownload /> Export CSV
          </Button>
        )}
      </section>
      {c.refused === 0 ? (
        <None>Nothing refused.</None>
      ) : (
        <>
          <Group title="Recent refusals">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-left text-xs">
                  <tr>
                    <th className={th}>When</th>
                    <th className={th}>Asked by</th>
                    <th className={th}>Asset</th>
                    <th className={th}>Reason</th>
                    <th className={th}>Offered</th>
                    <th className={th}>
                      <span className="inline-flex items-center gap-1">
                        Took it <InfoTip>The same client fetched what was offered, or checked it and was allowed, afterwards.</InfoTip>
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {c.log.map((l) => (
                    <tr key={l.id}>
                      <td className={cn(td, "text-muted-foreground whitespace-nowrap")} title={exact(l.at)} suppressHydrationWarning>
                        {ago(l.at)}
                      </td>
                      <td className={td}>
                        {l.client && <span className="text-muted-foreground mr-1 rounded border px-1 text-xs">agent</span>}
                        {asker(l)}
                      </td>
                      <td className={td}>
                        <AssetLink a={l.asset} />
                      </td>
                      <td className={td}>
                        {l.reasons.map((r) => REASON[r] ?? r).join(", ")}
                        {l.context && <span className="text-muted-foreground">, for {l.context}</span>}
                      </td>
                      <td className={td}>
                        {l.offered.length === 0 ? (
                          <span className="text-muted-foreground">Nothing</span>
                        ) : (
                          l.offered.map((o, i) => (
                            <span key={o.asset.id}>
                              {i > 0 && ", "}
                              <AssetLink a={o.asset} />
                            </span>
                          ))
                        )}
                      </td>
                      <td className={td}>
                        {l.offered.length === 0 ? null : l.offered.some((o) => o.taken) ? (
                          <span className="text-success inline-flex items-center gap-1">
                            <IconCheck aria-hidden className="size-3.5" /> Yes
                          </span>
                        ) : (
                          <span className="text-muted-foreground">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Group>
          <Group title="By reason">
            <BarList column="Refusals" empty="Nothing refused." rows={c.reasons.map((r) => ({ key: r.code, label: REASON[r.code] ?? r.code, value: r.count, tone: "warning" as const }))} />
            <Button variant="outline" size="sm" className="justify-self-start" asChild>
              <Link href="/insights">Open the overview</Link>
            </Button>
          </Group>
        </>
      )}
    </>
  );
}
