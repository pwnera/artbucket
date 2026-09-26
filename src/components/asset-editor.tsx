"use client";

import { useEffect, useRef, useState } from "react";
import { AlertIcon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import type { Asset } from "@/components/gallery";
import { formatBytes } from "@/lib/filename";

const FIELDS = [
  { key: "title", label: "Title" },
  { key: "creator", label: "Creator" },
  { key: "copyright", label: "Copyright" },
] as const;

/**
 * One asset, editable. A native modal <dialog>: focus trapping, Escape and the
 * inert background come from the platform. Saves through the public PATCH, and
 * Download returns the file with these edits written into it.
 */
export function AssetEditor({
  asset,
  onClose,
  onSaved,
}: {
  asset: Asset;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const m = asset.metadata ?? {};

  useEffect(() => ref.current?.showModal(), []);

  async function save(form: FormData) {
    setBusy(true);
    setError(null);
    const str = (k: string) => String(form.get(k) ?? "");
    const res = await fetch(`/api/v1/assets/${asset.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: str("title"),
        description: str("description"),
        creator: str("creator"),
        copyright: str("copyright"),
        tags: str("tags").split(","),
      }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json()).error?.message ?? "Couldn't save");
    onSaved();
    ref.current?.close();
  }

  const input =
    "bg-surface border-line focus:border-line-strong text-body text-ink w-full rounded-sm border px-3 py-2 outline-none";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // A click on the backdrop lands on the dialog element itself.
      onClick={(e) => e.target === ref.current && ref.current.close()}
      aria-labelledby="asset-editor-title"
      className="bg-surface-raised text-ink border-line shadow-lift m-auto w-[min(880px,calc(100vw-32px))] rounded-lg border p-0 backdrop:bg-black/40"
    >
      <form action={save} className="grid gap-6 p-6 md:grid-cols-[1fr_320px]">
        <div className="bg-surface-sunken flex min-h-64 items-center justify-center overflow-hidden rounded-card">
          {asset.mime.startsWith("image/") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/a/${asset.id}/w_960,f_webp`} alt="" className="max-h-[60vh] object-contain" />
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <h2 id="asset-editor-title" className="text-title-2 break-all">
              {asset.filename}
            </h2>
            <p className="text-meta text-ink-muted mt-1">
              {asset.width && asset.height ? `${asset.width} × ${asset.height} · ` : ""}
              {formatBytes(asset.size)}
              {m.camera ? ` · ${m.camera}` : ""}
              {m.capturedAt ? ` · ${m.capturedAt.slice(0, 10)}` : ""}
            </p>
          </div>

          {FIELDS.map(({ key, label }) => (
            <label key={key} className="text-label text-ink-muted flex flex-col gap-1">
              {label}
              <input name={key} defaultValue={m[key] ?? ""} maxLength={2000} className={input} />
            </label>
          ))}
          <label className="text-label text-ink-muted flex flex-col gap-1">
            Description
            <textarea
              name="description"
              defaultValue={m.description ?? ""}
              maxLength={2000}
              rows={3}
              className={input}
            />
          </label>
          <label className="text-label text-ink-muted flex flex-col gap-1">
            Tags, comma separated
            <input name="tags" defaultValue={asset.tags.join(", ")} className={input} />
          </label>

          {error && (
            <p role="status" className="text-body text-danger flex items-center gap-2">
              <AlertIcon size={20} />
              {error}
            </p>
          )}

          <div className="mt-auto flex flex-wrap justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => ref.current?.close()}>
              Cancel
            </Button>
            <Button variant="secondary" asChild>
              {/* The file as stored, with these fields written into it. */}
              <a href={`/a/${asset.id}?download`} download>
                Download
              </a>
            </Button>
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? "Saving" : "Save"}
            </Button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
