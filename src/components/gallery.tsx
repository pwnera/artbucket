"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertIcon, DashedOutline, ImageIcon, Logo, SearchIcon, UploadIcon } from "@/components/icon";
import { AssetEditor } from "@/components/asset-editor";
import { FieldManager } from "@/components/field-manager";
import { isActive, putWithProgress, UploadTray, type Upload } from "@/components/uploads";
import { CollectionDialog, type Collection } from "@/components/collections";
import { UploadFieldsDialog } from "@/components/fields";
import { Drip, Mascot } from "@/components/mascot";
import { Button } from "@/components/ui/button";
import { relaxInherited, type FieldDef, type FieldValue } from "@/lib/fields";
import { isFacetable } from "@/lib/filters";
import { pool } from "@/lib/pool";
import { fileTypeBadge, formatBytes, truncateFilename } from "@/lib/filename";

export type Asset = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  tags: string[];
  fields: Record<string, FieldValue>;
  inherited: Record<string, FieldValue>;
  collections: string[];
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

type Count = { value: string; count: number };
export type Listing = {
  data: Asset[];
  facets: { tags: Count[]; fields?: Record<string, Count[]> };
};
type SavedSearch = { id: string; name: string; query: string };

const toggle = (xs: string[], x: string) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

/** "f.budget.gte=10" as a person would say it. */
const describe = (k: string, v: string) => {
  const [, key, op] = k.split(".");
  return `${key} ${op === "gte" ? "≥" : op === "lte" ? "≤" : "="} ${v}`;
};

