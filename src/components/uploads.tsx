"use client";

import { useState, useSyncExternalStore } from "react";
import {
  IconAlertCircle,
  IconChevronDown,
  IconCircleCheck,
  IconExternalLink,
  IconLoader2,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/icon-button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatBytes, truncateFilename } from "@/lib/filename";

export type Upload = {
  id: string;
  name: string;
  size: number;
  /** Bytes sent to storage so far. */
  loaded: number;
  status: "queued" | "uploading" | "saving" | "done" | "deduped" | "failed";
  error?: string;
  /** The asset it became (or already was), once saved. */
  assetId?: string;
  /** An object URL of the file, for an image's row; revoked when the row goes. */
  preview?: string;
};

export const isActive = (u: Upload) => u.status === "queued" || u.status === "uploading" || u.status === "saving";

/**
 * Upload rows outside React state: progress ticks several times a second per
 * file, and only the tray should redraw for them, not the grid beside it.
 * Rows that leave give back their preview URLs.
 */
export function uploadStore() {
  let rows: Upload[] = [];
  const subs = new Set<() => void>();
  const set = (next: Upload[] | ((rows: Upload[]) => Upload[])) => {
    const was = rows;
    rows = typeof next === "function" ? next(rows) : next;
    for (const u of was) if (u.preview && !rows.some((r) => r.id === u.id)) URL.revokeObjectURL(u.preview);
    subs.forEach((f) => f());
  };
  return {
    get: () => rows,
    set,
    patch: (id: string, patch: Partial<Upload>) => set((us) => us.map((u) => (u.id === id ? { ...u, ...patch } : u))),
    subscribe: (f: () => void) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
  };
}
export type UploadStore = ReturnType<typeof uploadStore>;

/** The server's rows: none, and the same none each time, or React warns that the server snapshot isn't cached. */
const NONE: Upload[] = [];

/** What a component needs of the store, as a value that only changes when it does. */
export function useUploads<T = Upload[]>(store: UploadStore, pick: (rows: Upload[]) => T = (r) => r as T) {
  return useSyncExternalStore(store.subscribe, () => pick(store.get()), () => pick(NONE));
}

/**
 * PUT straight to storage with byte-level progress. fetch() can't report
 * upload progress; XMLHttpRequest can, natively. `signal` cancels it.
 */
export function putWithProgress(
  url: string,
  file: File,
  mime: string,
  onProgress: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", mime);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Storage rejected the upload"));
    xhr.onerror = () => reject(new Error("Network error while uploading"));
    xhr.onabort = () => reject(new DOMException("Cancelled", "AbortError"));
    if (signal?.aborted) return xhr.abort();
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

const LABEL: Record<Upload["status"], string> = {
  queued: "Waiting",
  uploading: "",
  saving: "Processing",
  done: "Added",
  deduped: "Already in library",
  failed: "Failed",
};

export type TrayLabels = Partial<Record<Upload["status"], string>> & {
  /** The summary once every file landed, as "12 files sent for review". */
  finished?: (files: string) => string;
};

/**
 * Upload progress: one overall bar and a row per file. It stays until
 * dismissed when anything failed, so an error can't flash past unread.
 * Floats in the corner, lifted over the selection bar while that is up; or
 * `inline`, in the page's flow (a guest's upload page). Row actions show
 * when their handler is given.
 */
