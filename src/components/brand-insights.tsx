"use client";

import Link from "next/link";
import { IconAlertTriangle } from "@/components/icons";
import { Breakdown, ComboChart, Kpis, short } from "@/components/analytics";
import { AssetLink, date, None, SURFACE, type Asset } from "@/components/insights";

/** GET /api/v1/brands/{slug}/insights, as lib/schemas.ts BrandInsights has it. */
export type BrandInsightsData = {
  days: number;
  pulls: number;
  views: number;
  week: { days: number; answers: number; agents: number; refused: number };
  adoption: {
    release: { number: number; publishedAt: string };
    days: { day: string; current: number; older: number }[];
    share: number | null;
    older: { asset: Asset; release: number | null; referrer: string | null; surface: string; client: string | null; fetches: number; last: string }[];
  } | null;
};

/** Where an older file went: the site that loaded it, else the agent that asked, else nobody said. */
const whereOf = (o: { referrer: string | null; client: string | null }) => o.referrer ?? o.client;

/**
 * A brand's Insights tab (PRD INS-1, INS-4, INS-6; the prototype's "Insights:
 * release adoption"): the places still loading an older release, this
 * week's brand answers, how many agents asked and uses refused, the fetches
 * since the latest release a day each, on it or on an older one, and where
 * the older ones go. The brand's files are the ones its releases hold
 * (lib/core/insights.ts brandInsights).
 */
export function BrandInsights({ data }: { data: BrandInsightsData | null }) {
  if (!data) return <None>Insights couldn&apos;t load. Try again in a moment.</None>;
  const { week, adoption } = data;
  const at = adoption && `@${adoption.release.number}`;
  const places = new Set(adoption?.older.map((o) => whereOf(o) ?? o.surface));
  return (
    <div className="grid gap-4">
      {adoption && places.size > 0 && (
        <p role="status" className="border-warning/40 bg-warning/10 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <IconAlertTriangle aria-hidden className="text-warning size-4 shrink-0" />
          <span>
            <b className="font-medium">
              {places.size === 1 ? "1 place still loads" : `${places.size} places still load`} files older than {at}
            </b>
            , released {date(adoption.release.publishedAt.slice(0, 10))}
          </span>
        </p>
      )}

      <section aria-label="This week" className="bg-card grid gap-2 rounded-xl border p-2 sm:p-3">
        <Kpis
          items={[
            { id: "answers", label: "Brand answers, this week", value: short(week.answers) },
            { id: "agents", label: "Asked by agents", value: week.answers ? `${Math.round((100 * week.agents) / week.answers)}%` : "0%" },
            { id: "refused", label: "Uses refused", value: short(week.refused) },
            { id: "share", label: at ? `Fetches on ${at}` : "Never released", value: adoption?.share !== null && adoption?.share !== undefined ? `${adoption.share}%` : "None" },
            { id: "pulls", label: `BrandHub pulls, ${data.days} days`, value: short(data.pulls) },
          ]}
        />
        {adoption && adoption.days.some((d) => d.current + d.older > 0) && (
          <div className="border-t px-1 pt-4 pb-1 sm:px-2">
            <ComboChart
              rows={adoption.days}
              x={(r) => date(r.day)}
              partial={adoption.days.at(-1)!.day === new Date().toISOString().slice(0, 10)}
              line={{ key: "current", label: `On ${at}` }}
              bars={{ key: "older", label: "Older releases" }}
            />
          </div>
        )}
      </section>

      {adoption ? (
        <Breakdown
            title="Still on older releases"
            action={
              <Link href="/insights/checks" className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2">
                Use checks
              </Link>
            }
            tabs={[
              {
                id: "where",
                label: "Where",
                column: `Fetches, ${week.days} days`,
                empty: <>Everyone loads {at}.</>,
                rows: group(adoption.older, (o) => whereOf(o) ?? `${SURFACE[o.surface] ?? o.surface}, not said`).map(([key, n, os]) => ({
                  key,
                  label: key,
                  sub: [...new Set(os.map((o) => (o.client ? "Agent" : (SURFACE[o.surface] ?? o.surface))))].join(", "),
                  value: n,
                  tone: "warning" as const,
                })),
              },
              {
                id: "file",
                label: "File",
                column: `Fetches, ${week.days} days`,
                empty: <>Everyone loads {at}.</>,
                rows: group(adoption.older, (o) => o.asset.id).map(([key, n, os]) => ({
                  key,
                  label: (
                    <>
                      <AssetLink a={os[0].asset} />
                      {os[0].release !== null && <span className="text-muted-foreground"> @{os[0].release}</span>}
                    </>
                  ),
                  sub: `Last on ${date(os.map((o) => o.last).sort().at(-1)!)}`,
                  value: n,
                  tone: "warning" as const,
                })),
              },
            ]}
          />
      ) : (
        <None>Never released: adoption starts with the first release.</None>
      )}
    </div>
  );
}

/** The rows by a key, the most fetched first, each with its total and its rows. */
function group<T extends { fetches: number }>(xs: T[], key: (x: T) => string): [string, number, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return [...m].map(([k, v]) => [k, v.reduce((a, b) => a + b.fetches, 0), v] as [string, number, T[]]).sort((a, b) => b[1] - a[1]);
}
