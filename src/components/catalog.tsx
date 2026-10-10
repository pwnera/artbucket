"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IconChevronDown,
  IconChevronRight,
  IconFileText,
  IconListCheck,
  IconLock,
  IconPalette,
  IconPhoto,
  IconRobot,
  IconSearch,
  IconSitemap,
  IconStack2,
  IconUser,
  IconWorld,
  IconLink,
} from "@tabler/icons-react";
import { AppHeader } from "@/components/page";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STATUS_LABEL, TYPE_LABEL, type CatalogStatus, type CatalogType } from "@/lib/catalog";
import type { ActivityLine, CatalogItem, Holder } from "@/lib/core/catalog";
import { cn } from "@/lib/utils";

/**
 * The catalog explorer (PRD: Artbucket Catalog): every project the person
 * reaches as a tree of its objects, and the one picked, with what it is, what
 * it comes from and what uses it (components/catalog-lineage.tsx), who
 * reaches it and what happened to it. All of it from /api/v1/catalog.
 */

const ICON: Record<CatalogType, React.ComponentType<{ className?: string }>> = {
  brand: IconPalette,
  collection: IconStack2,
  asset: IconPhoto,
  portal: IconWorld,
  rule: IconListCheck,
  page: IconFileText,
};

export const TypeIcon = ({ type, className }: { type: CatalogType; className?: string }) => {
  const Icon = ICON[type];
  return <Icon aria-hidden className={className} />;
};

const TONE: Record<CatalogStatus, "success" | "secondary" | "warning" | "outline"> = {
  current: "success",
  draft: "secondary",
  in_review: "warning",
  replaced: "warning",
  archived: "outline",
};

export const StatusBadge = ({ status, className }: { status: CatalogStatus; className?: string }) => (
  <Badge variant={TONE[status]} className={className}>
    {STATUS_LABEL[status]}
  </Badge>
);

// React Flow measures the window: only in the browser.
const LineageGraph = dynamic(() => import("@/components/catalog-lineage").then((m) => m.LineageGraph), {
  ssr: false,
  loading: () => <div className="bg-muted/40 h-[480px] animate-pulse rounded-xl border" />,
});

export type TreeProject = { id: string; slug: string; name: string; role: string | null; objects: CatalogItem[] };
export type Described = CatalogItem & { usedBy: CatalogItem[]; usedByCount: number; lineage: { up: number; down: number }; open: string };

const ORDER: CatalogType[] = ["brand", "collection", "asset", "portal"];
const FACETS: { id: string; label: string; types: CatalogType[] | null }[] = [
  { id: "all", label: "All", types: null },
  { id: "brand", label: "Brands", types: ["brand"] },
  { id: "collection", label: "Collections", types: ["collection"] },
  { id: "asset", label: "Assets", types: ["asset"] },
  { id: "portal", label: "Portals", types: ["portal"] },
];
const TABS = ["overview", "lineage", "access", "activity"] as const;
export type Tab = (typeof TABS)[number];

