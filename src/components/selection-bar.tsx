"use client";

import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import {
  IconArchive,
  IconArrowBackUp,
  IconCalendarOff,
  IconCheck,
  IconChevronDown,
  IconDots,
  IconDownload,
  IconMinus,
  IconPlus,
  IconSend,
  IconFolderMinus,
  IconFolderPlus,
  IconTag,
  IconTagOff,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { IconButton } from "@/components/icon-button";
import { toast } from "sonner";
import { useBrand } from "@/components/brand";
import { useCan } from "@/components/can";
import { useShell } from "@/components/shell";
import { CollectionDialog, CollectionIcon, type Collection } from "@/components/collections";
import type { Option } from "@/components/combobox";
import { Confirm } from "@/components/confirm";
import type { Asset } from "@/components/gallery";
import { extOf, PRESETS, stem } from "@/components/renditions";
import { approve, expireOn, moveTo, reject } from "@/components/review-actions";
import { saveZip } from "@/components/save-zip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useSidebar } from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { fileSlug } from "@/lib/branding";
import { formatBytes } from "@/lib/filename";
import type { FieldDef } from "@/lib/fields";
import { pool } from "@/lib/pool";
import type { Action } from "@/lib/permissions";
import { normalizeTags } from "@/lib/search";
import { sendResult } from "@/lib/send";
import { undoable } from "@/lib/undo";
import { hasPreview } from "@/lib/preview";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/info-tip";

const files = (n: number) => `${n.toLocaleString()} ${n === 1 ? "asset" : "assets"}`;

/** Past this a zip of originals built in the tab's memory risks the tab. */
const ZIP_LIMIT = 1024 ** 3;

/**
 * Change the page's copy of these assets now (null takes one out of the
 * listing); returns how to put them back: all, or only the ids given.
 */
export type Patch = (ids: string[], fn: (a: Asset) => Asset | null) => (only?: string[]) => void;

const patchTags = (a: Asset, tags: string[]) =>
  fetch(`/api/v1/assets/${a.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tags }),
  });
const restore = (a: Asset) => fetch(`/api/v1/assets/${a.id}/restore`, { method: "POST" });
const del = (a: Asset) => fetch(`/api/v1/assets/${a.id}`, { method: "DELETE" });

// ---- decisions that wait out their Undo ----------------------------------------

const waiting = new Set<() => void>();
let listening = false;
/** Assets whose decision waits on its Undo: a refresh meanwhile must not bring them back. */
export const deciding = new Set<string>();
function flushAll() {
  for (const send of [...waiting]) send();
}

/**
 * Approve and reject can't be taken back through the API, so they wait: the
 * rows leave at once, the requests go when the Undo toast has gone (or the
 * page is left), and Undo simply never sends them.
 *
 * ponytail: a plain fetch, so one started as the tab closes can be cut off;
 * move approve/reject onto keepalive if decisions go missing that way.
 */
export function decideLater(
  message: string,
  which: Asset[],
  run: (a: Asset) => Promise<Response>,
  { patch, onDone, onCount }: { patch?: Patch; onDone: () => void; onCount?: (delta: number) => void },
) {
  const back = patch?.(
    which.map((a) => a.id),
    () => null,
  );
  // The Review tab's count ticks down with the decision, not when the request goes 10s later.
  onCount?.(-which.length);
  let state: "waiting" | "sent" | "undone" = "waiting";
  for (const a of which) deciding.add(a.id);
  const settle = () => which.forEach((a) => deciding.delete(a.id));
  async function send() {
    if (state !== "waiting") return;
    state = "sent";
    waiting.delete(send);
    clearTimeout(timer);
    const failed: Asset[] = [];
    let why: string | undefined;
    await pool(which, 4, async (a) => {
      const r = await run(a).catch(() => null);
      if (r?.ok) return;
      failed.push(a);
      why ??= (await r?.json().catch(() => null))?.error?.message;
    });
    if (failed.length) {
      back?.(failed.map((a) => a.id));
      onCount?.(failed.length);
      toast.error(`${failed.length.toLocaleString()} of ${files(which.length)} couldn't be decided`, { description: why, duration: 10_000 });
    }
    settle();
    onDone();
  }
  if (!listening) {
    listening = true;
    window.addEventListener("pagehide", flushAll);
    document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flushAll());
  }
  waiting.add(send);
  // A little past the toast's 8s: hovering a toast pauses it, and an Undo
  // clicked just after should still find nothing sent.
  const timer = setTimeout(() => void send(), 10_000);
  undoable(message, {
    undo: () => {
      if (state !== "waiting") throw new Error("already sent");
      state = "undone";
      waiting.delete(send);
      clearTimeout(timer);
      settle();
      back?.();
      onCount?.(which.length);
    },
  });
}

