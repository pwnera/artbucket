"use client";

import { useCallback, useRef, useState } from "react";
import { ImageOff, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Asset = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: string;
};

// This component talks to /api/v1 and nothing else. There are no private
// endpoints: if the UI needs something the public API cannot do, the API is
// not finished.
export function Gallery({ initial }: { initial: Asset[] }) {
  const [assets, setAssets] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/v1/assets");
    if (res.ok) setAssets((await res.json()).data);
  }, []);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      setBusy(true);
      setError(null);
      try {
        for (const file of Array.from(files)) {
          const mime = file.type || "application/octet-stream";

          const ticket = await fetch("/api/v1/uploads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: file.name, mime, size: file.size }),
          });
          if (!ticket.ok) throw new Error((await ticket.json()).error?.message ?? "Upload failed");
          const { token, uploadUrl } = await ticket.json();

          const put = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": mime },
            body: file,
          });
          if (!put.ok) throw new Error("Storage rejected the upload");

          const done = await fetch("/api/v1/assets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, filename: file.name, mime }),
          });
          if (!done.ok) throw new Error((await done.json()).error?.message ?? "Finalize failed");
        }
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">artbucket</h1>
          <p className="text-muted-foreground text-sm">
            {assets.length} asset{assets.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Upload />}
          Upload
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
      </header>

      {error && (
        <p className="border-destructive/50 text-destructive mb-6 rounded-md border px-4 py-3 text-sm">
          {error}
        </p>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-xl border border-dashed p-4 transition-colors",
          dragging ? "border-primary bg-accent" : "border-border",
        )}
      >
        {assets.length === 0 ? (
          <p className="text-muted-foreground py-20 text-center text-sm">
            Drop files here, or use the upload button.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {assets.map((a) => (
              <li key={a.id} className="group">
                <a
                  href={`/a/${a.id}`}
                  className="bg-muted focus-visible:ring-ring block aspect-square overflow-hidden rounded-lg border focus-visible:ring-[3px]"
                >
                  {a.mime.startsWith("image/") ? (
                    // Rendition URLs are pure functions of the asset id — no
                    // export step, no signing, no prior round trip.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/a/${a.id}/w_600,h_600,fit_cover,f_webp`}
                      alt={a.filename}
                      loading="lazy"
                      className="size-full object-cover transition-transform group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="text-muted-foreground flex size-full items-center justify-center">
                      <ImageOff className="size-6" />
                    </div>
                  )}
                </a>
                <p className="mt-2 truncate text-xs font-medium" title={a.filename}>
                  {a.filename}
                </p>
                <p className="text-muted-foreground text-xs">
                  {a.width && a.height ? `${a.width}×${a.height} · ` : ""}
                  {formatBytes(a.size)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function formatBytes(n: number) {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}
