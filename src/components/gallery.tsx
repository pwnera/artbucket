"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconBook,
  IconBookmark,
  IconBookmarkPlus,
  IconChevronDown,
  IconCloudUpload,
  IconFolderUp,
  IconInbox,
  IconLayoutGrid,
  IconList,
  IconLoader2,
  IconPencil,
  IconPhoto,
  IconRobot,
  IconSearch,
  IconCopy,
  IconLock,
  IconShare,
  IconSparkles,
  IconTypography,
  IconUpload,
  IconLink,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { AssetEditor } from "@/components/asset-editor";
import { ThemeToggle } from "@/components/brand";
import { call, curl, ForAgents } from "@/components/agent-access";
import { AssetTable } from "@/components/asset-table";
import { LibraryTabs, PageHeader } from "@/components/page";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CollectionDialog, CollectionIcon, send, type Collection } from "@/components/collections";
import { FacetFilter, type Count } from "@/components/facet-filter";
import { UploadFieldsDialog } from "@/components/fields";
import { FontThumb, GoogleFontImport } from "@/components/font-preview";
import { LinkImport, Lottie } from "@/components/media";
import { AppSidebar, type SavedSearch } from "@/components/app-sidebar";
import { SelectionBar } from "@/components/selection-bar";
import { useCan } from "@/components/can";
import { IconButton } from "@/components/icon-button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AssetMenu } from "@/components/asset-menu";
import { suggestions } from "@/components/review-actions";
import { ShareDialog, type ShareTarget } from "@/components/share-dialog";
import { usePref, useRemember } from "@/components/sidebar-prefs";
import { GridSkeleton } from "@/components/skeletons";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { isActive, putWithProgress, UploadTray, type Upload } from "@/components/uploads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { relaxInherited, type FieldDef, type FieldValue } from "@/lib/fields";
import { isFacetable } from "@/lib/filters";
import { pool } from "@/lib/pool";
import { STATE_LABEL, type State, type Status } from "@/lib/lifecycle";
import type { Origin, Rights } from "@/lib/rights";
import type { C2pa } from "@/lib/c2pa";
import { fileTypeBadge, formatBytes, truncateFilename } from "@/lib/filename";
import { isFont } from "@/lib/font";
import { hasPreview, isLottie } from "@/lib/preview";
import type { SidebarData } from "@/lib/sidebar";
import { cn } from "@/lib/utils";
import { canonical, isNarrowed, parseView, viewQuery, type View } from "@/lib/view";

