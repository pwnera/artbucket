"use client";

import { AlertIcon } from "@/components/icon";
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
      className="bg-surface-raised border-line shadow-lift fixed right-4 bottom-4 z-40 w-[min(360px,calc(100vw-32px))] rounded-card border"
    >
      <header className="flex items-center gap-3 px-4 pt-3 pb-2">
        <p role="status" className="text-body-strong flex-1">
          {summary}
        </p>
        {!active && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss uploads"
            className="text-ink-muted hover:text-ink -mr-1 px-1"
          >
            ×
          </button>
        )}
      </header>
      <Bar pct={pct} label="Overall upload progress" tone={failed && !active ? "danger" : "teal"} />
      <ul className="max-h-64 overflow-y-auto px-4 py-2">
        {uploads.map((u) => {
          const p = u.size ? Math.round((u.loaded / u.size) * 100) : 0;
          return (
            <li key={u.id} className="py-1.5">
              <div className="flex items-baseline gap-2">
                <span className="text-filename text-ink flex-1" title={u.name}>
                  {truncateFilename(u.name, 28)}
                </span>
                <span
                  className={`text-meta shrink-0 ${u.status === "failed" ? "text-danger" : "text-ink-muted"}`}
                >
                  {u.status === "uploading" ? `${p}% of ${formatBytes(u.size)}` : LABEL[u.status]}
                </span>
              </div>
              {u.status === "uploading" && <Bar pct={p} label={`${u.name} progress`} thin />}
              {u.error && (
                <p className="text-meta text-danger mt-1 flex items-center gap-1">
                  <AlertIcon size={16} />
                  {u.error}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Bar({
  pct,
  label,
  thin,
  tone = "teal",
}: {
  pct: number;
  label: string;
  thin?: boolean;
  tone?: "teal" | "danger";
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={`bg-surface-sunken overflow-hidden rounded-pill ${thin ? "mt-1 h-1" : "mx-4 h-1.5"}`}
    >
      <div
        className={`h-full rounded-pill transition-[width] duration-150 ${tone === "danger" ? "bg-danger" : "bg-teal"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
