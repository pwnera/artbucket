"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  IconSearch,
  IconStack2,
  IconUser,
  IconUsersGroup,
  IconWorld,
  IconFolder,
  IconLink,
  IconPlus,
  IconArrowUpRight,
  IconShieldLock,
  IconLayoutSidebarLeftExpand,
  IconShare,
  IconX,
} from "@/components/icons";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { send } from "@/lib/send";
import { useCan, useMe } from "@/components/can";
import { Combobox } from "@/components/combobox";
import { ROLES, roleName, type Scope } from "@/lib/scopes";
import { undoable } from "@/lib/undo";
import { build, CatalogTree, findNode, LIST, NEW, type Node } from "@/components/catalog-tree";
import { IconButton } from "@/components/icon-button";
import { AppHeader } from "@/components/page";
import { PinButton } from "@/components/pin-button";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STATUS_LABEL, TYPE_LABEL, type CatalogStatus, type CatalogType } from "@/lib/catalog";
import type { ActivityLine, CatalogItem, Granted, Holder } from "@/lib/core/catalog";
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

export function CatalogExplorer({ projects, object, folder, tab }: { projects: TreeProject[]; object: Described | null; folder: string | null; tab: Tab }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const go = useCallback((id: string, t: Tab = tab) => router.push(`/catalog?o=${id}${t === "overview" ? "" : `&tab=${t}`}`, { scroll: false }), [router, tab]);
  const openFolder = useCallback((key: string) => router.push(`/catalog?f=${encodeURIComponent(key)}`, { scroll: false }), [router]);
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
        {hidden ? (
          <div className="hidden shrink-0 border-e p-1.5 md:sticky md:top-14 md:block md:h-[calc(100svh-3.5rem)]">
            <IconButton variant="ghost" size="icon-sm" label="Show the tree" onClick={() => setHidden(false)}>
              <IconLayoutSidebarLeftExpand />
            </IconButton>
          </div>
        ) : (
          <div className="h-80 shrink-0 border-b md:sticky md:top-14 md:h-[calc(100svh-3.5rem)] md:w-80 md:border-e md:border-b-0">
            <CatalogTree projects={projects} current={folder ?? object?.id ?? null} onOpen={(id) => go(id)} onOpenFolder={openFolder} onHide={() => setHidden(true)} />
          </div>
        )}
        <main className="min-w-0 flex-1 px-4 pt-6 pb-16 md:px-6">
          {folder ? (
            <FolderView key={folder} projects={projects} folder={folder} go={go} openFolder={openFolder} />
          ) : object ? (
            <ObjectView object={object} tab={tab} go={go} openFolder={openFolder} projects={projects} />
          ) : (
            <p className="text-muted-foreground text-sm">Nothing in the catalog you can reach yet. Upload an asset or make a brand, and it shows here.</p>
          )}
        </main>
      </div>
    </>
  );
}

/** The tabs an object has: lineage where something links to it or from it, activity where it is recorded (an asset's versions, a brand's releases). */
const tabsOf = (o: Described): Tab[] => TABS.filter((t) => (t === "lineage" ? o.lineage.up + o.lineage.down > 0 : t === "activity" ? o.type === "asset" || o.type === "brand" : true));

