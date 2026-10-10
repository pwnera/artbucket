"use client";

import Link from "next/link";
import { Spinner } from "@/components/ui/spinner";
import { useSearchParams } from "next/navigation";
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  IconAlertTriangle,
  IconBackground,
  IconBook,
  IconBookmark,
  IconBookmarkPlus,
  IconChevronDown,
  IconCloudUpload,
  IconFolder,
  IconFolderUp,
  IconInbox,
  IconLayoutGrid,
  IconList,
  IconPencil,
  IconPhoto,
  IconPlayerPlayFilled,
  IconRobot,
  IconSearch,
  IconLock,
  IconShare,
  IconSparkles,
  IconIcons,
  IconTypography,
  IconUpload,
  IconLink,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { AssetViewer } from "@/components/asset-viewer";
import { useBrand } from "@/components/brand";
import { call, curl, ForAgents } from "@/components/agent-access";
import { AssetTable } from "@/components/asset-table";
import { AppHeader, LibraryTabs, PageHeader } from "@/components/page";
import { CatalogMatches } from "@/components/catalog-matches";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CollectionIcon, send, type Collection } from "@/components/collections";
import { CopyButton } from "@/components/copy-button";
import { FacetFilter, type Count } from "@/components/facet-filter";
import { UploadFieldsDialog } from "@/components/fields";
import { FontThumb, GoogleFontImport } from "@/components/font-preview";
import { IconGlyph } from "@/components/icon-glyph";
import { IconPackImport } from "@/components/icon-packs";
import { LinkImport, Lottie } from "@/components/media";
import type { SavedSearch } from "@/components/app-sidebar";
import { deciding, SelectionBar, useBulk, type Patch } from "@/components/selection-bar";
import { SetupChecklist } from "@/components/setup-checklist";
import { useCan } from "@/components/can";
import { IconButton } from "@/components/icon-button";
import { InfoTip } from "@/components/info-tip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AssetMenu, type ActionContext } from "@/components/asset-menu";
import { ShareDialog, type ShareTarget } from "@/components/share-dialog";
import { usePref, useRemember } from "@/components/sidebar-prefs";
import { GRID_COLS, GridSkeleton, ListSkeleton } from "@/components/skeletons";
import { SubmitButton } from "@/components/submit-button";
import { Thumb } from "@/components/thumb";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { isActive, putWithProgress, UploadTray, uploadStore, useUploads, type Upload, type UploadStore } from "@/components/uploads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useShell } from "@/components/shell";
import { relaxInherited, type FieldDef, type FieldValue } from "@/lib/fields";
import { isFacetable } from "@/lib/filters";
import { pool } from "@/lib/pool";
import { expiring, STATE_LABEL, type State, type Status } from "@/lib/lifecycle";
import type { Origin, Rights } from "@/lib/rights";
import type { C2pa } from "@/lib/c2pa";
import { fileTypeBadge, formatBytes, tooLargeToUpload, truncateFilename } from "@/lib/filename";
import { isFont } from "@/lib/font";
import { hasPreview, isIcon, isLottie, isMono, parseLink } from "@/lib/preview";
import { flash, Morph, transition, useKept } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { canonical, isNarrowed, parseView, viewQuery, type View } from "@/lib/view";
import { reason, refusal } from "@/lib/send";

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
  /** How it arrived when not from a person: through an API key, or imported by the server. */
  via?: "agent" | "import" | null;
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
    lens?: string;
    capturedAt?: string;
    gps?: { lat: number; lon: number };
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

// Back and Forward restore their own scroll; any other move to a new place starts at the top.
let popped = false;
if (typeof window !== "undefined") window.addEventListener("popstate", () => void (popped = true));

// Opened by a push, the viewer closes by going Back, so history holds no
// duplicate library entry for the next Back to land on.
let pushedViewer = false;
const openAsset = (id: string) => {
  pushedViewer = true;
  go({ asset: id }, true);
};
const closeAsset = () => {
  if (!pushedViewer) return go({ asset: null });
  pushedViewer = false;
  window.history.back();
};

const PAGE = 100;
/** Lights up the tiles or rows of `ids` once they are drawn ([data-flash]). */
const flashTiles = (ids: Iterable<string>) => {
  const sel = [...ids].map((id) => `[data-cursor="${CSS.escape(id)}"]`).join(",");
  if (sel) flash(sel);
};

/** The API's largest page: a refresh past it asks for several at once. */
const MAX_PAGE = 200;

// A drag that started in the page (a tile, a sidebar item) is not an upload,
// whatever types the browser reports for it.
let dragInside = false;
/** A drag of files from the desktop, as opposed to something dragged within the page. */
const carriesFiles = (e: DragEvent) => !dragInside && !!e.dataTransfer?.types.includes("Files");

/** What a text field or another layer should keep for itself. */
const typing = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest("input, textarea, select, [contenteditable], [role=dialog], [role=alertdialog], [role=menu]");

/**
 * The files of a drop, folders walked for theirs (dotfiles like .DS_Store
 * left out). Entries are taken synchronously: the drop's data is gone after
 * the first await.
 */
function filesOf(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  const plain = [...dt.files];
  if (!entries.some((e) => e.isDirectory)) return Promise.resolve(plain);
  const out: File[] = [];
  const walk = async (e: FileSystemEntry): Promise<void> => {
    if (e.name.startsWith(".")) return;
    if (e.isFile) out.push(await new Promise<File>((ok, no) => (e as FileSystemFileEntry).file(ok, no)));
    else if (e.isDirectory) {
      const reader = (e as FileSystemDirectoryEntry).createReader();
      // readEntries hands a folder over in batches, until an empty one.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((ok, no) => reader.readEntries(ok, no));
        if (!batch.length) break;
        for (const c of batch) await walk(c);
      }
    }
  };
  return entries.reduce((p, e) => p.then(() => walk(e)), Promise.resolve()).then(() => out);
}

type Layout = "grid" | "list";
type Density = "s" | "m" | "l";
const TILE: Record<Density, string> = { s: "140px", m: "180px", l: "260px" };
const DENSITIES: Density[] = ["s", "m", "l"];

/** What a tile's art sits on: `auto` is a checkerboard for art with transparency, else neutral. */
export const WELLS = ["auto", "light", "dark", "checker"] as const;
export type Well = (typeof WELLS)[number];
/** The well behind an asset's art, overridden by the `data-well` of an enclosing `group/well`. */
export const wellClass = (a: Asset) =>
  cn(
    // An icon is a glyph on a plain ground; a grid behind a small shape is noise.
    a.probe?.hasAlpha === true && !isIcon(a) ? "bg-checker" : "bg-muted",
    "group-data-[well=light]/well:bg-white group-data-[well=dark]/well:bg-neutral-900 group-data-[well=checker]/well:bg-checker",
  );

/** A one-ink icon's color on each well: the theme's text, and what reads on a white or a black one. */
export const GLYPH_INK = "text-foreground group-data-[well=light]/well:text-neutral-900 group-data-[well=dark]/well:text-white";

/** A per-viewer preference, also in a cookie so the server paints it first. */
const remember = (name: string, value: string) => {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
};

/**
 * Grid or list, remembered per viewer: a convenience, so browser storage. The
 * library opens as a grid (it is art); Review as a list (it is decisions).
 */
function useLayout(review: boolean, initial?: Layout): [Layout, (l: Layout) => void] {
  const which = review ? "review" : "assets";
  const [stored, set] = usePref<Layout | null>(`artbucket:layout:${which}`, null);
  return [
    stored === "grid" || stored === "list" ? stored : (initial ?? (review ? "list" : "grid")),
    (l) => {
      set(l);
      remember(`artbucket_layout_${which}`, l);
    },
  ];
}

/** Whether `ref` is within `margin` of the viewport: a card's font or player waits until it is. */
function useInView<T extends Element>(margin = "200px") {
  const [el, setEl] = useState<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!el || seen) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setSeen(true), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [el, seen, margin]);
  return [setEl, seen] as const;
}

/** Where a suggestion came from, for the review queue: what a model made, what an agent sent, what was imported. */
export const provenanceChips = (a: Pick<Asset, "origin" | "via">) =>
  [a.origin === "generated" && "AI-made", a.via === "agent" && "By an agent", a.via === "import" && "Imported"].filter((c) => c !== false);

/**
 * What the review queue shows about an item before anyone opens it: where it
 * came from, the evidence that came with it, and what is missing before it
 * may run everywhere (`missing`, said as a warning).
 */
