"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { IconArrowRight, IconExternalLink, IconMinus, IconPlus, IconX } from "@/components/icons";
import { StatusBadge, TypeIcon } from "@/components/catalog";
import { CopyButton } from "@/components/copy-button";
import { IconButton } from "@/components/icon-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EDGE_LABEL, openPath, TYPE_LABEL, type CatalogType, type EdgeKind } from "@/lib/catalog";
import type { LineageEdge, LineageNode } from "@/lib/core/catalog";
import { cn } from "@/lib/utils";

/**
 * An object's lineage, as Unity Catalog draws it (GET
 * /api/v1/catalog/{id}/lineage): upstream on the left, what uses it on the
 * right, one hop each way to start. A + on a card's side brings that side's
 * next hop in, a - takes it away again. Picking a card shows it in a panel,
 * with its edges lit; from there, open it or walk the catalog to it.
 */

type Lineage = { root: string; nodes: LineageNode[]; edges: LineageEdge[]; unseen: number; impact: { line: string } };
type Dir = "up" | "down";
/** What one expansion brought in, so folding it takes exactly that away. */
type Added = { nodes: string[]; edges: string[] };
/** `level`: columns from the root, upstream negative; `at`: where each card sits, kept as hops come and go. */
type Graph = {
  nodes: Map<string, LineageNode>;
  edges: Map<string, LineageEdge>;
  added: Map<string, Added>;
  level: Map<string, number>;
  at: Map<string, { x: number; y: number }>;
  unseen: number;
  impact: string;
};

const W = 264;
const H = 104;
const COL = 344;
const ROW = 120;
const keyOf = (e: LineageEdge) => `${e.from}>${e.to}>${e.kind}`;

/** Each type its own color, as Unity Catalog marks tables, views and models apart. */
const TINT: Record<CatalogType, string> = {
  brand: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  collection: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  asset: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  site: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  rule: "bg-muted text-muted-foreground",
  page: "bg-muted text-muted-foreground",
};

const fetchHop = async (id: string, direction: string) => {
  const res = await fetch(`/api/v1/catalog/${encodeURIComponent(id)}/lineage?depth=1&direction=${direction}`);
  if (!res.ok) throw new Error(`Lineage answered ${res.status}`);
  return (await res.json()) as Lineage;
};

/**
 * Place new cards in their column, centred on the card they came from, below
 * any card already there: what is on the canvas never moves.
 */
function place(g: Graph, from: { x: number; y: number }, ids: string[], level: number) {
  const x = level * COL;
  const taken = [...g.at.entries()].filter(([id]) => g.level.get(id) === level).map(([, p]) => p.y);
  let y = from.y - ((ids.length - 1) / 2) * ROW;
  // Overlapping what is there: start below it.
  if (taken.some((t) => t > y - ROW && t < y + ids.length * ROW)) y = Math.max(...taken) + ROW;
  ids.forEach((id, i) => g.at.set(id, { x, y: y + i * ROW }));
}

/** The first graph: the root, what it comes from on the left, what uses it on the right. */
function first(l: Lineage): Graph {
  const g: Graph = { nodes: new Map(l.nodes.map((n) => [n.id, n])), edges: new Map(l.edges.map((e) => [keyOf(e), e])), added: new Map(), level: new Map([[l.root, 0]]), at: new Map([[l.root, { x: 0, y: 0 }]]), unseen: l.unseen, impact: l.impact.line };
  const up = l.edges.filter((e) => e.to === l.root).map((e) => e.from);
  const down = l.edges.filter((e) => e.from === l.root).map((e) => e.to);
  for (const id of up) g.level.set(id, -1);
  for (const id of down) if (!g.level.has(id)) g.level.set(id, 1);
  place(g, { x: 0, y: 0 }, [...new Set(up)], -1);
  place(g, { x: 0, y: 0 }, [...new Set(down)].filter((id) => g.level.get(id) === 1), 1);
  return g;
}

type Data = {
  item: LineageNode;
  root: boolean;
  picked: boolean;
  dim: boolean;
  side: Record<Dir, "more" | "less" | null>;
  busy: Dir | null;
  onSide: (id: string, dir: Dir) => void;
};