const day = (d: string | Date) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export function CatalogExplorer({ projects, object, tab }: { projects: TreeProject[]; object: Described | null; tab: Tab }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [facet, setFacet] = useState("all");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const go = useCallback((id: string, t: Tab = tab) => router.push(`/catalog?o=${id}${t === "overview" ? "" : `&tab=${t}`}`, { scroll: false }), [router, tab]);

  const types = FACETS.find((f) => f.id === facet)!.types;
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      projects.map((p) => {
        const objects = p.objects.filter((o) => (!types || types.includes(o.type)) && (!q || o.name.toLowerCase().includes(q) || o.address.includes(q)));
        return { ...p, objects };
      }),
    [projects, types, q],
  );
  const total = shown.reduce((s, p) => s + p.objects.length, 0);

  return (
    <>
      <AppHeader trail={[{ label: "Catalog" }]}>
        <Button asChild variant="outline" size="sm" className="text-muted-foreground w-56 justify-start font-normal max-sm:hidden">
          <Link href="/">
            <IconSearch /> Search everything in Explore
          </Link>
        </Button>
      </AppHeader>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <section
          aria-label="Catalog tree"
          className="flex shrink-0 flex-col border-b md:sticky md:top-14 md:h-[calc(100svh-3.5rem)] md:w-80 md:border-e md:border-b-0"
        >
          <div className="space-y-3 border-b p-4">
            <div className="flex items-center gap-2">
              <IconSitemap aria-hidden className="text-muted-foreground size-5" />
              <h1 className="font-display text-xl font-semibold tracking-tight">Catalog</h1>
              <span className="text-muted-foreground text-sm tabular-nums">{total}</span>
            </div>
            <Input type="search" placeholder="Filter by name or address" aria-label="Filter the tree" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="flex flex-wrap gap-1.5">
              {FACETS.map((f) => (
                <Button key={f.id} size="xs" variant={facet === f.id ? "secondary" : "ghost"} aria-pressed={facet === f.id} onClick={() => setFacet(f.id)}>
                  {f.label}
                </Button>
              ))}
            </div>
          </div>
          <div role="tree" aria-label="Projects and objects" className="max-h-80 overflow-y-auto p-2 md:max-h-none md:min-h-0 md:flex-1">
            {shown.map((p) => {
              const open = !closed.has(p.id);
              return (
                <div key={p.id} role="treeitem" aria-expanded={open} aria-selected={false}>
                  <button
                    type="button"
                    onClick={() => setClosed((c) => (c.delete(p.id) ? new Set(c) : new Set(c).add(p.id)))}
                    className="hover:bg-accent flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium"
                  >
                    {open ? <IconChevronDown aria-hidden className="size-4" /> : <IconChevronRight aria-hidden className="size-4" />}
                    <span className="truncate">{p.name}</span>
                    <span className="text-muted-foreground ms-auto text-xs tabular-nums">{p.objects.length}</span>
                  </button>
                  {open && (
                    <div role="group">
                      {ORDER.map((t) => {
                        const list = p.objects.filter((o) => o.type === t);
                        if (!list.length) return null;
                        return (
                          <div key={t} className="mb-1">
                            <div className="text-muted-foreground flex items-center px-2 pt-2 pb-1 ps-8 text-xs">
                              {TYPE_LABEL[t].many}
                              <span className="ms-auto tabular-nums">{list.length}</span>
                            </div>
                            {list.map((o) => (
                              <button
                                key={o.id}
                                type="button"
                                role="treeitem"
                                aria-selected={object?.id === o.id}
                                aria-current={object?.id === o.id ? "page" : undefined}
                                onClick={() => go(o.id)}
                                className={cn(
                                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 ps-8 text-start text-sm",
                                  object?.id === o.id ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "hover:bg-accent",
                                )}
                              >
                                <TypeIcon type={o.type} className="text-muted-foreground size-4 shrink-0" />
                                <span className="truncate">{o.name}</span>
                                {o.private && <IconLock aria-label="Private" className="text-muted-foreground size-3.5 shrink-0" />}
                                <span className="text-muted-foreground ms-auto text-xs tabular-nums">{o.release ? `@${o.release}` : o.status === "draft" ? "draft" : ""}</span>
                              </button>
                            ))}
                          </div>
                        );
                      })}
                      {!p.objects.length && <p className="text-muted-foreground px-2 py-1 ps-8 text-xs">{q || types ? "Nothing matches here." : "Nothing here yet."}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
        <main className="min-w-0 flex-1 px-4 pt-6 pb-16 md:px-6">
          {object ? (
            <ObjectView object={object} tab={tab} go={go} />
          ) : (
            <p className="text-muted-foreground text-sm">Nothing in the catalog you can reach yet. Upload an asset or make a brand, and it shows here.</p>
          )}
        </main>
      </div>
    </>
  );
}

function ObjectView({ object: o, tab, go }: { object: Described; tab: Tab; go: (id: string, t?: Tab) => void }) {
  const counts: Partial<Record<Tab, number>> = { lineage: o.lineage.up + o.lineage.down };
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-3">
        <nav aria-label="Where it is" className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm">
          <span>{o.project.name}</span>/<span>{TYPE_LABEL[o.parent?.type ?? o.type].many}</span>
          {o.parent && (
            <>
              /
              <button type="button" className="hover:text-foreground" onClick={() => go(o.parent!.id)}>
                {o.parent.name}
              </button>
            </>
          )}
        </nav>
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          <span className="bg-muted flex size-11 shrink-0 items-center justify-center rounded-lg">
            <TypeIcon type={o.type} className="size-5" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display truncate text-xl font-semibold tracking-tight">{o.name}</h2>
              <Badge variant="outline">{TYPE_LABEL[o.type].one}</Badge>
              <StatusBadge status={o.status} />
              {o.release && <Badge variant="secondary">@{o.release}</Badge>}
              {o.expiring && <Badge variant="warning">Expires {o.expires}</Badge>}
              {o.private && (
                <Badge variant="secondary">
                  <IconLock aria-hidden /> Private
                </Badge>
              )}
            </div>
            <div className="flex min-w-0 items-center gap-1">
              <code className="text-muted-foreground truncate font-mono text-xs">{o.address}</code>
              <CopyButton text={o.address} label="Copy address" what="Address" />
            </div>
          </div>
          <Button asChild>
            <a href={o.open}>Open {TYPE_LABEL[o.type].one.toLowerCase()}</a>
          </Button>
        </div>
      </div>
      <nav aria-label="Object" className="flex gap-5 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            aria-current={tab === t ? "page" : undefined}
            onClick={() => go(o.id, t)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 py-2.5 text-sm capitalize transition-colors",
              tab === t ? "border-primary text-foreground font-medium" : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {t}
            {!!counts[t] && <span className="bg-muted rounded-full px-1.5 text-xs tabular-nums">{counts[t]}</span>}
          </button>
        ))}
      </nav>
      {tab === "overview" && <Overview o={o} go={go} />}
      {tab === "lineage" && <LineageGraph key={o.id} id={o.id} onOpen={(id) => go(id, "lineage")} />}
      {tab === "access" && <Access key={o.id} id={o.id} />}
      {tab === "activity" && <Activity key={o.id} id={o.id} />}
    </div>
  );
}

const Card = ({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) => (
  <section className="bg-card space-y-3 rounded-xl border p-4">
    <div className="flex items-center gap-2">
      <h3 className="font-medium">{title}</h3>
      {aside}
    </div>
    {children}
  </section>
);

function Overview({ o, go }: { o: Described; go: (id: string, t?: Tab) => void }) {
  const props: [string, React.ReactNode][] = [
    ["Type", TYPE_LABEL[o.type].one],
    ["Project", o.project.name],
    ...(o.parent ? ([["Part of", o.parent.name]] as [string, string][]) : []),
    ["Created", day(o.createdAt)],
    ["Updated", day(o.updatedAt)],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <Card title="About">
        {o.description && <p className="text-sm text-pretty">{o.description}</p>}
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
          {props.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {o.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {o.tags.map((t) => (
              <Badge key={t} variant="secondary">
                {t}
              </Badge>
            ))}
          </div>
        )}
      </Card>
      <Card title="Used by" aside={<span className="text-muted-foreground text-sm tabular-nums">{o.usedByCount}</span>}>
        {o.usedBy.length ? (
          <ul className="space-y-1">
            {o.usedBy.map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => go(u.id)} className="hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm">
                  <TypeIcon type={u.type} className="text-muted-foreground size-4 shrink-0" />
                  <span className="truncate">{u.name}</span>
                  <span className="text-muted-foreground ms-auto text-xs">{TYPE_LABEL[u.type].one}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">Nothing uses it yet.</p>
        )}
        <Button variant="outline" size="sm" onClick={() => go(o.id, "lineage")}>
          See lineage
        </Button>
      </Card>
    </div>
  );
}

/** GET a catalog view of one object, as the tab opens. Keyed by the object where used, so another starts empty. */
function useView<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(path)
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error(`It answered ${r.status}`))))
      .then((d) => live && setData(d))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [path]);
  return { data, error };
}