function ObjectView({
  object: o,
  tab: asked,
  go,
  openFolder,
  projects,
}: {
  object: Described;
  tab: Tab;
  go: (id: string, t?: Tab) => void;
  openFolder: (key: string) => void;
  projects: TreeProject[];
}) {
  const counts: Partial<Record<Tab, number>> = { lineage: o.lineage.up + o.lineage.down };
  const tabs = tabsOf(o);
  const tab = tabs.includes(asked) ? asked : "overview";
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-3">
        <nav aria-label="Where it is" className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm">
          <button type="button" className="hover:text-foreground" onClick={() => openFolder(o.project.id)}>
            {o.project.name}
          </button>
          /
          <button type="button" className="hover:text-foreground" onClick={() => openFolder(`${o.project.id}:${o.parent?.type ?? o.type}`)}>
            {TYPE_LABEL[o.parent?.type ?? o.type].many}
          </button>
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
            <PinButton size="icon" pin={{ id: o.id, type: o.type, label: o.name, href: o.open.replace(/[?&]project=[^&]+/, "").replace(/\?$/, "") }} />
            <IconButton size="icon" label="Who can reach it, and grants" onClick={() => go(o.id, "access")}>
              <IconShieldLock />
            </IconButton>
            {SHAREABLE.includes(o.type) && <ShareToProject o={o} projects={projects} />}
            <Button asChild>
              <a href={o.open}>Open {TYPE_LABEL[o.type].one.toLowerCase()}</a>
            </Button>
          </div>
        </div>
      </div>
      <nav aria-label="Object" className="flex gap-5 overflow-x-auto border-b">
        {tabs.map((t) => (
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
      {tab === "access" && <Access key={o.id} o={o} />}
      {tab === "activity" && <Activity key={o.id} id={o.id} />}
    </div>
  );
}

/**
 * A tree level's page: a project, a type (Brands, Assets), an asset type
 * (Images) or a brand's rules or pages. Where it sits, what can be made in
 * it, what it groups as cards, then what it holds as a list: a project's
 * lately updated, a type's all of it.
 */
function FolderView({ projects, folder, go, openFolder }: { projects: TreeProject[]; folder: string; go: (id: string) => void; openFolder: (key: string) => void }) {
  const here = useMe()?.project.id;
  const tree = useMemo(() => build(projects, () => true), [projects]);
  const [shown, setShown] = useState(100);
  const found = findNode(tree, folder);
  if (!found) return <p className="text-muted-foreground text-sm">Nothing is here any more. Pick another place in the tree.</p>;
  const { node, trail } = found;
  const project = node.kind === "project" ? node : trail[0];
  const folders = node.children.filter((c) => c.kind === "group");
  // Named for what they hold: a project's brands, collections...; assets by type; then the things themselves.
  const groupsTitle = node.kind === "project" ? "In this project" : "By type";
  const itemsTitle = node.kind === "project" ? "Updated lately" : node.type && node.depth === 2 ? `All ${TYPE_LABEL[node.type].many.toLowerCase()}` : node.label;
  const leaves: CatalogItem[] = [];
  // What it holds, in every folder below: an object's own parts (a brand's rules and pages) stay the object's.
  const walk = (n: Node) => n.children.forEach((c) => (c.kind === "object" ? leaves.push(c.item!) : walk(c)));
  walk(node);
  const items = node.kind === "project" ? [...leaves].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)).slice(0, 12) : leaves;
  const make = node.depth === 2 && node.type && NEW[node.type] && node.key.startsWith(`${here}:`) ? NEW[node.type] : undefined;
  const list = node.depth === 2 && node.type ? LIST[node.type] : undefined;
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="space-y-3">
        {trail.length > 0 && (
          <nav aria-label="Where it is" className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm">
            {trail.map((t, i) => (
              <span key={t.key} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden>/</span>}
                <button type="button" className="hover:text-foreground" onClick={() => openFolder(t.key)}>
                  {t.label}
                </button>
              </span>
            ))}
          </nav>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <span className="bg-muted flex size-11 shrink-0 items-center justify-center rounded-lg">
            {node.kind === "project" ? (
              <span className="text-primary-ink font-display text-lg font-semibold">{node.label.charAt(0).toUpperCase()}</span>
            ) : node.type && node.depth === 2 ? (
              <TypeIcon type={node.type} className="size-5" />
            ) : (
              <IconFolder aria-hidden className="size-5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display truncate text-xl font-semibold tracking-tight">{node.label}</h2>
            <p className="text-muted-foreground text-sm">
              {node.kind === "project" ? `Project · You are ${roleName((projects.find((p) => p.id === node.key)?.role ?? "read") as Scope)}` : `In ${project.label}`} · {leaves.length.toLocaleString()}{" "}
              {leaves.length === 1 ? "item" : "items"}
            </p>
          </div>
          <div className="flex gap-2">
            <IconButton
              asChild
              size="icon"
              label={node.kind === "project" ? `Manage who is in ${node.label}` : `Access comes from ${project.label}: manage its members`}
            >
              <Link href={membersOf(project.key)}>
                <IconShieldLock />
              </Link>
            </IconButton>
            {list && (
              <IconButton asChild size="icon" label={list.label}>
                <Link href={list.href}>
                  <IconArrowUpRight />
                </Link>
              </IconButton>
            )}
            {make && (
              <Button asChild>
                <Link href={make.href}>
                  <IconPlus /> {make.label}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {folders.length > 0 && (
        <section aria-label={groupsTitle} className="space-y-3">
          <h3 className="text-sm font-medium">{groupsTitle}</h3>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-3">
            {folders.map((f) => (
              <li key={f.key}>
                <button
                  type="button"
                  onClick={() => openFolder(f.key)}
                  className="bg-card hover:bg-accent focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-start transition-colors outline-none focus-visible:ring-2"
                >
                  {f.type && f.depth === 2 ? <TypeIcon type={f.type} className="text-muted-foreground size-5 shrink-0" /> : <IconFolder aria-hidden className="text-muted-foreground size-5 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.label}</span>
                  <span className="text-muted-foreground text-xs tabular-nums">{f.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {items.length > 0 && (
        <section aria-label={itemsTitle} className="space-y-3">
          <h3 className="text-sm font-medium">{itemsTitle}</h3>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-left text-xs">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  {node.kind === "project" && <th className="px-4 py-2.5 font-medium max-sm:hidden">Type</th>}
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-end font-medium max-sm:hidden">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.slice(0, shown).map((i) => (
                  <tr
                    key={`${i.id}:${i.sharedFrom?.id ?? ""}`}
                    tabIndex={0}
                    onClick={() => go(i.id)}
                    onKeyDown={(e) => e.key === "Enter" && go(i.id)}
                    className="hover:bg-accent/60 focus-visible:bg-accent cursor-pointer outline-none"
                  >
                    <td className="w-full max-w-0 px-4 py-2.5">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <TypeIcon type={i.type} className="text-muted-foreground size-4 shrink-0" />
                        <span className="truncate font-medium">{i.name}</span>
                        {i.private && <IconLock aria-label="Private" className="text-muted-foreground size-3.5 shrink-0" />}
                        {i.sharedFrom && <Badge variant="secondary">Shared</Badge>}
                      </span>
                    </td>
                    {node.kind === "project" && <td className="text-muted-foreground px-4 py-2.5 whitespace-nowrap max-sm:hidden">{TYPE_LABEL[i.type].one}</td>}
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        <StatusBadge status={i.status} />
                        {i.release && <span className="text-muted-foreground text-xs tabular-nums">@{i.release}</span>}
                      </span>
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5 text-end whitespace-nowrap tabular-nums max-sm:hidden">{day(i.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {items.length > shown && (
            <Button variant="outline" onClick={() => setShown((n) => n + 200)}>
              Show {Math.min(200, items.length - shown).toLocaleString()} more
            </Button>
          )}
        </section>
      )}
      {!items.length && !folders.length && <p className="text-muted-foreground text-sm">Nothing here yet.</p>}
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
        <IconButton size="icon" label="Share to another project">
          <IconShare />
        </IconButton>
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

/** GET a catalog view of one object, as the tab opens, and again on `reload`. Keyed by the object where used, so another starts empty. */
function useView<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    fetch(path)
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error(`It answered ${r.status}`))))
      .then((d) => live && setData(d))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [path, n]);
  return { data, error, reload: () => setN((x) => x + 1) };
}

const KIND: Record<Holder["kind"], React.ComponentType<{ className?: string }>> = { person: IconUser, agent: IconRobot, project: IconFolder, public: IconWorld, link: IconLink };

type AccessView = { private: boolean; holders: Holder[]; on: { type: "asset" | "brand" | "collection"; id: string; name: string } | null; granted: Granted[] };

function Access({ o }: { o: Described }) {
  const { data, error, reload } = useView<AccessView>(`/api/v1/catalog/${o.id}/access`);
  const can = useCan();
  // Grants are made in the project open, by its admins (lib/core/people.ts target).
  const me = useMe();
  const manage = can("member.manage") && me?.project.id === o.project.id;
  return (
    <div className="space-y-4">
      {data?.on && manage && <Grants on={data.on} granted={data.granted} reload={reload} />}
      <ManageElsewhere o={o} grantable={!!data?.on} manage={manage} />
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
    </div>
  );
}

/** The project's members settings, in that project (?project= switches to it first). */
const membersOf = (project: string) => `/settings/project/members?project=${project}`;

/**
 * Where else who reaches it is decided: a portal's own access, the grant
 * made in another project, the project's members, the organization's
 * groups. Each a link to where it is changed.
 */
function ManageElsewhere({ o, grantable, manage }: { o: Described; grantable: boolean; manage: boolean }) {
  const can = useCan();
  const links = [
    o.type === "portal" && { href: o.open, label: "Set who sees this portal", hint: "public, password, members or by request, on the portal" },
    grantable && !manage && { href: `/catalog?o=${o.id}&tab=access&project=${o.project.id}`, label: `Grant access in ${o.project.name}`, hint: "grants are made by its admins, in it" },
    { href: membersOf(o.project.id), label: `Members of ${o.project.name}`, hint: "their project roles reach everything in it" },
    can("organization.manage") && { href: "/settings/organization/groups", label: "Groups", hint: "grant many people at once" },
  ].filter(Boolean) as { href: string; label: string; hint: string }[];
  return (
    <Card title="Manage access">
      <ul className="divide-y">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="group/link flex items-center gap-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="group-hover/link:text-primary-ink font-medium">{l.label}</span>
                <span className="text-muted-foreground block text-xs">{l.hint}</span>
              </span>
              <IconArrowUpRight className="text-muted-foreground size-4 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * Grants on this object, made here: a person or a group, with a role. Each
 * changes in place or is taken back (with an undo). On an asset, up to
 * Editor: admin over one asset is admin over nothing else.
 */
function Grants({ on, granted, reload }: { on: NonNullable<AccessView["on"]>; granted: Granted[]; reload: () => void }) {
  const [people, setPeople] = useState<{ value: string; label: string; hint?: string }[] | null>(null);
  const [role, setRole] = useState<Scope>("read");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([
      fetch("/api/v1/members?in=project").then((r) => (r.ok ? r.json() : { data: [] })),
      fetch("/api/v1/groups").then((r) => (r.ok ? r.json() : { data: [] })),
    ]).then(([m, g]: [{ data: { id: string; name: string; email: string }[] }, { data: { id: string; name: string }[] }]) => {
      if (!live) return;
      setPeople([
        ...g.data.map((x) => ({ value: `group:${x.id}`, label: x.name, hint: "Group" })),
        ...m.data.map((x) => ({ value: `user:${x.id}`, label: x.name || x.email, hint: x.email })),
      ]);
    });
    return () => {
      live = false;
    };
  }, []);
  const roles = on.type === "asset" ? ROLES.filter((r) => r.scope !== "admin") : ROLES;
  const grant = async (kind: "user" | "group", id: string, scope: Scope) => {
    setBusy(id);
    const done = await send("POST", "/api/v1/grants", { [kind]: id, resource: on.type, resourceId: on.id, scope });
    setBusy(null);
    if (done) reload();
    return done;
  };
  const remove = async (g: Granted) => {
    setBusy(g.id);
    const done = await send("DELETE", `/api/v1/grants/${g.grant}`);
    setBusy(null);
    if (!done) return;
    reload();
    undoable(`${g.who} no longer has a role on ${on.name}`, { undo: () => grant(g.kind === "group" ? "group" : "user", g.id, g.scope as Scope) });
  };
  const held = new Set(granted.map((g) => `${g.kind === "group" ? "group" : "user"}:${g.id}`));
  return (
    <Card title={`Granted on ${on.name}`} aside={<span className="text-muted-foreground text-sm tabular-nums">{granted.length}</span>}>
      {granted.length > 0 && (
        <ul className="space-y-1">
          {granted.map((g) => (
            <li key={g.grant} className="flex items-center gap-2 text-sm">
              {g.kind === "group" ? <IconUsersGroup aria-hidden className="text-muted-foreground size-4 shrink-0" /> : <IconUser aria-hidden className="text-muted-foreground size-4 shrink-0" />}
              <span className="min-w-0 flex-1 truncate">{g.who}</span>
              <Select value={g.scope} onValueChange={(v) => void grant(g.kind === "group" ? "group" : "user", g.id, v as Scope)}>
                <SelectTrigger size="sm" className="h-7 w-32" aria-label={`${g.who}'s role`}>
                  <SelectValue>{roleName(g.scope as Scope)}</SelectValue>
                </SelectTrigger>
                <SelectContent align="end">
                  {roles.map((r) => (
                    <SelectItem key={r.scope} value={r.scope}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <IconButton variant="ghost" size="icon-xs" label={`Take back ${g.who}'s role`} pending={busy === g.id} className="text-muted-foreground hover:text-destructive" onClick={() => void remove(g)}>
                <IconX />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Combobox
          className="min-w-56 flex-1"
          options={(people ?? []).filter((p) => !held.has(p.value))}
          value=""
          placeholder={people ? "Add a person or a group" : "Loading people"}
          onChange={(v) => {
            const [kind, id] = v.split(":") as ["user" | "group", string];
            if (id) void grant(kind, id, role);
          }}
        />
        <Select value={role} onValueChange={(v) => setRole(v as Scope)}>
          <SelectTrigger className="w-36" aria-label="Role to grant">
            <SelectValue>{roleName(role)}</SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            {roles.map((r) => (
              <SelectItem key={r.scope} value={r.scope}>
                <span className="grid">
                  <span>{r.label}</span>
                  <span className="text-muted-foreground text-xs">{r.hint}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-muted-foreground text-xs">{"It reaches everything inside it. A group's grant is each of its members'."}</p>
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