export type Asset = {
  id: string;
  /** Its own flag: it is private too when every collection it is in is. */
  private?: boolean;
  /** Served at /a/{id} to anyone while approved; otherwise to people with access, and signed URLs. */
  public?: boolean;
  filename: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  /** What the file shows as when it isn't an image (lib/preview.ts). */
  probe: Record<string, unknown> | null;
  tags: string[];
  fields: Record<string, FieldValue>;
  inherited: Record<string, FieldValue>;
  collections: string[];
  /**
   * Where it is in its lifecycle (lib/lifecycle.ts). `proposed`: suggested, waiting for a person;
   * `rejected`: turned down, kept for the agent to learn from.
   */
  status: Status;
  /** The status, `expired` for an approved asset past its last day of use, or `deleted`. */
  state: State;
  /** Deleted, and restorable for 30 days from then. */
  deletedAt?: string | null;
  /** Versions of one thing share a stack; null with one version. */
  stackId: string | null;
  version: number | null;
  /** Its stack's current approved version. */
  current: boolean;
  /** Who suggested it: an API key's name, or "web". */
  proposedBy: string | null;
  /** Why it was rejected. */
  reviewNote: string | null;
  /** Tags an agent suggested, waiting to be accepted or dismissed. */
  proposedTags: string[];
  /** Custom field values an agent suggested, by key, waiting for a person. */
  proposedFields?: Record<string, unknown>;
  rights: Rights | null;
  origin: Origin | null;
  /** The asset it was made from. */
  parentAssetId: string | null;
  generator: string | null;
  prompt: string | null;
  /** Content Credentials read from the file. */
  c2pa: C2pa | null;
  /** The asset that replaces this one. */
  supersededBy: string | null;
  metadata: {
    title?: string;
    description?: string;
    creator?: string;
    copyright?: string;
    camera?: string;
    capturedAt?: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type Listing = {
  data: Asset[];
  /** Every match; `data` is the first page of them. */
  total: number;
  facets: { tags: Count[]; types?: Count[]; states?: Count[]; fields?: Record<string, Count[]> };
};

/** "f.budget.gte=10" as a person would say it. */
const describe = (k: string, v: string) => {
  const [, key, op] = k.split(".");
  return `${key} ${op === "gte" ? "≥" : op === "lte" ? "≤" : "="} ${v}`;
};

/** The URL's view, whatever the page's closure last saw. */
const currentView = () => parseView(new URLSearchParams(window.location.search));

/**
 * Move to another view. Push for a place you would go Back from (a
 * collection, an open asset); replace for tweaking the one you're in.
 */
function go(patch: Partial<View>, push = false) {
  const qs = viewQuery({ ...currentView(), ...patch });
  window.history[push ? "pushState" : "replaceState"](null, "", qs ? `/?${qs}` : "/");
}

const PAGE = 100;

/** A drag of files from the desktop, as opposed to something dragged within the page. */
const carriesFiles = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");

type Layout = "grid" | "list";
/**
 * Grid or list, remembered per viewer: a convenience, so browser storage. The
 * library opens as a grid (it is art); Review as a list (it is decisions).
 */
async function copyLink(path: string) {
  const href = new URL(path, location.origin).href;
  try {
    await navigator.clipboard.writeText(href);
    toast.success("Copied a link to this collection");
  } catch {
    toast.error("Couldn't copy the link", { description: href });
  }
}

function useLayout(review: boolean): [Layout, (l: Layout) => void] {
  const [stored, set] = usePref<Layout | null>(`artbucket:layout:${review ? "review" : "assets"}`, null);
  return [stored === "grid" || stored === "list" ? stored : review ? "list" : "grid", set];
}

// This component talks to /api/v1 and nothing else. There are no private
// endpoints: if the UI needs something the public API cannot do, the API is
// not finished.
//
// What it shows is the URL (lib/view.ts): search, filters, the collection,
// Review, the open asset. State here is only what the URL can't hold.
export function Gallery({
  initial,
  fields: initialFields,
  sidebar,
}: {
  /** The first page for the URL the page was loaded at. */
  initial: Listing;
  fields: FieldDef[];
  sidebar: SidebarData;
}) {
  // A string, so the view derived from it is a value the compiler can trust.
  const search = useSearchParams().toString();
  const view = useMemo(() => parseView(new URLSearchParams(search)), [search]);
  const apiQuery = useMemo(() => viewQuery(view, false), [view]);
  const can = useCan();
  const [sharing, setSharing] = useState<ShareTarget | null>(null);
  const [fonts, setFonts] = useState(false);
  const [linking, setLinking] = useState(false);
  const [{ data: assets, total, facets }, setListing] = useState(initial);
  const [collections, setCollections] = useState(sidebar.collections);
  const [reviewCount, setReviewCount] = useState(sidebar.reviewCount);
  // The field schema can change under an open page (here or elsewhere), so it
  // refreshes with everything else. A stale copy sends values for deleted fields.
  const [fields, setFields] = useState(initialFields);
  const inCollection = collections.find((c) => c.id === view.collection);
  const [editing, setEditing] = useState<Collection | "new" | null>(null);
  const [searches, setSearches] = useState(sidebar.searches);
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

  // The search box is ahead of the URL while you type; it follows the URL when
  // something else changes it (Back, a saved search, Clear filters).
  const [text, setText] = useState(view.q);
  const [seenQ, setSeenQ] = useState(view.q);
  if (view.q !== seenQ) {
    setSeenQ(view.q);
    if (view.q !== text.trim()) setText(view.q);
  }
  // Settled for a beat, so each keystroke isn't a request or a history entry.
  useEffect(() => {
    if (text.trim() === currentView().q) return;
    const t = setTimeout(() => go({ q: text }), 150);
    return () => clearTimeout(t);
  }, [text]);

  // Responses can land out of order; only the latest request may paint.
  const latest = useRef(0);
  // How many are on screen, so a refresh after an edit keeps what you scrolled to.
  const loaded = useRef(initial.data.length);
  useEffect(() => {
    loaded.current = assets.length;
  });
  // The query behind what's on screen. When it differs from the URL's, a
  // search is in flight: derived, so no effect has to toggle a flag.
  const [shown, setShown] = useState(apiQuery);
  const refresh = useCallback(
    async (keep = true) => {
      const ticket = ++latest.current;
      const limit = keep ? Math.min(200, Math.max(PAGE, loaded.current)) : PAGE;
      const [res, cols, defs, review] = await Promise.all([
        fetch(`/api/v1/assets?${apiQuery}${apiQuery ? "&" : ""}limit=${limit}`),
        fetch("/api/v1/collections"),
        fetch("/api/v1/fields"),
        fetch("/api/v1/assets?review=true&limit=1"),
      ]);
      const [listing, colsBody, defsBody, reviewBody] = await Promise.all([
        res.json(),
        cols.ok ? cols.json() : null,
        defs.ok ? defs.json() : null,
        review.ok ? review.json() : null,
      ]);
      if (ticket !== latest.current) return;
      setShown(apiQuery);
      if (res.ok) setListing(listing);
      else toast.error("Couldn't run this search", { id: "search", description: listing.error?.message });
      if (colsBody) setCollections(colsBody.data);
      if (reviewBody) setReviewCount(reviewBody.total);
      if (defsBody) {
        const next: FieldDef[] = defsBody.data;
        setFields(next);
        // Drop filters on fields that no longer exist, or every search would 422.
        const gone = Object.keys(currentView().filters).filter((k) => !next.some((d) => d.key === k));
        if (gone.length) go({ filters: Object.fromEntries(Object.entries(currentView().filters).filter(([k]) => !gone.includes(k))) });
      }
    },
    [apiQuery],
  );

  // A new view starts from its first page. The server drew the first one.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void refresh(false);
  }, [refresh]);

  // The next page, when the end of the grid scrolls into view.
  const more = useRef(false);
  const loadMore = useCallback(async () => {
    if (more.current) return;
    more.current = true;
    const ticket = latest.current;
    const res = await fetch(`/api/v1/assets?${apiQuery}${apiQuery ? "&" : ""}offset=${loaded.current}&limit=${PAGE}`);
    more.current = false;
    if (!res.ok || ticket !== latest.current) return;
    const page: Listing = await res.json();
    setListing((l) => {
      const have = new Set(l.data.map((a) => a.id));
      return { ...l, total: page.total, data: [...l.data, ...page.data.filter((a) => !have.has(a.id))] };
    });
  }, [apiQuery]);
  const end = useRef<HTMLDivElement>(null);
  const hasMore = assets.length < total;
  useEffect(() => {
    if (!hasMore || !end.current) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && void loadMore(), {
      rootMargin: "600px",
    });
    io.observe(end.current);
    return () => io.disconnect();
  }, [hasMore, loadMore, assets.length]);

  // The open asset: from the grid, or fetched when the link points past it.
  const [known, setKnown] = useState<Asset | null>(null);
  const open =
    [assets.find((a) => a.id === view.asset), known?.id === view.asset ? known : undefined]
      .filter((a): a is Asset => !!a)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
  const missing = view.asset && !open ? view.asset : null;
  useEffect(() => {
    if (!missing) return;
    let live = true;
    fetch(`/api/v1/assets/${missing}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!live) return;
        if (b) setKnown(b.data);
        else {
          toast.error("That asset isn't in the library anymore");
          go({ asset: null });
        }
      });
    return () => {
      live = false;
    };
  }, [missing]);

  async function saveSearch(name: string) {
    const saved: SavedSearch | null = await send("POST", "/api/v1/searches", { name, query: apiQuery });
    if (!saved) return false;
    setSearches((ss) => [...ss, saved].sort((a, b) => a.name.localeCompare(b.name)));
    toast.success(`Saved "${name}"`);
    return true;
  }

  async function forget(id: string) {
    if (await send("DELETE", `/api/v1/searches/${id}`)) setSearches((ss) => ss.filter((sv) => sv.id !== id));
  }

  const clear = () => {
    setText("");
    go({ q: "", tags: [], types: [], status: [], filters: {}, extra: [] });
  };

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
  const into = view.collection;
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
              collections: into ? [into] : [],
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
    [refresh, into],
  );

  // A clean batch clears itself shortly after; one with failures waits to be read.
  const uploading = uploads.some(isActive);
  useEffect(() => {
    if (!uploads.length || uploading || uploads.some((u) => u.status === "failed")) return;
    const t = setTimeout(() => setUploads([]), 4000);
    return () => clearTimeout(t);
  }, [uploads, uploading]);

  const narrowed = isNarrowed(view);
  // Into the collection open, or the workspace itself: whatever the person may add to.
  const canUpload = into ? can("asset.upload", { id: into }) : can("workspace.upload");
  // Asking someone without an account to send files there, by link.
  const canRequest = inCollection ? can("collection.collect", inCollection) : can("share.collect_workspace");
  const filtered = narrowed || view.collection !== null || view.review;
  // The welcome is for an empty library, not for a search that found nothing.
  const empty = assets.length === 0 && !filtered;

  const picked = assets.filter((a) => selected.has(a.id));
  const shareAsset = (a: Asset) => setSharing({ kind: "view", asset: { id: a.id, name: a.metadata?.title || a.filename, public: a.public } });
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

  const searching = shown !== apiQuery || text.trim() !== view.q;
  const [layout, setLayout] = useLayout(view.review);
  const activeSearch = searches.find((sv) => canonical(sv.query) === apiQuery) ?? null;

  // What you open goes to the top of Recents in the sidebar: an asset, a saved search, a collection.
  const recent = open
    ? { kind: "asset" as const, id: open.id, label: open.metadata?.title || open.filename, href: `/?asset=${open.id}` }
    : activeSearch
      ? { kind: "search" as const, id: activeSearch.id, label: activeSearch.name, href: `/?${canonical(activeSearch.query)}` }
      : inCollection
        ? { kind: "collection" as const, id: inCollection.id, label: inCollection.name, href: `/?collection=${inCollection.id}` }
        : null;
  const recentKey = recent && JSON.stringify(recent);
  const remember = useRemember();
  useEffect(() => {
    if (recentKey) remember(JSON.parse(recentKey));
  }, [recentKey, remember]);
  const title = activeSearch?.name ?? (view.review ? "Review" : (inCollection?.name ?? "All assets"));

  return (
    // Drag is tracked on the whole page: dropping only inside a bordered box is
    // a worse target than the window.
    <SidebarProvider
      // Only files from outside: dragging within the page (reordering the
      // sidebar, a link, an image) is not an upload.
      onDragEnter={(e) => {
        if (!carriesFiles(e)) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => carriesFiles(e) && e.preventDefault()}
      onDragLeave={(e) => {
        if (!carriesFiles(e)) return;
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) setDragging(false);
      }}
      onDrop={(e) => {
        if (!carriesFiles(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (canUpload) start(e.dataTransfer.files);
      }}
    >
      <AppSidebar
        me={sidebar.me}
        collections={collections}
        brands={sidebar.brands}
        searches={searches}
        reviewCount={reviewCount}
        onNewCollection={() => setEditing("new")}
        onEditCollection={setEditing}
        onDeleteSearch={forget}
        onUpload={canUpload ? () => input.current?.click() : undefined}
      />

      <SidebarInset className="min-w-0">
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <div className="relative w-full max-w-md">
            {searching ? (
              <IconLoader2 className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 animate-spin" />
            ) : (
              <IconSearch className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            )}
            <Input
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Search names, tags, captions"
              aria-label="Search assets"
              className="h-8 pl-8"
            />
          </div>
          {/* Stays enabled mid-upload: a second batch queues alongside the first. */}
          {/* Pushes what follows to the right edge, whether or not Upload shows. */}
          <span className="ml-auto" />
          {/* Every way files come in, in one control: Upload, and the others in its menu. */}
          {canUpload && (
            <div className="flex">
              <Button size="sm" className="rounded-r-none" onClick={() => input.current?.click()} aria-busy={uploading}>
                <IconUpload />
                <span className="hidden sm:inline">Upload</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="border-primary-foreground/20 rounded-l-none border-l px-1.5" aria-label="More ways to add">
                    <IconChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => input.current?.click()}>
                    <IconUpload /> Upload files
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setFonts(true)}>
                    <IconTypography /> Import a Google font
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setLinking(true)}>
                    <IconLink /> Add a link
                    <span className="text-muted-foreground ml-auto pl-4 text-xs">Figma, Google</span>
                  </DropdownMenuItem>
                  {canRequest && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setSharing(inCollection ? { kind: "upload", collection: inCollection } : { kind: "upload" })}>
                        <IconFolderUp /> Request uploads by link
                        <span className="text-muted-foreground ml-auto pl-4 text-xs">no account</span>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <GoogleFontImport open={fonts} onOpenChange={setFonts} into={into} onDone={() => void refresh()} />
              <LinkImport open={linking} onOpenChange={setLinking} into={into} onDone={() => void refresh()} />
            </div>
          )}
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
          {/* How an agent reads what this page shows; only the theme comes after it. */}
          <ForAgents
            about={
              view.review
                ? "What waits here, as an agent asks for it. Each agent reads what you decided, and why, with my_proposals."
                : "This view as a query: an agent gets the same assets and facets, then asks rendition_url for the size to hand out."
            }
            reads={(origin) => {
              const args = {
                q: view.q || undefined,
                tags: view.tags,
                types: view.types.length ? view.types : undefined,
                collection: inCollection?.name,
                filters: Object.keys(view.filters).length || view.extra.length
                  ? { ...view.filters, ...Object.fromEntries(view.extra.map(([k, v]) => [k.slice(2), v])) }
                  : undefined,
                review: view.review || undefined,
              };
              return [
                { label: "MCP tool", text: call("search_assets", args) },
                ...(view.review ? [{ label: "What each agent reads back", text: call("my_proposals") }] : []),
                { label: "REST", text: curl(`${origin}/api/v1/assets${apiQuery ? `?${apiQuery}` : ""}`) },
              ];
            }}
          />
          <ThemeToggle />
        </header>

        <div className="flex min-w-0 flex-1 flex-col gap-4 px-4 pb-4 md:px-6 md:pb-6">
          <LibraryTabs at={view.review ? "review" : "assets"} reviewCount={reviewCount} />
          <PageHeader
            icon={
              view.review ? <IconInbox /> : activeSearch ? <IconBookmark /> : inCollection ? <CollectionIcon icon={inCollection.icon} /> : <IconPhoto />
            }
            title={title}
            aside={
              <>
                <Badge variant="secondary" className="font-mono tabular-nums" title={`${total} ${total === 1 ? "asset" : "assets"}`}>
                  {total}
                </Badge>
                {inCollection?.private && !activeSearch && (
                  <Badge variant="outline" title="Only people added to it, and admins, see it">
                    <IconLock /> Private
                  </Badge>
                )}
              </>
            }
            description={
              view.review
                ? "What agents, contributors and upload links sent in, and tags they suggested. Nothing reaches the library until someone approves it."
                : activeSearch
                  ? "A saved search: this link always shows what matches now."
                  : inCollection
                    ? `Uploads made here land in ${inCollection.name}.${
                        Object.keys(inCollection.fields).length
                          ? ` Its assets read ${Object.entries(inCollection.fields)
                              .map(([k, v]) => `${fields.find((d) => d.key === k)?.label ?? k}: ${v}`)
                              .join(", ")}.`
                          : ""
                      }`
                    : "Everything in the library. Drop files anywhere on the page to add them."
            }
          >
            {/* What can be done with the collection itself: copy its link, share it, edit it. */}
            {inCollection && !activeSearch && (
              <IconButton label="Copy link, for people with access" onClick={() => copyLink(`/?collection=${inCollection.id}`)}>
                <IconCopy />
              </IconButton>
            )}
            {inCollection && !activeSearch && can("collection.share", inCollection) && (
              <IconButton label={`Share ${inCollection.name}`} onClick={() => setSharing({ kind: "view", collection: inCollection })}>
                <IconShare />
              </IconButton>
            )}
            {inCollection && !activeSearch && can("collection.edit", inCollection) && (
              <IconButton label="Edit collection" onClick={() => setEditing(inCollection)}>
                <IconPencil />
              </IconButton>
            )}
          </PageHeader>
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
                    {picked.length ? `${picked.length} selected` : "Select all"}
                  </span>
                </label>
              )}
              <FacetFilter
                label="Type"
                counts={facets.types ?? []}
                selected={view.types}
                format={(v) => v[0].toUpperCase() + v.slice(1)}
                onChange={(types) => go({ types })}
              />
              <FacetFilter label="Tags" counts={facets.tags} selected={view.tags} onChange={(tags) => go({ tags })} />
              {/* Review is its own queue; everywhere else the library is what may be used, and the rest a filter away. */}
              {!view.review && (
                <FacetFilter
                  label="Status"
                  counts={facets.states ?? []}
                  selected={view.status}
                  format={(v) => STATE_LABEL[v as State] ?? v}
                  onChange={(status) => go({ status })}
                />
              )}
              {fields.filter(isFacetable).map((d) => (
                <FacetFilter
                  key={d.key}
                  label={d.label}
                  counts={facets.fields?.[d.key] ?? []}
                  selected={view.filters[d.key] ?? []}
                  format={d.type === "boolean" ? (v) => (v === "true" ? "Yes" : "No") : undefined}
                  onChange={(vs) => go({ filters: { ...view.filters, [d.key]: vs } })}
                />
              ))}
              {view.extra.map(([k, v]) => (
                <Badge key={`${k}=${v}`} variant="secondary" className="h-8 gap-1 pr-1">
                  {describe(k, v)}
                  <button
                    type="button"
                    onClick={() => go({ extra: view.extra.filter((x) => x[0] !== k || x[1] !== v) })}
                    aria-label={`Remove filter ${describe(k, v)}`}
                    className="hover:bg-muted-foreground/20 rounded-full p-0.5"
                  >
                    <IconX className="size-3" />
                  </button>
                </Badge>
              ))}
              {narrowed && (
                <Button variant="ghost" size="sm" className="h-8" onClick={clear}>
                  Clear filters <IconX />
                </Button>
              )}
              <span className="ml-auto" />
              {/* Only a search or filter is worth naming; a collection or Review is already in the sidebar. */}
              {narrowed && !activeSearch && can("search.save") && <SaveSearch onSave={saveSearch} />}
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={layout}
                onValueChange={(v) => v && setLayout(v as Layout)}
                aria-label="Layout"
              >
                <ToggleGroupItem value="grid" aria-label="Grid" title="Grid">
                  <IconLayoutGrid />
                </ToggleGroupItem>
                <ToggleGroupItem value="list" aria-label="List" title="List">
                  <IconList />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}

          {empty ? (
            <EmptyState dragging={dragging} onUpload={canUpload ? () => input.current?.click() : undefined} />
          ) : assets.length === 0 && searching ? (
            // Don't flash "no matches" for a search that hasn't answered yet.
            <GridSkeleton count={8} />
          ) : assets.length === 0 && view.review && !narrowed ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconInbox />
                </EmptyMedia>
                <EmptyTitle>Nothing to review</EmptyTitle>
                <EmptyDescription>
                  What agents, contributors and upload links send in waits here until someone approves it. Nothing
                  they add reaches the library on its own.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="flex-row flex-wrap justify-center">
                {can("share.collect_workspace") && (
                  <Button onClick={() => setSharing({ kind: "upload" })}>
                    <IconFolderUp /> Request uploads by link
                  </Button>
                )}
                <Button variant="outline" asChild>
                  <Link href="/agents">
                    <IconRobot /> Connect an agent
                  </Link>
                </Button>
              </EmptyContent>
            </Empty>
          ) : assets.length === 0 && inCollection && !narrowed ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CollectionIcon icon={inCollection.icon} />
                </EmptyMedia>
                <EmptyTitle>{inCollection.name} is empty</EmptyTitle>
                <EmptyDescription>
                  Upload while it&apos;s open and files land here. Or select assets in All assets and use Add to.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="flex-row justify-center">
                {canUpload && (
                  <Button onClick={() => input.current?.click()}>
                    <IconUpload /> Upload here
                  </Button>
                )}
                <Button variant="outline" onClick={() => go({ collection: null }, true)}>
                  Browse all assets
                </Button>
              </EmptyContent>
            </Empty>
          ) : assets.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconSearch />
                </EmptyMedia>
                <EmptyTitle>No matches</EmptyTitle>
                <EmptyDescription>
                  {view.q ? <>Nothing matches &ldquo;{view.q}&rdquo;</> : "Nothing matches these filters"}
                  {inCollection ? ` in ${inCollection.name}` : ""}. Try fewer words or drop a filter.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="flex-row justify-center">
                <Button variant="outline" onClick={clear}>
                  Clear filters
                </Button>
                {inCollection && (
                  <Button variant="ghost" onClick={() => go({ collection: null }, true)}>
                    Search all assets
                  </Button>
                )}
              </EmptyContent>
            </Empty>
          ) : (
            <>
              {layout === "list" ? (
                <div aria-busy={searching} className={cn("transition-opacity", searching && "opacity-60")}>
                  <AssetTable
                    assets={assets}
                    selected={selected}
                    selecting={picked.length > 0}
                    review={view.review}
                    onOpen={(a) => go({ asset: a.id }, true)}
                    onPick={pick}
                    onShare={shareAsset}
                    onChanged={() => void refresh()}
                  />
                </div>
              ) : (
              <ul
                aria-busy={searching}
                className={cn(
                  "grid gap-4 transition-opacity [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]",
                  searching && "opacity-60",
                )}
              >
                {assets.map((a, i) => (
                  <AssetMenu
                    key={a.id}
                    asset={a}
                    onOpen={() => go({ asset: a.id }, true)}
                    onShare={() => shareAsset(a)}
                    onPick={() => pick(i, false)}
                    selected={selected.has(a.id)}
                    onChanged={() => void refresh()}
                  >
                    <li>
                      <AssetCard
                        asset={a}
                        onOpen={() => go({ asset: a.id }, true)}
                        selected={selected.has(a.id)}
                        // Once anything is selected, a click selects instead of opening.
                        selecting={picked.length > 0}
                        onPick={(range) => pick(i, range)}
                      />
                    </li>
                  </AssetMenu>
                ))}
              </ul>
              )}
              {hasMore ? (
                <div ref={end} className="flex justify-center py-4">
                  <Button variant="outline" size="sm" onClick={() => void loadMore()}>
                    Load more
                    <span className="text-muted-foreground tabular-nums">
                      {assets.length} of {total}
                    </span>
                  </Button>
                </div>
              ) : (
                <p className="text-muted-foreground py-2 text-center text-sm">
                  Showing all {total} {total === 1 ? "asset" : "assets"}
                </p>
              )}
            </>
          )}
        </div>
      </SidebarInset>

      {open && (
        <AssetEditor
          key={open.id}
          asset={open}
          fields={fields}
          collections={collections}
          onClose={() => go({ asset: null })}
          onSaved={refresh}
          onReviewed={(a) => {
            setKnown(a);
            void refresh();
          }}
          onOpen={(id) => {
            go({ asset: id }, true);
            void refresh();
          }}
        />
      )}

      {pending && (
        <UploadFieldsDialog
          defs={fields}
          count={pending.length}
          inherited={inherited}
          from={inCollection?.name}
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
        review={view.review}
        onSelectAll={selectAll}
        onClear={clearSelection}
        onDone={refresh}
      />


      {sharing && <ShareDialog target={sharing} collections={collections} onClose={() => setSharing(null)} onChanged={() => void refresh()} />}
      {editing && (
        <CollectionDialog
          collection={editing === "new" ? undefined : editing}
          fields={fields}
          onClose={() => setEditing(null)}
          onSaved={(c) => {
            // A new collection opens; a deleted one drops back to everything.
            if (editing === "new" && c) go({ collection: c.id }, true);
            else if (!c) go({ collection: null }, true);
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
  const [hover, setHover] = useState(false);
  return (
    <div className="group relative" onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
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
          {hasPreview(a) ? (
            // Rendition URLs are pure functions of the asset id: no export step,
            // no signing, no prior round trip.
            <Thumb src={`/a/${a.id}/w_260,f_webp`} alt={a.filename} />
          ) : isLottie(a) ? (
            // Still until pointed at: a grid of loops is noise.
            <Lottie src={`/a/${a.id}`} playing={hover} className="p-2" />
          ) : isFont(a.mime, a.filename) ? (
            <span className="flex size-full items-center justify-center">
              <FontThumb id={a.id} className="text-6xl" />
            </span>
          ) : (
            <span className="text-muted-foreground flex size-full items-center justify-center">
              <IconPhoto className="size-8" stroke={1.5} />
            </span>
          )}
          <Badge variant="secondary" className="bg-background/80 absolute top-2 left-2 font-mono text-[11px] backdrop-blur">
            {fileTypeBadge(a.filename, a.mime, a.probe)}
            {a.version && <span className="text-muted-foreground">v{a.version}</span>}
          </Badge>
          {(a.status === "proposed" || suggestions(a)) && (
            <Badge className="absolute bottom-2 left-2 text-[11px]">
              <IconSparkles />
              {a.status === "proposed" ? "Suggested" : `Suggested: ${suggestions(a)}`}
            </Badge>
          )}
          {/* What /api/v1/check would refuse whatever the use: say so before anyone picks it. */}
          {(a.supersededBy || !["active", "proposed"].includes(a.state)) && (
            <Badge variant="secondary" className="bg-background/80 absolute right-2 bottom-2 text-[11px] backdrop-blur">
              {a.state === "active" ? "Replaced" : STATE_LABEL[a.state]}
            </Badge>
          )}
        </div>
        <div className="grid gap-0.5 border-t px-3 py-2">
          {/* The title a person gave it reads better than the name a camera did. */}
          <p className="truncate text-sm font-medium" title={a.filename}>
            {a.metadata?.title || truncateFilename(a.filename, 24)}
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

/**
 * A lazy image that pulses until it arrives, then fades in. Its parent must be `relative`.
 * `src` names the size for a 1x screen (`/a/{id}/w_240,f_webp`); a 2x screen
 * gets the rendition twice as wide, so nothing is upscaled on a retina display.
 */
export function Thumb({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  const double = src.replace(/\/w_(\d+)/, (_, w) => `/w_${Math.min(Number(w) * 2, 8000)}`);
  return (
    <>
      {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        // A cached image can finish before hydration attaches onLoad.
        ref={(img) => {
          if (img?.complete && img.naturalWidth) setLoaded(true);
        }}
        src={src}
        srcSet={double === src ? undefined : `${src} 1x, ${double} 2x`}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className={cn(
          // No zoom on hover: scaling a raster softens it. The card's shadow says hover.
          "relative size-full object-contain p-2 transition-opacity duration-200",
          loaded ? "opacity-100" : "opacity-0",
          className,
        )}
      />
    </>
  );
}

/** An empty library: the one place the whole page is the upload target. */
function EmptyState({ dragging, onUpload }: { dragging: boolean; onUpload?: () => void }) {
  return (
    <Empty className={cn("border-2 transition-colors", dragging && "border-primary bg-primary/5")}>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-14 rounded-full [&_svg:not([class*='size-'])]:size-7">
          <IconCloudUpload stroke={1.5} />
        </EmptyMedia>
        <EmptyTitle className="text-xl">Your brand, as data</EmptyTitle>
        <EmptyDescription>
          Upload assets, write the rules they follow, and let people and agents use both. Every asset is searchable
          and served at any size, straight from its URL.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex flex-wrap justify-center gap-2">
          {onUpload && (
            <Button onClick={onUpload}>
              <IconUpload /> Upload files
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link href="/brand">
              <IconBook /> Write your guidelines
            </Link>
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">or drop files anywhere on this page</p>
      </EmptyContent>
    </Empty>
  );
}

/** Name the current view and keep it in the sidebar. */
function SaveSearch({ onSave }: { onSave: (name: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8">
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