const KIND: Record<Holder["kind"], React.ComponentType<{ className?: string }>> = { person: IconUser, agent: IconRobot, public: IconWorld, link: IconLink };

function Access({ id }: { id: string }) {
  const { data, error } = useView<{ private: boolean; holders: Holder[] }>(`/api/v1/catalog/${id}/access`);
  return (
    <Card title="Who can reach it">
      <p className="text-muted-foreground text-sm">
        Grants reach down: organization, then project, then this object. The highest role on the way wins.
        {data?.private && " It is private: only grants on it, and admins, reach it."}
      </p>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {data && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left text-xs">
              <tr>
                <th className="py-2 font-normal">Who</th>
                <th className="py-2 font-normal">Role</th>
                <th className="py-2 font-normal">Through</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.holders.map((h, i) => {
                const Icon = KIND[h.kind];
                return (
                  <tr key={i}>
                    <td className="py-2 pe-4">
                      <span className="flex items-center gap-2">
                        <Icon className="text-muted-foreground size-4 shrink-0" />
                        {h.who}
                      </span>
                    </td>
                    <td className="py-2 pe-4">
                      <Badge variant="outline">{h.role}</Badge>
                    </td>
                    <td className="text-muted-foreground py-2">{h.via}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Activity({ id }: { id: string }) {
  const { data, error } = useView<{ data: ActivityLine[] }>(`/api/v1/catalog/${id}/activity`);
  return (
    <Card title="Activity">
      {error && <p className="text-destructive text-sm">{error}</p>}
      {data && !data.data.length && <p className="text-muted-foreground text-sm">Nothing yet.</p>}
      <ul className="space-y-2">
        {data?.data.map((a, i) => (
          <li key={i} className="flex items-baseline gap-3 text-sm">
            <span aria-hidden className="bg-primary/60 size-1.5 shrink-0 translate-y-[-2px] rounded-full" />
            <span className="min-w-0 flex-1">
              {a.who && <b className="font-medium">{a.who} </b>}
              {a.what}
            </span>
            <span className="text-muted-foreground shrink-0 text-xs">{day(a.at)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