/** The shell's review count, moved by a decision as it is made (decideLater). */
export function useReviewCount() {
  const { setReviewCount } = useShell();
  return (delta: number) => setReviewCount((n) => Math.max(0, n + delta));
}

// ---- bulk work ----------------------------------------------------------------

type EachOptions = {
  which?: Asset[];
  /** The change as the page should show it now. */
  local?: (a: Asset) => Asset | null;
  /** Offered for 8s over the assets it worked on (their state before). */
  undo?: (done: Asset[]) => Promise<void>;
  /** No toasts: an undo, which reports through undoable. */
  quiet?: boolean;
};

/**
 * Bulk work over the selection, shared by the selection bar and the context
 * menu on a selected asset. Each one is the same public call the
 * single-asset UI makes, run a few at a time; a failure is counted, not
 * fatal. Changes show at once and go back where they failed.
 */
export function useBulk({
  picked,
  current,
  patch,
  onDone,
  onClear,
}: {
  picked: Asset[];
  /** The collection being browsed: removing from it takes assets out of view. */
  current?: string | null;
  patch?: Patch;
  onDone: () => void;
  onClear: () => void;
}) {
  const [busy, setBusy] = useState(false);
  // Work over many files counts up in the bar, where it was asked for, not in a toast.
  const [progress, setProgress] = useState<{ verb: string; done: number; of: number } | null>(null);
  const brand = useBrand();

  async function each(verb: string, fn: (a: Asset) => Promise<Response>, { which = picked, local, undo, quiet = false }: EachOptions = {}) {
    setBusy(true);
    const back = local && patch?.(
      which.map((a) => a.id),
      local,
    );
    if (!quiet) setProgress({ verb, done: 0, of: which.length });
    const done: Asset[] = [];
    let why: string | undefined;
    try {
      await pool(which, 4, async (a) => {
        const call = () => fn(a).catch(() => null);
        let res = await call();
        // Past the server's rate limit: wait as long as it says, once.
        if (res?.status === 429) {
          await new Promise((r) => setTimeout(r, Number(res!.headers.get("retry-after") ?? 1) * 1000));
          res = await call();
        }
        if (res?.ok) {
          done.push(a);
          if (!quiet) setProgress({ verb, done: done.length, of: which.length });
          return;
        }
        why ??= (await res?.json().catch(() => null))?.error?.message;
      });
    } finally {
      setBusy(false);
      if (!quiet) setProgress(null);
    }
    const failed = which.filter((a) => !done.includes(a));
    if (failed.length) back?.(failed.map((a) => a.id));
    onDone();
    if (quiet) return failed.length === 0;
    const offer = undo && done.length ? { action: { label: "Undo", onClick: () => void undo(done) }, duration: 8000 } : {};
    if (failed.length) toast.error(`${verb} ${files(done.length)}, ${failed.length.toLocaleString()} failed`, { description: why, ...offer });
    else if (undo && done.length) undoable(`${verb} ${files(done.length)}`, { undo: () => undo(done) });
    else toast.success(`${verb} ${files(which.length)}`);
    return failed.length === 0;
  }

  /** The inverse of a change: put each asset back as it was, quietly; a throw tells undoable it didn't work. */
  const inverse = (verb: string, fn: (a: Asset) => Promise<Response>) => async (done: Asset[]) => {
    const was = new Map(done.map((a) => [a.id, a]));
    if (!(await each(verb, fn, { which: done, local: (x) => was.get(x.id) ?? x, quiet: true }))) throw new Error();
  };

  // Membership is one call per collection, not per asset.
  async function members(c: Collection, change: "add" | "remove", which = picked, quiet = false): Promise<boolean> {
    setBusy(true);
    const ids = which.map((a) => a.id);
    const back = patch?.(ids, (x) =>
      change === "remove" && current === c.id
        ? null
        : { ...x, collections: change === "add" ? [...new Set([...x.collections, c.id])] : x.collections.filter((id) => id !== c.id) },
    );
    // sendResult never throws: a dropped connection comes back as a result.
    const r = await sendResult("POST", `/api/v1/collections/${c.id}/assets`, { [change]: ids }, { quiet: true });
    setBusy(false);
    if (!r.ok) {
      back?.();
      if (!quiet && !r.network) toast.error(r.error?.message ?? "Couldn't change the collection");
      return false;
    }
    onDone();
    if (quiet) return true;
    // Undo touches only what this changed: not what was already in, or already out.
    const changed = which.filter((a) => a.collections.includes(c.id) === (change === "remove"));
    undoable(`${change === "add" ? "Added" : "Removed"} ${files(ids.length)} ${change === "add" ? "to" : "from"} ${c.name}`, {
      undo: async () => {
        if (changed.length && !(await members(c, change === "add" ? "remove" : "add", changed, true))) throw new Error();
      },
    });
    // Only the browsed collection's assets leave the view; unticking another in Add to keeps the selection.
    if (change === "remove" && current === c.id) onClear();
    return true;
  }

  /**
   * Fetch each file (the original, or a preset rendition of each image), zip
   * them in the browser, save. Non-images have no renditions: they go in as is.
   */
  async function download(preset?: (typeof PRESETS)[number], which = picked) {
    if (!preset && which.reduce((n, a) => n + a.size, 0) > ZIP_LIMIT)
      return void toast.error("Too big to zip in the browser", { description: "Pick a size instead of originals, or fewer files." });
    setBusy(true);
    setProgress({ verb: "Fetched", done: 0, of: which.length });
    const got: { name: string; data: Uint8Array; date: Date }[] = [];
    let failed = 0;
    try {
      await pool(which, 4, async (a) => {
        // A video's still is one frame of it, not the video at another size.
        const image = preset && hasPreview(a) && !a.mime.startsWith("video/");
        const url = image ? `/a/${a.id}/${preset.spec}` : `/a/${a.id}?download`;
        const res = await fetch(url).catch(() => null);
        // A connection dropped mid-body fails this file, not the batch.
        const body = res?.ok ? await res.arrayBuffer().catch(() => null) : null;
        if (!body) return void failed++;
        got.push({ name: image ? `${stem(a.filename)}.${extOf(preset.spec)}` : a.filename, data: new Uint8Array(body), date: new Date(a.createdAt) });
        setProgress({ verb: "Fetched", done: got.length, of: which.length });
      });
    } finally {
      setBusy(false);
      setProgress(null);
    }
    if (!got.length) return void toast.error("Nothing could be downloaded");
    saveZip(got, `${fileSlug(brand.name)}-${preset ? preset.name.toLowerCase().replace(/\s+/g, "-") : "originals"}-${got.length}.zip`);
    if (failed) toast.warning(`Zipped ${files(got.length)}, ${failed} failed`);
    else toast.success(`Zipped ${files(got.length)}`);
  }

  const deleteLive = (which: Asset[]) =>
    each("Deleted", del, { which, local: () => null, undo: inverse("Restored", restore) });

  return { busy, progress, each, inverse, members, download, deleteLive, patch, onDone, onClear };
}
export type Bulk = ReturnType<typeof useBulk>;

