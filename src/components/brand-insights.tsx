"use client";

import Link from "next/link";
import { IconAlertTriangle } from "@tabler/icons-react";
import { AssetLink, Bars, date, None, SURFACE, td, th, type Asset } from "@/components/insights";
import { Group } from "@/components/settings/panels";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
  if (!data) return <None>Insights couldn&apos;t load. Nothing has changed; try again in a moment.</None>;
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
            </b>{" "}
            since release {at} on {date(adoption.release.publishedAt.slice(0, 10))}.
          </span>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi value={week.answers.toLocaleString()} label="brand answers this week" />
        <Kpi value={week.answers ? `${Math.round((100 * week.agents) / week.answers)}%` : "0%"} label="asked by agents" />
        <Kpi value={week.refused.toLocaleString()} label={<>uses refused · <Link href="/insights" className="underline underline-offset-2">see why</Link></>} />
        <Kpi value={adoption?.share !== null && adoption?.share !== undefined ? `${adoption.share}%` : "None"} label={at ? `fetches on ${at}` : "never released"} />
      </div>

      {adoption ? (
        <>
          <Group title="Fetches by release" description={`Since ${at}, the brand's files a day each through every surface: on ${at}, or on an older release (or replaced since).`}>
            <Bars
              rows={adoption.days}
              x={(r) => date(r.day)}
              series={[
                { key: "current", label: `${at} (current)`, className: "bg-primary" },
                { key: "older", label: "Older", className: "bg-warning" },
              ]}
            />
          </Group>

          <Group title={`Still on older releases`} description={`Where files older than ${at} were fetched in the last ${week.days} days.`}>
            {adoption.older.length === 0 ? (
              <None>Everyone loads {at}.</None>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground text-left text-xs">
                    <tr>
                      <th className={th}>Where</th>
                      <th className={th}>Surface</th>
                      <th className={th}>File</th>
                      <th className={cn(th, "text-right")}>Fetches, {week.days} days</th>
                      <th className={cn(th, "text-right")}>Last seen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {adoption.older.map((o) => (
                      <tr key={`${o.asset.id}/${o.referrer}/${o.surface}/${o.client}`}>
                        <td className={td}>{whereOf(o) ?? <span className="text-muted-foreground">Not said</span>}</td>
                        <td className={td}>
                          <Badge variant={o.client ? "default" : "secondary"}>{o.client ? "agent" : (SURFACE[o.surface] ?? o.surface)}</Badge>
                        </td>
                        <td className={td}>
                          <AssetLink a={o.asset} />
                          {o.release !== null && <span className="text-muted-foreground"> @{o.release}</span>}
                        </td>
                        <td className={cn(td, "text-right tabular-nums")}>{o.fetches.toLocaleString()}</td>
                        <td className={cn(td, "text-right tabular-nums")}>{date(o.last)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Group>
        </>
      ) : (
        <None>Never released: release adoption starts with the first release.</None>
      )}
    </div>
  );
}

function Kpi({ value, label }: { value: string; label: React.ReactNode }) {
  return (
    <div className="bg-card grid gap-0.5 rounded-xl border p-4">
      <b className="font-display text-2xl font-semibold tabular-nums">{value}</b>
      <small className="text-muted-foreground text-xs">{label}</small>
    </div>
  );
}
