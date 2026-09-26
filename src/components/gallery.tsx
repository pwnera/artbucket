"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertIcon, DashedOutline, ImageIcon, Logo, SearchIcon, UploadIcon } from "@/components/icon";
import { AssetEditor } from "@/components/asset-editor";
import { Drip, Mascot } from "@/components/mascot";
import { Button } from "@/components/ui/button";
import { fileTypeBadge, formatBytes, truncateFilename } from "@/lib/filename";

export type Asset = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  tags: string[];
  metadata: {
    title?: string;
    description?: string;
    creator?: string;
    copyright?: string;
    camera?: string;
    capturedAt?: string;
  } | null;
  createdAt: string;
};

export type Listing = { data: Asset[]; facets: { tags: { value: string; count: number }[] } };

// This component talks to /api/v1 and nothing else. There are no private
// endpoints: if the UI needs something the public API cannot do, the API is
// not finished.
export function Gallery({ initial }: { initial: Listing }) {
  const [{ data: assets, facets }, setListing] = useState(initial);
  const [q, setQ] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [open, setOpen] = useState<Asset | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const refresh = useCallback(async () => {
    const params = new URLSearchParams(q.trim() ? { q } : {});
    for (const t of tags) params.append("tag", t);
    const res = await fetch(`/api/v1/assets?${params}`);
    if (res.ok) setListing(await res.json());
  }, [q, tags]);

  // Search as you type, settled for a beat so each keystroke isn't a request.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(refresh, 150);
    return () => clearTimeout(t);
  }, [refresh]);

  const toggleTag = (t: string) =>
    setTags((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));

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
        setError(e instanceof Error ? e.message : "Files couldn't be uploaded");
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  // A selected tag stays on screen even when nothing matches, or it could never be cleared.
  const chips = [
    ...tags.filter((t) => !facets.tags.some((f) => f.value === t)).map((value) => ({ value, count: 0 })),
    ...facets.tags,
  ];
  const filtered = q.trim() !== "" || tags.length > 0;
  // The welcome is for an empty library, not for a search that found nothing.
  const empty = assets.length === 0 && !filtered;

  return (
    // Drag is tracked on the whole page: dropping only inside a bordered box is
    // a worse target than the window, and it forces an empty frame to sit under
    // a full grid just to have somewhere to aim.
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        void upload(e.dataTransfer.files);
      }}
      className="min-h-dvh"
    >
      <main className="mx-auto max-w-6xl px-8 py-8">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-2">
            {/* The mark is centred on the wordmark's line box, not on the whole
                block, so the count below still starts at the wordmark's edge. */}
            <span className="flex h-[30px] items-center">
              <Logo size={30} />
            </span>
            <div>
              <h1 className="text-title-1">Artbucket</h1>
              <p className="text-meta text-ink-muted mt-1">
                {assets.length} {filtered ? "found" : assets.length === 1 ? "file" : "files"}
              </p>
            </div>
          </div>

          {/* The one coral CTA on this view. */}
          <Button size="lg" onClick={() => input.current?.click()} disabled={busy} aria-busy={busy}>
            <UploadIcon size={20} />
            {busy ? "Uploading" : "Upload files"}
          </Button>
          <input
            ref={input}
            type="file"
            multiple
            className="hidden"
            aria-hidden
            tabIndex={-1}
            onChange={(e) => e.target.files && upload(e.target.files)}
          />
        </header>

        {!empty && (
          <div className="mb-6 space-y-3">
            <label className="bg-surface-raised border-line focus-within:border-line-strong text-ink-muted flex max-w-md items-center gap-2 rounded-pill border px-4 py-2">
              <SearchIcon size={20} />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search names, tags, captions"
                aria-label="Search assets"
                className="text-body text-ink placeholder:text-ink-muted w-full bg-transparent outline-none"
              />
            </label>
            {chips.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Filter by tag">
                {chips.map(({ value, count }) => {
                  const on = tags.includes(value);
                  return (
                    <li key={value}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleTag(value)}
                        className={`text-label rounded-pill border px-3 py-1 transition-colors duration-150 ${
                          on
                            ? "bg-teal-soft border-teal text-teal-ink"
                            : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
                        }`}
                      >
                        {value} <span className="opacity-70">{count}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* Status: icon, word and colour together — never colour alone. */}
        {error && (
          <p
            role="status"
            className="bg-surface-raised border-line text-body text-danger mb-6 flex items-center gap-2 rounded-card border px-4 py-3"
          >
            <AlertIcon size={20} />
            {error}
          </p>
        )}

        {empty ? (
          <div className="relative flex flex-col items-center rounded-lg px-6 py-12 text-center">
            <DashedOutline active={dragging} />
            {/* One drip, one Pip: the only decoration on this screen. */}
            <span className="bg-line block h-px w-16" />
            <Drip size={28} />
            <Mascot size={96} className="mt-2" />
            <h2 className="text-display mt-6">Your art, all in one bucket</h2>
            <p className="text-body text-ink-muted mt-2 max-w-sm">
              Drop files anywhere on this page to add them. Pip will keep them tidy.
            </p>
          </div>
        ) : assets.length === 0 ? (
          <p className="text-body text-ink-muted py-12 text-center">
            Nothing matches. Try fewer words or clear a tag.
          </p>
        ) : (
          <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
            {assets.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setOpen(a)}
                  className="bg-surface-raised w-full text-left border-line shadow-card hover:shadow-lift hover:border-line-strong block rounded-card border p-2 transition-[box-shadow,border-color] duration-150"
                >
                  {/* The art is the hero: a neutral well, contained, never cropped, never tinted. */}
                  <div className="bg-surface-sunken relative aspect-square overflow-hidden rounded-sm">
                    {a.mime.startsWith("image/") ? (
                      // Rendition URLs are pure functions of the asset id — no
                      // export step, no signing, no prior round trip.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/a/${a.id}/w_480,f_webp`}
                        alt={a.filename}
                        loading="lazy"
                        className="size-full object-contain"
                      />
                    ) : (
                      <span className="text-ink-muted flex size-full items-center justify-center">
                        <ImageIcon size={24} />
                      </span>
                    )}
                    <span className="text-badge bg-scrim text-on-scrim absolute top-2 left-2 rounded-xs px-1.5 py-1">
                      {fileTypeBadge(a.filename, a.mime)}
                    </span>
                  </div>
                  <div className="px-1 pt-2 pb-1">
                    <p className="text-filename text-ink" title={a.filename}>
                      {truncateFilename(a.filename, 20)}
                    </p>
                    <p className="text-meta text-ink-muted mt-1">
                      {a.width && a.height ? `${a.width} × ${a.height} · ` : ""}
                      {formatBytes(a.size)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      {open && (
        <AssetEditor key={open.id} asset={open} onClose={() => setOpen(null)} onSaved={refresh} />
      )}

      {/* Dragging over a populated library: one calm overlay, not a moving target. */}
      {dragging && !empty && (
        <div className="pointer-events-none fixed inset-4 z-50">
          <div className="bg-teal-soft/80 relative flex size-full items-center justify-center rounded-lg backdrop-blur-[2px]">
            <DashedOutline active />
            <p className="text-title-2 text-teal-ink flex items-center gap-2">
              <UploadIcon size={24} />
              Drop to add to your library
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