// This component talks to /api/v1 and nothing else. There are no private
// endpoints: if the UI needs something the public API cannot do, the API is
// not finished.
export function Gallery({
  initial,
  fields: initialFields,
  collections: initialCollections,
  searches: initialSearches,
}: {
  initial: Listing;
  fields: FieldDef[];
  collections: Collection[];
  searches: SavedSearch[];
}) {
  const [{ data: assets, facets }, setListing] = useState(initial);
  const [collections, setCollections] = useState(initialCollections);
  // The field schema can change under an open page (here or elsewhere), so it
  // refreshes with everything else. A stale copy sends values for deleted fields.
  const [fields, setFields] = useState(initialFields);
  const [managingFields, setManagingFields] = useState(false);
  // The collection being browsed. Uploads made while it is selected land in it.
  const [current, setCurrent] = useState<string | null>(null);
  const [editing, setEditing] = useState<Collection | "new" | null>(null);
  const inCollection = collections.find((c) => c.id === current);
  const [q, setQ] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  // Selected values per select/boolean field; values of one field OR together.
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  // Params the UI has no control for (ranges from a saved search): kept, shown, removable.
  const [extra, setExtra] = useState<[string, string][]>([]);
  const [searches, setSearches] = useState(initialSearches);
  const [open, setOpen] = useState<Asset | null>(null);
  // Files waiting on the required-fields step before they upload.
  const [pending, setPending] = useState<File[] | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  // The whole view as an /api/v1/assets query string: what runs, and what saves.
  const query = useCallback(() => {
    const params = new URLSearchParams(q.trim() ? { q } : {});
    for (const t of tags) params.append("tag", t);
    if (current) params.set("collection", current);
    for (const [k, vs] of Object.entries(filters)) for (const v of vs) params.append(`f.${k}`, v);
    for (const [k, v] of extra) params.append(k, v);
    return params;
  }, [q, tags, current, filters, extra]);

  // Responses can land out of order; only the latest request may paint.
  const latest = useRef(0);
  const refresh = useCallback(async () => {
    const params = query();
    const ticket = ++latest.current;
    const [res, cols, defs] = await Promise.all([
      fetch(`/api/v1/assets?${params}`),
      fetch("/api/v1/collections"),
      fetch("/api/v1/fields"),
    ]);
    const [listing, colsBody, defsBody] = await Promise.all([
      res.json(),
      cols.ok ? cols.json() : null,
      defs.ok ? defs.json() : null,
    ]);
    if (ticket !== latest.current) return;
    if (res.ok) setListing(listing);
    else setError(listing.error?.message ?? "Search failed");
    if (colsBody) setCollections(colsBody.data);
    if (defsBody) {
      const next: FieldDef[] = defsBody.data;
      setFields(next);
      // Drop filters on fields that no longer exist, or every search would 422.
      setFilters((f) => {
        const kept = Object.fromEntries(Object.entries(f).filter(([k]) => next.some((d) => d.key === k)));
        return Object.keys(kept).length === Object.keys(f).length ? f : kept;
      });
    }
  }, [query]);

  /** Restore a saved query string into the view's state. */
  const apply = (qs: string) => {
    const p = new URLSearchParams(qs);
    const byField: Record<string, string[]> = {};
    const rest: [string, string][] = [];
    for (const [k, v] of p) {
      const m = k.match(/^f\.([a-z0-9_]+)$/);
      if (m) (byField[m[1]] ??= []).push(v);
      else if (k.startsWith("f.")) rest.push([k, v]);
    }
    setError(null);
    setQ(p.get("q") ?? "");
    setTags(p.getAll("tag"));
    setCurrent(p.get("collection"));
    setFilters(byField);
    setExtra(rest);
  };

  async function saveSearch() {
    const name = prompt("Name this search")?.trim();
    if (!name) return;
    const res = await fetch("/api/v1/searches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, query: query().toString() }),
    });
    if (!res.ok) return setError((await res.json()).error?.message ?? "Couldn't save the search");
    const saved: SavedSearch = (await res.json()).data;
    setSearches((ss) => [...ss, saved].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async function forget(id: string) {
    const res = await fetch(`/api/v1/searches/${id}`, { method: "DELETE" });
    if (res.ok) setSearches((ss) => ss.filter((sv) => sv.id !== id));
  }

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

  // With required fields still unmet, files wait for them; otherwise straight up.
  // Values inherited from the collection being uploaded into count as met.
  const inherited = inCollection?.fields ?? {};
  const start = (list: FileList) => {
    const files = Array.from(list);
    if (!files.length) return;
    if (relaxInherited(fields, inherited).some((f) => f.required)) setPending(files);
    else void upload(files);
  };


  const track = (id: string, patch: Partial<Upload>) =>
    setUploads((us) => us.map((u) => (u.id === id ? { ...u, ...patch } : u)));

  // Three files at a time. One file failing doesn't stop the rest of the batch;
  // it's marked in the tray with its reason.
  const upload = useCallback(
    async (files: File[], values: Record<string, FieldValue> = {}) => {
      const batch = files.map((file) => ({ file, id: crypto.randomUUID() }));
      setUploads((us) => [
        // A new batch clears finished rows from an earlier one, keeps anything in flight.
        ...us.filter(isActive),
        ...batch.map(({ file, id }) => ({
          id,
          name: file.name,
          size: file.size,
          loaded: 0,
          status: "queued" as const,
        })),
      ]);

      await pool(batch, 3, async ({ file, id }) => {
        const mime = file.type || "application/octet-stream";
        try {
          track(id, { status: "uploading" });
          const ticket = await fetch("/api/v1/uploads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: file.name, mime, size: file.size }),
          });
          if (!ticket.ok) throw new Error((await ticket.json()).error?.message ?? "Upload failed");
          const { token, uploadUrl } = await ticket.json();

          await putWithProgress(uploadUrl, file, mime, (loaded) => track(id, { loaded }));

          track(id, { status: "saving", loaded: file.size });
          const done = await fetch("/api/v1/assets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token,
              filename: file.name,
              mime,
              fields: values,
              collections: current ? [current] : [],
            }),
          });
          const body = await done.json();
          if (!done.ok) throw new Error(body.error?.message ?? "Couldn't add it to the library");
          track(id, { status: body.deduped ? "deduped" : "done" });
          void refresh(); // the grid fills in as files land, not all at the end
        } catch (e) {
          track(id, { status: "failed", error: e instanceof Error ? e.message : "Upload failed" });
        }
      });
    },
    [refresh, current],
  );

  // A clean batch clears itself shortly after; one with failures waits to be read.
  const uploading = uploads.some(isActive);
  useEffect(() => {
    if (!uploads.length || uploading || uploads.some((u) => u.status === "failed")) return;
    const t = setTimeout(() => setUploads([]), 4000);
    return () => clearTimeout(t);
  }, [uploads, uploading]);

  const filtered =
    q.trim() !== "" ||
    tags.length > 0 ||
    current !== null ||
    extra.length > 0 ||
    Object.values(filters).some((vs) => vs.length > 0);
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
        start(e.dataTransfer.files);
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

          <span className="ml-auto" />
          <Button variant="ghost" onClick={() => setManagingFields(true)}>
            Custom fields
          </Button>
          {/* The one coral CTA on this view. */}
          {/* Stays enabled mid-upload: a second batch queues alongside the first. */}
          <Button size="lg" onClick={() => input.current?.click()} aria-busy={uploading}>
            <UploadIcon size={20} />
            Upload files
          </Button>
          <input
            ref={input}
            type="file"
            multiple
            className="hidden"
            aria-hidden
            tabIndex={-1}
            onChange={(e) => {
              if (e.target.files) start(e.target.files);
              e.target.value = ""; // the same file can be picked again after a cancel
            }}
          />
        </header>

        {!empty && (
          <div className="mb-6 space-y-3">
            <nav aria-label="Collections" className="flex flex-wrap items-center gap-2">
              {[{ id: null, name: "All files" }, ...collections].map((c) => {
                const on = current === c.id;
                return (
                  <button
                    key={c.id ?? "all"}
                    type="button"
                    aria-current={on ? "page" : undefined}
                    onClick={() => setCurrent(c.id)}
                    className={`text-control rounded-pill px-3 py-1.5 transition-colors duration-150 ${
                      on ? "bg-teal-strong text-on-teal-strong" : "text-ink-muted hover:bg-teal-soft hover:text-teal-ink"
                    }`}
                  >
                    {c.name}
                    {"count" in c && <span className="ml-1.5 opacity-70">{c.count}</span>}
                  </button>
                );
              })}
              <Button variant="ghost" size="sm" onClick={() => setEditing("new")}>
                New collection
              </Button>
              {inCollection && (
                <Button variant="ghost" size="sm" onClick={() => setEditing(inCollection)}>
                  Edit
                </Button>
              )}
            </nav>
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
            <FacetRow
              label="Tags"
              counts={facets.tags}
              selected={tags}
              onToggle={(v) => setTags((ts) => toggle(ts, v))}
            />
            {fields.filter(isFacetable).map((d) => (
              <FacetRow
                key={d.key}
                label={d.label}
                counts={facets.fields?.[d.key] ?? []}
                selected={filters[d.key] ?? []}
                format={d.type === "boolean" ? (v) => (v === "true" ? "Yes" : "No") : undefined}
                onToggle={(v) => setFilters((f) => ({ ...f, [d.key]: toggle(f[d.key] ?? [], v) }))}
              />
            ))}
            {(extra.length > 0 || filtered || searches.length > 0) && (
              <div className="flex flex-wrap items-center gap-2">
                {extra.map(([k, v]) => (
                  <Button
                    key={`${k}=${v}`}
                    variant="secondary"
                    size="sm"
                    onClick={() => setExtra((xs) => xs.filter((x) => x[0] !== k || x[1] !== v))}
                    aria-label={`Remove filter ${describe(k, v)}`}
                  >
                    {describe(k, v)} ×
                  </Button>
                ))}
                {searches.map((sv) => (
                  <span key={sv.id} className="border-line flex items-center rounded-pill border">
                    <button
                      type="button"
                      onClick={() => apply(sv.query)}
                      className="text-control text-ink hover:text-teal-ink py-1 pr-1 pl-3"
                    >
                      {sv.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => forget(sv.id)}
                      aria-label={`Delete saved search ${sv.name}`}
                      className="text-ink-muted hover:text-danger px-2 py-1"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {filtered && (
                  <Button variant="ghost" size="sm" onClick={saveSearch}>
                    Save this search
                  </Button>
                )}
              </div>
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
            {inCollection && !q.trim() && !tags.length
              ? "Nothing in this collection yet. Upload while it's selected, or add files from their editor."
              : "Nothing matches. Try fewer words or clear a tag."}
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
        <AssetEditor
          key={open.id}
          asset={open}
          fields={fields}
          collections={collections}
          onClose={() => setOpen(null)}
          onSaved={refresh}
        />
      )}

      {pending && (
        <UploadFieldsDialog
          defs={fields}
          count={pending.length}
          inherited={inherited}
          onCancel={() => setPending(null)}
          onSubmit={(values) => {
            setPending(null);
            void upload(pending, values);
          }}
        />
      )}

      <UploadTray uploads={uploads} onDismiss={() => setUploads([])} />

      {managingFields && (
        <FieldManager fields={fields} onClose={() => setManagingFields(false)} onChanged={refresh} />
      )}

      {editing && (
        <CollectionDialog
          collection={editing === "new" ? undefined : editing}
          fields={fields}
          onClose={() => setEditing(null)}
          onSaved={(c) => {
            // A new collection opens; a deleted one drops back to everything.
            if (editing === "new" && c) setCurrent(c.id);
            else if (!c) setCurrent(null);
            void refresh();
          }}
        />
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

/**
 * One facet: a label and its value chips. A selected value stays on screen
 * even when its count drops to zero, or it could never be cleared.
 */
function FacetRow({
  label,
  counts,
  selected,
  onToggle,
  format = (v) => v,
}: {
  label: string;
  counts: Count[];
  selected: string[];
  onToggle: (value: string) => void;
  format?: (value: string) => string;
}) {
  const chips = [
    ...selected.filter((v) => !counts.some((c) => c.value === v)).map((value) => ({ value, count: 0 })),
    ...counts,
  ];
  if (!chips.length) return null;
  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label={`Filter by ${label}`}>
      <li className="text-label text-ink-muted mr-1">{label}</li>
      {chips.map(({ value, count }) => {
        const on = selected.includes(value);
        return (
          <li key={value}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(value)}
              className={`text-label rounded-pill border px-3 py-1 transition-colors duration-150 ${
                on
                  ? "bg-teal-soft border-teal text-teal-ink"
                  : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
              }`}
            >
              {format(value)} <span className="opacity-70">{count}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
