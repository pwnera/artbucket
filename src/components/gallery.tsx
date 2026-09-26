"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconBookmarkPlus, IconCloudUpload, IconPhoto, IconSearch, IconUpload, IconX } from "@tabler/icons-react";
import { toast } from "sonner";
import { AssetEditor } from "@/components/asset-editor";
import { CollectionDialog, send, type Collection } from "@/components/collections";
import { FacetFilter, type Count } from "@/components/facet-filter";
import { UploadFieldsDialog } from "@/components/fields";
import { FieldManager } from "@/components/field-manager";
import { LibrarySidebar, type SavedSearch } from "@/components/library-sidebar";
import { SelectionBar } from "@/components/selection-bar";
import { isActive, putWithProgress, UploadTray, type Upload } from "@/components/uploads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { relaxInherited, type FieldDef, type FieldValue } from "@/lib/fields";
import { isFacetable } from "@/lib/filters";
import { pool } from "@/lib/pool";
import { fileTypeBadge, formatBytes, truncateFilename } from "@/lib/filename";
import { cn } from "@/lib/utils";

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

export type Listing = {
  data: Asset[];
  facets: { tags: Count[]; fields?: Record<string, Count[]> };
};

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
  // Selected asset ids. Only the ones on screen count (`picked`), so a filter
  // change can't leave hidden files in a bulk action.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchor = useRef<number | null>(null);
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
    else toast.error(listing.error?.message ?? "Search failed", { id: "search" });
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
    setQ(p.get("q") ?? "");
    setTags(p.getAll("tag"));
    setCurrent(p.get("collection"));
    setFilters(byField);
    setExtra(rest);
  };

  async function saveSearch(name: string) {
    const saved: SavedSearch | null = await send("POST", "/api/v1/searches", { name, query: query().toString() });
    if (!saved) return false;
    setSearches((ss) => [...ss, saved].sort((a, b) => a.name.localeCompare(b.name)));
    toast.success(`Saved "${name}"`);
    return true;
  }

  async function forget(id: string) {
    if (await send("DELETE", `/api/v1/searches/${id}`)) setSearches((ss) => ss.filter((sv) => sv.id !== id));
  }

  const clear = () => {
    setQ("");
    setTags([]);
    setFilters({});
    setExtra([]);
  };

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

  const picked = assets.filter((a) => selected.has(a.id));
  const selectAll = () => setSelected(new Set(assets.map((a) => a.id)));
  const clearSelection = () => setSelected(new Set());
  // Shift extends from the last one clicked, as in a file manager.
  const pick = (i: number, range: boolean) => {
    const id = assets[i].id;
    // Read now: the updater below runs later, after the anchor has moved.
    const from0 = anchor.current;
    setSelected((s) => {
      const next = new Set(s);
      if (range && from0 !== null) {
        const [from, to] = [from0, i].sort((x, y) => x - y);
        for (const a of assets.slice(from, to + 1)) next.add(a.id);
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    anchor.current = i;
  };

  // Cmd/Ctrl+A selects the grid, Escape clears; both leave text fields and dialogs alone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof Element && t.closest("input, textarea, [contenteditable], [role=dialog], [role=alertdialog]")) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.preventDefault();
        setSelected(new Set(assets.map((a) => a.id)));
      } else if (e.key === "Escape") setSelected(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [assets]);

  const narrowed = q.trim() !== "" || tags.length > 0 || extra.length > 0 || Object.values(filters).some((vs) => vs.length > 0);
  const qs = query().toString();
  const activeSearch = searches.find((sv) => sv.query === qs)?.query ?? null;

  return (
    // Drag is tracked on the whole page: dropping only inside a bordered box is
    // a worse target than the window.
    <SidebarProvider
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
    >
      <LibrarySidebar
        collections={collections}
        current={current}
        onSelect={(id) => {
          setCurrent(id);
          if (id === null) clear();
        }}
        onNewCollection={() => setEditing("new")}
        onEditCollection={setEditing}
        searches={searches}
        activeSearch={activeSearch}
        onApplySearch={(sv) => apply(sv.query)}
        onDeleteSearch={forget}
        onManageFields={() => setManagingFields(true)}
      />

      <SidebarInset>
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{inCollection?.name ?? "All files"}</h1>
          </div>
          <Badge variant="secondary" className="font-mono tabular-nums">
            {assets.length}
          </Badge>
          <div className="relative ml-auto w-full max-w-sm">
            <IconSearch className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search names, tags, captions"
              aria-label="Search assets"
              className="h-8 pl-8"
            />
          </div>
          {/* Stays enabled mid-upload: a second batch queues alongside the first. */}
          <Button size="sm" onClick={() => input.current?.click()} aria-busy={uploading}>
            <IconUpload />
            <span className="hidden sm:inline">Upload</span>
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

        <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          {!empty && (
            <div className="flex flex-wrap items-center gap-2">
              {assets.length > 0 && (
                <label className="hover:bg-accent flex h-8 items-center gap-2 rounded-md px-2 text-sm">
                  <Checkbox
                    checked={picked.length === 0 ? false : picked.length === assets.length ? true : "indeterminate"}
                    onCheckedChange={() => (picked.length === assets.length ? clearSelection() : selectAll())}
                    aria-label="Select all"
                  />
                  <span className="text-muted-foreground hidden sm:inline">
                    {picked.length ? `${picked.length} selected` : "Select"}
                  </span>
                </label>
              )}
              <FacetFilter label="Tags" counts={facets.tags} selected={tags} onChange={setTags} />
              {fields.filter(isFacetable).map((d) => (
                <FacetFilter
                  key={d.key}
                  label={d.label}
                  counts={facets.fields?.[d.key] ?? []}
                  selected={filters[d.key] ?? []}
                  format={d.type === "boolean" ? (v) => (v === "true" ? "Yes" : "No") : undefined}
                  onChange={(vs) => setFilters((f) => ({ ...f, [d.key]: vs }))}
                />
              ))}
              {extra.map(([k, v]) => (
                <Badge key={`${k}=${v}`} variant="secondary" className="h-8 gap-1 pr-1">
                  {describe(k, v)}
                  <button
                    type="button"
                    onClick={() => setExtra((xs) => xs.filter((x) => x[0] !== k || x[1] !== v))}
                    aria-label={`Remove filter ${describe(k, v)}`}
                    className="hover:bg-muted-foreground/20 rounded-full p-0.5"
                  >
                    <IconX className="size-3" />
                  </button>
                </Badge>
              ))}
              {narrowed && (
                <Button variant="ghost" size="sm" className="h-8" onClick={clear}>
                  Reset <IconX />
                </Button>
              )}
              {filtered && !activeSearch && <SaveSearch onSave={saveSearch} />}
            </div>
          )}

          {empty ? (
            <EmptyState dragging={dragging} onUpload={() => input.current?.click()} />
          ) : assets.length === 0 ? (
            <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-12 text-center text-sm">
              <IconSearch className="size-8" stroke={1.5} />
              {inCollection && !narrowed
                ? "Nothing in this collection yet. Upload while it's open, or add files from their editor."
                : "Nothing matches. Try fewer words or clear a filter."}
              {narrowed && (
                <Button variant="outline" size="sm" onClick={clear}>
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
              {assets.map((a, i) => (
                <li key={a.id}>
                  <AssetCard
                    asset={a}
                    onOpen={() => setOpen(a)}
                    selected={selected.has(a.id)}
                    // Once anything is selected, a click selects instead of opening.
                    selecting={picked.length > 0}
                    onPick={(range) => pick(i, range)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </SidebarInset>

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

      <SelectionBar
        picked={picked}
        total={assets.length}
        collections={collections}
        current={inCollection}
        onSelectAll={selectAll}
        onClear={clearSelection}
        onDone={refresh}
      />

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
        <div className="bg-background/80 pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="border-primary/40 bg-muted/50 flex size-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed">
            <IconCloudUpload className="size-10" stroke={1.5} />
            <p className="text-lg font-medium">Drop to add to {inCollection ? inCollection.name : "your library"}</p>
          </div>
        </div>
      )}
    </SidebarProvider>
  );
}

/** A thumbnail tile. The art is contained, never cropped, on a neutral well. */
export function AssetCard({
  asset: a,
  onOpen,
  selected = false,
  selecting = false,
  onPick,
}: {
  asset: Asset;
  onOpen?: () => void;
  selected?: boolean;
  selecting?: boolean;
  /** `range` is true for a shift-click. */
  onPick?: (range: boolean) => void;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={(e) => {
          // Cmd/Ctrl/Shift-click selects, as in a file manager.
          if (onPick && (selecting || e.metaKey || e.ctrlKey || e.shiftKey)) onPick(e.shiftKey);
          else onOpen?.();
        }}
        className={cn(
          "bg-card text-card-foreground focus-visible:ring-ring/50 block w-full overflow-hidden rounded-xl border text-left shadow-xs transition-shadow outline-none select-none hover:shadow-md focus-visible:ring-[3px]",
          selected && "border-primary ring-primary ring-2",
        )}
      >
        <div className="bg-muted relative aspect-square overflow-hidden">
          {a.mime.startsWith("image/") ? (
            // Rendition URLs are pure functions of the asset id: no export step,
            // no signing, no prior round trip.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/a/${a.id}/w_480,f_webp`}
              alt={a.filename}
              loading="lazy"
              className="size-full object-contain p-2 transition-transform duration-200 group-hover:scale-[1.03]"
            />
          ) : (
            <span className="text-muted-foreground flex size-full items-center justify-center">
              <IconPhoto className="size-8" stroke={1.5} />
            </span>
          )}
          <Badge variant="secondary" className="bg-background/80 absolute top-2 left-2 font-mono text-[10px] backdrop-blur">
            {fileTypeBadge(a.filename, a.mime)}
          </Badge>
        </div>
        <div className="grid gap-0.5 border-t px-3 py-2">
          <p className="truncate text-sm font-medium" title={a.filename}>
            {truncateFilename(a.filename, 24)}
          </p>
          <p className="text-muted-foreground text-xs tabular-nums">
            {a.width && a.height ? `${a.width} × ${a.height} · ` : ""}
            {formatBytes(a.size)}
          </p>
          {a.tags.length > 0 && (
            <div className="mt-1 flex gap-1 overflow-hidden">
              {a.tags.slice(0, 3).map((t) => (
                <Badge key={t} variant="outline" className="font-normal">
                  {t}
                </Badge>
              ))}
              {a.tags.length > 3 && <span className="text-muted-foreground text-xs">+{a.tags.length - 3}</span>}
            </div>
          )}
        </div>
      </button>
      {onPick && (
        <Checkbox
          checked={selected}
          onClick={(e) => {
            e.preventDefault();
            onPick(e.shiftKey);
          }}
          aria-label={`Select ${a.filename}`}
          className={cn(
            "bg-background/90 absolute top-2 right-2 size-5 shadow-sm backdrop-blur transition-opacity",
            selecting || selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          )}
        />
      )}
    </div>
  );
}

function EmptyState({ dragging, onUpload }: { dragging: boolean; onUpload: () => void }) {
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-12 text-center transition-colors ${
        dragging ? "border-primary bg-muted/50" : ""
      }`}
    >
      <span className="bg-muted flex size-14 items-center justify-center rounded-full">
        <IconCloudUpload className="size-7" stroke={1.5} />
      </span>
      <div className="grid gap-1">
        <h2 className="text-xl font-semibold tracking-tight">Your art, all in one bucket</h2>
        <p className="text-muted-foreground max-w-sm text-sm">Drop files anywhere on this page, or pick them to upload.</p>
      </div>
      <Button onClick={onUpload}>
        <IconUpload /> Upload files
      </Button>
    </div>
  );
}

/** Name the current view and keep it in the sidebar. */
function SaveSearch({ onSave }: { onSave: (name: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="ml-auto h-8">
          <IconBookmarkPlus /> Save search
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <form
          action={async (form) => {
            const name = String(form.get("name") ?? "").trim();
            if (name && (await onSave(name))) setOpen(false);
          }}
          className="flex gap-2"
        >
          <Input name="name" placeholder="Name this search" required maxLength={120} autoFocus className="h-8" />
          <Button type="submit" size="sm">
            Save
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
