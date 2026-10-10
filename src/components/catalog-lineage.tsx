"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { Background, Controls, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { IconPlus } from "@tabler/icons-react";
import { TypeIcon, StatusBadge } from "@/components/catalog";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { EDGE_LABEL, TYPE_LABEL, type EdgeKind } from "@/lib/catalog";
import type { LineageEdge, LineageNode } from "@/lib/core/catalog";
import { cn } from "@/lib/utils";

/**
 * An object's lineage as a graph (GET /api/v1/catalog/{id}/lineage): one hop
 * each way to start, and a + on any side of a node that goes further, which
 * fetches that node's next hop and grows the graph. Upstream sits left,
 * downstream right. Opening a node walks the catalog to it, on this tab.
 */

type Lineage = { root: string; nodes: LineageNode[]; edges: LineageEdge[]; unseen: number; impact: { line: string } };
type Graph = { nodes: Map<string, LineageNode>; edges: Map<string, LineageEdge>; unseen: number; impact: string };
type Dir = "up" | "down";

const W = 240;
const COL = 320;
const ROW = 92;
const keyOf = (e: LineageEdge) => `${e.from}>${e.to}>${e.kind}`;

const fetchHop = async (id: string, direction: string) => {
  const res = await fetch(`/api/v1/catalog/${encodeURIComponent(id)}/lineage?depth=1&direction=${direction}`);
  if (!res.ok) throw new Error(`Lineage answered ${res.status}`);
  return (await res.json()) as Lineage;
};

/** Columns by hops from the root: upstream negative, downstream positive; each column centred on the root's row. */
function layout(root: string, g: Graph): Map<string, { x: number; y: number }> {
  const level = new Map([[root, 0]]);
  const queue = [root];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of g.edges.values()) {
      const next = e.from === id ? e.to : e.to === id ? e.from : null;
      if (!next || level.has(next)) continue;
      level.set(next, level.get(id)! + (e.from === id ? 1 : -1));
      queue.push(next);
    }
  }
  const columns = new Map<number, string[]>();
  for (const id of g.nodes.keys()) {
    const l = level.get(id) ?? 0;
    columns.set(l, [...(columns.get(l) ?? []), id]);
  }
  const at = new Map<string, { x: number; y: number }>();
  for (const [l, ids] of columns) ids.forEach((id, i) => at.set(id, { x: l * COL, y: (i - (ids.length - 1) / 2) * ROW }));
  return at;
}

type Data = {
  item: LineageNode;
  root: boolean;
  more: { up: boolean; down: boolean };
  busy: Dir | null;
  onExpand: (id: string, dir: Dir) => void;
  onOpen: (id: string) => void;
};

const Plus = ({ side, data }: { side: Dir; data: Data }) => (
  <button
    type="button"
    aria-label={side === "up" ? `Show what ${data.item.name} comes from` : `Show what uses ${data.item.name}`}
    onClick={(e) => {
      e.stopPropagation();
      data.onExpand(data.item.id, side);
    }}
    className={cn(
      "nodrag bg-background text-muted-foreground hover:text-foreground hover:border-primary absolute top-1/2 z-10 flex size-5 -translate-y-1/2 items-center justify-center rounded-full border shadow-xs",
      side === "up" ? "-left-2.5" : "-right-2.5",
    )}
  >
    {data.busy === side ? <Spinner className="size-3" /> : <IconPlus className="size-3" />}
  </button>
);

