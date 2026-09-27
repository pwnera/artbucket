"use client";

import { useState } from "react";
import {
  IconArchive,
  IconArrowBackUp,
  IconCalendarOff,
  IconCheck,
  IconChevronDown,
  IconDownload,
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
import { useLibraryTags } from "@/components/asset-editor";
import { useCan } from "@/components/can";
import { CollectionIcon, type Collection } from "@/components/collections";
import { MultiCombobox, type Option } from "@/components/combobox";
import type { Asset } from "@/components/gallery";
import { extOf, PRESETS, stem } from "@/components/renditions";
import { approve, expireOn, moveTo, reject } from "@/components/review-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { pool } from "@/lib/pool";
import type { Action } from "@/lib/permissions";
import { uniqueNames, zip } from "@/lib/zip";
import { hasPreview } from "@/lib/preview";

const files = (n: number) => `${n} ${n === 1 ? "asset" : "assets"}`;

/**
 * Bulk actions over the selected assets. Each one is the same public call the
 * single-asset UI makes, run a few at a time; a failure is counted, not fatal.
 */
export function SelectionBar({
  picked,
  total,
  collections,
  current,
  review = false,
  onSelectAll,
  onClear,
  onDone,
}: {
  picked: Asset[];
  total: number;
  collections: Collection[];
  /** The collection being browsed, if any: offers "remove from" it. */
  current?: Collection;
  /** In the review queue: approve and reject come first. */
  review?: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const libraryTags = useLibraryTags();
  const can = useCan();
  if (!picked.length) return null;
  // A bulk action shows when it is allowed on every asset picked.
  const onAll = (action: Action) => picked.every((a) => can(action, a));
  const into = collections.filter((c) => can("collection.edit", c));

  /** `undo`: offered on the toast, over the assets it worked on. */
  async function each(verb: string, fn: (a: Asset) => Promise<Response>, which = picked, undo?: (done: Asset[]) => Promise<void>) {
    setBusy(true);
    const done: Asset[] = [];
    let why: string | undefined;
    await pool(which, 4, async (a) => {
      const call = () => fn(a).catch(() => null);
      let res = await call();
      // Past the server's rate limit: wait as long as it says, once.
      if (res?.status === 429) {
        await new Promise((r) => setTimeout(r, Number(res!.headers.get("retry-after") ?? 1) * 1000));
        res = await call();
      }
      if (res?.ok) return void done.push(a);
      why ??= (await res?.json().catch(() => null))?.error?.message;
    });
    setBusy(false);
    onDone();
    const failed = which.length - done.length;
    const action = undo && done.length ? { action: { label: "Undo", onClick: () => void undo(done) } } : {};
    if (failed) toast.error(`${verb} ${files(done.length)}, ${failed} failed`, { description: why, ...action });
    else toast.success(`${verb} ${files(which.length)}`, action);
    return failed === 0;
  }

  const restore = (a: Asset) => fetch(`/api/v1/assets/${a.id}/restore`, { method: "POST" });
  const undelete = async (done: Asset[]) => void (await each("Restored", restore, done));
  const live = picked.filter((a) => a.state !== "deleted");



  const patchTags = (a: Asset, tags: string[]) =>
    fetch(`/api/v1/assets/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags }),
    });

  // Membership is one call per collection, not per asset.
  async function members(c: Collection, change: "add" | "remove") {
    setBusy(true);
    const res = await fetch(`/api/v1/collections/${c.id}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [change]: picked.map((a) => a.id) }),
    });
    setBusy(false);
    onDone();
    if (!res.ok) return toast.error((await res.json()).error?.message ?? "Couldn't change the collection");
    toast.success(`${change === "add" ? "Added" : "Removed"} ${files(picked.length)} ${change === "add" ? "to" : "from"} ${c.name}`);
    if (change === "remove") onClear();
  }

  /**
   * Fetch each file (the original, or a preset rendition of each image), zip
   * them in the browser, save. Non-images have no renditions: they go in as is.
   */
  async function download(preset?: (typeof PRESETS)[number]) {
    setBusy(true);
    const id = toast.loading(`Preparing ${files(picked.length)}`);
    const got: { name: string; data: Uint8Array; date: Date }[] = [];
    let failed = 0;
    await pool(picked, 4, async (a) => {
      // A video's still is one frame of it, not the video at another size.
      const image = preset && hasPreview(a) && !a.mime.startsWith("video/");
      const url = image ? `/a/${a.id}/${preset.spec}` : `/a/${a.id}?download`;
      const res = await fetch(url).catch(() => null);
      if (!res?.ok) return void failed++;
      got.push({
        name: image ? `${stem(a.filename)}.${extOf(preset.spec)}` : a.filename,
        data: new Uint8Array(await res.arrayBuffer()),
        date: new Date(a.createdAt),
      });
      toast.loading(`Fetched ${got.length} of ${picked.length}`, { id });
    });
    setBusy(false);
    if (!got.length) return toast.error("Nothing could be downloaded", { id });
    const names = uniqueNames(got.map((g) => g.name));
    const blob = new Blob([zip(got.map((g, i) => ({ ...g, name: names[i] })))], { type: "application/zip" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `artbucket-${preset ? preset.name.toLowerCase().replace(/\s+/g, "-") : "originals"}-${got.length}.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    if (failed) toast.warning(`Zipped ${files(got.length)}, ${failed} failed`, { id });
    else toast.success(`Zipped ${files(got.length)}`, { id });
  }

  // Lifecycle moves, each over the part of the selection it applies to.
  const inState = (...states: Asset["state"][]) => picked.filter((a) => states.includes(a.state));
  const move = (label: string, icon: React.ReactNode, verb: string, which: Asset[], fn: (a: Asset) => Promise<Response>) =>
    which.length ? [{ label, icon, run: () => each(verb, fn, which) }] : [];
  const moves = [
    ...(onAll("asset.edit") ? move("Submit for review", <IconSend />, "Submitted", inState("draft"), (a) => moveTo(a, "proposed")) : []),
    ...(onAll("asset.review")
      ? [
          ...(review ? [] : move("Approve", <IconCheck />, "Approved", inState("draft", "proposed"), approve)),
          ...move("Archive", <IconArchive />, "Archived", inState("active", "expired"), (a) => moveTo(a, "archived")),
          ...move("Unarchive", <IconArrowBackUp />, "Unarchived", inState("archived"), (a) => moveTo(a, "active")),
        ]
      : []),
    ...(onAll("asset.delete") ? move("Restore", <IconArrowBackUp />, "Restored", inState("deleted"), restore) : []),
  ];

  const onPicked = new Set(picked.flatMap((a) => a.tags));
  const pickedTags: Option[] = [...onPicked].sort().map((value) => ({ value }));

  return (
    <div
      role="toolbar"
      aria-label="Selection"
      className="bg-popover text-popover-foreground fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-xl border p-1.5 shadow-lg"
    >
      <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Clear selection">
        <IconX />
      </Button>
      <span className="px-1 text-sm font-medium whitespace-nowrap tabular-nums">{picked.length} selected</span>
      {picked.length < total && (
        <Button variant="link" size="sm" className="px-1" onClick={onSelectAll}>
          Select all {total}
        </Button>
      )}
      <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />

      {review && onAll("asset.review") && (
        <>
          <Button size="sm" disabled={busy} onClick={async () => (await each("Approved", approve)) && onClear()}>
            <IconCheck /> Approve
          </Button>
          <RejectAction
            disabled={busy}
            onReject={async (reason) => {
              const ok = await each("Rejected", (a) => reject(a, reason));
              if (ok) onClear();
              return ok;
            }}
          />
          <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
        </>
      )}

      {onAll("asset.edit") && (
      <>
      <TagAction
        label="Tag"
        icon={<IconTag />}
        options={libraryTags}
        creatable
        disabled={busy}
        onApply={(tags) => each("Tagged", (a) => patchTags(a, [...new Set([...a.tags, ...tags])]))}
      />
      <TagAction
        label="Untag"
        icon={<IconTagOff />}
        options={pickedTags}
        disabled={busy || !pickedTags.length}
        onApply={(tags) => each("Untagged", (a) => patchTags(a, a.tags.filter((t) => !tags.includes(t))))}
      />
      </>
      )}

      {moves.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={busy}>
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
      {onAll("asset.edit") && (
        <ExpiryAction
          disabled={busy}
          onApply={(expires) => each(expires ? `Set ${expires} as the last day of use for` : "Cleared the last day of use for", (a) => expireOn(a, expires))}
        />
      )}

      {into.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={busy}>
              <IconFolderPlus /> Add to
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="center" className="max-h-72">
            <DropdownMenuLabel>Add to collection</DropdownMenuLabel>
            {into.map((c) => (
              <DropdownMenuItem key={c.id} onClick={() => members(c, "add")}>
                <CollectionIcon icon={c.icon} /> {c.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {current && can("collection.edit", current) && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => members(current, "remove")}>
          <IconFolderMinus /> Remove from {current.name}
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={busy}>
            <IconDownload /> Download
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center" className="max-h-80">
          <DropdownMenuLabel>Download as .zip</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => download()}>
            Originals
            <span className="text-muted-foreground ml-auto pl-4 text-xs">with edits</span>
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

      {onAll("asset.delete") && live.length > 0 && (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={busy}>
            <IconTrash /> Delete
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {files(live.length)}?</AlertDialogTitle>
            <AlertDialogDescription>
              They leave the library, its collections and its links at once, and their URLs stop working. For 30 days
              they can be restored, from the Deleted status; then they are gone for good.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (await each("Deleted", (a) => fetch(`/api/v1/assets/${a.id}`, { method: "DELETE" }), live, undelete)) onClear();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      )}
    </div>
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
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {compact ? (
          <IconButton variant="ghost" label="Reject…" disabled={disabled}>
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
        <p className="text-muted-foreground text-xs">
          Suggested assets are kept out of the library, with this reason. Suggested tags are dismissed.
        </p>
        <Button
          size="sm"
          variant="destructive"
          onClick={async () => {
            if (await onReject(reason.trim())) setOpen(false);
          }}
        >
          Reject
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** Set, or clear, the last day of use across the selection: past it, links answer 410. */
function ExpiryAction({ disabled, onApply }: { disabled?: boolean; onApply: (expires: string | null) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState("");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled}>
          <IconCalendarOff /> Expiry
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" className="grid w-72 gap-3">
        <label className="grid gap-1.5 text-sm font-medium">
          Last day of use
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <p className="text-muted-foreground text-xs">After it, their links answer 410 and checks refuse them. The rest of their rights stay as they are.</p>
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" disabled={!day} onClick={async () => (await onApply(day)) && setOpen(false)}>
            Set
          </Button>
          <Button size="sm" variant="outline" onClick={async () => (await onApply(null)) && setOpen(false)}>
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Pick tags, then apply them to the whole selection. */
function TagAction({
  label,
  icon,
  options,
  creatable,
  disabled,
  onApply,
}: {
  label: string;
  icon: React.ReactNode;
  options: Option[];
  creatable?: boolean;
  disabled?: boolean;
  onApply: (tags: string[]) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTags([]);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled}>
          {icon} {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" className="grid w-80 gap-3">
        <MultiCombobox
          options={options}
          value={tags}
          onChange={setTags}
          placeholder={creatable ? "Tags to add" : "Tags to remove"}
          creatable={creatable}
        />
        <Button
          size="sm"
          disabled={!tags.length}
          onClick={async () => {
            if (await onApply(tags)) setOpen(false);
          }}
        >
          {label} selection
        </Button>
      </PopoverContent>
    </Popover>
  );
}
