"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { switchedElsewhere, workspaceChannel } from "@/components/account";
import { AppSidebar, type SavedSearch } from "@/components/app-sidebar";
import type { BrandInfo } from "@/components/brand-switcher";
import { useCan } from "@/components/can";
import { CollectionDialog, type Collection } from "@/components/collections";
import { CommandPalette, type PageCommand } from "@/components/command-palette";
import { ShortcutsDialog, useShortcuts } from "@/components/shortcuts";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { FieldDef } from "@/lib/fields";
import { send } from "@/lib/send";
import type { SidebarData } from "@/lib/sidebar";
import { undoable } from "@/lib/undo";

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

type ShellValue = {
  collections: Collection[];
  setCollections: Setter<Collection[]>;
  searches: SavedSearch[];
  setSearches: Setter<SavedSearch[]>;
  reviewCount: number;
  setReviewCount: Setter<number>;
  brands: BrandInfo[];
  setBrands: Setter<BrandInfo[]>;
  /** Folds the sidebar to icons while true, without touching what the person chose. */
  setSqueeze: (squeeze: boolean) => void;
  openPalette: () => void;
  openCollection: (c: Collection | "new") => void;
  /** The page's upload picker, offered in ⌘K while one is registered. */
  setUpload: (fn: (() => void) | null) => void;
  /** The page's own commands for ⌘K, asked for as it opens (usePageCommands). */
  setCommands: (fn: (() => PageCommand[]) | null) => void;
  /** Bumped after a collection is saved or deleted here, so a page showing its assets can refetch them. */
  collectionEdits: number;
};

const ShellContext = createContext<ShellValue | null>(null);

export function useShell() {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error("useShell must be used within the (app) layout's Shell.");
  return shell;
}

/**
 * The caller's commands in ⌘K while it is mounted: `fn` is asked for them
 * each time the palette opens or is typed in, so it reads the page as it is
 * then (keep it stable). Nothing where no Shell is around.
 */
export function usePageCommands(fn: () => PageCommand[]) {
  const setCommands = useContext(ShellContext)?.setCommands;
  useEffect(() => {
    if (!setCommands) return;
    setCommands(fn);
    return () => setCommands(null);
  }, [setCommands, fn]);
}

/**
 * Folds the app's sidebar to its rail while the caller is mounted and `on`,
 * as the brand's reader and builder do to give the page room. Nothing where
 * no Shell is around (the /design pages).
 */
export function useSqueeze(on = true) {
  const setSqueeze = useContext(ShellContext)?.setSqueeze;
  useEffect(() => {
    if (!setSqueeze || !on) return;
    setSqueeze(true);
    return () => setSqueeze(false);
  }, [setSqueeze, on]);
}

/**
 * The app's frame, mounted once in the (app) layout: the sidebar, ⌘K, the
 * keyboard shortcuts and the collection dialog stay put while pages swap beside them, so the sidebar
 * keeps its scroll, its collapse and its open menus across navigation.
 *
 * What the sidebar lists is held here, seeded by the layout. Pages write
 * their fresher copies through the setters; a router.refresh re-renders the
 * layout, and its new props win again.
 */
/**
 * The operator's word to an organization's admins (me.notice: a plan that
 * ends, a payment that failed), across the top of every page until it is
 * closed. Closed for this tab only: the word stands until the server drops it.
 */
function NoticeBanner({ notice }: { notice: { text: string; href: string | null } }) {
  const key = `notice:${notice.text}`;
  // Closed on the server, then what this tab remembers: no flash of a banner already closed, no hydration mismatch.
  const closedBefore = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return sessionStorage.getItem(key) === "1";
      } catch {
        return false;
      }
    },
    () => true,
  );
  const [closed, setClosed] = useState(false);
  if (closed || closedBefore) return null;
  const close = () => {
    setClosed(true);
    try {
      sessionStorage.setItem(key, "1");
    } catch {}
  };
  return (
    <div role="status" className="bg-warning/15 text-foreground flex items-center gap-3 border-b px-4 py-2 text-sm">
      <p className="min-w-0 flex-1">
        {notice.text}
        {notice.href && (
          <>
            {" "}
            <a href={notice.href} className="font-medium underline underline-offset-2">
              See the plan
            </a>
          </>
        )}
      </p>
      <button type="button" onClick={close} aria-label="Close" className="text-muted-foreground hover:text-foreground shrink-0 px-1">
        &times;
      </button>
    </div>
  );
}