const ObjectNode = memo(function ObjectNode({ data }: NodeProps<Node<Data>>) {
  const { item, root } = data;
  return (
    <div className="relative" style={{ width: W }}>
      <Handle type="target" position={Position.Left} className="!opacity-0" isConnectable={false} />
      <button
        type="button"
        onClick={() => !root && data.onOpen(item.id)}
        aria-current={root ? "true" : undefined}
        className={cn(
          "bg-card flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2 text-left shadow-xs transition-colors",
          root ? "border-primary ring-primary/20 cursor-default ring-2" : "hover:border-primary/60",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          <TypeIcon type={item.type} className="text-muted-foreground size-4 shrink-0" />
          <span className="truncate">{item.name}</span>
          {item.status !== "current" && <StatusBadge status={item.status} className="ml-auto" />}
        </span>
        <span className="text-muted-foreground truncate text-xs">
          {TYPE_LABEL[item.type].one} · {item.project.name}
          {item.release ? ` · @${item.release}` : ""}
        </span>
      </button>
      {data.more.up && <Plus side="up" data={data} />}
      {data.more.down && <Plus side="down" data={data} />}
      <Handle type="source" position={Position.Right} className="!opacity-0" isConnectable={false} />
    </div>
  );
});

const nodeTypes = { object: ObjectNode };

/** Keyed by `id` where it is used: another object starts a graph of its own. */
export function LineageGraph({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const { resolvedTheme } = useTheme();
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<{ id: string; dir: Dir } | null>(null);

  useEffect(() => {
    let live = true;
    fetchHop(id, "up,down")
      .then((l) => live && setGraph({ nodes: new Map(l.nodes.map((n) => [n.id, n])), edges: new Map(l.edges.map((e) => [keyOf(e), e])), unseen: l.unseen, impact: l.impact.line }))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [id]);

  const expand = useCallback(async (node: string, dir: Dir) => {
    setBusy({ id: node, dir });
    try {
      const l = await fetchHop(node, dir);
      setGraph((g) => {
        if (!g) return g;
        const nodes = new Map(g.nodes);
        for (const n of l.nodes) nodes.set(n.id, n);
        const edges = new Map(g.edges);
        for (const e of l.edges) edges.set(keyOf(e), e);
        return { ...g, nodes, edges, unseen: g.unseen + l.unseen };
      });
      // Expanded once, its + goes, whether or not the hop held anything the caller can see.
      setDone((d) => new Set(d).add(`${node}:${dir}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, []);

  const flow = useMemo(() => {
    if (!graph) return null;
    const at = layout(id, graph);
    const shown = (n: string, dir: Dir) => [...graph.edges.values()].filter((e) => (dir === "up" ? e.to === n : e.from === n)).length;
    const nodes: Node<Data>[] = [...graph.nodes.values()].map((item) => ({
      id: item.id,
      type: "object",
      position: at.get(item.id) ?? { x: 0, y: 0 },
      data: {
        item,
        root: item.id === id,
        more: {
          up: !done.has(`${item.id}:up`) && item.up > shown(item.id, "up"),
          down: !done.has(`${item.id}:down`) && item.down > shown(item.id, "down"),
        },
        busy: busy?.id === item.id ? busy.dir : null,
        onExpand: expand,
        onOpen,
      },
    }));
    const edges: Edge[] = [...graph.edges.values()].map((e) => ({
      id: keyOf(e),
      source: e.from,
      target: e.to,
      // A rule's edge reads as its key (logo.primary); the others, as what they are.
      label: e.kind === "rule" && e.via ? e.via : EDGE_LABEL[e.kind as EdgeKind],
      labelStyle: { fontSize: 11 },
      labelBgPadding: [4, 2] as [number, number],
      animated: e.kind === "replaced_by",
    }));
    return { nodes, edges };
  }, [graph, id, done, busy, expand, onOpen]);

  if (error) return <p className="text-destructive text-sm">{error}</p>;
  if (!flow || !graph) return <div className="bg-muted/40 h-[480px] animate-pulse rounded-xl border" />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="warning">Impact</Badge>
        <span>{graph.impact}</span>
        {graph.unseen > 0 && (
          <span className="text-muted-foreground">
            {graph.unseen === 1 ? "1 object you can't see" : `${graph.unseen} objects you can't see`} also{" "}
            {graph.unseen === 1 ? "links" : "link"} here.
          </span>
        )}
      </div>
      <div className="h-[480px] overflow-hidden rounded-xl border">
        {/* Keyed by its size: a hop added fits the grown graph back into view. */}
        <ReactFlow
          key={graph.nodes.size}
          nodes={flow.nodes}
          edges={flow.edges}
          nodeTypes={nodeTypes}
          colorMode={resolvedTheme === "dark" ? "dark" : "light"}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          nodesConnectable={false}
          nodesDraggable
          proOptions={{ hideAttribution: true }}
          minZoom={0.2}
        >
          <Background gap={20} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <p className="text-muted-foreground text-xs">Upstream on the left, what uses it on the right. A + shows the next hop; open a node to walk the catalog to it.</p>
    </div>
  );
}