const Side = ({ dir, data }: { dir: Dir; data: Data }) => {
  const state = data.side[dir];
  if (!state) return null;
  const Icon = state === "more" ? IconPlus : IconMinus;
  const what = dir === "up" ? `what ${data.item.name} comes from` : `what uses ${data.item.name}`;
  return (
    <button
      type="button"
      aria-label={state === "more" ? `Show ${what}` : `Hide ${what}`}
      onClick={(e) => {
        e.stopPropagation();
        data.onSide(data.item.id, dir);
      }}
      className={cn(
        "nodrag bg-background text-muted-foreground hover:text-primary-ink hover:border-primary absolute top-1/2 z-10 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm",
        dir === "up" ? "-left-3" : "-right-3",
      )}
    >
      {data.busy === dir ? <Spinner className="size-3" /> : <Icon className="size-3.5" />}
    </button>
  );
};

const ObjectNode = memo(function ObjectNode({ data }: NodeProps<Node<Data>>) {
  const { item, root, picked } = data;
  return (
    <div className={cn("relative transition-opacity", data.dim && "opacity-40")} style={{ width: W }}>
      <Handle type="target" position={Position.Left} className="!opacity-0" isConnectable={false} />
      <div
        className={cn(
          "bg-card overflow-hidden rounded-lg border shadow-sm transition-[border-color,box-shadow]",
          root && "border-primary border-2",
          picked && !root && "border-primary ring-primary/25 ring-2",
          !root && !picked && "hover:border-primary/50",
        )}
      >
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", TINT[item.type])}>
            <TypeIcon type={item.type} className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{item.name}</span>
            <span className="text-muted-foreground block truncate text-xs">
              {TYPE_LABEL[item.type].one}
              {version(item) && ` · ${version(item)}`} · {item.project.name}
            </span>
          </span>
        </div>
        {/* Whether it may be used: current or not, its license, its last day. */}
        <div className="bg-muted/40 flex items-center gap-1.5 border-t px-3 py-2 text-xs">
          <StatusBadge status={item.status} />
          {item.expiring && <Badge variant="warning">Expires {item.expires}</Badge>}
          {item.type === "asset" && (
            <span title={item.license ?? "No license recorded"} className={cn("min-w-0 truncate", item.license ? "text-foreground" : "text-muted-foreground italic")}>
              {item.license ?? "No license"}
            </span>
          )}
          {root && <span className="text-primary-ink ms-auto shrink-0 font-medium">This object</span>}
        </div>
      </div>
      <Side dir="up" data={data} />
      <Side dir="down" data={data} />
      <Handle type="source" position={Position.Right} className="!opacity-0" isConnectable={false} />
    </div>
  );
});

const nodeTypes = { object: ObjectNode };

/** "v2 of 3" for an asset in a stack, "@4" for a released brand. */
const version = (n: LineageNode) =>
  n.type === "asset" ? (n.release ? `v${n.release}${(n.versions ?? 1) > 1 ? ` of ${n.versions}` : ""}` : null) : n.release ? `@${n.release}` : null;

/** Fold a side: what it brought in goes, and whatever was unfolded from that, all the way down. */
function fold(g: Graph, key: string): Graph {
  const gone = g.added.get(key);
  if (!gone) return g;
  let next: Graph = { ...g, nodes: new Map(g.nodes), edges: new Map(g.edges), added: new Map(g.added), level: new Map(g.level), at: new Map(g.at) };
  next.added.delete(key);
  for (const n of gone.nodes) for (const d of ["up", "down"] as Dir[]) next = fold(next, `${n}:${d}`);
  for (const e of gone.edges) next.edges.delete(e);
  for (const n of gone.nodes) {
    next.nodes.delete(n);
    next.level.delete(n);
    next.at.delete(n);
    for (const [k, e] of next.edges) if (e.from === n || e.to === n) next.edges.delete(k);
  }
  return next;
}