export function Shell({
  sidebar,
  defaultOpen,
  defaultWidth,
  children,
}: {
  sidebar: SidebarData;
  defaultOpen: boolean;
  defaultWidth: number | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const can = useCan();

  const [collections, setCollections] = useState(sidebar.collections);
  const [searches, setSearches] = useState(sidebar.searches);
  const [reviewCount, setReviewCount] = useState(sidebar.reviewCount);
  const [brands, setBrands] = useState(sidebar.brands);
  const [seen, setSeen] = useState(sidebar);
  if (sidebar !== seen) {
    setSeen(sidebar);
    setCollections(sidebar.collections);
    setSearches(sidebar.searches);
    setReviewCount(sidebar.reviewCount);
    setBrands(sidebar.brands);
  }

  const [nav, setNav] = useState(defaultOpen);
  const [squeeze, setSqueeze] = useState(false);
  const [searching, setSearching] = useState(false);
  const [help, setHelp] = useState(false);
  // Held in a box: a function handed to useState's setter would be called as an updater.
  const [upload, setUploadBox] = useState<{ fn: () => void } | null>(null);
  const setUpload = useCallback((fn: (() => void) | null) => setUploadBox(fn && { fn }), []);
  const [commands, setCommandsBox] = useState<{ fn: () => PageCommand[] } | null>(null);
  const setCommands = useCallback((fn: (() => PageCommand[]) | null) => setCommandsBox(fn && { fn }), []);
  const [editing, setEditing] = useState<{ collection?: Collection; fields: FieldDef[] } | null>(null);
  // The last one opened stays mounted, so the dialog animates out instead of vanishing.
  const [lastEditing, setLastEditing] = useState(editing);
  if (editing && editing !== lastEditing) setLastEditing(editing);
  const [collectionEdits, setCollectionEdits] = useState(0);

  useShortcuts({ setPalette: setSearching, setHelp });

  // The workspace is a cookie every tab shares, so a switch in another tab
  // silently points this one's requests (uploads, new collections) at it.
  // Catch up when this tab is looked at again, or at once when told.
  const workspace = sidebar.me.workspace.id;
  useEffect(() => {
    switchedElsewhere(); // what the cookie says now is what this page was drawn for
    const check = () => {
      const to = switchedElsewhere();
      if (!to || to === workspace) return;
      toast.info("You switched workspace in another tab", { id: "workspace" });
      router.refresh();
    };
    const onVisible = () => document.visibilityState === "visible" && check();
    const channel = workspaceChannel();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisible);
    channel?.addEventListener("message", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisible);
      channel?.removeEventListener("message", check);
    };
  }, [workspace, router]);

  // The layout's counts load once, not per navigation. As pages change they
  // refresh in the background, at most every 15s, so Review stays current.
  const counted = useRef(0);
  useEffect(() => {
    const now = Date.now();
    const due = counted.current && now - counted.current >= 15_000;
    if (counted.current && !due) return;
    counted.current = now;
    if (!due) return; // the first render's counts are the layout's, fresh
    const json = (url: string) =>
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    void Promise.all([json("/api/v1/collections"), json("/api/v1/assets?review=true&limit=1")]).then(([cols, review]) => {
      if (cols) setCollections(cols.data);
      if (review) setReviewCount(review.total);
    });
  }, [pathname]);

  // The dialog sets the values a collection's assets inherit, so it needs the
  // schema. The last one fetched opens it at once, and the fresh one follows;
  // only the first open waits for it.
  const schema = useRef<FieldDef[] | null>(null);
  const openCollection = useCallback(async (c: Collection | "new") => {
    const collection = c === "new" ? undefined : c;
    const known = schema.current;
    if (known) setEditing({ collection, fields: known });
    const fields: FieldDef[] | null = await send("GET", "/api/v1/fields");
    if (!fields) return;
    schema.current = fields;
    // Closed meanwhile stays closed; another collection opened meanwhile keeps its own.
    setEditing((e) => (known ? (e && e.collection === collection ? { ...e, fields } : e) : (e ?? { collection, fields })));
  }, []);

  async function saved(c: Collection | null) {
    const was = editing?.collection;
    setCollectionEdits((n) => n + 1);
    const res = await fetch("/api/v1/collections").catch(() => null);
    if (res?.ok) setCollections((await res.json()).data);
    // A new collection opens; a deleted one that was open drops back to everything.
    if (c && !was) {
      const href = `/?collection=${c.id}`;
      if (pathname === "/") window.history.pushState(null, "", href);
      else router.push(href);
    } else if (!c && was && pathname === "/" && params.get("collection") === was.id) {
      const q = new URLSearchParams(window.location.search);
      q.delete("collection");
      window.history.pushState(null, "", q.size ? `/?${q}` : "/");
    }
  }

  // Gone at once, back in its place if the delete fails; Undo saves it again, under a new id.
  async function forget(id: string) {
    const at = searches.findIndex((s) => s.id === id);
    const gone = searches[at];
    if (!gone) return;
    const putBack = (s: SavedSearch) => setSearches((ss) => (ss.some((x) => x.id === s.id) ? ss : [...ss.slice(0, at), s, ...ss.slice(at)]));
    setSearches((ss) => ss.filter((s) => s.id !== id));
    if (!(await send("DELETE", `/api/v1/searches/${id}`))) return putBack(gone);
    undoable(`Deleted ${gone.name}`, {
      undo: async () => {
        const made: SavedSearch | null = await send("POST", "/api/v1/searches", { name: gone.name, query: gone.query });
        if (!made) return false; // send said why
        putBack(made);
      },
    });
  }

  const value = useMemo<ShellValue>(
    () => ({
      collections,
      setCollections,
      searches,
      setSearches,
      reviewCount,
      setReviewCount,
      brands,
      setBrands,
      setSqueeze,
      openPalette: () => setSearching(true),
      openCollection: (c) => void openCollection(c),
      setUpload,
      setCommands,
      collectionEdits,
    }),
    [collections, searches, reviewCount, brands, setUpload, setCommands, openCollection, collectionEdits],
  );

  const newCollection = can("collection.create") ? () => void openCollection("new") : undefined;
  const currentBrand = pathname === "/brand" ? (params.get("brand") ?? brands.find((b) => b.default)?.slug) : undefined;

  return (
    <ShellContext.Provider value={value}>
      <SidebarProvider
        defaultWidth={defaultWidth}
        open={nav && !squeeze}
        onOpenChange={(o) => {
          // Toggling by hand wins over a page's squeeze.
          setSqueeze(false);
          setNav(o);
        }}
      >
        <AppSidebar
          me={sidebar.me}
          collections={collections}
          brands={brands}
          searches={searches}
          reviewCount={reviewCount}
          currentBrand={currentBrand}
          openSearch={() => setSearching(true)}
          openShortcuts={() => setHelp(true)}
          onNewCollection={newCollection}
          onEditCollection={(c) => void openCollection(c)}
          onDeleteSearch={forget}
        />
        <SidebarInset className="min-w-0">
          {sidebar.me.notice && <NoticeBanner notice={sidebar.me.notice} />}
          {children}
        </SidebarInset>
        <CommandPalette
          open={searching}
          onOpenChange={setSearching}
          collections={collections}
          brands={brands}
          searches={searches}
          onUpload={upload?.fn}
          onNewCollection={newCollection}
          onShortcuts={() => setHelp(true)}
          commands={commands?.fn}
        />
        <ShortcutsDialog open={help} onOpenChange={setHelp} />
        {lastEditing && (
          <CollectionDialog
            open={!!editing}
            collection={lastEditing.collection}
            fields={lastEditing.fields}
            onClose={() => setEditing(null)}
            onSaved={(c) => void saved(c)}
          />
        )}
      </SidebarProvider>
    </ShellContext.Provider>
  );
}
