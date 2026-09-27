"use client";

import { useEffect, useRef, useState } from "react";
import { IconArchive, IconArrowBackUp, IconCheck, IconColumns, IconPhoto, IconSend, IconStack2, IconUpload } from "@tabler/icons-react";
import { toast } from "sonner";
import { send } from "@/components/collections";
import { useCan } from "@/components/can";
import { Thumb, type Asset } from "@/components/gallery";
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
import { fileTypeBadge, formatBytes } from "@/lib/filename";
import { STATE_LABEL } from "@/lib/lifecycle";
import { hasPreview } from "@/lib/preview";
import { ago } from "@/lib/time";
import { cn } from "@/lib/utils";

const title = (a: Asset) => a.metadata?.title || a.filename;

/**
 * Where an asset is in its lifecycle, and the move that comes next. A
 * proposal and a rejection are Review's to show; this is the rest. Each
 * button acts at once through the public PATCH, separately from Save.
 */
export function Lifecycle({ asset, onChanged }: { asset: Asset; onChanged: (asset: Asset) => void }) {
  const [busy, setBusy] = useState(false);
  const can = useCan();
  const review = can("asset.review", asset);
  const move = async (status: Asset["status"], done: string) => {
    setBusy(true);
    const next = await send("PATCH", `/api/v1/assets/${asset.id}`, { status });
    setBusy(false);
    if (!next) return;
    toast.success(done);
    onChanged(next);
  };
  const r = asset.rights;

  if (asset.state === "active") {
    if (!review) return null;
    return (
      <div className="text-muted-foreground flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs">
        <IconCheck className="size-4" />
        <span className="flex-1">
          Approved{r?.expires ? `, in use until ${r.expires}` : ""}
          {r?.embargo && r.embargo > new Date().toISOString().slice(0, 10) ? `; embargoed until ${r.embargo}` : ""}
        </span>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => move("archived", "Archived: its links now answer 410")}>
          <IconArchive /> Archive
        </Button>
      </div>
    );
  }

  const says = {
    draft: "Out of the library, and its links, until it is approved.",
    expired: `Its last day of use was ${r?.expires}: its links answer 410 and checks refuse it. A later date under Rights brings it back.`,
    archived: "Retired: out of the library, its links answer 410, and checks refuse it.",
  }[asset.state as "draft" | "expired" | "archived"];
  if (!says) return null;
  return (
    <div className="bg-muted/40 grid gap-2 rounded-lg border p-3 text-sm">
      <p className="font-medium">{STATE_LABEL[asset.state]}</p>
      <p className="text-muted-foreground text-xs">{says}</p>
      <div className="flex gap-2">
        {asset.state === "draft" && can("asset.edit", asset) && (
          <Button type="button" size="sm" variant={review ? "outline" : "default"} disabled={busy} onClick={() => move("proposed", "Sent for review")}>
            <IconSend /> Submit for review
          </Button>
        )}
        {asset.state === "draft" && review && (
          <Button type="button" size="sm" disabled={busy} onClick={() => move("active", "Approved")}>
            <IconCheck /> Approve
          </Button>
        )}
        {asset.state === "expired" && review && (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => move("archived", "Archived")}>
            <IconArchive /> Archive
          </Button>
        )}
        {asset.state === "archived" && review && (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => move("active", "Back in the library")}>
            <IconArrowBackUp /> Unarchive
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * The asset's stack of versions: which one is current, rolling back to an
 * earlier one, comparing two side by side, and adding the next.
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
  const [versions, setVersions] = useState<Asset[]>([]);
  const [comparing, setComparing] = useState<Asset | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const draft = useRef(false);
  const can = useCan();
  useEffect(() => {
    let live = true;
    fetch(`/api/v1/assets/${asset.id}/versions`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => live && setVersions(j.data));
    return () => {
      live = false;
    };
  }, [asset.id, asset.updatedAt]);

  const mayAdd = can("asset.version", asset);
  if (versions.length < 2 && !mayAdd) return null;

  async function makeCurrent(v: Asset) {
    setBusy(true);
    const next: Asset[] | null = await send("POST", `/api/v1/assets/${asset.id}/versions/${v.version}/current`);
    setBusy(false);
    if (!next) return;
    toast.success(`Version ${v.version} is current`);
    setVersions(next);
    const self = next.find((x) => x.id === asset.id);
    if (self) onChanged(self);
  }

  async function upload(f: File) {
    setBusy(true);
    const id = toast.loading(`Uploading ${f.name}`);
    const mime = f.type || "application/octet-stream";
    try {
      const ticket = await fetch("/api/v1/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: f.name, mime, size: f.size }),
      });
      if (!ticket.ok) throw new Error((await ticket.json()).error?.message ?? "Upload failed");
      const { token, uploadUrl } = await ticket.json();
      await putWithProgress(uploadUrl, f, mime, (loaded) =>
        toast.loading(`Uploading ${f.name}: ${Math.round((loaded / f.size) * 100)}%`, { id }),
      );
      const res = await fetch("/api/v1/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, filename: f.name, mime, versionOf: asset.id, ...(draft.current && { status: "draft" }) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message ?? "Couldn't add the version");
      const v: Asset = body.data;
      toast.success(
        body.deduped
          ? "That file is already a version of this"
          : v.status === "active"
            ? `Version ${v.version} is current`
            : `Version ${v.version} added as ${STATE_LABEL[v.state].toLowerCase()}`,
        { id },
      );
      onOpen(v.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed", { id });
    } finally {
      setBusy(false);
    }
  }

  const pick = (asDraft: boolean) => {
    draft.current = asDraft;
    file.current?.click();
  };

  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <p className="flex flex-1 items-center gap-2 text-sm font-medium">
          <IconStack2 className="size-4" /> Versions
        </p>
        {mayAdd && (
          <>
            <input
              ref={file}
              type="file"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void upload(f);
              }}
            />
            {can("asset.edit", asset) ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="sm" variant="outline" disabled={busy}>
                    <IconUpload /> New version
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => pick(false)}>Upload, and make it current</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => pick(true)}>Upload as a draft</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => pick(false)}>
                <IconUpload /> Suggest a new version
              </Button>
            )}
          </>
        )}
      </div>
      {versions.length < 2 ? (
        <p className="text-muted-foreground text-xs">
          A new file for the same thing replaces this one once approved: checks point to it, and share links serve it.
        </p>
      ) : (
        <ul className="grid gap-1">
          {versions.map((v) => (
            <li key={v.id} className={cn("flex items-center gap-2 rounded-md p-1 text-sm", v.id === asset.id && "bg-muted")}>
              <button type="button" onClick={() => onOpen(v.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left hover:underline">
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
              <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline" suppressHydrationWarning>
                {ago(v.createdAt)}
              </span>
              {v.id !== asset.id && (
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Compare with version ${v.version}`} onClick={() => setComparing(v)}>
                  <IconColumns />
                </Button>
              )}
              {!v.current && v.state === "active" && can("asset.review", v) && (
                <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => makeCurrent(v)}>
                  Make current
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {comparing && <Compare pair={[comparing, asset].sort((a, b) => (a.version ?? 0) - (b.version ?? 0)) as [Asset, Asset]} onClose={() => setComparing(null)} />}
    </div>
  );
}

/** Two versions side by side, older on the left, and what differs between them. */
function Compare({ pair, onClose }: { pair: [Asset, Asset]; onClose: () => void }) {
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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogTitle>
          Version {pair[0].version} and version {pair[1].version}
        </DialogTitle>
        <DialogDescription>Older on the left. What differs is in bold.</DialogDescription>
        <div className="grid grid-cols-2 gap-3">
          {pair.map((a) => (
            <figure key={a.id} className="grid gap-2">
              <div className="bg-muted relative aspect-square overflow-hidden rounded-lg border">
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
