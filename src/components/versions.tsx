"use client";

import { useEffect, useRef, useState } from "react";
import { IconArrowBackUp, IconCheck, IconColumns, IconPhoto, IconSend, IconUpload, IconArchive } from "@/components/icons";
import { toast } from "sonner";
import { send } from "@/components/collections";
import { useCan } from "@/components/can";
import { Fold } from "@/components/fields";
import { Thumb, type Asset } from "@/components/gallery";
import { moveTo } from "@/components/review-actions";
import { usePref } from "@/components/sidebar-prefs";
import { putWithProgress } from "@/components/uploads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { fileTypeBadge, formatBytes, tooLargeToUpload } from "@/lib/filename";
import { STATE_LABEL } from "@/lib/lifecycle";
import { hasPreview } from "@/lib/preview";
import { ago, exact } from "@/lib/time";
import { undoable } from "@/lib/undo";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/info-tip";
import { flash } from "@/lib/motion";
import { reason, refusal } from "@/lib/send";

const title = (a: Asset) => a.metadata?.title || a.filename;

/** What sits behind a preview: a transparency grid, white or black, so white and black marks both show. */
export type PreviewBg = "checker" | "light" | "dark";
export const PREVIEW_BG: Record<PreviewBg | "auto", string> = {
  checker: "bg-checker",
  light: "bg-white",
  dark: "bg-neutral-900",
  auto: "bg-muted/50",
};
const TRANSPARENT = /^image\/(png|svg\+xml|webp|avif|gif)$/;

/**
 * The preview background the viewer picked, remembered per browser; until
 * they pick, a format that can be transparent gets the grid.
 */
export function usePreviewBg(mime: string) {
  const [picked, setPicked] = usePref<PreviewBg | null>("artbucket:preview-bg", null);
  const bg: PreviewBg | "auto" = picked ?? (TRANSPARENT.test(mime) ? "checker" : "auto");
  return [bg, setPicked] as const;
}

/** Undo a status move: back where it was, and the panel told. */
const moveBack = (a: Asset, status: Asset["status"], onChanged: (asset: Asset) => void) => async () => {
  const r = await moveTo(a, status);
  if (!r.ok) throw new Error();
  onChanged((await r.json()).data);
};

/** The status in a line of badges under the title: "Approved", "until 12/31/2026", "embargoed until". */
export function StatusBadges({ asset }: { asset: Asset }) {
  const r = asset.rights;
  const today = new Date().toISOString().slice(0, 10);
  if (asset.state !== "active") return <Badge variant="outline">{STATE_LABEL[asset.state]}</Badge>;
  return (
    <>
      <Badge variant="success">
        {/* One of several versions: the one in use, as the prototype's "Current · v2" says. */}
        <IconCheck /> {asset.stackId && asset.version && asset.current ? `Current · v${asset.version}` : "Approved"}
      </Badge>
      {r?.expires && <Badge variant="outline">until {new Date(`${r.expires}T00:00:00`).toLocaleDateString()}</Badge>}
      {r?.embargo && r.embargo > today && (
        <Badge variant="warning">embargoed until {new Date(`${r.embargo}T00:00:00`).toLocaleDateString()}</Badge>
      )}
    </>
  );
}

/**
 * Where an asset is in its lifecycle when it is out of the library, and the
 * move that comes next. A proposal and a rejection are Review's to show, an
 * approved asset's status is a badge under the title; this is the rest.
 * `approve` is the viewer's own, so a draft goes live with what the form says.
 */