// ---- the bar ------------------------------------------------------------------

type Panel = "tag" | "untag" | "expiry" | "add" | null;

/**
 * Bulk actions over the selected assets, floating over the grid. It stays
 * mounted so it can slide out; while it closes it shows the last selection.
 */
export function SelectionBar({
  picked,
  loaded,
  total,
  collections,
  fields,
  current,
  review = false,
  bulk,
  deleting,
  onDeletingChange,
  onSelectAll,
  onClear,
  onOpenCollection,
}: {
  picked: Asset[];
  /** How many are on the page: what Select all can take. */
  loaded: number;
  /** Every match of the view. */
  total: number;
  collections: Collection[];
  fields: FieldDef[];
  /** The collection being browsed, if any: offers "remove from" it. */
  current?: Collection;
  /** In the review queue: approve and reject come first. */
  review?: boolean;
  bulk: Bulk;
  /** The delete confirmation, open: from Delete here, the Delete key or the context menu. */
  deleting: boolean;
  onDeletingChange: (open: boolean) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onOpenCollection: (c: Collection) => void;
}) {
  const can = useCan();
  const { state: sidebar, isMobile } = useSidebar();
  const [panel, setPanel] = useState<Panel>(null);
  const [creating, setCreating] = useState(false);
  const [libraryTags, setLibraryTags] = useState<Option[]>([]);
  const open = picked.length > 0;
  const [last, setLast] = useState(picked);
  if (open && picked !== last) setLast(picked);
  const items = open ? picked : last;
  const { busy, progress, each, inverse, members, download } = bulk;

  // A bulk action shows when it is allowed on every asset picked.
  const onAll = (action: Action) => items.length > 0 && items.every((a) => can(action, a));
  const canEdit = onAll("asset.edit");
  const into = collections.filter((c) => can("collection.edit", c));
  const canCreate = can("collection.create");
  const live = items.filter((a) => a.state !== "deleted");
  const canDelete = onAll("asset.delete") && live.length > 0;
  // What the delete confirmation asked about, held while it runs: the delete empties the selection, and the bar, as it goes.
  const [asked, setAsked] = useState<Asset[] | null>(null);
  if (deleting && !asked && canDelete) setAsked(live);
  if (!deleting && asked) setAsked(null);

  // Tags created since the page loaded belong in the list: fetched as Tag opens.
  const loadTags = useCallback(() => {
    fetch("/api/v1/assets?limit=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b && setLibraryTags(b.facets.tags.map((t: { value: string; count: number }) => ({ value: t.value, hint: t.count }))))
      .catch(() => {});
  }, []);
  const openPanel = useCallback(
    (p: Panel) => {
      if (p === "tag") loadTags();
      setPanel(p);
    },
    [loadTags],
  );

  // T tags the selection, from anywhere but a field or another layer.
  useEffect(() => {
    if (!open || !canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.key !== "t" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof Element && t.closest("input, textarea, [contenteditable], [role=dialog], [role=alertdialog], [role=menu]")) return;
      e.preventDefault();
      openPanel("tag");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, canEdit, openPanel]);

  const shown = open || last.length > 0;

  const was = (done: Asset[]) => new Map(done.map((a) => [a.id, a]));
  // Lifecycle moves, each over the part of the selection it applies to, each undone by the move back.
  const inState = (...states: Asset["state"][]) => items.filter((a) => states.includes(a.state));
  const move = (label: string, icon: React.ReactNode, verb: string, which: Asset[], to: Asset["status"] | null, fn: (a: Asset) => Promise<Response>) =>
    which.length
      ? [
          {
            label,
            icon,
            run: () =>
              each(verb, fn, {
                which,
                ...(to && {
                  local: (x: Asset) => ({ ...x, status: to, state: to }),
                  undo: inverse("Moved back", (a) => moveTo(a, a.status)),
                }),
              }),
          },
        ]
      : [];
  const moves = [
    ...(onAll("asset.edit") ? move("Submit for review", <IconSend />, "Submitted", inState("draft"), "proposed", (a) => moveTo(a, "proposed")) : []),
    ...(onAll("asset.review")
      ? [
          ...(review ? [] : move("Approve", <IconCheck />, "Approved", inState("draft", "proposed"), null, approve)),
          ...move("Archive", <IconArchive />, "Archived", inState("active", "expired"), "archived", (a) => moveTo(a, "archived")),
          ...move("Unarchive", <IconArrowBackUp />, "Unarchived", inState("archived"), "active", (a) => moveTo(a, "active")),
        ]
      : []),
    ...(onAll("asset.delete") ? move("Restore", <IconArrowBackUp />, "Restored", inState("deleted"), null, restore) : []),
  ];

  const pickedTags: Option[] = [...new Set(items.flatMap((a) => a.tags))].sort().map((value) => ({ value }));
  const bytes = items.reduce((n, a) => n + a.size, 0);
  const removeHere = current && can("collection.edit", current);
  const onCount = useReviewCount();
  const decide = { patch: bulk.patch, onDone: bulk.onDone, onCount };

  const tag = (tags: string[]) => {
    const add = (x: Asset) => [...new Set([...x.tags, ...tags])];
    return each("Tagged", (a) => patchTags(a, add(a)), {
      local: (x) => ({ ...x, tags: add(x) }),
      undo: inverse("Untagged", (a) => patchTags(a, a.tags)),
    });
  };
  const untag = (tags: string[]) => {
    const keep = (x: Asset) => x.tags.filter((t) => !tags.includes(t));
    return each("Untagged", (a) => patchTags(a, keep(a)), {
      local: (x) => ({ ...x, tags: keep(x) }),
      undo: inverse("Tagged", (a) => patchTags(a, a.tags)),
    });
  };
  const expire = (expires: string | null) =>
    each(expires ? `Set ${expires} as the last day of use for` : "Cleared the last day of use for", (a) => expireOn(a, expires), {
      local: (x) => ({ ...x, rights: x.rights ? { ...x.rights, expires } : x.rights }),
      undo: async (done) => {
        const before = was(done);
        await inverse("Restored the last day of use for", (a) => expireOn(a, before.get(a.id)?.rights?.expires ?? null))(done);
      },
    });

  const toggle = (p: Exclude<Panel, null>) => (o: boolean) => (o ? openPanel(p) : setPanel(null));

  return (
    <>
      {shown && (
        <div
          role="toolbar"
          aria-label="Selection"
          data-state={open ? "open" : "closed"}
          // globals.css lifts bottom toasts, and the upload tray, above the bar while it is up.
          data-floating={open ? "selection" : undefined}
          onAnimationEnd={(e) => e.target === e.currentTarget && !open && setLast([])}
          className={cn(
            "bg-popover text-popover-foreground fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-xl border p-1.5 shadow-lg",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4 data-[state=open]:duration-200",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-4 data-[state=closed]:duration-150 data-[state=closed]:ease-in data-[state=closed]:pointer-events-none",
            // Centered on the content, not the window, beside an open sidebar.
            sidebar === "expanded" && !isMobile && "md:left-[calc(50%+var(--sidebar-width)/2)] md:max-w-[calc(100vw-var(--sidebar-width)-2rem)]",
          )}
        >
          <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Clear selection">
            <IconX />
          </Button>
          <span className="flex items-center px-1 text-sm font-medium whitespace-nowrap tabular-nums" aria-live="polite">
            {busy ? <Spinner className="text-muted-foreground mr-1.5 size-4" aria-hidden /> : null}
            {progress ? (
              `${progress.verb} ${progress.done.toLocaleString()} of ${progress.of.toLocaleString()}`
            ) : (
              <>
                {/* Keyed, so each pick pops the number. */}
                <span key={items.length} className="animate-in fade-in-0 zoom-in-90 duration-150">
                  {items.length < total ? `${items.length.toLocaleString()} of ${total.toLocaleString()}` : items.length.toLocaleString()}
                </span>
                <span className="hidden sm:inline">&nbsp;selected</span>
              </>
            )}
          </span>
          {progress && (
            <span
              aria-hidden
              className="bg-primary pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left transition-transform duration-300"
              style={{ transform: `scaleX(${progress.done / Math.max(progress.of, 1)})` }}
            />
          )}
          {items.length < loaded && (
            <Button variant="link" size="sm" className="hidden px-1 sm:inline-flex" onClick={onSelectAll}>
              Select all {loaded.toLocaleString()}
            </Button>
          )}
          <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />

          {review && onAll("asset.review") && (
            <>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => {
                  decideLater(`Approved ${files(items.length)}`, items, approve, decide);
                  onClear();
                }}
              >
                <IconCheck /> Approve
              </Button>
              <RejectAction
                disabled={busy}
                onReject={async (reason) => {
                  decideLater(`Rejected ${files(items.length)}`, items, (a) => reject(a, reason), decide);
                  onClear();
                  return true;
                }}
              />
              <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
            </>
          )}

          {canEdit && (
            <>
              <TagAction
                label="Tag"
                icon={<IconTag />}
                shortcut
                options={libraryTags}
                creatable
                disabled={busy}
                open={panel === "tag"}
                onOpenChange={toggle("tag")}
                onApply={tag}
              />
              <TagAction
                label="Untag"
                icon={<IconTagOff />}
                options={pickedTags}
                disabled={busy || !pickedTags.length}
                open={panel === "untag"}
                onOpenChange={toggle("untag")}
                onApply={untag}
                className="hidden md:inline-flex"
              />
            </>
          )}

          {moves.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" disabled={busy} className="hidden md:inline-flex">
                  Status <IconChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="center">
                {moves.map((m) => (
                  <DropdownMenuItem key={m.label} onClick={m.run}>
                    {m.icon} {m.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canEdit && <ExpiryAction disabled={busy} open={panel === "expiry"} onOpenChange={toggle("expiry")} onApply={expire} className="hidden md:inline-flex" />}

          {(into.length > 0 || canCreate) && (
            <AddTo
              picked={items}
              into={into}
              canCreate={canCreate}
              disabled={busy}
              open={panel === "add"}
              onOpenChange={toggle("add")}
              onToggle={(c, change) => void members(c, change)}
              onNew={() => {
                setPanel(null);
                setCreating(true);
              }}
            />
          )}
          {removeHere && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => members(current, "remove")} className="hidden md:inline-flex">
              <IconFolderMinus /> Remove from {current.name}
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton variant="ghost" size="sm" label="Download" disabled={busy} className="w-auto px-2.5">
                <IconDownload /> <span className="hidden md:inline">Download</span>
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="center" className="max-h-80">
              <DropdownMenuLabel>Download as .zip</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => download()} disabled={bytes > ZIP_LIMIT}>
                <span className="grid">
                  Originals
                  {bytes > ZIP_LIMIT && <span className="text-muted-foreground text-xs">Too big to zip here: pick a size, or fewer files</span>}
                </span>
                <span className="text-muted-foreground ml-auto pl-4 text-xs tabular-nums">{formatBytes(bytes)}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {PRESETS.map((p) => (
                <DropdownMenuItem key={p.name} onClick={() => download(p)}>
                  {p.name}
                  <span className="text-muted-foreground ml-auto pl-4 font-mono text-xs">{p.spec}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* A phone has room for the frequent few; the rest fold in here. */}
          {(moves.length > 0 || canEdit || removeHere) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton variant="ghost" label="More" disabled={busy} className="md:hidden">
                  <IconDots />
                </IconButton>
              </DropdownMenuTrigger>
              {/* Focus stays with the popover a menu item opened, not back on this trigger. */}
              <DropdownMenuContent side="top" align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
                {moves.map((m) => (
                  <DropdownMenuItem key={m.label} onClick={m.run}>
                    {m.icon} {m.label}
                  </DropdownMenuItem>
                ))}
                {canEdit && (
                  <>
                    {moves.length > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuItem disabled={!pickedTags.length} onSelect={() => openPanel("untag")}>
                      <IconTagOff /> Untag…
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => openPanel("expiry")}>
                      <IconCalendarOff /> Expiry…
                    </DropdownMenuItem>
                  </>
                )}
                {removeHere && (
                  <DropdownMenuItem onSelect={() => void members(current, "remove")}>
                    <IconFolderMinus /> Remove from {current.name}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => onDeletingChange(true)}
              aria-label="Delete"
            >
              <IconTrash /> <span className="hidden md:inline">Delete</span>
            </Button>
          )}
        </div>
      )}

      {/* Soft, and undoable, but many at once: still asked first. */}
      <Confirm
        open={!!asked}
        onOpenChange={onDeletingChange}
        title={`Delete ${files(asked?.length ?? 0)}?`}
        says="They leave the library and their links stop working at once. Restore them from Deleted within 30 days; then they are gone for good."
        action="Delete"
        run={async () => {
          const ok = await bulk.deleteLive(asked ?? []);
          if (ok) onClear();
          return ok;
        }}
      />

      <CollectionDialog
        open={creating}
        fields={fields}
        onClose={() => setCreating(false)}
        onSaved={async (c) => {
          if (!c) return;
          const r = await sendResult("POST", `/api/v1/collections/${c.id}/assets`, { add: items.map((a) => a.id) });
          bulk.onDone();
          if (r.ok) toast.success(`Added ${files(items.length)} to ${c.name}`, { action: { label: "Open it", onClick: () => onOpenCollection(c) }, duration: 8000 });
        }}
      />
    </>
  );
}

/** Add to, or take out of, collections: a check for all of the selection in it, a dash for some. */
function AddTo({
  picked,
  into,
  canCreate,
  disabled,
  open,
  onOpenChange,
  onToggle,
  onNew,
}: {
  picked: Asset[];
  into: Collection[];
  canCreate: boolean;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: (c: Collection, change: "add" | "remove") => void;
  onNew: () => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <IconButton variant="ghost" size="sm" label="Add to collection" disabled={disabled} className="w-auto px-2.5">
          <IconFolderPlus /> <span className="hidden md:inline">Add to</span>
        </IconButton>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-64 p-0">
        <Command loop>
          <CommandInput placeholder="Find a collection" autoFocus />
          <CommandList className="max-h-64">
            <CommandEmpty>No collection by that name.</CommandEmpty>
            {into.length > 0 && (
              <CommandGroup>
                {into.map((c) => {
                  const n = picked.filter((a) => a.collections.includes(c.id)).length;
                  const all = n === picked.length;
                  return (
                    <CommandItem key={c.id} value={`${c.name} ${c.id}`} onSelect={() => onToggle(c, all ? "remove" : "add")}>
                      <span
                        className={cn(
                          "border-primary flex size-4 shrink-0 items-center justify-center rounded-sm border",
                          n ? "bg-primary text-primary-foreground" : "opacity-50",
                        )}
                      >
                        {all ? <IconCheck className="text-primary-foreground size-3" /> : n ? <IconMinus className="text-primary-foreground size-3" /> : null}
                      </span>
                      <CollectionIcon icon={c.icon} />
                      <span className="truncate">{c.name}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            {canCreate && (
              <>
                <CommandSeparator />
                <CommandGroup forceMount>
                  <CommandItem forceMount value="new collection" onSelect={onNew}>
                    <IconPlus /> New collection…
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Reject, with one reason the agents read back. */
export function RejectAction({
  disabled,
  compact,
  side = "top",
  onReject,
}: {
  disabled?: boolean;
  /** An icon button, for a table row. */
  compact?: boolean;
  side?: "top" | "bottom" | "left";
  onReject: (reason: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {compact ? (
          <IconButton variant="ghost" label="Reject…" shortcut={["R"]} disabled={disabled}>
            <IconX />
          </IconButton>
        ) : (
          <Button variant="ghost" size="sm" disabled={disabled}>
            <IconX /> Reject…
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent side={side} align="end" className="grid w-80 gap-3">
        <Textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why not? The agents read this"
          aria-label="Reason for rejecting"
          maxLength={2000}
          rows={2}
        />
        <p className="text-muted-foreground text-xs">Assets stay out of the library; suggested tags are dismissed.</p>
        <Button
          size="sm"
          variant="destructive"
          pending={busy}
          onClick={async () => {
            setBusy(true);
            try {
              if (await onReject(reason.trim())) setOpen(false);
            } finally {
              setBusy(false);
            }
          }}
        >
          Reject
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The bar's top edge as a popover's anchor: Untag and Expiry open from the
 * More menu on a phone, where their own buttons are hidden, and should open
 * in the same place either way.
 */
function BarAnchor() {
  return <PopoverAnchor className="pointer-events-none absolute inset-x-0 top-0 h-0" />;
}

/** Set, or clear, the last day of use across the selection: past it, links answer 410. */
function ExpiryAction({
  disabled,
  open,
  onOpenChange,
  onApply,
  className,
}: {
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (expires: string | null) => Promise<boolean>;
  className?: string;
}) {
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState<"set" | "clear" | null>(null);
  const apply = async (to: string | null) => {
    setBusy(to ? "set" : "clear");
    try {
      if (await onApply(to)) onOpenChange(false);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <BarAnchor />
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled} className={className}>
          <IconCalendarOff /> Expiry
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" className="grid w-72 gap-3">
        <label className="grid gap-1.5 text-sm font-medium">
          <span className="flex items-center gap-1.5">
            Last day of use
            <InfoTip>After it, their links answer 410 and checks refuse them. The rest of their rights stay as they are.</InfoTip>
          </span>
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" disabled={!day || !!busy} pending={busy === "set"} onClick={() => void apply(day)}>
            Set
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy} pending={busy === "clear"} onClick={() => void apply(null)}>
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Pick tags, then apply them to the whole selection: one click (or T) and
 * type. Enter picks the highlighted tag; Enter on an empty search, or
 * ⌘Enter, applies.
 */
function TagAction({
  label,
  icon,
  options,
  creatable,
  shortcut,
  disabled,
  open,
  onOpenChange,
  onApply,
  className,
}: {
  label: string;
  icon: React.ReactNode;
  options: Option[];
  creatable?: boolean;
  /** Advertise T in the tooltip. */
  shortcut?: boolean;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (tags: string[]) => Promise<boolean>;
  className?: string;
}) {
  const [tags, setTags] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const typed = normalizeTags([q])[0] ?? "";
  const offer = creatable && typed !== "" && !tags.includes(typed) && !options.some((o) => o.value === typed);
  const set = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      setTags([]);
      setQ("");
    }
  };
  const flip = (t: string) => {
    setTags((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));
    setQ("");
  };
  const apply = async () => {
    if (tags.length && (await onApply(tags))) set(false);
  };
  return (
    <Popover open={open} onOpenChange={set}>
      {!shortcut && <BarAnchor />}
      <PopoverTrigger asChild>
        {shortcut ? (
          <IconButton variant="ghost" size="sm" label={label} shortcut={["T"]} disabled={disabled} className={cn("w-auto px-2.5", className)}>
            {icon} <span className="hidden md:inline">{label}</span>
          </IconButton>
        ) : (
          <Button variant="ghost" size="sm" disabled={disabled} className={className}>
            {icon} {label}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent side="top" className="w-72 p-0">
        <Command loop>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 border-b p-2">
              {tags.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1 pr-1">
                  {t}
                  <button type="button" onClick={() => flip(t)} aria-label={`Remove ${t}`} className="hover:bg-muted-foreground/20 rounded-full p-0.5">
                    <IconX className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <CommandInput
            autoFocus
            value={q}
            onValueChange={setQ}
            placeholder={creatable ? "Tags to add" : "Tags to remove"}
            onKeyDown={(e) => {
              // cmdk leaves a handled key alone, so this wins over picking the highlighted row.
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !q.trim())) {
                e.preventDefault();
                void apply();
              }
            }}
          />
          <CommandList className="max-h-56">
            <CommandEmpty>{creatable ? "Type to add one." : "No match."}</CommandEmpty>
            {offer && (
              <CommandGroup forceMount>
                <CommandItem forceMount value={`\u0000${typed}`} onSelect={() => flip(typed)}>
                  <IconPlus /> Add &ldquo;{typed}&rdquo;
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {options.map((o) => {
                const on = tags.includes(o.value);
                return (
                  <CommandItem key={o.value} value={o.value} onSelect={() => flip(o.value)}>
                    <span
                      className={cn(
                        "border-primary flex size-4 items-center justify-center rounded-sm border",
                        on ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible",
                      )}
                    >
                      <IconCheck className="text-primary-foreground size-3" />
                    </span>
                    <span className="truncate">{o.value}</span>
                    {o.hint !== undefined && <span className="text-muted-foreground ml-auto font-mono text-xs">{o.hint.toLocaleString()}</span>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="flex items-center gap-2 border-t p-2">
          <span className="text-muted-foreground flex-1 text-xs">
            <Kbd keys={["mod", "↵"]} /> to apply
          </span>
          <Button size="sm" disabled={!tags.length} onClick={() => void apply()}>
            {label} selection
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
