"use client";

import { useEffect, useState } from "react";
import { HEAD } from "@/components/brand-sections/look";
import { LocalDate } from "@/components/public-grid";
import { useSite } from "@/components/site/site-context";
import { Skeleton } from "@/components/ui/skeleton";
import type { Update } from "@/lib/history";
import { ruleName } from "@/lib/rules";
import type { Media } from "@/lib/site";
import { cn } from "@/lib/utils";

/** Past this many names in one row, the rest are counted: a first publish is all new. */
const NAMES = 8;

/**
 * Publishes, newest first: when, the note and its picture, and the pages and
 * rules each changed for readers since the publish before. Pages still there
 * are plain links, which the site moves to like its own; removed ones are
 * only named. `media` has the notes' pictures, signed for a visitor.
 */
export function UpdateList({ updates, media, as: H = "h3" }: { updates: Update[]; media: Record<string, Media>; as?: "h2" | "h3" }) {
  const { view, href, url } = useSite();
  if (!updates.length) return <p className="text-muted-foreground">Nothing released yet.</p>;
  // A rule's heading, when the page carries it; else its key, as words.
  const rule = (key: string) => ruleName({ key, label: view.rules.find((r) => r.key === key && r.label)?.label });
  return (
    <ol className="space-y-10">
      {updates.map((u) => {
        const pic = u.image ? (media[u.image]?.preview ?? url(u.image, "/w_1600,f_webp")) : null;
        const { pages, rules } = u.changes;
        const rows: [string, React.ReactNode[]][] = [
          ["New pages", pages.added.map((p) => <a key={p.slug} href={href(p.slug)}>{p.title}</a>)],
          ["Updated pages", pages.changed.map((p) => <a key={p.slug} href={href(p.slug)}>{p.title}</a>)],
          ["Removed pages", pages.removed.map((p) => p.title)],
          ["New rules", rules.added.map(rule)],
          ["Changed rules", rules.changed.map(rule)],
          ["Removed rules", rules.removed.map(rule)],
        ];
        return (
          <li key={u.version} className="space-y-3">
            <H className={cn(HEAD, "text-(length:--brand-h3) leading-snug")}>
              <LocalDate at={u.publishedAt} />
            </H>
            <p className="text-muted-foreground text-xs">Release {u.version}</p>
            {u.note && <p className="max-w-(--brand-measure) whitespace-pre-line text-pretty">{u.note}</p>}
            {pic && (
              // The note says what it shows.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pic} alt="" loading="lazy" decoding="async" className="max-h-96 max-w-full rounded-xl" />
            )}
            <dl className="grid gap-x-4 gap-y-1 text-sm @md:grid-cols-[auto_minmax(0,1fr)]">
              {rows
                .filter(([, xs]) => xs.length)
                .map(([name, xs]) => (
                  <div key={name} className="contents">
                    <dt className="text-muted-foreground">{name}</dt>
                    <dd>
                      <ul className="flex flex-wrap gap-x-3 [&_a]:underline [&_a]:underline-offset-2">
                        {xs.slice(0, NAMES).map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                        {xs.length > NAMES && <li className="text-muted-foreground">and {xs.length - NAMES} more</li>}
                      </ul>
                    </dd>
                  </div>
                ))}
            </dl>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * What's new (?view=updates) in place of a page: the brand's publishes,
 * from GET /portal/{slug}/updates on a portal (with the headers the visitor
 * got in with; keep `headers` stable), else from the brand's own.
 */
export function WhatsNew({ portal, headers }: { portal?: string; headers?: () => HeadersInit }) {
  const { view } = useSite();
  const brand = view.brand.slug;
  const [got, setGot] = useState<{ brand: string; data: Update[]; media: Record<string, Media> } | { brand: string; error: true } | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    const q = encodeURIComponent(brand);
    fetch(portal ? `/api/v1/portal/${portal}/updates?brand=${q}` : `/api/v1/brands/${q}/updates`, { headers: headers?.(), cache: "no-store", signal: ac.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((b: { data: Update[]; media?: Record<string, Media> }) => setGot({ brand, data: b.data, media: b.media ?? {} }))
      .catch(() => ac.signal.aborted || setGot({ brand, error: true }));
    return () => ac.abort();
  }, [portal, headers, brand]);
  const now = got?.brand === brand ? got : null;
  return (
    <div className="mx-auto w-full max-w-280 space-y-8 px-6 py-[calc(var(--brand-gap)*2)] @3xl:px-10">
      <div className="space-y-3">
        <h1 className={cn(HEAD, "text-[length:min(var(--brand-h1),10cqi)] leading-[1.1] text-balance")}>What&apos;s new</h1>
        <p className="text-muted-foreground text-lg text-pretty">What each release of {view.brand.name} changed.</p>
      </div>
      {!now ? (
        <div role="status" aria-label="Loading what's new" className="space-y-3">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-4 w-2/3 max-w-sm" />
        </div>
      ) : "error" in now ? (
        <p role="alert" className="text-muted-foreground">
          What&apos;s new didn&apos;t load. Reload the page to try again.
        </p>
      ) : (
        <UpdateList updates={now.data} media={now.media} as="h2" />
      )}
    </div>
  );
}
