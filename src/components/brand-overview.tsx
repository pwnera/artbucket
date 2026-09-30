"use client";

import { IconBook, IconChartBar, IconCircle, IconCircleCheckFilled, IconLock, IconStar, IconWorld } from "@tabler/icons-react";
import type { Status } from "@/components/builder/use-status";
import { Preview } from "@/components/hub";
import { AppHeader } from "@/components/page";
import { inkOn } from "@/lib/color";
import { ago, logoOf, taglineOf, tintOf } from "@/lib/hub";
import { ruleName, type Rule } from "@/lib/rules";
import { cn } from "@/lib/utils";

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
  brand: { slug: string; name: string; default: boolean };
  rules: Rule[];
  status: Status | null;
  release: Release | null;
  /** null: this person may not read Insights. */
  signals: BrandSignals | null;
};

const HEX = /^#[0-9a-f]{6}$/i;

export function BrandOverview({ brand, rules, status, release, signals }: BrandOverviewProps) {
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

          {status && (
            <Box title={status.next ? `Launch checklist, ${status.done} of ${status.total}` : "Ready to share"} icon={<IconCircleCheckFilled />}>
              <ol className="grid gap-1">
                {status.steps
                  .filter((s) => s.done !== null)
                  .map((s) => (
                    <li key={s.id} className="flex items-start gap-2 text-sm">
                      {s.done ? (
                        <IconCircleCheckFilled aria-label="Done" className="text-success mt-0.5 size-4 shrink-0" />
                      ) : (
                        <IconCircle aria-label="To do" className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                      )}
                      <span className={cn(s.done && "text-muted-foreground")}>{s.title}</span>
                    </li>
                  ))}
              </ol>
            </Box>
          )}
        </aside>
      </div>
    </>
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