/** Keyed by `id` where it is used: another object starts a graph of its own. */
export function LineageGraph({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const { resolvedTheme } = useTheme();
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ id: string; dir: Dir } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const view = useRef<ReactFlowInstance<Node<Data>> | null>(null);
  const size = graph?.nodes.size ?? 0;
  // A hop added or folded: the cards stay where they are, and the view eases to take them all in.
  useEffect(() => {
    if (size) requestAnimationFrame(() => view.current?.fitView({ padding: 0.25, maxZoom: 1, duration: 300 }));
  }, [size]);

  useEffect(() => {
    let live = true;
    fetchHop(id, "up,down")
      .then((l) => live && setGraph(first(l)))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [id]);

  const side = useCallback(
    async (node: string, dir: Dir) => {
      const key = `${node}:${dir}`;
      if (graph?.added.has(key)) {
        setGraph((g) => g && fold(g, key));
        return;
      }
      setBusy({ id: node, dir });
      try {
        const l = await fetchHop(node, dir);
        setGraph((g) => {
          if (!g) return g;
          const next: Graph = { ...g, nodes: new Map(g.nodes), edges: new Map(g.edges), level: new Map(g.level), at: new Map(g.at), added: new Map(g.added) };
          const added: Added = { nodes: [], edges: [] };
          for (const n of l.nodes) {
            if (next.nodes.has(n.id)) continue;
            next.nodes.set(n.id, n);
            added.nodes.push(n.id);
          }
          for (const e of l.edges) {
            if (next.edges.has(keyOf(e))) continue;
            next.edges.set(keyOf(e), e);
            added.edges.push(keyOf(e));
          }
          // The new hop's column: one further out, on the side it was asked from.
          const level = (g.level.get(node) ?? 0) + (dir === "down" ? 1 : -1);
          for (const n of added.nodes) next.level.set(n, level);
          place(next, g.at.get(node) ?? { x: 0, y: 0 }, added.nodes, level);
          next.added.set(key, added);
          next.unseen += l.unseen;
          return next;
        });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [graph],
  );

  // A card dragged stays where it is dropped: its place is the graph's, so a hop added later lays out around it.
  const moved = useCallback((changes: NodeChange<Node<Data>>[]) => {
    const drags = changes.flatMap((c) => (c.type === "position" && c.position ? [c] : []));
    if (!drags.length) return;
    setGraph((g) => {
      if (!g) return g;
      const at = new Map(g.at);
      for (const c of drags) at.set(c.id, c.position!);
      return { ...g, at };
    });
  }, []);

  const flow = useMemo(() => {
    if (!graph) return null;
    const edgeList = [...graph.edges.values()];
    const shown = (n: string, dir: Dir) => edgeList.filter((e) => (dir === "up" ? e.to === n : e.from === n)).length;
    const lit = picked ? new Set(edgeList.flatMap((e) => (e.from === picked || e.to === picked ? [e.from, e.to] : []))) : null;
    const nodes: Node<Data>[] = [...graph.nodes.values()].map((item) => {
      // A + only on the side facing out, where nothing is drawn yet: upstream cards open left, downstream ones right, the root both.
      const level = graph.level.get(item.id) ?? 0;
      const outward = (dir: Dir) => level === 0 || (dir === "up" ? level < 0 : level > 0);
      const state = (dir: Dir): Data["side"][Dir] =>
        !outward(dir) ? null : graph.added.has(`${item.id}:${dir}`) ? "less" : item[dir] > shown(item.id, dir) ? "more" : null;
      return {
        id: item.id,
        type: "object",
        position: graph.at.get(item.id) ?? { x: 0, y: 0 },
        // Its size, said up front: the minimap and fitting draw from it, as nothing records the measured one.
        width: W,
        height: H,
        selected: item.id === picked,
        data: {
          item,
          root: item.id === id,
          picked: item.id === picked,
          dim: !!lit && !lit.has(item.id) && item.id !== picked,
          side: { up: state("up"), down: state("down") },
          busy: busy?.id === item.id ? busy.dir : null,
          onSide: side,
        },
      };
    });
    const edges: Edge[] = edgeList.map((e) => {
      const on = !picked || e.from === picked || e.to === picked;
      return {
        id: keyOf(e),
        source: e.from,
        target: e.to,
        // A rule's edge reads as its key (logo.primary); the others, as what they are.
        label: e.kind === "rule" && e.via ? e.via : EDGE_LABEL[e.kind as EdgeKind],
        labelStyle: { fontSize: 10, opacity: on ? 1 : 0.3 },
        labelBgPadding: [4, 2] as [number, number],
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        style: { strokeWidth: picked && on ? 2 : 1.25, opacity: on ? 1 : 0.25, ...(picked && on ? { stroke: "var(--primary)" } : {}) },
        animated: e.kind === "replaced_by",
      };
    });
    return { nodes, edges };
  }, [graph, id, busy, side, picked]);

  if (error) return <p className="text-destructive text-sm">{error}</p>;
  if (!flow || !graph) return <div className="bg-muted/40 h-[600px] animate-pulse rounded-xl border" />;
  const chosen = picked ? graph.nodes.get(picked) : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="warning">Impact</Badge>
        <span>{graph.impact}</span>
        {graph.unseen > 0 && (
          <span className="text-muted-foreground">
            {graph.unseen === 1 ? "1 object you can't see also links here." : `${graph.unseen} objects you can't see also link here.`}
          </span>
        )}
      </div>
      <div className="bg-muted/20 relative h-[600px] overflow-hidden rounded-xl border">
        <ReactFlow
          nodes={flow.nodes}
          edges={flow.edges}
          nodeTypes={nodeTypes}
          onInit={(i) => (view.current = i)}
          colorMode={resolvedTheme === "dark" ? "dark" : "light"}
          fitView
          fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
          nodesConnectable={false}
          onNodesChange={moved}
          onNodeClick={(_, n) => setPicked((p) => (p === n.id ? null : n.id))}
          onNodeDoubleClick={(_, n) => n.id !== id && onOpen(n.id)}
          onPaneClick={() => setPicked(null)}
          proOptions={{ hideAttribution: true }}
          minZoom={0.2}
        >
          <Background gap={18} size={1} />
          <Controls showInteractive={false} position="bottom-left" />
          <MiniMap pannable zoomable position="bottom-right" nodeColor={(n) => (n.id === id ? "var(--primary)" : "var(--muted-foreground)")} nodeBorderRadius={6} className="!bg-background rounded-md border" />
          <Panel position="top-left" className="text-muted-foreground bg-background/90 flex items-center gap-3 rounded-md border px-2.5 py-1.5 text-xs">
            <span>Upstream</span>
            <IconArrowRight className="size-3.5" />
            <span className="text-foreground font-medium">This object</span>
            <IconArrowRight className="size-3.5" />
            <span>Downstream</span>
          </Panel>
          {chosen && (
            <Panel position="top-right" className="bg-background w-72 space-y-3 rounded-lg border p-3 shadow-lg">
              <div className="flex items-start gap-2.5">
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", TINT[chosen.type])}>
                  <TypeIcon type={chosen.type} className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{chosen.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {TYPE_LABEL[chosen.type].one} in {chosen.project.name}
                  </p>
                </div>
                <IconButton variant="ghost" size="icon-xs" label="Close" onClick={() => setPicked(null)}>
                  <IconX />
                </IconButton>
              </div>
              <div className="flex items-center gap-1">
                <code className="text-muted-foreground truncate font-mono text-xs">{chosen.address}</code>
                <CopyButton text={chosen.address} label="Copy address" what="Address" />
              </div>
              <dl className="grid grid-cols-[6rem_1fr] gap-y-1.5 text-xs">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <StatusBadge status={chosen.status} />
                </dd>
                {version(chosen) && (
                  <>
                    <dt className="text-muted-foreground">Version</dt>
                    <dd>{version(chosen)}</dd>
                  </>
                )}
                {chosen.type === "asset" && (
                  <>
                    <dt className="text-muted-foreground">License</dt>
                    <dd className="break-words">{chosen.license ?? "None recorded"}</dd>
                  </>
                )}
                {chosen.expires && (
                  <>
                    <dt className="text-muted-foreground">Usable until</dt>
                    <dd>{chosen.expires}</dd>
                  </>
                )}
              </dl>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-muted/50 rounded-md p-2">
                  <dt className="text-muted-foreground">Upstream</dt>
                  <dd className="text-sm font-medium tabular-nums">{chosen.up}</dd>
                </div>
                <div className="bg-muted/50 rounded-md p-2">
                  <dt className="text-muted-foreground">Downstream</dt>
                  <dd className="text-sm font-medium tabular-nums">{chosen.down}</dd>
                </div>
              </dl>
              <div className="flex gap-2">
                {chosen.id !== id && (
                  <Button size="sm" className="flex-1" onClick={() => onOpen(chosen.id)}>
                    Its lineage
                  </Button>
                )}
                <Button asChild size="sm" variant="outline" className="flex-1">
                  <a href={openPath(chosen)}>
                    Open <IconExternalLink />
                  </a>
                </Button>
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>
      <p className="text-muted-foreground text-xs">Click a card for its details, double-click to walk the catalog to it, drag it to move it. A + shows the next hop, a - hides it again.</p>
    </div>
  );
}