export const reviewChips = (a: Pick<Asset, "origin" | "via" | "generator" | "prompt" | "c2pa" | "rights">) => ({
  from: [...provenanceChips(a), a.generator && `Made with ${a.generator}`, a.prompt && "Prompt recorded", a.c2pa && "Content Credentials"].filter(
    (c): c is string => !!c,
  ),
  // Without one, lib/rights.ts refuses every use but editorial.
  missing: a.rights?.modelRelease === "missing" ? "Missing: model release" : null,
});

/** What the grid and the list say about an asset beyond its type: its state, its version, what waits on it. */
export function stateBadge(a: Asset) {
  const n = a.proposedTags.length + Object.keys(a.proposedFields ?? {}).length;
  return {
    // What /api/v1/check would refuse whatever the use, or soon will: said before anyone picks it.
    state:
      a.supersededBy && a.state === "active"
        ? "Replaced"
        : !["active", "proposed"].includes(a.state)
          ? STATE_LABEL[a.state]
          : expiring({ status: a.status, rights: a.rights }),
    version: a.version ? `v${a.version}` : null,
    suggested: a.status === "proposed" ? "Suggested" : n ? `${n} ${n === 1 ? "suggestion" : "suggestions"}` : null,
  };
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
  initialLayout,
  initialDensity,
}: {
  /** The first page for the URL the page was loaded at. */
  initial: Listing;
  fields: FieldDef[];
  /** The viewer's layout and density, from their cookie, for the first paint. */
  initialLayout?: Layout;
  initialDensity?: Density;
}) {
  // A string, so the view derived from it is a value the compiler can trust.
  const search = useSearchParams().toString();
  const view = useMemo(() => parseView(new URLSearchParams(search)), [search]);
  const apiQuery = useMemo(() => viewQuery(view, false), [view]);
  const can = useCan();
  const brand = useBrand();
  // Kept mounted once used, so closing animates; the last target shows while it does.
  const [sharing, setSharing] = useState<{ target: ShareTarget; open: boolean } | null>(null);
  const share = (target: ShareTarget) => setSharing({ target, open: true });
  const [fonts, setFonts] = useState(false);
  const [icons, setIcons] = useState(false);
  const [linking, setLinking] = useState<{ open: boolean; url: string }>({ open: false, url: "" });
  const [{ data: assets, total, facets }, setListing] = useState(initial);
  // The sidebar's lists live in the shell; what this page refetches goes back there.
  const { collections, setCollections, setReviewCount, searches, setSearches, openCollection, setUpload, collectionEdits } =
    useShell();
  // The field schema can change under an open page (here or elsewhere), so it
  // refreshes with everything else. A stale copy sends values for deleted fields.
  const [fields, setFields] = useState(initialFields);
  const inCollection = collections.find((c) => c.id === view.collection);
  // Files waiting on the required-fields step before they upload.
  const [pending, setPending] = useState<{ files: File[]; hidden: boolean; open: boolean } | null>(null);
  const [drag, setDrag] = useState<{ count: number } | null>(null);
  // Kept a moment after the files leave or land, so the overlay fades rather than blinks out.
  const dragShown = useKept(drag);
  // Selected asset ids. Only the ones on screen count (`picked`), so a filter
  // change can't leave hidden files in a bulk action.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // The shift-click anchor and the keyboard cursor are ids: the list reorders under indexes.
  const anchor = useRef<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
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
  const listed = useRef(assets);
  useEffect(() => {
    loaded.current = assets.length;
    listed.current = assets;
  });
  const lastRefresh = useRef(0);
  // What a toast's Retry calls: the latest of each, from outside their own definitions.
  const again = useRef({ refresh: () => {}, loadMore: () => {} });
  // The query behind what's on screen. When it differs from the URL's, a
  // search is in flight: derived, so no effect has to toggle a flag.
  const [shown, setShown] = useState(apiQuery);
  // A search the API refused (a filter on a field that's gone): said in place, not over stale results.
  const [failure, setFailure] = useState<string | null>(null);
  // A refresh is due (files landing): the listing may not have them yet.
  const [due, setDue] = useState(false);

  /**
   * Reload what the URL shows, and the lists around it. The query is read
   * now, not closed over: a refresh started for one view (an upload's) must
   * never paint another. `keep` reloads as many as are on screen.
   */
  const refresh = useCallback(
    async (keep = true) => {
      const ticket = ++latest.current;
      lastRefresh.current = Date.now();
      const q = viewQuery(currentView(), false);
      const want = keep ? Math.max(PAGE, loaded.current) : PAGE;
      const url = (offset: number) =>
        `/api/v1/assets?${q}${q ? "&" : ""}${offset ? `offset=${offset}&` : ""}limit=${Math.min(MAX_PAGE, want - offset)}`;
      const json = (u: string) =>
        fetch(u)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
      try {
        const [pages, colsBody, defsBody, reviewBody] = await Promise.all([
          Promise.all(
            Array.from({ length: Math.ceil(want / MAX_PAGE) }, (_, i) =>
              fetch(url(i * MAX_PAGE)).then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => null) })),
            ),
          ),
          json("/api/v1/collections"),
          json("/api/v1/fields"),
          json("/api/v1/assets?review=true&limit=1"),
        ]);
        if (ticket !== latest.current) return;
        const bad = pages.find((p) => !p.ok || !p.body);
        // The API said no to this search: an empty answer, with its reason.
        if (bad && bad.status >= 400 && bad.status < 500 && bad.body?.error) {
          setShown(q);
          setFailure(bad.body.error.message ?? "the API refused it");
          setListing((l) => ({ ...l, data: [], total: 0 }));
        } else if (bad) throw new Error("unreachable");
        else {
          const [first, ...rest] = pages.map((p) => p.body as Listing);
          const seen = new Set<string>();
          // Decisions still waiting on their Undo stay hidden.
          const data = [...first.data, ...rest.flatMap((p) => p.data)].filter((a) => !deciding.has(a.id) && !seen.has(a.id) && !!seen.add(a.id));
          setShown(q);
          setFailure(null);
          setListing({ ...first, data, total: first.total - (first.data.length + rest.reduce((n, p) => n + p.data.length, 0) - data.length) });
        }
        if (colsBody) setCollections(colsBody.data);
        // Decisions waiting on their Undo are already counted out.
        if (reviewBody) setReviewCount(Math.max(0, reviewBody.total - deciding.size));
        if (defsBody) {
          const next: FieldDef[] = defsBody.data;
          setFields(next);
          // Drop filters on fields that no longer exist, or every search would 422.
          const gone = Object.keys(currentView().filters).filter((k) => !next.some((d) => d.key === k));
          if (gone.length) go({ filters: Object.fromEntries(Object.entries(currentView().filters).filter(([k]) => !gone.includes(k))) });
        }
      } catch {
        if (ticket !== latest.current) return;
        // What's on screen stays, undimmed, and says it may be stale.
        setShown(q);
        toast.error("Couldn't reach the library", { id: "search", action: { label: "Retry", onClick: () => void again.current.refresh() } });
      } finally {
        if (ticket === latest.current) setDue(false);
      }
    },
    [setCollections, setReviewCount],
  );

  // Files land a few a second in a batch: one refresh after they pause, not one each.
  const soon = useRef<ReturnType<typeof setTimeout>>(undefined);
  const refreshSoon = useCallback(() => {
    setDue(true);
    clearTimeout(soon.current);
    soon.current = setTimeout(() => void refresh(), 300);
  }, [refresh]);
  useEffect(() => () => clearTimeout(soon.current), []);

  // A collection saved in the shell's dialog may change what its assets inherit.
  const seenEdits = useRef(collectionEdits);
  useEffect(() => {
    if (collectionEdits === seenEdits.current) return;
    seenEdits.current = collectionEdits;
    void refresh();
  }, [collectionEdits, refresh]);

  // A new view starts from its first page. The server drew the first one.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void refresh(false);
  }, [apiQuery, refresh]);

  // Back to a tab that sat for a while: what agents and teammates did meanwhile shows up.
  useEffect(() => {
    const onShow = () => document.visibilityState === "visible" && Date.now() - lastRefresh.current > 30_000 && void refresh();
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [refresh]);

  // The next page, when the end of the grid scrolls into view.
  const more = useRef(false);
  const [paging, setPaging] = useState(false);
  const loadMore = useCallback(async () => {
    if (more.current) return;
    more.current = true;
    setPaging(true);
    const ticket = latest.current;
    const q = viewQuery(currentView(), false);
    try {
      const res = await fetch(`/api/v1/assets?${q}${q ? "&" : ""}offset=${loaded.current}&limit=${PAGE}`);
      const page: Listing | null = res.ok ? await res.json().catch(() => null) : null;
      if (ticket !== latest.current) return;
      if (!page) return void toast.error("Couldn't load more", { id: "more", action: { label: "Retry", onClick: () => void again.current.loadMore() } });
      setListing((l) => {
        const have = new Set(l.data.map((a) => a.id));
        return { ...l, total: page.total, data: [...l.data, ...page.data.filter((a) => !have.has(a.id) && !deciding.has(a.id))] };
      });
    } catch {
      toast.error("Couldn't reach the library", { id: "more", action: { label: "Retry", onClick: () => void again.current.loadMore() } });
    } finally {
      more.current = false;
      setPaging(false);
    }
  }, []);
  useEffect(() => {
    again.current = { refresh: () => void refresh(), loadMore: () => void loadMore() };
  }, [refresh, loadMore]);
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

  /**
   * Show a change before the server has it (null takes an asset out); the
   * returned function puts back what was there, for the ids given or all.
   */
  const patch: Patch = useCallback((ids, fn) => {
    const want = new Set(ids);
    const was = new Map<string, [number, Asset]>();
    // As a view transition: the tiles that stay slide into the gap the others leave.
    transition(() => {
      setListing((l) => {
        was.clear();
        let removed = 0;
        const data: Asset[] = [];
        l.data.forEach((a, i) => {
          if (!want.has(a.id)) return void data.push(a);
          was.set(a.id, [i, a]);
          const next = fn(a);
          if (next) data.push(next);
          else removed++;
        });
        return removed || was.size ? { ...l, data, total: l.total - removed } : l;
      });
      // The tiles that changed light up once, so a bulk edit shows where it went (the removed are gone by then).
      flashTiles(ids);
    });
    return (only) => {
      const back = [...was].filter(([id]) => !only || only.includes(id)).sort((x, y) => x[1][0] - y[1][0]);
      transition(() => {
        setListing((l) => {
          const ids = new Set(back.map(([id]) => id));
          const returning = back.filter(([id]) => !l.data.some((a) => a.id === id)).length;
          const data = l.data.filter((a) => !ids.has(a.id));
          for (const [, [i, a]] of back) data.splice(Math.min(i, data.length), 0, a);
          return { ...l, data, total: l.total + returning };
        });
        // What came back, from an undo or a refusal, is found again at a glance.
        flashTiles(back.map(([id]) => id));
      });
    };
  }, []);

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
      .catch(() => null)
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
  // Closed some other way (Back): the next close has no push to undo.
  useEffect(() => {
    if (!view.asset) pushedViewer = false;
  }, [view.asset]);

  async function saveSearch(name: string) {
    const saved: SavedSearch | null = await send("POST", "/api/v1/searches", { name, query: apiQuery });
    if (!saved) return false;
    setSearches((ss) => [...ss, saved].sort((a, b) => a.name.localeCompare(b.name)));
    toast.success(`Saved "${name}"`);
    return true;
  }

  const clear = () => {
    setText("");
    go({ q: "", tags: [], types: [], status: [], filters: {}, extra: [] });
  };

  // ---- uploads ------------------------------------------------------------------

  // Rows live outside React state, read only by the tray: progress doesn't redraw the grid.
  const [uploads] = useState(uploadStore);
  const uploading = useUploads(uploads, (rows) => rows.some(isActive));
  // What a row needs to be sent again, or stopped.
  const jobs = useRef(
    new Map<string, { file: File; values: Record<string, FieldValue>; into: string | null; hidden: boolean; stop: AbortController; proposed?: boolean }>(),
  );
  // Just landed: ringed for a moment, so new files are found in a full grid.
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  // Just added, uploaded or imported: ringed for a moment, so the eye finds it in the grid.
  const markFresh = useCallback((id: string) => {
    setFresh((s) => new Set(s).add(id));
    setTimeout(() => setFresh((s) => (s.delete(id) ? new Set(s) : s)), 3000);
  }, []);
  const imported = (ids: string[]) => {
    ids.forEach(markFresh);
    refreshSoon();
  };

  // With required fields still unmet, files wait for them; otherwise straight up.
  // Values inherited from the collection being uploaded into count as met.
  const inherited = inCollection?.fields ?? {};
  const into = view.collection;

  const sendOne = useCallback(
    async (id: string) => {
      const job = jobs.current.get(id);
      if (!job) return;
      const { file, values, stop } = job;
      const mime = file.type || "application/octet-stream";
      const signal = stop.signal;
      try {
        if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
        const big = tooLargeToUpload(file.size);
        if (big) throw new Error(big);
        uploads.patch(id, { status: "uploading", error: undefined, loaded: 0 });
        const ticket = await fetch("/api/v1/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, mime, size: file.size }),
          signal,
        });
        if (!ticket.ok) throw new Error(await refusal(ticket, "Upload failed"));
        const { token, uploadUrl } = await ticket.json();

        await putWithProgress(uploadUrl, file, mime, (loaded) => uploads.patch(id, { loaded }), signal);

        uploads.patch(id, { status: "saving", loaded: file.size });
        const done = await fetch("/api/v1/assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, filename: file.name, mime, fields: values, collections: job.into ? [job.into] : [], ...(job.hidden && { private: true }) }),
          signal,
        });
        if (!done.ok) throw new Error(await refusal(done, "Couldn't add it to the library"));
        const body = await done.json().catch(() => null);
        const assetId: string | undefined = body?.data?.id;
        // Without write where it landed it waits in Review: where Show looks for it.
        job.proposed = body?.data?.status === "proposed";
        uploads.patch(id, { status: body?.deduped ? "deduped" : "done", assetId });
        if (assetId && !body?.deduped) markFresh(assetId);
        refreshSoon(); // the grid fills in as files land, not all at the end
      } catch (e) {
        const cancelled = e instanceof DOMException && e.name === "AbortError";
        uploads.patch(id, { status: "failed", error: cancelled ? "Cancelled" : reason(e, "Upload failed") });
      }
    },
    [uploads, refreshSoon, markFresh],
  );

  // Three files at a time. One file failing doesn't stop the rest of the batch;
  // it's marked in the tray with its reason, and can be sent again.
  const upload = useCallback(
    async (files: File[], values: Record<string, FieldValue> = {}, hidden = false) => {
      const batch = files.map((file) => ({ file, id: crypto.randomUUID() }));
      for (const { file, id } of batch) jobs.current.set(id, { file, values, into, hidden, stop: new AbortController() });
      // A new batch clears finished rows from an earlier one, keeps anything in flight.
      uploads.set((us) => {
        for (const u of us) if (!isActive(u)) jobs.current.delete(u.id);
        return [
          ...us.filter(isActive),
          ...batch.map(({ file, id }) => ({
            id,
            name: file.name,
            size: file.size,
            loaded: 0,
            status: "queued" as const,
            preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
          })),
        ];
      });
      await pool(batch, 3, ({ id }) => sendOne(id));
    },
    [into, uploads, sendOne],
  );

  const start = (list: FileList | File[], hidden = false) => {
    const files = Array.from(list);
    if (!files.length) return;
    if (relaxInherited(fields, inherited).some((f) => f.required)) setPending({ files, hidden, open: true });
    else void upload(files, {}, hidden);
  };
  // "Upload privately" opens the same picker: this says which one it was.
  const privately = useRef(false);
  const choose = (hidden: boolean) => {
    privately.current = hidden;
    input.current?.click();
  };

  // Leaving mid-upload drops the rest of the batch: the browser asks first.
  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  const narrowed = isNarrowed(view);
  // Into the collection open, or the workspace itself: whatever the person may add to.
  const canUpload = into ? can("asset.upload", { id: into }) : can("workspace.upload");

  // ⌘K offers Upload while this page can take one.
  useEffect(() => {
    setUpload(canUpload ? () => choose(false) : null);
    return () => setUpload(null);
  }, [canUpload, setUpload]);

  // Drag is tracked on the whole window: dropping only inside a bordered box
  // is a worse target. Only files from outside count: dragging within the page
  // (reordering the sidebar, a link, a tile) is not an upload. Nor is a drop
  // on the open asset or a dialog: that is theirs to take (a new version).
  const drop = useRef<{ start: ((files: File[]) => void) | null; viewing: boolean }>({ start: null, viewing: false });
  useEffect(() => {
    drop.current = { start: canUpload ? start : null, viewing: !!view.asset };
  });
  useEffect(() => {
    const elsewhere = (e: DragEvent) =>
      e.defaultPrevented || drop.current.viewing || (e.target instanceof Element && !!e.target.closest("[role=dialog], [role=alertdialog]"));
    // Never let the browser open a dropped file in place of the app.
    const refuse = (e: DragEvent) => {
      if (e.defaultPrevented) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
    };
    const enter = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      if (elsewhere(e)) return refuse(e);
      e.preventDefault();
      dragDepth.current += 1;
      setDrag({ count: e.dataTransfer?.items.length ?? 0 });
    };
    const over = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      if (elsewhere(e) || !drop.current.start) return refuse(e);
      e.preventDefault();
    };
    // Mirrors enter: what enter left to the viewer or a dialog doesn't count on the way out either.
    const leave = (e: DragEvent) => {
      if (!carriesFiles(e) || elsewhere(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current <= 0) setDrag(null);
    };
    const dropped = (e: DragEvent) => {
      const internal = dragInside;
      dragInside = false;
      if (internal || !e.dataTransfer?.types.includes("Files")) return;
      dragDepth.current = 0;
      setDrag(null);
      if (elsewhere(e) || !drop.current.start) return refuse(e);
      e.preventDefault();
      const take = drop.current.start;
      void filesOf(e.dataTransfer).then((files) => take(files));
    };
    const inside = () => void (dragInside = true);
    const done = () => void (dragInside = false);
    window.addEventListener("dragstart", inside);
    window.addEventListener("dragend", done);
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", dropped);
    return () => {
      window.removeEventListener("dragstart", inside);
      window.removeEventListener("dragend", done);
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", dropped);
    };
  }, []);

  // Paste a screenshot to upload it, or a Figma or Google link to add it.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (typing(e.target) || !drop.current.start || drop.current.viewing || !e.clipboardData) return;
      const files = [...e.clipboardData.files];
      if (files.length) {
        e.preventDefault();
        drop.current.start(files);
        return;
      }
      const text = e.clipboardData.getData("text/plain").trim();
      if (parseLink(text)) {
        e.preventDefault();
        setLinking({ open: true, url: text });
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // Asking someone without an account to send files there, by link.
  const canRequest = inCollection ? can("collection.collect", inCollection) : can("share.collect_workspace");
  const filtered = narrowed || view.collection !== null || view.review;

  const activeSearch = searches.find((sv) => canonical(sv.query) === apiQuery) ?? null;
  // Where you are, apart from what you're searching for: moving between places clears the selection and the grid.
  const placeOf = (q: string) => {
    const s = searches.find((sv) => canonical(sv.query) === q);
    if (s) return `search:${s.id}`;
    const v = parseView(new URLSearchParams(q));
    return `${v.collection ?? ""}|${v.review}`;
  };
  const place = placeOf(apiQuery);
  const [seenPlace, setSeenPlace] = useState(place);
  if (place !== seenPlace) {
    setSeenPlace(place);
    setSelected(new Set());
  }
  // A new place starts at the top, however it was reached (a sidebar link
  // pushes on its own); an open asset keeps your spot. Only a URL change
  // counts: a saved search appearing renames the place, it doesn't move you.
  const prior = useRef({ place, search });
  useEffect(() => {
    const moved = search !== prior.current.search;
    if (moved && place !== prior.current.place && !popped && !view.asset) window.scrollTo({ top: 0 });
    // A traversal is spent by the URL change it caused.
    if (moved) popped = false;
    prior.current = { place, search };
  }, [place, search, view.asset]);
  const searching = shown !== apiQuery || text.trim() !== view.q;
  // Another place's tiles under this place's title would be a lie: a skeleton until it answers.
  const moving = shown !== apiQuery && placeOf(shown) !== place;
  // The welcome is for an empty library, not for a search that found nothing.
  const empty = assets.length === 0 && !filtered && !moving && !failure;
  // Any view with a match means the library has assets; a search that finds nothing doesn't empty it.
  const [stocked, setStocked] = useState(initial.total > 0);
  if (!stocked && total > 0) setStocked(true);

  const picked = useMemo(() => assets.filter((a) => selected.has(a.id)), [assets, selected]);
  const shareAsset = (a: Asset) => share({ kind: "view", asset: { id: a.id, name: a.metadata?.title || a.filename, public: a.public } });
  const selectAll = () => setSelected(new Set(assets.map((a) => a.id)));
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  /** Shift extends from the last one clicked, as in a file manager. */
  const pick = useCallback((a: Asset, range: boolean) => {
    const list = listed.current;
    const from = list.findIndex((x) => x.id === anchor.current);
    const to = list.findIndex((x) => x.id === a.id);
    setSelected((s) => {
      const next = new Set(s);
      if (range && from >= 0 && to >= 0) {
        const [i, j] = [from, to].sort((x, y) => x - y);
        for (const x of list.slice(i, j + 1)) next.add(x.id);
      } else if (next.has(a.id)) next.delete(a.id);
      else next.add(a.id);
      return next;
    });
    anchor.current = a.id;
  }, []);
  const openOne = useCallback((a: Asset) => openAsset(a.id), []);

  const bulk = useBulk({ picked, current: view.collection, patch, onDone: refreshSoon, onClear: clearSelection });
  const editable = collections.filter((c) => can("collection.edit", c));
  const deletable = (list: Asset[]) => list.length > 0 && list.every((a) => can("asset.delete", a)) && list.some((a) => a.state !== "deleted");

  /** Delete from the keyboard: the selection, or the asset under the cursor; asked first, like the bar. */
  const askDelete = (a: Asset) => {
    const targets = selected.has(a.id) ? picked : [a];
    if (!deletable(targets)) return;
    if (!selected.has(a.id)) {
      setSelected(new Set([a.id]));
      anchor.current = a.id;
    }
    setDeleting(true);
  };

  // Tiles and rows move like Finder's: arrows (J and K too), Shift extends,
  // Enter or Space opens, X selects, Delete asks to delete.
  const onGridKey = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.defaultPrevented || e.altKey) return;
    const el = e.target as HTMLElement;
    const id = el.dataset.cursor;
    const a = id ? assets.find((x) => x.id === id) : undefined;
    if (!id || !a) return;
    const mod = e.metaKey || e.ctrlKey;
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-cursor]")];
    const i = items.indexOf(el);
    const top = items[0].getBoundingClientRect().top;
    const k = items.findIndex((x) => x.getBoundingClientRect().top !== top);
    const cols = k < 0 ? items.length : k;
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, j: cols, k: -cols, Home: -i, End: items.length };
    if (e.key in step && !mod) {
      e.preventDefault();
      const target = items[Math.max(0, Math.min(items.length - 1, i + step[e.key]))];
      const to = assets.find((x) => x.id === target.dataset.cursor);
      target.focus();
      if (!to) return;
      setCursor(to.id);
      if (e.shiftKey) {
        if (!anchor.current || !selected.has(anchor.current)) anchor.current = id;
        pick(to, true);
      }
    } else if ((e.key === "Enter" || e.key === " ") && !mod) {
      e.preventDefault();
      openAsset(id);
    } else if (e.key === "x" && !mod) {
      e.preventDefault();
      pick(a, e.shiftKey);
    } else if ((e.key === "Backspace" || e.key === "Delete") && !mod) {
      e.preventDefault();
      askDelete(a);
    }
  };

  const [layout, setLayout] = useLayout(view.review, initialLayout);
  const [storedDensity, setStoredDensity] = usePref<Density | null>("artbucket:density", null);
  const density: Density = storedDensity && DENSITIES.includes(storedDensity) ? storedDensity : (initialDensity ?? "m");
  const setDensity = (d: Density) => {
    setStoredDensity(d);
    remember("artbucket_density", d);
  };
  const [storedWell, setWell] = usePref<Well>("artbucket:well", "auto");
  const well: Well = WELLS.includes(storedWell) ? storedWell : "auto";

  // ⌘A selects the grid, Esc clears, / finds, - and = size the tiles. Text
  // fields, dialogs and menus keep their keys; a key a menu already took
  // (its Esc) is not the page's.
  const keys = useRef({ selectAll, density, setDensity });
  useEffect(() => {
    keys.current = { selectAll, density, setDensity };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || typing(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "a") {
        e.preventDefault();
        keys.current.selectAll();
      } else if (e.key === "Escape") setSelected(new Set());
      else if (e.key === "/" && !mod) {
        e.preventDefault();
        searchBox.current?.focus();
      } else if ((e.key === "-" || e.key === "=") && !mod && !e.altKey) {
        const i = DENSITIES.indexOf(keys.current.density) + (e.key === "=" ? 1 : -1);
        if (DENSITIES[i]) transition(() => keys.current.setDensity(DENSITIES[i]));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // What you open goes to the top of Recents in the sidebar: an asset, a saved search, a collection.
  const recent = open
    ? { kind: "asset" as const, id: open.id, label: open.metadata?.title || open.filename, href: `/?asset=${open.id}` }
    : activeSearch
      ? { kind: "search" as const, id: activeSearch.id, label: activeSearch.name, href: `/?${canonical(activeSearch.query)}` }
      : inCollection
        ? { kind: "collection" as const, id: inCollection.id, label: inCollection.name, href: `/?collection=${inCollection.id}` }
        : null;
  const recentKey = recent && JSON.stringify(recent);
  const rememberRecent = useRemember();
  useEffect(() => {
    if (recentKey) rememberRecent(JSON.parse(recentKey));
  }, [recentKey, rememberRecent]);
  // A search of the whole library is named by its words, as the prototype's “winter” is.
  const searched = !activeSearch && !view.review && !inCollection && view.q.trim() ? view.q.trim() : null;
  const title = activeSearch?.name ?? (view.review ? "Waiting for review" : (inCollection?.name ?? (searched ? `\u201c${searched}\u201d` : "All assets")));
  const where = activeSearch?.name ?? (view.review ? "Review" : (inCollection?.name ?? (searched ? "Search" : undefined)));

  // The tab says which view (or asset) it is; the history menu too.
  const tabTitle = open ? open.metadata?.title || open.filename : (where ?? "Assets");
  useEffect(() => {
    document.title = `${tabTitle} - ${brand.name}`;
  }, [tabTitle, brand.name]);

  // The filters stick under the header; their edge shows once they do.
  const [stuck, setStuck] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sentinel.current) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < 120), { rootMargin: "-57px 0px 0px 0px" });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [empty]);

  const ids = useMemo(() => new Set(assets.map((a) => a.id)), [assets]);
  const tab = ids.has(cursor ?? "") ? cursor : (assets[0]?.id ?? null);
  const selecting = picked.length > 0;

  /** What a tile's or row's context menu acts with: the whole selection when the asset is part of one. */
  const menuFor = (a: Asset): ActionContext => ({
    onOpen: () => openAsset(a.id),
    onShare: () => shareAsset(a),
    onPick: () => pick(a, false),
    selected: selected.has(a.id),
    onChanged: refreshSoon,
    local: (fn) => patch([a.id], fn),
    bulk:
      selected.has(a.id) && picked.length > 1
        ? {
            count: picked.length,
            into: editable,
            add: (c: Collection) => void bulk.members(c, "add"),
            download: () => void bulk.download(),
            remove: deletable(picked) ? () => setDeleting(true) : undefined,
          }
        : undefined,
  });

  const skeleton = layout === "list" ? <ListSkeleton /> : <GridSkeleton count={12} />;

  return (
    <>
      <AppHeader trail={where ? [{ label: "Explore", href: "/" }, { label: where }] : [{ label: "Explore" }]}>
        <div className="relative w-36 min-w-20 shrink! sm:w-64">
          {searching ? (
            <Spinner className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          ) : (
            <IconSearch className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          )}
          <Input
            ref={searchBox}
            data-search
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && !text && e.currentTarget.blur()}
            placeholder={inCollection || view.review || activeSearch ? "Filter this view" : "Search everything"}
            aria-label={inCollection || view.review || activeSearch ? "Filter this view" : "Search everything"}
            className="h-8 pl-8 sm:pr-8"
          />
          {!text && <Kbd keys={["/"]} className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 sm:inline-flex" />}
        </div>
        {/* Every way files come in, in one control: Upload, and the others in its menu. Stays enabled mid-upload: a second batch queues alongside the first. */}
        {canUpload && (
          <div className="flex">
            <Button size="sm" className="rounded-r-none" onClick={() => choose(false)} aria-busy={uploading}>
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
                <DropdownMenuItem onSelect={() => choose(false)}>
                  <IconUpload /> Upload files
                </DropdownMenuItem>
                {!inCollection?.private && (
                  <DropdownMenuItem onSelect={() => choose(true)}>
                    <IconLock /> Upload privately
                    <span className="text-muted-foreground ml-auto pl-4 text-xs">you choose who</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => folder.current?.click()}>
                  <IconFolder /> Upload a folder
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setFonts(true)}>
                  <IconTypography /> Import a Google font
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setIcons(true)}>
                  <IconIcons /> Import icons
                  <span className="text-muted-foreground ml-auto pl-4 text-xs">open source packs</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setLinking({ open: true, url: "" })}>
                  <IconLink /> Add a link
                  <span className="text-muted-foreground ml-auto pl-4 text-xs">Figma, Google</span>
                </DropdownMenuItem>
                {canRequest && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => share(inCollection ? { kind: "upload", collection: inCollection } : { kind: "upload" })}>
                      <IconFolderUp /> Request uploads by link
                      <span className="text-muted-foreground ml-auto pl-4 text-xs">no account</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <GoogleFontImport open={fonts} onOpenChange={setFonts} into={into} onDone={imported} />
            <IconPackImport open={icons} onOpenChange={setIcons} into={into} onDone={imported} />
            <LinkImport
              open={linking.open}
              defaultValue={linking.url}
              onOpenChange={(o) => setLinking((l) => ({ ...l, open: o }))}
              into={into}
              onDone={imported}
            />
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
            if (e.target.files) start(e.target.files, privately.current);
            e.target.value = ""; // the same file can be picked again after a cancel
          }}
        />
        <input
          ref={folder}
          type="file"
          // Not in React's types; every current browser takes it.
          {...{ webkitdirectory: "" }}
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            if (e.target.files) start([...e.target.files].filter((f) => !f.webkitRelativePath.split("/").some((p) => p.startsWith("."))));
            e.target.value = "";
          }}
        />
        {/* How an agent reads what this page shows. */}
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
      </AppHeader>

      <div
        className={cn("flex min-w-0 flex-1 flex-col gap-4 px-4 pb-4 md:px-6 md:pb-6", selecting && "pb-24 md:pb-24")}
        style={{ "--tile": TILE[density] } as React.CSSProperties}
      >
        <LibraryTabs at={view.review ? "review" : "assets"} />
        <PageHeader
          icon={
            view.review ? <IconInbox /> : activeSearch ? <IconBookmark /> : inCollection ? <CollectionIcon icon={inCollection.icon} /> : <IconPhoto />
          }
          title={title}
          aside={
            <>
              {/* Held in place while moving, so the title doesn't shift; a new count pops in. */}
              <Badge
                variant="secondary"
                className={cn("font-mono tabular-nums", moving && "invisible")}
                title={`${total.toLocaleString()} ${total === 1 ? "asset" : "assets"}`}
              >
                <span key={total} className="animate-in fade-in-0 zoom-in-90 duration-150">
                  {total.toLocaleString()}
                </span>
              </Badge>
              {inCollection?.private && !activeSearch && (
                <Badge variant="outline" title="Only people added to it, and admins, see it">
                  <IconLock /> Private
                </Badge>
              )}
              {view.review ? (
                <InfoTip>What agents, contributors and upload links sent in, and tags they suggested. Nothing reaches the library until someone approves it.</InfoTip>
              ) : searched ? (
                <InfoTip>Approved and in date, unless Status says otherwise.</InfoTip>
              ) : activeSearch ? (
                <InfoTip>A saved search: this link always shows what matches now.</InfoTip>
              ) : canUpload ? (
                <InfoTip>{inCollection ? `Uploads made here land in ${inCollection.name}.` : "Drop or paste files anywhere on the page to add them."}</InfoTip>
              ) : null}
            </>
          }
          description={
            inCollection && !activeSearch && Object.keys(inCollection.fields).length
              ? `Its assets read ${Object.entries(inCollection.fields)
                  .map(([k, v]) => `${fields.find((d) => d.key === k)?.label ?? k}: ${v}`)
                  .join(", ")}.`
              : undefined
          }
        >
          {/* What can be done with the collection itself: copy its link, share it, edit it. */}
          {inCollection && !activeSearch && (
            <CopyButton
              text={async () => new URL(`/?collection=${inCollection.id}`, location.origin).href}
              label="Copy link, for people with access"
              what="the link"
              size="icon-sm"
              variant="outline"
            />
          )}
          {inCollection && !activeSearch && can("collection.share", inCollection) && (
            <IconButton label={`Share ${inCollection.name}`} onClick={() => share({ kind: "view", collection: inCollection })}>
              <IconShare />
            </IconButton>
          )}
          {inCollection && !activeSearch && can("collection.edit", inCollection) && (
            <IconButton label="Edit collection" onClick={() => openCollection(inCollection)}>
              <IconPencil />
            </IconButton>
          )}
        </PageHeader>

        {!view.review && !activeSearch && !inCollection && <SetupChecklist uploaded={stocked} onUpload={canUpload ? () => choose(false) : undefined} />}

        {/* Explore searches everything: what else matches, beside the assets. */}
        {searched && <CatalogMatches q={searched} />}

        {/* Heard once a search settles, not per keystroke. */}
        <span className="sr-only" aria-live="polite">
          {searching ? "" : failure ? "This search can't run" : `${total.toLocaleString()} ${total === 1 ? "result" : "results"}`}
        </span>

        <div ref={sentinel} aria-hidden className="-mb-4 h-0" />
        {!empty && (
          <div
            className={cn(
              "bg-background z-[9] sm:sticky sm:top-14 -mx-4 -my-2 flex flex-wrap items-center gap-2 border-b border-transparent px-4 py-2 transition-colors md:-mx-6 md:px-6",
              stuck && "border-border",
            )}
          >
            {assets.length > 0 && (
              <label className="hover:bg-accent flex h-8 items-center gap-2 rounded-md px-2 text-sm">
                <Checkbox
                  checked={picked.length === 0 ? false : picked.length === assets.length ? true : "indeterminate"}
                  onCheckedChange={() => (picked.length === assets.length ? clearSelection() : selectAll())}
                  aria-label={`Select all ${assets.length.toLocaleString()} loaded`}
                />
                <span className="text-muted-foreground hidden tabular-nums sm:inline">
                  {/* Honest about what a bulk action will cover: what is selected, of everything that matches. */}
                  {picked.length ? `${picked.length.toLocaleString()} of ${total.toLocaleString()} selected` : "Select all"}
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
            <FacetFilter label="Tags" mode="all" creatable counts={facets.tags} selected={view.tags} onChange={(tags) => go({ tags })} />
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
              <Badge key={`${k}=${v}`} variant="secondary" className="animate-in fade-in-0 zoom-in-95 h-8 gap-1 pr-1 duration-150">
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
              <Button variant="ghost" size="sm" className="animate-in fade-in-0 h-8 duration-150" onClick={clear}>
                Clear filters <IconX />
              </Button>
            )}
            <span className="ml-auto" />
            {/* Only a search or filter is worth naming; a collection or Review is already in the sidebar. */}
            {narrowed && !activeSearch && can("search.save") && <SaveSearch onSave={saveSearch} />}
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon-sm" aria-label="Tile backdrop">
                      <IconBackground />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Tile backdrop</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Behind the art</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={well} onValueChange={(v) => transition(() => setWell(v as Well))}>
                  <DropdownMenuRadioItem value="auto">
                    Auto <span className="text-muted-foreground ml-auto pl-4 text-xs">checker when transparent</span>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="checker">Checker</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            {layout === "grid" && (
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={density}
                onValueChange={(v) => v && transition(() => setDensity(v as Density))}
                aria-label="Tile size"
                className="hidden sm:flex"
              >
                {DENSITIES.map((d, i) => (
                  <Tooltip key={d}>
                    <TooltipTrigger asChild>
                      <ToggleGroupItem value={d} aria-label={["Small tiles", "Medium tiles", "Large tiles"][i]}>
                        <span aria-hidden className="bg-current rounded-[2px]" style={{ width: 6 + i * 3, height: 6 + i * 3 }} />
                      </ToggleGroupItem>
                    </TooltipTrigger>
                    <TooltipContent>
                      {["Small tiles", "Medium tiles", "Large tiles"][i]}
                      <Kbd keys={["-"]} className="ml-2" />
                      <Kbd keys={["="]} className="ml-1" />
                    </TooltipContent>
                  </Tooltip>
                ))}
              </ToggleGroup>
            )}
            <ToggleGroup type="single" variant="outline" size="sm" value={layout} onValueChange={(v) => v && transition(() => setLayout(v as Layout))} aria-label="Layout">
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem value="grid" aria-label="Grid">
                    <IconLayoutGrid />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>Grid</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem value="list" aria-label="List">
                    <IconList />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>List</TooltipContent>
              </Tooltip>
            </ToggleGroup>
          </div>
        )}

        {failure && !searching ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconAlertTriangle />
              </EmptyMedia>
              <EmptyTitle>This search can&apos;t run</EmptyTitle>
              <EmptyDescription>{failure}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row justify-center">
              <Button variant="outline" onClick={clear}>
                Clear filters
              </Button>
            </EmptyContent>
          </Empty>
        ) : empty ? (
          <EmptyState dragging={!!drag} onUpload={canUpload ? () => choose(false) : undefined} />
        ) : moving || (assets.length === 0 && searching) ? (
          // Don't flash "no matches", or the last place's tiles, for a view that hasn't answered yet.
          skeleton
        ) : assets.length === 0 && view.review && !narrowed ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconInbox />
              </EmptyMedia>
              <EmptyTitle>Nothing to review</EmptyTitle>
              <EmptyDescription>Uploads from agents, contributors and upload links wait here for approval.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row flex-wrap justify-center">
              {can("share.collect_workspace") && (
                <Button onClick={() => share({ kind: "upload" })}>
                  <IconFolderUp /> Request uploads by link
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link href="/connections">
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
                {canUpload
                  ? "Upload here, or use Add to from All assets."
                  : "Nothing added yet."}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row justify-center">
              {canUpload && (
                <Button onClick={() => choose(false)}>
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
              <EmptyTitle>{view.q ? <>No results for &ldquo;{view.q}&rdquo;</> : "No matches"}</EmptyTitle>
              <EmptyDescription>
                Try fewer words or drop a filter.
                {/* lib/core/assets.ts records the empty search; Insights lists them as search gaps. */}
                {view.q && <> <InfoTip>Logged as a search gap, so the brand team sees what people look for.</InfoTip></>}
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
                  selecting={selecting}
                  review={view.review}
                  cursor={tab}
                  well={well}
                  onCursor={setCursor}
                  onKeyDown={onGridKey}
                  menu={menuFor}
                  onOpen={openOne}
                  onPick={pick}
                  patch={patch}
                  onChanged={refreshSoon}
                />
              </div>
            ) : (
              <ul
                aria-busy={searching}
                aria-label="Assets"
                data-well={well}
                onKeyDown={onGridKey}
                className={cn("group/well grid transition-opacity", GRID_COLS, searching && "opacity-60")}
              >
                {/* Files on their way, ahead of the rest, until they land as real tiles. */}
                {!narrowed && !view.review && <GhostTiles store={uploads} shown={assets} />}
                {assets.map((a) => (
                  <AssetMenu key={a.id} asset={a} {...menuFor(a)}>
                    {/* Off screen, a tile skips layout and paint. The negative margin
                        gives its rings room inside the paint containment that brings. */}
                    <li
                      // Its name in a view transition (a size, a delete, an undo): it moves from where it was.
                      data-vt={`tile-${a.id}`}
                      className="group/tile -m-1 p-1 [contain-intrinsic-size:auto_260px] [content-visibility:auto]"
                    >
                      <AssetCard
                        asset={a}
                        onOpen={openOne}
                        selected={selected.has(a.id)}
                        // Once anything is selected, a click selects instead of opening.
                        selecting={selecting}
                        onPick={pick}
                        fresh={fresh.has(a.id)}
                        tabbable={a.id === tab}
                        onCursor={setCursor}
                        large={density === "l"}
                        open={view.asset === a.id}
                      />
                    </li>
                  </AssetMenu>
                ))}
              </ul>
            )}
            {paging && layout === "grid" && <GridSkeleton count={4} />}
            {hasMore ? (
              <div ref={end} className="flex justify-center py-4">
                <Button variant="outline" size="sm" onClick={() => void loadMore()} pending={paging}>
                  Load more
                  <span className="text-muted-foreground tabular-nums">
                    {assets.length.toLocaleString()} of {total.toLocaleString()}
                  </span>
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground py-2 text-center text-sm">
                Showing all {total.toLocaleString()} {total === 1 ? "asset" : "assets"}
              </p>
            )}
          </>
        )}
      </div>

      <AssetViewer
        asset={open}
        loading={!!missing}
        assets={assets}
        hasMore={hasMore}
        onLoadMore={loadMore}
        onStep={(id) => go({ asset: id })}
        fields={fields}
        collections={collections}
        onClose={closeAsset}
        onSaved={refresh}
        onReviewed={(a) => {
          setKnown(a);
          void refresh();
        }}
        onOpen={(id) => {
          // Already open (a new version, Replaced, Versions): swap in place, so closing is still one step back.
          if (view.asset) go({ asset: id });
          else openAsset(id);
          void refresh();
        }}
      />

      {pending && (
        <UploadFieldsDialog
          open={pending.open}
          defs={fields}
          count={pending.files.length}
          inherited={inherited}
          from={inCollection?.name}
          onCancel={() => setPending((p) => p && { ...p, open: false })}
          onSubmit={(values) => {
            setPending((p) => p && { ...p, open: false });
            void upload(pending.files, values, pending.hidden);
          }}
        />
      )}

      <LibraryUploads
        store={uploads}
        ids={ids}
        settled={!searching && !due}
        onCancel={(id) => jobs.current.get(id)?.stop.abort()}
        onRetry={(id) => {
          const job = jobs.current.get(id);
          if (!job) return;
          job.stop = new AbortController();
          uploads.patch(id, { status: "queued", error: undefined, loaded: 0 });
          void sendOne(id);
        }}
        onOpen={openAsset}
        onShow={(rows) => {
          // Where they landed: their collection if they share one, Review if they wait there, and no filter.
          const went = rows.map((u) => jobs.current.get(u.id));
          const into = new Set(went.map((j) => j?.into ?? null));
          setText("");
          go(
            {
              q: "",
              tags: [],
              types: [],
              status: [],
              filters: {},
              extra: [],
              collection: into.size === 1 ? [...into][0] : null,
              review: went.every((j) => j?.proposed),
            },
            true,
          );
        }}
      />

      <SelectionBar
        picked={picked}
        loaded={assets.length}
        total={total}
        collections={collections}
        fields={fields}
        current={inCollection}
        review={view.review}
        bulk={bulk}
        deleting={deleting}
        onDeletingChange={setDeleting}
        onSelectAll={selectAll}
        onClear={clearSelection}
        onOpenCollection={(c) => go({ collection: c.id }, true)}
      />

      {sharing && (
        <ShareDialog
          target={sharing.target}
          open={sharing.open}
          collections={collections}
          onClose={() => setSharing((s) => s && { ...s, open: false })}
          onChanged={refreshSoon}
        />
      )}

      {/* Dragging over a populated library: one calm overlay, not a moving target. It says what a drop would do, before it does it. */}
      {dragShown && !empty && (
        <div
          className={cn(
            "bg-background/80 pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm",
            drag ? "animate-in fade-in-0 duration-150" : "animate-out fade-out-0 fill-mode-forwards duration-100 ease-in",
          )}
        >
          <div
            className={cn(
              "flex size-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed",
              canUpload ? "border-primary/40 bg-muted/50" : "border-border bg-muted/30",
            )}
          >
            <IconCloudUpload className={cn("size-10", !canUpload && "text-muted-foreground")} stroke={1.5} />
            <p className="text-lg font-medium">
              {canUpload
                ? `Drop ${dragShown.count > 1 ? `${dragShown.count.toLocaleString()} files` : dragShown.count === 1 ? "it" : "files"} to add to ${inCollection ? inCollection.name : "your library"}`
                : `You can't add files to ${inCollection ? inCollection.name : "this library"}`}
            </p>
            {canUpload && relaxInherited(fields, inherited).some((f) => f.required) && (
              <p className="text-muted-foreground text-sm">You&apos;ll fill in the required fields first</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Files uploading, as tiles at the head of the grid: their picture at once
 * (an image's preview), a ring filling with the bytes sent, then the real
 * tile in their place once it is drawn. Subscribed on its own, as the tray is,
 * so progress redraws these tiles and not the grid.
 */
function GhostTiles({ store, shown }: { store: UploadStore; shown: Asset[] }) {
  const rows = useUploads(store);
  // Landed but not drawn yet (the refresh after it is on its way): still a ghost, so it never blinks out of sight.
  const waiting = (u: Upload) => isActive(u) || (u.status === "done" && !!u.assetId && !shown.some((a) => a.id === u.assetId));
  return rows.filter(waiting).map((u) => {
    const pct = u.size ? u.loaded / u.size : 0;
    return (
      <li key={u.id} aria-hidden className="animate-in fade-in-0 zoom-in-95 -m-1 p-1 duration-200">
        <div className="bg-card flex h-full flex-col overflow-hidden rounded-xl border border-dashed shadow-xs">
          <div className="bg-muted/50 relative grid aspect-square place-items-center overflow-hidden">
            {u.preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u.preview} alt="" draggable={false} className="absolute inset-0 size-full object-contain p-2 opacity-60" />
            )}
            <svg viewBox="0 0 36 36" className={cn("relative size-10 drop-shadow-sm", u.status !== "uploading" && "animate-spin")}>
              <circle cx="18" cy="18" r="15" fill="var(--background)" fillOpacity="0.85" stroke="var(--border)" strokeWidth="3" />
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke="var(--primary)"
                strokeWidth="3"
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray="100"
                // Waiting or saving: a short arc that turns; sending: the share sent.
                strokeDashoffset={u.status === "uploading" ? 100 - pct * 100 : 75}
                transform="rotate(-90 18 18)"
                className="transition-[stroke-dashoffset] duration-300"
              />
            </svg>
          </div>
          <p className="text-muted-foreground truncate px-3 py-2.5 text-sm">{u.name}</p>
        </div>
      </li>
    );
  });
}

/**
 * The tray, subscribed to the upload rows on its own so their progress
 * redraws only it. A clean batch clears itself after a moment; one with
 * failures waits to be read.
 */
function LibraryUploads({
  store,
  ids,
  settled,
  onCancel,
  onRetry,
  onOpen,
  onShow,
}: {
  store: UploadStore;
  /** What the listing holds, to tell landed files it doesn't show. */
  ids: Set<string>;
  /** No refresh in flight: a file missing from the listing is really missing. */
  settled: boolean;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onOpen: (assetId: string) => void;
  /** Go where these landed files are. */
  onShow: (rows: Upload[]) => void;
}) {
  const rows = useUploads(store);
  const active = rows.some(isActive);
  const failed = rows.some((u) => u.status === "failed");
  const lost = useMemo(
    () => (!active && settled ? rows.filter((u) => u.status === "done" && u.assetId && !ids.has(u.assetId)) : []),
    [rows, active, settled, ids],
  );
  const missing = lost.length;
  useEffect(() => {
    if (!rows.length || active || failed || missing) return;
    const t = setTimeout(() => store.set([]), 4000);
    return () => clearTimeout(t);
  }, [rows, active, failed, missing, store]);
  return (
    <UploadTray
      uploads={rows}
      onDismiss={() => store.set([])}
      onCancel={onCancel}
      onRetry={onRetry}
      onOpen={onOpen}
      missing={missing}
      onShowMissing={() => onShow(lost)}
    />
  );
}

/**
 * A thumbnail tile. The art is contained, never cropped, on a neutral well
 * (a checkerboard for art with transparency). Memoized: the grid redraws on
 * every keystroke and selection, and a tile only when its own props change.
 */
export const AssetCard = memo(function AssetCard({
  asset: a,
  onOpen,
  selected = false,
  selecting = false,
  onPick,
  fresh = false,
  tabbable,
  onCursor,
  large = false,
  open = false,
}: {
  asset: Asset;
  onOpen?: (a: Asset) => void;
  selected?: boolean;
  selecting?: boolean;
  /** `range` is true for a shift-click. */
  onPick?: (a: Asset, range: boolean) => void;
  /** Just uploaded: ringed for a moment. */
  fresh?: boolean;
  /** The grid's one tab stop (roving tabindex); undefined outside a grid. */
  tabbable?: boolean;
  onCursor?: (id: string) => void;
  /** Large tiles: a bigger rendition. */
  large?: boolean;
  /** Shown in the viewer: its picture has moved there (the open's view transition). */
  open?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const [peek, setPeek] = useState(false);
  const [duration, setDuration] = useState<number | null>(typeof a.probe?.duration === "number" ? a.probe.duration : null);
  const [view, seen] = useInView<HTMLDivElement>();
  const about = useId();
  const video = a.mime.startsWith("video/");
  const player = useRef<HTMLVideoElement>(null);
  // A clip plays after a short hover, not as the pointer crosses the grid; never when asked for less motion.
  useEffect(() => {
    if (!hover || !video || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setPeek(true), 300);
    return () => {
      clearTimeout(t);
      setPeek(false);
    };
  }, [hover, video]);
  // One element both reads the length (at rest, once in view) and plays the peek.
  useEffect(() => {
    const v = player.current;
    if (!v) return;
    if (peek) void v.play().catch(() => {});
    else v.pause();
  }, [peek]);
  const title = a.metadata?.title || truncateFilename(a.filename, 24);
  const badge = stateBadge(a);
  return (
    <div ref={view} className="group relative h-full" onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
      <button
        type="button"
        data-cursor={a.id}
        tabIndex={tabbable === false ? -1 : 0}
        aria-label={a.metadata?.title || a.filename}
        aria-describedby={about}
        aria-pressed={selecting ? selected : undefined}
        onFocus={() => onCursor?.(a.id)}
        onClick={(e) => {
          // Cmd/Ctrl/Shift-click selects, as in a file manager.
          if (onPick && (selecting || e.metaKey || e.ctrlKey || e.shiftKey)) onPick(a, e.shiftKey);
          else onOpen?.(a);
        }}
        className={cn(
          "bg-card text-card-foreground flex h-full w-full scroll-mt-32 scroll-mb-24 flex-col overflow-hidden rounded-xl border text-left shadow-xs select-none",
          "transition-[box-shadow,transform,border-color] hover:border-foreground/15 hover:shadow-md active:scale-[0.98] motion-reduce:transform-none",
          "group-data-[state=open]/tile:border-foreground/30 group-data-[state=open]/tile:shadow-md",
          selected && "border-primary ring-primary hover:border-primary ring-2",
          fresh && !selected && "ring-primary/40 animate-in fade-in-0 zoom-in-95 ring-2",
        )}
      >
        <Morph name={open ? null : `asset-${a.id}`}>
          <div className={cn("relative aspect-square overflow-hidden", wellClass(a), selected && "bg-primary/5")}>
            {isIcon(a) ? (
              // The vector at a glyph's size: a 24px icon's rendition, blown up to the tile, would blur.
              seen && (
                <span className={cn("flex size-full items-center justify-center", GLYPH_INK)}>
                  <IconGlyph src={`/a/${a.id}`} mono={isMono(a)} className={large ? "size-20" : "size-14"} />
                </span>
              )
            ) : hasPreview(a) ? (
              // Rendition URLs are pure functions of the asset id: no export step,
              // no signing, no prior round trip.
              <Thumb src={`/a/${a.id}/${large ? "w_400" : "w_260"},f_webp`} alt="" />
            ) : isLottie(a) && seen ? (
              // Still until pointed at: a grid of loops is noise.
              <Lottie src={`/a/${a.id}`} playing={hover} className="p-2" />
            ) : isFont(a.mime, a.filename) && seen ? (
              <span className="flex size-full items-center justify-center">
                <FontThumb id={a.id} className="text-6xl" />
              </span>
            ) : isLottie(a) || isFont(a.mime, a.filename) ? null : (
              <span className="text-muted-foreground flex size-full items-center justify-center">
                <IconPhoto className="size-8" stroke={1.5} />
              </span>
            )}
            {/* The probe records no length: a hidden player fetches just the header for the badge, then goes. */}
            {video && seen && (peek || duration === null) && (
              <video
                ref={player}
                src={`/a/${a.id}`}
                muted
                loop
                playsInline
                preload={peek ? "auto" : "metadata"}
                onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
                aria-hidden
                className={cn("absolute inset-0 size-full object-contain p-2", peek ? "animate-in fade-in-0" : "invisible")}
              />
            )}
            {video && !peek && (
              <span aria-hidden className="bg-background/80 absolute top-1/2 left-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full shadow-sm backdrop-blur">
                <IconPlayerPlayFilled className="size-4" />
              </span>
            )}
            <Badge variant="secondary" className="bg-background/80 text-2xs absolute top-2 left-2 font-mono backdrop-blur">
              {fileTypeBadge(a.filename, a.mime, a.probe)}
              {badge.version && <span className="text-muted-foreground">{badge.version}</span>}
            </Badge>
            {badge.suggested && (
              <Badge className="text-2xs absolute bottom-2 left-2 max-w-[calc(50%-0.75rem)] truncate">
                <IconSparkles />
                <span className="truncate">{badge.suggested}</span>
              </Badge>
            )}
            {/* Its state first (replaced, expired, expiring); else where it came from (AI-made, by an agent, imported). */}
            {(badge.state ?? provenanceChips(a)[0]) ? (
              <Badge variant="secondary" className="bg-background/80 text-2xs absolute right-2 bottom-2 max-w-[calc(50%-0.75rem)] truncate backdrop-blur">
                {badge.state ?? provenanceChips(a)[0]}
              </Badge>
            ) : (
              video &&
              duration !== null && (
                <Badge variant="secondary" className="bg-background/80 text-2xs absolute right-2 bottom-2 font-mono tabular-nums backdrop-blur">
                  {Math.floor(Math.round(duration) / 60)}:{String(Math.round(duration) % 60).padStart(2, "0")}
                </Badge>
              )
            )}
          </div>
        </Morph>
        <div className="flex flex-1 flex-col gap-0.5 border-t px-3 py-2">
          {/* The title a person gave it reads better than the name a camera did. */}
          <p className="truncate text-sm font-medium" title={a.filename}>
            {title}
          </p>
          <p className="text-muted-foreground text-xs tabular-nums">
            {a.width && a.height ? `${a.width} × ${a.height} · ` : ""}
            {formatBytes(a.size)}
          </p>
          {a.tags.length > 0 && (
            <div className="mt-auto hidden gap-1 overflow-hidden pt-1 sm:flex">
              {a.tags.slice(0, 3).map((t) => (
                <Badge key={t} variant="outline" className="font-normal">
                  {t}
                </Badge>
              ))}
              {a.tags.length > 3 && <span className="text-muted-foreground text-xs">+{a.tags.length - 3}</span>}
            </div>
          )}
        </div>
        <span id={about} className="sr-only">
          {[fileTypeBadge(a.filename, a.mime, a.probe), formatBytes(a.size), badge.state, badge.suggested, ...provenanceChips(a), selected ? "selected" : null]
            .filter(Boolean)
            .join(", ")}
        </span>
      </button>
      {onPick && (
        <Checkbox
          checked={selected}
          tabIndex={-1}
          onClick={(e) => {
            e.preventDefault();
            onPick(a, e.shiftKey);
          }}
          aria-label={`Select ${a.filename}`}
          className={cn(
            // A touch screen has no hover to reveal it: there it always shows, at a finger's size.
            "bg-background/90 absolute top-2 right-2 size-5 shadow-sm backdrop-blur transition-opacity pointer-coarse:size-6",
            selecting || selected ? "opacity-100" : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100",
          )}
        />
      )}
    </div>
  );
});

/** Moved to its own file; importers here keep working. */
export { Thumb };

/** An empty library: the one place the whole page is the upload target. */
function EmptyState({ dragging, onUpload }: { dragging: boolean; onUpload?: () => void }) {
  return (
    <Empty className={cn("border-2 transition-colors", dragging && onUpload && "border-primary bg-primary/5")}>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-14 rounded-full [&_svg:not([class*='size-'])]:size-7">
          <IconCloudUpload stroke={1.5} />
        </EmptyMedia>
        <EmptyTitle className="text-xl">{onUpload ? "Your brand, as data" : "Nothing here yet"}</EmptyTitle>
        <EmptyDescription>
          {onUpload
            ? "Upload assets, write the rules they follow."
            : "No assets yet. The guidelines say how the brand is used."}
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
            <Link href={onUpload ? "/brand?edit" : "/brand"}>
              <IconBook /> {onUpload ? "Write your guidelines" : "Read the guidelines"}
            </Link>
          </Button>
        </div>
        {onUpload && <p className="text-muted-foreground text-xs">or drop or paste files anywhere on this page</p>}
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
          <SubmitButton size="sm">Save</SubmitButton>
        </form>
      </PopoverContent>
    </Popover>
  );
}