export function Lifecycle({
  asset,
  onChanged,
  approve,
}: {
  asset: Asset;
  onChanged: (asset: Asset) => void;
  approve?: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const can = useCan();
  const review = can("asset.review", asset);
  const move = async (status: Asset["status"], done: string, undo?: boolean) => {
    setBusy(status);
    const next = await send("PATCH", `/api/v1/assets/${asset.id}`, { status });
    setBusy(null);
    if (!next) return;
    onChanged(next);
    if (undo) undoable(done, { undo: moveBack(asset, asset.status, onChanged) });
    else toast.success(done);
  };
  const r = asset.rights;
  if (asset.state === "active") return null;

  const restore = async () => {
    setBusy("restore");
    const back = await send("POST", `/api/v1/assets/${asset.id}/restore`);
    setBusy(null);
    if (!back) return;
    toast.success("Restored");
    onChanged(back);
  };
  const purged = asset.deletedAt ? new Date(new Date(asset.deletedAt).getTime() + 30 * 86_400_000).toLocaleDateString() : null;
  const says = {
    deleted: `Deleted, links off. Restore it before ${purged}, or it is gone for good.`,
    draft: "Out of the library, links off, until approved.",
    expired: `Expired ${r?.expires}: links off, checks refuse it. A later date under Rights brings it back.`,
    archived: "Archived: links off, checks refuse it.",
  }[asset.state as "deleted" | "draft" | "expired" | "archived"];
  if (!says) return null;
  return (
    <div className="bg-muted/40 grid gap-2 rounded-lg border p-3 text-sm">
      <p className="text-muted-foreground text-xs">{says}</p>
      <div className="flex flex-wrap gap-2 empty:hidden">
        {asset.state === "draft" && can("asset.edit", asset) && (
          <Button
            type="button"
            size="sm"
            variant={review ? "outline" : "default"}
            disabled={!!busy}
            pending={busy === "proposed"}
            onClick={() => move("proposed", "Sent for review")}
          >
            <IconSend /> Submit for review
          </Button>
        )}
        {asset.state === "draft" && review && (
          <Button
            type="button"
            size="sm"
            disabled={!!busy}
            pending={busy === "active"}
            onClick={async () => {
              if (!approve) return move("active", "Approved");
              setBusy("active");
              await approve();
              setBusy(null);
            }}
          >
            <IconCheck /> Approve
          </Button>
        )}
        {asset.state === "expired" && review && (
          <Button type="button" size="sm" variant="outline" disabled={!!busy} pending={busy === "archived"} onClick={() => move("archived", "Archived. Its links stop working.", true)}>
            <IconArchive /> Archive
          </Button>
        )}
        {asset.state === "deleted" && can("asset.delete", asset) && (
          <Button type="button" size="sm" variant="outline" disabled={!!busy} pending={busy === "restore"} onClick={restore}>
            <IconArrowBackUp /> Restore
          </Button>
        )}
        {asset.state === "archived" && review && (
          <Button type="button" size="sm" variant="outline" disabled={!!busy} pending={busy === "active"} onClick={() => move("active", "Back in the library", true)}>
            <IconArrowBackUp /> Unarchive
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * A new file for this asset: uploaded, then added to its stack with
 * versionOf, current at once or as a draft. Shared by the New version menu
 * and a file dropped on the open asset. `onOpen` shows the version made.
 */
export function useVersionUpload(asset: Asset, onOpen: (id: string) => void) {
  const [busy, setBusy] = useState(false);
  // How far the file is, shown where it was asked for (the button, the dropped-on preview), not in a toast.
  const [pct, setPct] = useState<number | null>(null);
  async function upload(f: File, draft = false) {
    setBusy(true);
    setPct(0);
    const mime = f.type || "application/octet-stream";
    try {
      const big = tooLargeToUpload(f.size);
      if (big) throw new Error(big);
      const ticket = await fetch("/api/v1/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: f.name, mime, size: f.size }),
      });
      if (!ticket.ok) throw new Error(await refusal(ticket, "Upload failed"));
      const { token, uploadUrl } = await ticket.json();
      await putWithProgress(uploadUrl, f, mime, (loaded) => setPct(Math.round((loaded / f.size) * 100)));
      const res = await fetch("/api/v1/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, filename: f.name, mime, versionOf: asset.id, ...(draft && { status: "draft" }) }),
      });
      if (!res.ok) throw new Error(await refusal(res, "Couldn't add the version"));
      const body = await res.json().catch(() => null);
      if (!body) throw new Error("Couldn't add the version");
      const v: Asset = body.data;
      toast.success(
        body.deduped
          ? "That file is already a version of this"
          : v.status === "active"
            ? `Version ${v.version} is current`
            : `Version ${v.version} added as ${STATE_LABEL[v.state].toLowerCase()}`,
      );
      onOpen(v.id);
    } catch (e) {
      toast.error(reason(e, "Upload failed"));
    } finally {
      setBusy(false);
      setPct(null);
    }
  }
  return { upload, busy, pct };
}

/** How far an upload is, as a line along the bottom of the button that started it. */
export function UploadStrip({ pct }: { pct: number }) {
  return (
    <span
      aria-hidden
      className="bg-primary pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left rounded-full transition-transform duration-300"
      style={{ transform: `scaleX(${pct / 100})` }}
    />
  );
}

/**
 * The asset's stack of versions, folded to "3 versions · v3 current": which
 * one is current, rolling back to an earlier one, comparing two side by
 * side, and adding the next.
 */
export function Versions({
  asset,
  onChanged,
  onOpen,
}: {
  asset: Asset;
  /** Something about this asset changed: current, superseded. */
  onChanged: (asset: Asset) => void;
  onOpen: (id: string) => void;
}) {
  // null while loading: a stack shows skeleton rows, not the explanation, until it lands.
  const [versions, setVersions] = useState<Asset[] | null>(null);
  const [comparing, setComparing] = useState<{ with: Asset; open: boolean } | null>(null);
  // The version being made current: its own button spins, the others wait.
  const [making, setMaking] = useState<string | null>(null);
  const busy = making !== null;
  const file = useRef<HTMLInputElement>(null);
  const draft = useRef(false);
  const can = useCan();
  const { upload, busy: uploading, pct } = useVersionUpload(asset, onOpen);
  const strip = pct !== null && <UploadStrip pct={pct} />;
  useEffect(() => {
    let live = true;
    fetch(`/api/v1/assets/${asset.id}/versions`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => live && setVersions(j.data))
      .catch(() => live && setVersions([]));
    return () => {
      live = false;
    };
  }, [asset.id, asset.updatedAt]);

  const mayAdd = can("asset.version", asset);
  const list = versions ?? [];
  if (versions && versions.length < 2 && !mayAdd) return null;
  if (!versions && !asset.stackId && !mayAdd) return null;

  async function makeCurrent(v: Asset) {
    const was = list.find((x) => x.current);
    setMaking(v.id);
    const next: Asset[] | null = await send("POST", `/api/v1/assets/${asset.id}/versions/${v.version}/current`);
    setMaking(null);
    if (!next) return;
    const apply = (vs: Asset[]) => {
      setVersions(vs);
      const self = vs.find((x) => x.id === asset.id);
      if (self) onChanged(self);
      // The row that is current now lights up, where Current moved to.
      const now = vs.find((x) => x.current);
      if (now) flash(`[data-version="${CSS.escape(now.id)}"]`);
    };
    apply(next);
    const message = `Version ${v.version} is current`;
    if (!was) return void toast.success(message);
    undoable(message, {
      undo: async () => {
        const back: Asset[] | null = await send("POST", `/api/v1/assets/${asset.id}/versions/${was.version}/current`);
        if (!back) throw new Error();
        apply(back);
      },
    });
  }

  const pick = (asDraft: boolean) => {
    draft.current = asDraft;
    file.current?.click();
  };
  const current = list.find((v) => v.current);
  const summary = versions ? (
    `${list.length || 1} ${list.length > 1 ? "versions" : "version"}${current && list.length > 1 ? ` · v${current.version} current` : ""}`
  ) : (
    <span className="bg-accent inline-block h-3 w-20 animate-pulse rounded-md align-middle" />
  );

  return (
    <Fold title="Versions" summary={summary} remember="versions">
      {mayAdd && (
        <div className="flex">
          <input
            ref={file}
            type="file"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f, draft.current);
            }}
          />
          {can("asset.edit", asset) ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" variant="outline" pending={uploading} disabled={busy}>
                  <IconUpload /> New version
                  {strip}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => pick(false)}>Upload, and make it current</DropdownMenuItem>
                <DropdownMenuItem onClick={() => pick(true)}>Upload as a draft</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button type="button" size="sm" variant="outline" pending={uploading} disabled={busy} onClick={() => pick(false)}>
              <IconUpload /> Suggest a new version
              {strip}
            </Button>
          )}
        </div>
      )}
      {!versions ? (
        asset.stackId && <ul className="grid gap-1" aria-busy>
          {[0, 1].map((i) => (
            <li key={i} className="flex items-center gap-2 p-1">
              <Skeleton className="size-8 shrink-0 rounded" />
              <Skeleton className="h-3 flex-1" />
            </li>
          ))}
        </ul>
      ) : list.length < 2 ? (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          Drop a new version on the preview.
          <InfoTip>Once approved, it replaces this one: checks point to it, and share links serve it.</InfoTip>
        </p>
      ) : (
        <ul className="grid gap-1">
          {list.map((v) => (
            <li
              key={v.id}
              data-version={v.id}
              aria-current={v.id === asset.id || undefined}
              className={cn("flex items-center gap-2 rounded-md p-1 text-sm", v.id === asset.id && "bg-muted")}
            >
              <button type="button" onClick={() => onOpen(v.id)} className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left hover:underline">
                <span className="bg-muted relative size-8 shrink-0 overflow-hidden rounded">
                  {hasPreview(v) && <Thumb src={`/a/${v.id}/w_64,f_webp`} alt="" />}
                </span>
                <span className="text-muted-foreground shrink-0 tabular-nums">v{v.version}</span>
                <span className="truncate">{title(v)}</span>
              </button>
              {v.current ? (
                <Badge>Current</Badge>
              ) : v.state !== "active" ? (
                <Badge variant="outline">{STATE_LABEL[v.state]}</Badge>
              ) : null}
              <time
                dateTime={v.createdAt}
                title={exact(v.createdAt)}
                className="text-muted-foreground hidden shrink-0 text-xs sm:inline"
                suppressHydrationWarning
              >
                {ago(v.createdAt)}
              </time>
              {v.id !== asset.id && (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Compare with version ${v.version}`}
                  onClick={() => setComparing({ with: v, open: true })}
                >
                  <IconColumns />
                </Button>
              )}
              {!v.current && v.state === "active" && can("asset.review", v) && (
                <Button type="button" size="sm" variant="ghost" pending={making === v.id} disabled={busy} onClick={() => makeCurrent(v)}>
                  Make current
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {comparing && (
        <Compare
          open={comparing.open}
          pair={[comparing.with, asset].sort((a, b) => (a.version ?? 0) - (b.version ?? 0)) as [Asset, Asset]}
          onClose={() => setComparing((c) => c && { ...c, open: false })}
        />
      )}
    </Fold>
  );
}

/** Two versions side by side, older on the left, and what differs between them. */
function Compare({ pair, open, onClose }: { pair: [Asset, Asset]; open: boolean; onClose: () => void }) {
  const [bg] = usePreviewBg(pair[1].mime);
  const rows: [string, (a: Asset) => string][] = [
    ["State", (a) => (a.current ? `${STATE_LABEL[a.state]}, current` : STATE_LABEL[a.state])],
    ["File", (a) => a.filename],
    ["Type", (a) => fileTypeBadge(a.filename, a.mime, a.probe)],
    ["Size", (a) => (a.width && a.height ? `${a.width} × ${a.height} · ` : "") + formatBytes(a.size)],
    ["Title", (a) => a.metadata?.title ?? ""],
    ["Last day of use", (a) => a.rights?.expires ?? ""],
    ["Made with", (a) => a.generator ?? ""],
    ["Added", (a) => `${new Date(a.createdAt).toLocaleDateString()}${a.proposedBy ? `, by ${a.proposedBy}` : ""}`],
  ];
  return (
    // Kept mounted while it closes, so it animates out.
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogTitle>
          Version {pair[0].version} and version {pair[1].version}
        </DialogTitle>
        <DialogDescription>Older on the left. What differs is in bold.</DialogDescription>
        <div className="grid grid-cols-2 gap-3">
          {pair.map((a) => (
            <figure key={a.id} className="grid gap-2">
              <div className={cn("relative aspect-square overflow-hidden rounded-lg border", PREVIEW_BG[bg])}>
                {hasPreview(a) ? (
                  <Thumb src={`/a/${a.id}/w_640,f_webp`} alt={title(a)} className="p-3" />
                ) : (
                  <span className="text-muted-foreground flex size-full items-center justify-center">
                    <IconPhoto className="size-8" stroke={1.5} />
                  </span>
                )}
              </div>
              <figcaption className="text-sm font-medium">v{a.version}</figcaption>
            </figure>
          ))}
        </div>
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([label, of]) => {
              const [x, y] = pair.map(of);
              const differs = x !== y;
              return (
                <tr key={label} className="border-t">
                  <th scope="row" className="text-muted-foreground w-32 py-1.5 pr-2 text-left align-top font-normal">
                    {label}
                  </th>
                  {[x, y].map((v, i) => (
                    <td key={i} className={cn("w-1/2 py-1.5 pr-2 align-top break-all", differs && "font-medium")}>
                      {v || <span className="text-muted-foreground">-</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}