export function UploadTray({
  uploads,
  onDismiss,
  onCancel,
  onRetry,
  onOpen,
  missing = 0,
  onShowMissing,
  inline = false,
  labels,
}: {
  uploads: Upload[];
  onDismiss: () => void;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
  onOpen?: (assetId: string) => void;
  /** Landed files the page isn't showing (a filter excludes them). */
  missing?: number;
  onShowMissing?: () => void;
  inline?: boolean;
  labels?: TrayLabels;
}) {
  const [folded, setFolded] = useState(false);
  if (!uploads.length) return null;
  const label = { ...LABEL, ...labels };
  const active = uploads.filter(isActive).length;
  const failed = uploads.filter((u) => u.status === "failed").length;
  const finished = uploads.length - active;
  const total = uploads.reduce((n, u) => n + u.size, 0);
  // A finished file counts as fully sent, even one storage never needed (deduped).
  const sent = uploads.reduce((n, u) => n + (isActive(u) ? u.loaded : u.size), 0);
  const pct = total ? Math.round((sent / total) * 100) : 100;

  const files = (n: number) => `${n.toLocaleString()} ${n === 1 ? "file" : "files"}`;
  const summary = active
    ? `Uploading ${files(uploads.length)} · ${finished.toLocaleString()} done`
    : failed
      ? `${(uploads.length - failed).toLocaleString()} uploaded, ${failed.toLocaleString()} failed`
      : missing
        ? `${missing.toLocaleString()} added, not in this view`
        : (labels?.finished?.(files(uploads.length)) ?? `${files(uploads.length)} uploaded`);

  return (
    <section
      aria-label="Uploads"
      className={cn(
        "bg-popover text-popover-foreground rounded-xl border",
        inline
          ? "w-full"
          : "fixed right-4 bottom-4 z-40 w-[min(360px,calc(100vw-32px))] shadow-lg transition-[bottom] duration-200 [body:has([data-floating=selection])_&]:bottom-20",
      )}
    >
      <header className="flex items-center gap-2 px-4 pt-3 pb-2">
        {/* The header folds the list away and keeps the bar, for a long batch. */}
        <button
          type="button"
          onClick={() => setFolded((f) => !f)}
          aria-expanded={!folded}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left"
        >
          {active ? (
            <IconLoader2 className="text-muted-foreground size-4 shrink-0 animate-spin" />
          ) : failed ? (
            <IconAlertCircle className="text-destructive size-4 shrink-0" />
          ) : (
            <IconCircleCheck className="text-success size-4 shrink-0" />
          )}
          <p role="status" className="flex-1 truncate text-sm font-medium">
            {summary}
          </p>
          <IconChevronDown className={cn("text-muted-foreground size-4 shrink-0 transition-transform", folded && "rotate-180")} />
        </button>
        {!active && missing > 0 && onShowMissing && (
          <Button variant="link" size="sm" className="h-auto px-0" onClick={onShowMissing}>
            Show
          </Button>
        )}
        {!active && (
          <Button variant="ghost" size="icon-xs" onClick={onDismiss} aria-label="Dismiss uploads">
            <IconX />
          </Button>
        )}
      </header>
      <Progress
        value={pct}
        aria-label="Overall upload progress"
        className={cn("mx-4 mb-3 w-auto", failed && !active && "[&>div]:bg-destructive", !folded && "mb-0")}
      />
      {!folded && (
        <ul className="max-h-64 overflow-y-auto px-4 py-2">
          {uploads.map((u) => {
            const p = u.size ? Math.round((u.loaded / u.size) * 100) : 0;
            const landed = (u.status === "done" || u.status === "deduped") && u.assetId;
            return (
              <li key={u.id} className="py-1.5">
                <div className="flex items-center gap-2">
                  {u.preview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.preview} alt="" className="bg-muted size-6 shrink-0 rounded object-cover" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm" title={u.name}>
                    {truncateFilename(u.name, 28)}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-xs tabular-nums",
                      u.status === "failed" ? "text-destructive" : u.status === "done" ? "text-success" : "text-muted-foreground",
                    )}
                  >
                    {u.status === "uploading" ? `${p}% of ${formatBytes(u.size)}` : label[u.status]}
                  </span>
                  {isActive(u) && onCancel && (
                    <IconButton variant="ghost" size="icon-xs" label={`Cancel ${u.name}`} onClick={() => onCancel(u.id)}>
                      <IconX />
                    </IconButton>
                  )}
                  {u.status === "failed" && onRetry && (
                    <IconButton variant="ghost" size="icon-xs" label={`Retry ${u.name}`} onClick={() => onRetry(u.id)}>
                      <IconRefresh />
                    </IconButton>
                  )}
                  {landed && onOpen && (
                    <IconButton variant="ghost" size="icon-xs" label={`Open ${u.name}`} onClick={() => onOpen(u.assetId!)}>
                      <IconExternalLink />
                    </IconButton>
                  )}
                </div>
                {u.status === "uploading" && <Progress value={p} aria-label={`${u.name} progress`} className="mt-1 h-1" />}
                {u.error && <p className="text-destructive mt-1 text-xs">{u.error}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
