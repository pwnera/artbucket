"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { NavLink, useNavigate } from "@/components/app-sidebar";
import { useMe } from "@/components/can";
import { StatusBadge, TypeIcon } from "@/components/catalog";
import { save } from "@/components/asset-menu";
import { copyText } from "@/components/copy-button";
import { FacetFilter } from "@/components/facet-filter";
import { IconButton } from "@/components/icon-button";
import { IconArrowUpRight, IconComponents, IconCopy, IconDots, IconDownload, IconLink, IconPin, IconPinFilled, IconSitemap } from "@/components/icons";
import { usePins } from "@/components/sidebar-prefs";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { openPath, STATUS_LABEL, TYPE_LABEL, type CatalogStatus, type CatalogType } from "@/lib/catalog";
import type { CatalogResults } from "@/lib/core/catalog";
import type { Narrow } from "@/lib/view";
import { cn } from "@/lib/utils";

/**
 * Explore's search of every type (GET /api/v1/catalog): a row of types to
 * pick one, the Tags and Status filters every type takes, then one ranked
 * list, assets among brands, collections, sites, rules, guideline pages and
 * components, each drawn as the same card, a page at a time; or (`only`)
 * every match of one type. Each opens where the app shows it; an asset of
 * this project in the viewer, in place. The Assets tab is the asset grid
 * (components/gallery.tsx), with the filters only assets have.
 */

const OTHERS: CatalogType[] = ["brand", "collection", "site", "rule", "page", "component"];
const EVERY: CatalogType[] = [...OTHERS, "asset"];
const PAGE = 40;

type Found = { key: string; r: CatalogResults; items: CatalogResults["items"] };

/** `record`: the search of every type is Explore's one search for Insights; a type's tab is a look at it. */
const fetchCatalog = (q: string, types: CatalogType[], narrow: Narrow, cursor: number, signal?: AbortSignal) => {
  const params = new URLSearchParams({ q, limit: String(PAGE), cursor: String(cursor), facets: "true" });
  if (types.length !== EVERY.length) params.set("record", "false");
  for (const t of types) params.append("type", t);
  for (const t of narrow.tags) params.append("tag", t);
  if (narrow.statuses.length) params.set("status", narrow.statuses.join(","));
  return fetch(`/api/v1/catalog?${params}`, { signal }).then((r) => (r.ok ? (r.json() as Promise<CatalogResults>) : null));
};

