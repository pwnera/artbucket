"use client";

import { IconAlertCircle, IconCircleCheck, IconLoader2, IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
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
};

export const isActive = (u: Upload) => u.status === "queued" || u.status === "uploading" || u.status === "saving";

/**
 * PUT straight to storage with byte-level progress. fetch() can't report
 * upload progress; XMLHttpRequest can, natively.
 */
export function putWithProgress(
  url: string,
  file: File,
  mime: string,
  onProgress: (loaded: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", mime);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Storage rejected the upload"));
    xhr.onerror = () => reject(new Error("Network error while uploading"));
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

/**
 * Upload progress: one overall bar and a row per file. It stays until
 * dismissed when anything failed, so an error can't flash past unread.
 */
export function UploadTray({ uploads, onDismiss }: { uploads: Upload[]; onDismiss: () => void }) {
  if (!uploads.length) return null;
  const active = uploads.filter(isActive).length;
  const failed = uploads.filter((u) => u.status === "failed").length;
  const finished = uploads.length - active;
  const total = uploads.reduce((n, u) => n + u.size, 0);
  // A finished file counts as fully sent, even one storage never needed (deduped).
  const sent = uploads.reduce((n, u) => n + (isActive(u) ? u.loaded : u.size), 0);
  const pct = total ? Math.round((sent / total) * 100) : 100;

  const files = (n: number) => `${n} ${n === 1 ? "file" : "files"}`;
  const summary = active
    ? `Uploading ${files(uploads.length)} · ${finished} done`
    : failed
      ? `${uploads.length - failed} uploaded, ${failed} failed`
      : `${files(uploads.length)} uploaded`;

  return (
    <section
      aria-label="Uploads"
      className="bg-popover text-popover-foreground fixed right-4 bottom-4 z-40 w-[min(360px,calc(100vw-32px))] rounded-xl border shadow-lg"
    >
      <header className="flex items-center gap-2 px-4 pt-3 pb-2">
        {active ? (
          <IconLoader2 className="text-muted-foreground size-4 animate-spin" />
        ) : failed ? (
          <IconAlertCircle className="text-destructive size-4" />
        ) : (
          <IconCircleCheck className="size-4 text-emerald-600" />
        )}
        <p role="status" className="flex-1 text-sm font-medium">
          {summary}
        </p>
        {!active && (
          <Button variant="ghost" size="icon-xs" onClick={onDismiss} aria-label="Dismiss uploads">
            <IconX />
          </Button>
        )}
      </header>
      <Progress
        value={pct}
        aria-label="Overall upload progress"
        className={cn("mx-4 w-auto", failed && !active && "[&>div]:bg-destructive")}
      />
      <ul className="max-h-64 overflow-y-auto px-4 py-2">
        {uploads.map((u) => {
          const p = u.size ? Math.round((u.loaded / u.size) * 100) : 0;
          return (
            <li key={u.id} className="py-1.5">
              <div className="flex items-baseline gap-2">
                <span className="flex-1 truncate text-sm" title={u.name}>
                  {truncateFilename(u.name, 28)}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs tabular-nums",
                    u.status === "failed" ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {u.status === "uploading" ? `${p}% of ${formatBytes(u.size)}` : LABEL[u.status]}
                </span>
              </div>
              {u.status === "uploading" && <Progress value={p} aria-label={`${u.name} progress`} className="mt-1 h-1" />}
              {u.error && <p className="text-destructive mt-1 text-xs">{u.error}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
