"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IconFileText,
  IconListCheck,
  IconLock,
  IconPalette,
  IconPhoto,
  IconRobot,
  IconStack2,
  IconUser,
  IconWorld,
  IconFolder,
  IconLink,
  IconShare,
  IconX,
} from "@tabler/icons-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { send } from "@/lib/send";
import { IconButton } from "@/components/icon-button";
import { AppHeader } from "@/components/page";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
export const LineageGraph = dynamic(() => import("@/components/catalog-lineage").then((m) => m.LineageGraph), {
  ssr: false,
  loading: () => <div className="bg-muted/40 h-[480px] animate-pulse rounded-xl border" />,
});

export type TreeProject = { id: string; slug: string; name: string; role: string | null; objects: CatalogItem[] };
export type Described = CatalogItem & {
  usedBy: CatalogItem[];
  usedByCount: number;
  lineage: { up: number; down: number };
  sharedWith: { grant: string; project: { id: string; slug: string; name: string }; role: string }[];
  open: string;
};

const TABS = ["overview", "lineage", "access", "activity"] as const;
export type Tab = (typeof TABS)[number];

const day = (d: string | Date) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/**
 * One object's page, the shell every object shares (/catalog/{id}): where it
 * is, its address and status, and its tabs, the governance ones (Lineage,
 * Access, Activity) the same for every type. Brands carry these tabs in their
 * own pages (brands/[slug]); collections and portals live here.
 */
export function ObjectPage({ object, tab, projects }: { object: Described; tab: Tab; projects: TreeProject[] }) {
  const router = useRouter();
  const go = useCallback((id: string, t: Tab = tab) => router.push(`/catalog/${id}${t === "overview" ? "" : `?tab=${t}`}`, { scroll: false }), [router, tab]);
  return (
    <>
      <AppHeader trail={[{ label: TYPE_LABEL[object.type].many, href: object.type === "collection" ? "/" : object.type === "portal" ? "/portals" : undefined }, { label: object.name }]} />
      <main className="px-4 pt-6 pb-16 md:px-6">
        <ObjectView object={object} tab={tab} go={go} projects={projects} />
      </main>
    </>
  );
}

/** One of the governance tabs on its own, for a page with tabs of its own (a brand's). Walking the lineage opens the next object's page. */
export function GovernanceTab({ id, tab }: { id: string; tab: "lineage" | "access" | "activity" }) {
  const router = useRouter();
  if (tab === "lineage") return <LineageGraph key={id} id={id} onOpen={(to) => router.push(`/catalog/${to}?tab=lineage`)} />;
  return tab === "access" ? <Access key={id} id={id} /> : <Activity key={id} id={id} />;
}

export function ObjectView({ object: o, tab, go, projects }: { object: Described; tab: Tab; go: (id: string, t?: Tab) => void; projects: TreeProject[] }) {
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
          <div className="flex gap-2">
            {SHAREABLE.includes(o.type) && <ShareToProject o={o} projects={projects} />}
            <Button asChild>
              {o.type === "collection" ? (
                <Link href={`/?collection=${o.id}`}>Browse in Explore</Link>
              ) : o.type === "portal" ? (
                <Link href="/portals">Manage portals</Link>
              ) : (
                <a href={o.open}>Open {TYPE_LABEL[o.type].one.toLowerCase()}</a>
              )}
            </Button>
          </div>
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
      {SHAREABLE.includes(o.type) && <SharedWith o={o} />}
      {o.type === "collection" && (
        <Button asChild variant="outline" className="w-fit">
          <Link href={`/?collection=${o.id}`}>Browse its assets in Explore</Link>
        </Button>
      )}
    </div>
  );
}

const SHAREABLE: CatalogType[] = ["brand", "collection", "asset"];

/** Where it is shared, each taken back by its X (an admin of either project). */
function SharedWith({ o }: { o: Described }) {
  const router = useRouter();
  return (
    <Card title="Shared with" aside={<span className="text-muted-foreground text-sm tabular-nums">{o.sharedWith.length}</span>}>
      {o.sharedWith.length ? (
        <ul className="space-y-1">
          {o.sharedWith.map((x) => (
            <li key={x.grant} className="flex items-center gap-2 text-sm">
              <IconFolder aria-hidden className="text-muted-foreground size-4" />
              <span className="truncate">{x.project.name}</span>
              <Badge variant="outline" className="ms-auto">
                {x.role}
              </Badge>
              <IconButton
                variant="ghost"
                size="icon-xs"
                label={`Stop sharing with ${x.project.name}`}
                className="text-muted-foreground hover:text-destructive"
                onClick={async () => (await send("DELETE", `/api/v1/grants/${x.grant}`)) && router.refresh()}
              >
                <IconX />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">Only {o.project.name} reaches it.</p>
      )}
    </Card>
  );
}

/** Share into another project of the organization: Viewer for its members, kept and edited here. */
function ShareToProject({ o, projects }: { o: Described; projects: TreeProject[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const others = projects.filter((p) => p.id !== o.project.id && !o.sharedWith.some((x) => x.project.id === p.id));
  const [to, setTo] = useState(others[0]?.id ?? "");
  if (!others.length) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <IconShare /> Share to project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share {o.name}</DialogTitle>
          <DialogDescription>
            Its members read it, as a Viewer, where it is: it is kept and edited in {o.project.name}, and nothing is copied.
          </DialogDescription>
        </DialogHeader>
        <Select value={to} onValueChange={setTo}>
          <SelectTrigger className="w-full" aria-label="Into">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {others.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button
            onClick={async () => {
              if (!(await send("POST", "/api/v1/grants", { project: to, resource: o.type, resourceId: o.id, scope: "read" }))) return;
              setOpen(false);
              router.refresh();
            }}
          >
            Share
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

const KIND: Record<Holder["kind"], React.ComponentType<{ className?: string }>> = { person: IconUser, agent: IconRobot, project: IconFolder, public: IconWorld, link: IconLink };

export function Access({ id }: { id: string }) {
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

export function Activity({ id }: { id: string }) {
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