/** The matches of `types` for `q` (none asked: nothing), and the next page of them on `more`. */
function useFound(q: string, types: CatalogType[] | null, narrow: Narrow) {
  const key = types && `${q}|${types.join()}|${narrow.tags.join()}|${narrow.statuses.join()}`;
  const [found, setFound] = useState<Found | null>(null);
  useEffect(() => {
    if (!key || !types) return;
    const ac = new AbortController();
    const wait = setTimeout(() => {
      fetchCatalog(q, types, narrow, 0, ac.signal)
        .then((r) => r && setFound({ key, r, items: r.items }))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(wait);
      ac.abort();
    };
    // `key` is q, types and narrow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const now = found?.key === key ? found : null;
  const more = () =>
    now?.r.next != null &&
    fetchCatalog(q, types!, narrow, now.r.next)
      .then((r) => r && setFound((f) => (f?.key === key ? { key, r, items: [...f.items, ...r.items] } : f)))
      .catch(() => {});
  return now && { ...now, more };
}

/** Retired statuses aren't picked here: replaced has no asset state to keep in the URL, and the results say what they left out. */
const PICKABLE: CatalogStatus[] = ["draft", "in_review", "current", "archived"];

/**
 * `narrow`: Explore's tags and states, which narrow every type; `onNarrow`
 * changes them. `assets`: the asset grid's count, for its tab.
 */
export function CatalogMatches({
  q,
  only,
  assets,
  narrow,
  onNarrow,
  onOpenAsset,
  onOpenComponent,
}: {
  q: string;
  only: CatalogType | null;
  assets: number;
  narrow: Narrow;
  onNarrow: (n: Narrow) => void;
  onOpenAsset: (id: string) => void;
  /** A component opens in a panel over Explore (components/components-page.tsx ComponentSheet). */
  onOpenComponent: (id: string) => void;
}) {
  const here = useMe()?.project.id;
  const params = useSearchParams();
  const all = useFound(q, EVERY, narrow);
  const one = useFound(q, only && only !== "asset" ? [only] : null, narrow);
  // In place where it can be: an asset of this project in the viewer, a component in its panel; the rest where the app shows it.
  const open = (i: Item) =>
    i.type === "asset" && i.project.id === here ? { onClick: () => onOpenAsset(i.id) } : i.type === "component" ? { onClick: () => onOpenComponent(i.id) } : { href: openPath(i) };
  const card = (i: Item) => <ResultCard key={i.id} i={i} {...open(i)} />;
  if (!all) return null;
  const types = OTHERS.filter((t) => all.r.counts[t] || t === only);
  // A tab keeps the words and the filters; a file type or a field, only assets have, stays on the Assets tab.
  const href = (t: CatalogType | null) => {
    const p = new URLSearchParams(params);
    p.delete("asset");
    if (t) p.set("in", t);
    else p.delete("in");
    if (t !== "asset") for (const k of [...p.keys()]) if (k === "type" || k.startsWith("f.")) p.delete(k);
    return p.size ? `/?${p}` : "/";
  };
  const tab = (t: CatalogType | null, label: string, n?: number) => (
    <NavLink
      key={t ?? "all"}
      href={href(t)}
      aria-current={only === t ? "page" : undefined}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors",
        only === t ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent",
      )}
    >
      {label}
      {n != null && <span className={cn("text-xs tabular-nums", only !== t && "text-muted-foreground")}>{n.toLocaleString()}</span>}
    </NavLink>
  );
  const shown = only && only !== "asset" ? one : all;
  const facets = shown?.r.facets;
  return (
    <>
      <nav aria-label="What to explore" className="flex flex-wrap gap-2">
        {tab(null, "Everything", all.r.total)}
        {tab("asset", TYPE_LABEL.asset.many, assets)}
        {types.map((t) => tab(t, TYPE_LABEL[t].many, all.r.counts[t] ?? 0))}
      </nav>
      {only === "asset" ? null : (
        <>
          {/* The filters every type takes, counted over these matches. */}
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
            <FacetFilter label="Tags" mode="all" counts={facets?.tags ?? []} selected={narrow.tags} onChange={(tags) => onNarrow({ ...narrow, tags })} />
            <FacetFilter
              label="Status"
              counts={(facets?.statuses ?? []).filter((s) => PICKABLE.includes(s.value))}
              selected={narrow.statuses}
              format={(v) => STATUS_LABEL[v as CatalogStatus] ?? v}
              onChange={(statuses) => onNarrow({ ...narrow, statuses: statuses as Narrow["statuses"] })}
            />
          </div>
          {/* Ranked together, whatever their type: a strong component comes before a weak asset. */}
          <Section title={only ? TYPE_LABEL[only].many : "Results"} count={shown?.r.total}>
            {shown && !shown.items.length && only === "component" && !q && !narrow.tags.length && !narrow.statuses.length ? (
              // Nothing deployed yet: how to bring a Storybook's components in, as the Components page said.
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconComponents />
                  </EmptyMedia>
                  <EmptyTitle>No components yet</EmptyTitle>
                  <EmptyDescription>
                    Deploy a Storybook to a site (<code>artbucket site push storybook-static --site storybook --kind storybook</code>) and each component it documents shows up here.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : shown && !shown.items.length ? (
              <p className="text-muted-foreground text-sm">No {only ? TYPE_LABEL[only].many.toLowerCase() : "results"} match.</p>
            ) : (
              <CardGrid>{(shown?.items ?? []).map(card)}</CardGrid>
            )}
            {shown?.r.next != null && (
              <Button variant="outline" size="sm" onClick={shown.more}>
                Show more
              </Button>
            )}
            {/* What the search left out, so a missing logo isn't a mystery: "logo.png @3 matches too, but it was replaced by @4." */}
            {shown?.r.hidden.example && (
              <p className="text-muted-foreground text-xs">
                {shown.r.hidden.example}
                {shown.r.hidden.count > 1 && ` ${shown.r.hidden.count - 1} more replaced, archived or expired ${shown.r.hidden.count === 2 ? "match" : "matches"} left out too.`}
              </p>
            )}
          </Section>
        </>
      )}
    </>
  );
}

type Item = CatalogResults["items"][number];

type Action = { id: string; label: string; icon: React.ReactNode; run: () => void };

/** What every result offers, whatever its type, and an asset's download: one list, for its right click and its ⋯. */
function useActions(i: Item, href: string | undefined, onClick: (() => void) | undefined): Action[][] {
  const navigate = useNavigate();
  const { has, toggle } = usePins();
  const at = openPath(i);
  const pinned = has(i.id);
  return [
    [
      { id: "open", label: "Open", icon: <IconArrowUpRight />, run: () => (onClick ? onClick() : navigate(href ?? at)) },
      { id: "catalog", label: "Open in catalog", icon: <IconSitemap />, run: () => navigate(`/catalog?o=${i.id}`) },
      ...(i.type === "asset" ? [{ id: "download", label: "Download", icon: <IconDownload />, run: () => save(`/a/${i.id}?download`, i.name) }] : []),
    ],
    [
      { id: "link", label: "Copy link", icon: <IconLink />, run: () => void copyText(new URL(at, location.origin).href, { what: "the link" }) },
      { id: "address", label: "Copy address", icon: <IconCopy />, run: () => void copyText(i.address, { what: "the address" }) },
      {
        id: "pin",
        label: pinned ? "Unpin" : "Pin to the sidebar",
        icon: pinned ? <IconPinFilled /> : <IconPin />,
        // Pinned where it opens in whichever project is open: the project switch is the proxy's, not the pin's.
        run: () => toggle({ id: i.id, type: i.type, label: i.name, href: at.replace(/[?&]project=[^&#]+/, "").replace(/\?(?=#|$)/, "") }),
      },
    ],
  ];
}

/**
 * A search result of any type, drawn one way: what it looks like on top (an
 * asset's rendition, a component's story, else its type's icon), then its
 * name, what it is and where, and its status when not current. It opens
 * where the app shows it (lib/catalog.ts openPath), as from every other list;
 * its right click and its ⋯ offer the same few things for every type.
 */
export function ResultCard({ i, href, onClick }: { i: Item; href?: string; onClick?: () => void }) {
  const [broken, setBroken] = useState(false);
  const actions = useActions(i, href, onClick);
  const look =
    i.type === "asset" && !broken ? (
      // eslint-disable-next-line @next/next/no-img-element -- a rendition, already sized
      <img src={`/a/${i.id}/w_320,f_webp`} alt="" loading="lazy" onError={() => setBroken(true)} className="size-full object-contain" />
    ) : i.type === "component" && i.preview ? (
      // The story at a desk's width, shrunk to the card: never interactive here, so the card stays one link.
      <iframe src={i.preview} title={i.name} loading="lazy" tabIndex={-1} sandbox="allow-scripts allow-same-origin" className="pointer-events-none absolute top-0 left-0 h-[250%] w-[250%] origin-top-left scale-[0.4] border-0" />
    ) : (
      <span className="text-muted-foreground [&_svg]:size-6">
        <TypeIcon type={i.type} />
      </span>
    );
  const body = (
    <>
      <span className="bg-muted relative flex aspect-[4/3] items-center justify-center overflow-hidden border-b">{look}</span>
      <span className="flex items-center gap-2 px-3 py-2 pe-10">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{i.name}</span>
          <span className="text-muted-foreground block truncate text-xs">
            {TYPE_LABEL[i.type].one} · {i.parent ? i.parent.name : i.project.name}
          </span>
        </span>
        {i.status !== "current" && <StatusBadge status={i.status} />}
      </span>
    </>
  );
  const cls = "bg-card hover:bg-accent focus-visible:ring-ring/50 flex w-full flex-col overflow-hidden rounded-xl border text-start transition-colors outline-none focus-visible:ring-2";
  return (
    <li className="group relative">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {href ? (
            <Link href={href} className={cls}>
              {body}
            </Link>
          ) : (
            // eslint-disable-next-line no-restricted-syntax -- the card twin of the Link above, the whole card the hit target
            <button type="button" onClick={onClick} className={cls}>
              {body}
            </button>
          )}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuLabel>{i.name}</ContextMenuLabel>
          {actions.map((g, n) => (
            <Fragment key={n}>
              <ContextMenuSeparator />
              {g.map((a) => (
                <ContextMenuItem key={a.id} onSelect={a.run}>
                  {a.icon} {a.label}
                </ContextMenuItem>
              ))}
            </Fragment>
          ))}
        </ContextMenuContent>
      </ContextMenu>
      {/* The same, for touch and keyboards: no right click there. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton label={`More for ${i.name}`} size="icon-xs" variant="ghost" className="absolute end-2 bottom-2.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 data-[state=open]:opacity-100">
            <IconDots />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {actions.map((g, n) => (
            <Fragment key={n}>
              {n > 0 && <DropdownMenuSeparator />}
              {g.map((a) => (
                <DropdownMenuItem key={a.id} onSelect={a.run}>
                  {a.icon} {a.label}
                </DropdownMenuItem>
              ))}
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/** A titled part of Explore or the catalog: "Brands and collections", "Assets for you". */
export function Section({ title, count, aside, children }: { title: string; count?: number; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium">{title}</h2>
        {count != null && <span className="text-muted-foreground text-xs tabular-nums">{count.toLocaleString()}</span>}
        {aside && <span className="ms-auto">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

export const CardGrid = ({ children }: { children: React.ReactNode }) => <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3">{children}</ul>;

const CARD =
  "bg-card hover:bg-accent focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-start transition-colors outline-none focus-visible:ring-2";

/** A brand, collection, portal or rule as a card: its icon, its name, what it is and where. */
export function ObjectCard({
  type,
  icon,
  href,
  onClick,
  name,
  sub,
  status,
}: {
  type?: CatalogType;
  icon?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  name: string;
  sub?: string;
  status?: CatalogStatus;
}) {
  const body = (
    <>
      <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-[18px]">
        {icon ?? (type && <TypeIcon type={type} />)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        {sub && <span className="text-muted-foreground block truncate text-xs">{sub}</span>}
      </span>
      {status && status !== "current" && <StatusBadge status={status} />}
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className={CARD}>
          {body}
        </Link>
      ) : (
        // eslint-disable-next-line no-restricted-syntax -- the card twin of the Link above, the whole card the hit target
        <button type="button" onClick={onClick} className={CARD}>
          {body}
        </button>
      )}
    </li>
  );
}
