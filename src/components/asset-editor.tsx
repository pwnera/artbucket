"use client";

import { Fragment, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconBook,
  IconCertificate,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconDots,
  IconCode,
  IconDownload,
  IconEye,
  IconInfoCircle,
  IconLock,
  IconPencil,
  IconPhoto,
  IconShare,
  IconSparkles,
  IconUpload,
  IconX,
  IconZoomIn,
  IconZoomOut,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { type Collection } from "@/components/collections";
import { Combobox, MultiCombobox, type Option } from "@/components/combobox";
import { assetActions } from "@/components/asset-menu";
import { CopyButton } from "@/components/copy-button";
import { describedBy, fieldFormValue, FieldInputs, Fold, formatFieldValue, ghost, Property, readFieldValues } from "@/components/fields";
import { call, curl, ForAgents } from "@/components/agent-access";
import { FontPlayground } from "@/components/font-preview";
import { IconGlyph } from "@/components/icon-glyph";
import { LibraryPicker } from "@/components/asset-picker";
import { Renditions } from "@/components/renditions";
import { approveBody } from "@/components/review-actions";
import { SaveStatus } from "@/components/save-status";
import { Thumb, type Asset } from "@/components/gallery";
import { Lottie } from "@/components/media";
import { ReadOnly } from "@/components/brand-values";
import { usePref } from "@/components/sidebar-prefs";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Can, useCan, Writable } from "@/components/can";
import { IconButton } from "@/components/icon-button";
import { ShareDialog } from "@/components/share-dialog";
import { Lifecycle, PREVIEW_BG, StatusBadges, usePreviewBg, useVersionUpload, Versions, type PreviewBg } from "@/components/versions";
import { DialogClose, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { missingRequired, relaxInherited, type FieldDef } from "@/lib/fields";
import { contextLabel, ruleLabel, type Rule } from "@/lib/rules";
import { fileTypeBadge, formatBytes } from "@/lib/filename";
import { isFont } from "@/lib/font";
import { embedUrl, hasPreview, isIcon, isLottie, isMono } from "@/lib/preview";
import { CHANNELS } from "@/lib/rights";
import { sendResult, type ApiError } from "@/lib/send";
import { ago } from "@/lib/time";
import { cn } from "@/lib/utils";

/** Every tag in the library, for autocomplete: an unfiltered search's facets. */
export function useLibraryTags() {
  const [tags, setTags] = useState<Option[]>([]);
  useEffect(() => {
    fetch("/api/v1/assets?limit=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b && setTags(tagOptions(b)))
      .catch(() => {});
  }, []);
  return tags;
}

const tagOptions = (b: { facets: { tags: { value: string; count: number }[] } }): Option[] =>
  b.facets.tags.map((t) => ({ value: t.value, hint: t.count }));

/**
 * Tags beyond the top 50 the facets list: a search for what is typed lists
 * the tags it matches, since the search index covers tags. Merged in, never
 * replacing, so the list doesn't jump.
 */
function useTagSearch(base: Option[]) {
  const [more, setMore] = useState<Option[]>([]);
  const have = new Set(base.map((o) => o.value));
  const options = [...base, ...more.filter((o) => !have.has(o.value))];
  const search = (q: string) =>
    fetch(`/api/v1/assets?limit=1&q=${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!b) return;
        setMore((m) => {
          const seen = new Set(m.map((o) => o.value));
          return [...m, ...tagOptions(b).filter((o) => !seen.has(o.value))];
        });
      })
      .catch(() => {});
  return [options, search] as const;
}

/** Every country the browser can name, as "Germany (DE)": territories pick from these. */
let regions: Option[] | null = null;
function regionOptions() {
  if (regions) return regions;
  const names = new Intl.DisplayNames([typeof navigator === "undefined" ? "en" : navigator.language], { type: "region" });
  const out: Option[] = [];
  for (let a = 65; a <= 90; a++)
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      const name = names.of(code);
      if (name && name !== code && name !== "Unknown Region") out.push({ value: code, label: `${name} (${code})` });
    }
  return (regions = out);
}
const territory = (v: string) => (/^[a-z]{2}$/i.test(v.trim()) ? v.trim().toUpperCase() : null);

const TEXT = ["title", "description", "creator", "copyright"] as const;
const PROVENANCE = ["origin", "generator", "prompt", "parentAssetId", "supersededBy"] as const;
const RIGHTS = ["license", "territories", "channels", "embargo", "expires", "modelRelease"] as const;
/** Rights are replaced whole, so their inputs save together. */
const groupOf = (name: string) => ((RIGHTS as readonly string[]).includes(name) ? "rights" : name);

/** The asset as its form submits it, one string per property: what "changed" is measured against. */
function serverForm(a: Asset, defs: FieldDef[]): Record<string, string> {
  const m = a.metadata ?? {};
  const r = a.rights;
  return {
    ...Object.fromEntries(TEXT.map((k) => [k, m[k] ?? ""])),
    tags: JSON.stringify(a.tags),
    private: a.private ? "on" : "",
    ...Object.fromEntries(relaxInherited(defs, a.inherited).map((d) => [`field:${d.key}`, fieldFormValue(d, a.fields[d.key])])),
    rights: JSON.stringify([r?.license ?? "", r?.territories ?? [], r?.channels ?? [], r?.embargo ?? "", r?.expires ?? "", r?.modelRelease ?? ""]),
    ...Object.fromEntries(PROVENANCE.map((k) => [k, a[k] ?? ""])),
  };
}

/** The form, read the same way. */
function formGroups(form: HTMLFormElement, groups: string[]) {
  const f = new FormData(form);
  const one = (k: string) => String(f.get(k) ?? "");
  const all = (k: string) => f.getAll(k).map(String);
  return Object.fromEntries(
    groups.map((g) => [
      g,
      g === "tags"
        ? JSON.stringify(all("tags"))
        : g === "rights"
          ? JSON.stringify([one("license"), all("territories"), all("channels"), one("embargo"), one("expires"), one("modelRelease")])
          : g === "private"
            ? f.get("private") === "on"
              ? "on"
              : ""
            : one(g),
    ]),
  );
}

/** Zod's tree (z.treeifyError) flattened to [path, message] pairs. */
type Tree = { errors?: string[]; properties?: Record<string, Tree>; items?: (Tree | null)[] };
function issues(node: Tree | undefined, at: string[] = [], out: [string[], string][] = []) {
  if (!node || typeof node !== "object") return out;
  for (const e of node.errors ?? []) out.push([at, e]);
  for (const [k, v] of Object.entries(node.properties ?? {})) issues(v, [...at, k], out);
  (node.items ?? []).forEach((v, i) => v && issues(v, [...at, String(i)], out));
  return out;
}

/** The input a server error is about, by its name in this form; null when no input says it. */
function inputOf(path: string[], defs: FieldDef[]) {
  const [head, next] = path;
  if (head === "fields") return next ? `field:${next}` : null;
  if (head === "rights") return next && (RIGHTS as readonly string[]).includes(next) ? next : null;
  if (([...TEXT, ...PROVENANCE, "tags", "private"] as string[]).includes(head)) return head;
  // Custom field errors come rooted at the fields themselves.
  if (defs.some((d) => d.key === head)) return `field:${head}`;
  return null;
}

/** An error's messages by input name, and what no input can show. */
function mapErrors(error: ApiError | null, defs: FieldDef[]) {
  const byInput: Record<string, string> = {};
  const loose: string[] = [];
  const missing = error?.detail?.missing;
  if (Array.isArray(missing)) for (const k of missing) byInput[`field:${k}`] = "Fill this in before approving.";
  for (const [path, message] of issues(error?.detail as Tree | undefined)) {
    const name = inputOf(path, defs);
    if (name) byInput[name] ??= message.replace(/^Invalid input: /, "");
    else loose.push(message);
  }
  if (!Object.keys(byInput).length) loose.unshift(error?.message ?? "Couldn't save");
  return { byInput, loose };
}

/** Open the fold a property is in, bring it into view, and put the cursor in it. */
function focusProp(form: HTMLFormElement | null, name: string) {
  const slot = form?.querySelector<HTMLElement>(`[data-prop="${CSS.escape(name)}"]`);
  if (!slot) return;
  const fold = slot.closest("details");
  if (fold && !fold.open) fold.open = true;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  slot.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
  slot.querySelector<HTMLElement>("input:not([type=hidden]):not([tabindex='-1']), textarea, button, [tabindex='0']")?.focus({ preventScroll: true });
}

/** What the header menu keeps of assetActions(). */
const MENU = new Set(["copy", "share", "archive", "unarchive", "public", "delete", "restore"]);

const nonNull = <T,>(o: Record<string, T | null>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null)) as Record<string, T>;

/** What the viewer asks of the editor it shows: commit, keys, a dropped file. */
export type EditorControl = {
  /** Commits what is typed; false when a save was refused or didn't reach the server. */
  flush: () => Promise<boolean>;
  /** A viewer key: d, s, C, z, f, a, r. True when it did something. */
  shortcut: (key: string) => boolean;
  /** A file dropped on the open asset: its next version. */
  drop: (file: File) => void;
  /** Puts back what the server has, where something typed didn't save. */
  discard: () => void;
};

/**
 * One asset, as a document: the preview, and its properties edited in place.
 * Each property saves when you leave it (only that property, so a teammate's
 * change to another is never overwritten), and SaveStatus says whether it
 * landed. A refusal shows on the property and puts it back. AssetViewer owns
 * the dialog around it, and remounts this per asset.
 */
export function AssetEditor({
  asset,
  fields,
  collections,
  onClose,
  onSaved,
  onReviewed,
  onOpen,
  onDecided,
  onStep,
  hasPrev,
  hasNext,
  dragging,
  control,
  onDirty,
}: {
  asset: Asset;
  fields: FieldDef[];
  collections: Collection[];
  onClose: () => void;
  onSaved: () => void;
  /** A save or a review action changed the asset. */
  onReviewed: (asset: Asset) => void;
  /** Show another asset instead: another version of this one. */
  onOpen: (id: string) => void;
  /** Approved or rejected: `before` is what Undo puts back. */
  onDecided?: (before: Asset, after: Asset, message: string) => void;
  onStep?: (d: 1 | -1) => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  /** Files are being dragged over the dialog. */
  dragging?: boolean;
  control?: React.Ref<EditorControl>;
  /** Something typed hasn't been saved yet. */
  onDirty?: (dirty: boolean) => void;
}) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const downloadRef = useRef<HTMLAnchorElement>(null);
  const copyRef = useRef<HTMLSpanElement>(null);
  const [sharing, setSharing] = useState<boolean | null>(null);
  const [zoom, setZoom] = useState(false);
  const [theater, setTheater] = useState(false);
  // An embed paints when the other site does: a skeleton until then.
  const [framed, setFramed] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rev, setRev] = useState<Record<string, number>>({});
  const can = useCan();
  const editable = can("asset.edit", asset) && asset.state !== "deleted";
  const router = useRouter();
  const [tags, searchTags] = useTagSearch(useLibraryTags());
  const { upload } = useVersionUpload(asset, (v) => leave(() => onOpen(v)));
  const m = asset.metadata ?? {};
  const relaxed = relaxInherited(fields, asset.inherited);

  // What the server has, as the form says it; `base` is the last of it this form knows.
  const server = serverForm(asset, fields);
  const serverKey = JSON.stringify(server);
  const base = useRef(server);
  const groups = Object.keys(server);
  const keyOf = (g: string) => `${g}:${rev[g] ?? 0}`;
  const bump = (gs: string[]) => gs.length && setRev((r) => ({ ...r, ...Object.fromEntries(gs.map((g) => [g, (r[g] ?? 0) + 1])) }));

  const changed = () => {
    const form = formRef.current;
    if (!form || !editable) return [];
    const now = formGroups(form, groups);
    return groups.filter((g) => now[g] !== base.current[g]);
  };
  const [dirty, setDirty] = useState(false);
  /**
   * The viewer hears "dirty" only once a save has settled and left something
   * behind (it failed): text being typed saves on blur, before any close.
   */
  const check = (settled = false) => {
    const d = changed().length > 0;
    setDirty(d);
    if (settled || !d) onDirty?.(d);
  };

  /** A control holding the cursor, or its open popover, is never swapped out from under it. */
  const focusedIn = (g: string) =>
    [...(formRef.current?.querySelectorAll<HTMLElement>("[data-prop]") ?? [])].some(
      (el) => groupOf(el.dataset.prop!) === g && (el.contains(document.activeElement) || !!el.querySelector("[aria-expanded=true]")),
    );

  /**
   * A change made elsewhere (a review action, a teammate, a refresh): each
   * property you haven't touched takes the server's value, remounted unless
   * it has focus (then on the next blur); one you edited keeps your edit.
   */
  const reconcile = () => {
    const form = formRef.current;
    if (!form) return;
    const now = formGroups(form, groups);
    const stale: string[] = [];
    for (const g of groups) {
      if (server[g] === base.current[g]) continue;
      if (now[g] === base.current[g]) {
        if (focusedIn(g)) continue;
        stale.push(g);
      }
      base.current[g] = server[g];
    }
    bump(stale);
  };
  useEffect(reconcile, [serverKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // One save at a time, in order: each diffs against what the last one left.
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  function flush(extra?: Record<string, unknown>): Promise<Asset | boolean> {
    const next = chain.current.then(() => commit(extra));
    chain.current = next.catch(() => {});
    return next;
  }

  async function commit(extra?: Record<string, unknown>): Promise<Asset | boolean> {
    const form = formRef.current;
    if (!form || (!editable && !extra)) return true;
    const now = formGroups(form, groups);
    const sent = changed();
    const f = new FormData(form);
    const str = (k: string) => String(f.get(k) ?? "");
    const orNull = (k: string) => str(k).trim() || null;
    const body: Record<string, unknown> = {};
    const values: Record<string, unknown> = {};
    const cleared: string[] = [];
    for (const g of sent) {
      if ((TEXT as readonly string[]).includes(g)) body[g] = str(g);
      else if (g === "tags") body.tags = f.getAll("tags").map(String);
      else if (g === "private") body.private = f.get("private") === "on";
      else if (g === "rights")
        // Replaced whole: empty everywhere is stored as no rights at all.
        body.rights = {
          license: orNull("license"),
          territories: f.getAll("territories").map(String),
          channels: f.getAll("channels").map(String),
          embargo: orNull("embargo"),
          expires: orNull("expires"),
          modelRelease: orNull("modelRelease"),
        };
      else if (g.startsWith("field:")) {
        const d = relaxed.find((x) => `field:${x.key}` === g);
        if (!d) continue;
        const v = readFieldValues(f, [d]);
        // A required field can't be cleared: say so, and put it back.
        if (!(d.key in v)) cleared.push(g);
        else values[d.key] = v[d.key];
      } else body[g] = orNull(g);
    }
    if (Object.keys(values).length) body.fields = values;
    if (cleared.length) {
      setErrors((e) => ({ ...e, ...Object.fromEntries(cleared.map((g) => [g, "Required. It keeps its value."])) }));
      bump(cleared);
    }
    const saving = sent.filter((g) => !cleared.includes(g));
    if (!saving.length && !extra) {
      check(true);
      return !cleared.length;
    }

    const payload = { ...body, ...extra };
    // An approval's values go over the typed ones, not instead of them: a cleared field stays cleared.
    if (body.fields && extra?.fields) payload.fields = { ...(body.fields as object), ...(extra.fields as object) };
    const res = await sendResult("PATCH", `/api/v1/assets/${asset.id}`, payload, { quiet: true });
    if (res.ok) {
      for (const g of saving) base.current[g] = now[g];
      setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !saving.includes(groupOf(k)))));
      check(true);
      onReviewed(res.data);
      // What the person may do comes from the server, and private moves it.
      if (saving.includes("private")) router.refresh();
      return res.data as Asset;
    }
    if (res.network) {
      // Kept as typed: Retry sends it again.
      toast.error("Couldn't reach the server", {
        id: "offline",
        duration: 10_000,
        description: "What you typed is still here.",
        action: { label: "Retry", onClick: () => void flush(extra) },
      });
      check(true);
      return false;
    }
    const { byInput, loose } = mapErrors(res.error, fields);
    setErrors((e) => ({ ...e, ...byInput }));
    // A refused property goes back to what the server has; an approval keeps what was typed, to fix and approve again.
    // Only the ones the error names: the rest of the same save stay as typed, and go with the next one.
    if (!extra) {
      const refused = saving.filter((g) => Object.keys(byInput).some((k) => groupOf(k) === g));
      const back = refused.length ? refused : saving;
      bump(back);
      for (const g of back) base.current[g] = server[g];
    }
    if (loose.length) toast.error(loose.join("; "), { duration: 10_000 });
    const first = Object.keys(byInput)[0];
    if (first) setTimeout(() => focusProp(formRef.current, first));
    check(true);
    return false;
  }

  /** Commit, then go: to another asset, a link, out. A refused save stays, to be fixed. */
  function leave(next: () => void) {
    void flush().then((ok) => {
      if (ok !== false) next();
    });
  }

  // A refresh or a closed tab would drop what is typed and not yet saved.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** Every suggestion taken, with what the form says: its tags, its values over the suggested ones. */
  const approving = useRef(false);
  async function approve() {
    const form = formRef.current;
    // Once: the A key and the button are both a way in.
    if (!form || approving.current) return;
    approving.current = true;
    try {
      await approveNow(form);
    } finally {
      approving.current = false;
    }
  }
  async function approveNow(form: HTMLFormElement) {
    setApproveError(null);
    const data = new FormData(form);
    const typed = nonNull(readFieldValues(data, fields));
    const suggested = Object.fromEntries(Object.entries(asset.proposedFields ?? {}).filter(([k]) => fields.some((d) => d.key === k)));
    const missing = missingRequired(fields, { ...asset.inherited, ...asset.fields, ...suggested, ...typed });
    if (missing.length) {
      setErrors((e) => ({ ...e, ...Object.fromEntries(missing.map((d) => [`field:${d.key}`, "Fill this in before approving."])) }));
      setApproveError(`Fill in ${missing.map((d) => d.label).join(", ")} first.`);
      focusProp(form, `field:${missing[0].key}`);
      return;
    }
    const body = approveBody(asset, {
      tags: [...new Set([...data.getAll("tags").map(String), ...asset.proposedTags])],
      fields: { ...suggested, ...typed },
    });
    const next = await flush(body);
    if (typeof next === "object") onDecided?.(asset, next, asset.status === "active" ? "Accepted the suggestions" : "Approved");
    else if (next === false) setApproveError("It didn't go through. Check the fields marked above.");
  }

  const embed = embedUrl(asset);
  const svg = asset.mime === "image/svg+xml";
  // An icon is drawn at glyph sizes, not fit to the pane; actual pixels of a 24px icon say nothing.
  const icon = !embed && isIcon(asset);
  const image = !embed && !icon && hasPreview(asset) && !asset.mime.startsWith("video/") && !asset.mime.startsWith("audio/") && !isLottie(asset);
  const zoomable = image;
  const backdrop = image || icon;

  const control_: EditorControl = {
    flush: () => flush().then((ok) => ok !== false),
    shortcut: (key) => {
      const review = can("asset.review", asset);
      const proposed = asset.status === "proposed";
      switch (key) {
        case "d":
          downloadRef.current?.click();
          return true;
        case "s":
          setSharing(true);
          return true;
        case "C":
          copyRef.current?.querySelector("button")?.click();
          return true;
        case "z":
          if (!zoomable) return false;
          setZoom((z) => !z);
          return true;
        case "f":
          setTheater((t) => !t);
          return true;
        case "a":
          if (!review || !(proposed || asset.proposedTags.length || Object.keys(asset.proposedFields ?? {}).length)) return false;
          void approve();
          return true;
        case "r":
          if (!review || !proposed) return false;
          setRejecting(true);
          return true;
      }
      return false;
    },
    drop: (file) => {
      if (!can("asset.version", asset)) return void toast.error("You can't add versions to this asset");
      void upload(file);
    },
    discard: () => {
      const gone = changed();
      for (const g of gone) base.current[g] = server[g];
      bump(gone);
      setDirty(false);
    },
  };
  useImperativeHandle(control, () => control_);

  // Where each inherited value comes from: the oldest collection that sets it wins.
  const sources: Record<string, string> = {};
  for (const c of collections
    .filter((c) => asset.collections.includes(c.id))
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))) {
    for (const k of Object.keys(c.fields)) sources[k] ??= c.name;
  }

  const [bg, setBg] = usePreviewBg(asset.mime);
  const facts = [
    asset.width && asset.height ? `${asset.width} × ${asset.height}` : null,
    formatBytes(asset.size),
    m.camera,
    m.capturedAt?.slice(0, 10),
  ].filter(Boolean);
  const name = m.title || asset.filename;
  // Anything a reader would see under Details: without it, they're told so rather than shown a bare heading.
  const described =
    !!(m.description || m.creator || m.copyright) ||
    asset.tags.length > 0 ||
    asset.collections.length > 0 ||
    Object.keys(asset.fields).length > 0 ||
    Object.keys(asset.inherited).length > 0;
  const pending = asset.proposedTags.length > 0 || Object.keys(asset.proposedFields ?? {}).length > 0;
  const link = () => new URL(`/?asset=${asset.id}`, location.origin).href;

  // The library's own menu, less what this view already has a place for (open, download, approve, reject).
  // A delete closes the viewer once it has gone through.
  const deleting = useRef(false);
  const menu = assetActions(asset, can, {
    onOpen: () => {},
    onShare: () => setSharing(true),
    onChanged: () => {
      if (deleting.current) onClose();
      deleting.current = false;
      onSaved();
    },
    local: (fn) => {
      deleting.current = fn(asset) === null;
      return () => void (deleting.current = false);
    },
  })
    .map((g) =>
      g
        .filter((it) => MENU.has(it.id))
        .map((it) =>
          it.id === "copy" ? { ...it, shortcut: <Kbd keys={["⇧", "C"]} /> } : it.id === "share" ? { ...it, shortcut: <Kbd keys={["S"]} /> } : it,
        ),
    )
    .filter((g) => g.length > 0);

  // Dragged out to Figma, Keynote or the desktop: the original file, not the preview's WebP.
  const dragOut = (e: React.DragEvent) => {
    const url = new URL(`/a/${asset.id}?download`, location.origin).href;
    e.dataTransfer.setData("DownloadURL", `${asset.mime}:${asset.filename}:${url}`);
    // Another app fetches a link without the session, so only a public file's works there.
    if (asset.public) e.dataTransfer.setData("text/uri-list", new URL(`/a/${asset.id}`, location.origin).href);
  };

  const field = (name: string) => ({
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": describedBy(`${id}-${name}`, { error: errors[name] }),
  });

  return (
    <>
      <div
        className={cn(
          "animate-in fade-in-0 flex min-h-64 flex-col border-b duration-150 max-md:h-[45dvh] md:min-h-0 md:border-r md:border-b-0",
          // The picked background is for images and icons; a video, a font or a file keeps the plain well.
          PREVIEW_BG[backdrop ? bg : "auto"],
          theater && "max-md:h-dvh md:col-span-2 md:border-r-0",
        )}
      >
        <div className="group/preview relative flex min-h-0 flex-1 items-center justify-center">
          {embed ? (
            <>
              {!framed && <Skeleton className="absolute inset-0 rounded-none" />}
              <iframe
                src={embed}
                title={name}
                allowFullScreen
                onLoad={() => setFramed(true)}
                className="absolute inset-0 size-full"
              />
            </>
          ) : asset.mime.startsWith("video/") ? (
            // The original, streamed in ranges; the derived frame shows until it plays.
            <video
              src={`/a/${asset.id}`}
              poster={hasPreview(asset) ? `/a/${asset.id}/w_1280,f_webp` : undefined}
              controls
              playsInline
              preload="metadata"
              className="absolute inset-0 size-full object-contain p-6"
            />
          ) : asset.mime.startsWith("audio/") ? (
            <audio src={`/a/${asset.id}`} controls preload="metadata" className="w-full px-6" />
          ) : isLottie(asset) ? (
            <Lottie src={`/a/${asset.id}`} className="absolute inset-0 p-6" />
          ) : icon ? (
            <div draggable onDragStart={dragOut} className="absolute inset-0">
              <IconStage asset={asset} bg={bg} name={name} />
            </div>
          ) : image ? (
            <div
              draggable
              onDragStart={dragOut}
              onDoubleClick={() => setZoom((z) => !z)}
              className={cn("absolute inset-0", zoom ? "cursor-zoom-out overflow-auto" : "cursor-zoom-in")}
            >
              {zoom ? (
                // Actual pixels, panned by scrolling. An SVG stays the vector: an <img> runs no script.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={svg ? `/a/${asset.id}` : `/a/${asset.id}/f_webp`}
                  alt={name}
                  draggable={false}
                  style={asset.width ? { width: asset.width } : undefined}
                  className="m-auto block max-w-none p-6"
                />
              ) : svg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/a/${asset.id}`} alt={name} draggable={false} className="size-full object-contain p-6" />
              ) : (
                <Thumb
                  src={`/a/${asset.id}/w_640,f_webp`}
                  alt={name}
                  eager
                  // The card's rendition, already cached: shown at once, sharpened when this lands.
                  placeholder={`/a/${asset.id}/w_${typeof devicePixelRatio !== "undefined" && devicePixelRatio > 1 ? 520 : 260},f_webp`}
                  className="p-6"
                />
              )}
            </div>
          ) : isFont(asset.mime, asset.filename) ? (
            <FontPlayground id={asset.id} />
          ) : (
            <Empty className="border-0 p-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconPhoto />
                </EmptyMedia>
                <EmptyTitle>No preview</EmptyTitle>
                <EmptyDescription>Download it to open this {fileTypeBadge(asset.filename, asset.mime, asset.probe)} file.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {/* How it is looked at: behind it, how big, how much of the window. */}
          <div className="bg-background/80 absolute top-3 left-3 flex items-center gap-1 rounded-md border p-0.5 shadow-xs backdrop-blur">
            {backdrop && (
              <ToggleGroup
                type="single"
                size="sm"
                value={bg === "auto" ? "" : bg}
                onValueChange={(v) => v && setBg(v as PreviewBg)}
                aria-label="Background"
              >
                {(
                  [
                    ["checker", "Transparency grid"],
                    ["light", "White"],
                    ["dark", "Black"],
                  ] as const
                ).map(([v, label]) => (
                  <ToggleGroupItem key={v} value={v} aria-label={label} title={label} className="px-2">
                    <span className={cn("size-3.5 rounded-sm ring-1 ring-black/15 dark:ring-white/20", PREVIEW_BG[v])} />
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
            {zoomable && (
              <IconButton variant="ghost" size="icon-xs" label={zoom ? "Fit" : "Actual size"} shortcut={["Z"]} onClick={() => setZoom((z) => !z)}>
                {zoom ? <IconZoomOut /> : <IconZoomIn />}
              </IconButton>
            )}
            <IconButton
              variant="ghost"
              size="icon-xs"
              label={theater ? "Show the properties" : "Theater"}
              shortcut={["F"]}
              onClick={() => setTheater((t) => !t)}
            >
              {theater ? <IconArrowsMinimize /> : <IconArrowsMaximize />}
            </IconButton>
          </div>

          {onStep && hasPrev && (
            <IconButton
              label="Previous"
              shortcut={["←"]}
              variant="secondary"
              onClick={() => onStep(-1)}
              className="absolute top-1/2 left-3 -translate-y-1/2 opacity-0 shadow-sm transition-opacity group-hover/preview:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
            >
              <IconChevronLeft />
            </IconButton>
          )}
          {onStep && hasNext && (
            <IconButton
              label="Next"
              shortcut={["→"]}
              variant="secondary"
              onClick={() => onStep(1)}
              className="absolute top-1/2 right-3 -translate-y-1/2 opacity-0 shadow-sm transition-opacity group-hover/preview:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
            >
              <IconChevronRight />
            </IconButton>
          )}

          {dragging && (
            <div className="bg-background/85 animate-in fade-in-0 absolute inset-3 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm font-medium duration-150">
              <IconUpload className="text-muted-foreground size-6" />
              Drop to add a new version
            </div>
          )}
        </div>
        <div className="bg-popover flex items-center gap-1.5 border-t px-4 py-3">
          <Badge variant="outline">{fileTypeBadge(asset.filename, asset.mime, asset.probe)}</Badge>
          <span className="text-muted-foreground truncate text-xs tabular-nums">{facts.join(" · ")}</span>
          <span className="ml-auto" />
          {/* One way out: who can open it is asked in the dialog. */}
          <IconButton label="Share" shortcut={["S"]} onClick={() => setSharing(true)}>
            <IconShare />
          </IconButton>
          {sharing !== null && (
            <ShareDialog
              open={sharing}
              target={{
                kind: "view",
                asset: {
                  id: asset.id,
                  name,
                  public: asset.public,
                  shareable: asset.status === "active" && can("asset.share", asset),
                },
              }}
              onClose={() => setSharing(false)}
              onChanged={(a) => onReviewed({ ...asset, public: a.public })}
            />
          )}
          <span ref={copyRef} className="contents">
            <CopyButton label="Copy link" what="the link" size="icon-sm" variant="outline" shortcut={["⇧", "C"]} text={async () => link()} />
          </span>
          {/* An SVG pastes into Figma or code as markup: copied, not downloaded. */}
          {svg && (
            <CopyButton
              label="Copy SVG"
              what="the SVG"
              size="icon-sm"
              variant="outline"
              icon={IconCode}
              text={() => fetch(`/a/${asset.id}`).then((r) => (r.ok ? r.text() : null))}
            />
          )}
          {hasPreview(asset) && <Renditions asset={asset} />}
          {/* The file as stored, with the fields written in: what is typed is saved first. */}
          <IconButton label="Download the original" shortcut={["D"]} asChild>
            <a
              ref={downloadRef}
              href={`/a/${asset.id}?download`}
              download
              onClick={(e) => {
                if (e.currentTarget.dataset.flushed) return void delete e.currentTarget.dataset.flushed;
                e.preventDefault();
                const a = e.currentTarget;
                void flush().then(() => {
                  a.dataset.flushed = "1";
                  a.click();
                });
              }}
            >
              <IconDownload />
            </a>
          </IconButton>
        </div>
      </div>

      <form
        ref={formRef}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void flush();
        }}
        onInput={() => check()}
        onBlur={(e) => {
          // Leaving a field saves it; a picker saves on pick, through onChange. A popover's
          // search box is portaled out of the form, though React bubbles its events here.
          if (!e.currentTarget.contains(e.target as Node)) return;
          if ((e.target as Element).matches("input:not([type=hidden]), textarea")) setTimeout(() => (reconcile(), void flush()));
        }}
        onKeyDown={(e) => {
          // A picker's list (cmdk) has already taken its Enter; keys from portals aren't the form's.
          if (e.defaultPrevented || !e.currentTarget.contains(e.target as Node)) return;
          const t = e.target as HTMLElement;
          const mod = e.metaKey || e.ctrlKey;
          if (e.key === "Enter" && mod) {
            e.preventDefault();
            e.currentTarget.requestSubmit();
          } else if (e.key === "Enter" && !e.shiftKey && !e.altKey && t instanceof HTMLInputElement && t.type !== "hidden") {
            // Enter confirms the field and moves on, as in Notion; it never closes anything.
            e.preventDefault();
            const all = [
              ...e.currentTarget.querySelectorAll<HTMLElement>("input:not([type=hidden]):not([tabindex='-1']), textarea, button:not([tabindex='-1'])"),
            ].filter((el) => !(el as HTMLButtonElement).disabled && el.offsetParent !== null);
            const next = all[all.indexOf(t) + 1];
            if (next) next.focus();
            else t.blur();
          }
        }}
        className={cn("animate-in fade-in-0 flex min-h-0 flex-col duration-150 md:h-full", theater && "hidden")}
      >
        <ReadOnly.Provider value={!editable}>
          {/* The dialog's header, like every page's, ends with For agents. */}
          <div className="bg-popover/95 flex items-start gap-2 border-b px-6 pt-5 pb-3 backdrop-blur md:pr-12 max-md:sticky max-md:top-0 max-md:z-10">
            <div className="min-w-0 flex-1">
              <DialogTitle className="sr-only">{name}</DialogTitle>
              <DialogDescription className="sr-only">
                {asset.filename}. {editable ? "Changes save as you go." : "You can look at this one, not change it."}
              </DialogDescription>
              {editable ? (
                <div data-prop="title" className="group/title relative">
                  <textarea
                    key={keyOf("title")}
                    name="title"
                    rows={1}
                    defaultValue={m.title ?? ""}
                    placeholder={asset.filename}
                    maxLength={2000}
                    aria-label="Title"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                    className={cn(
                      // The pencil's room on the right, so a long title never runs under it.
                      "hover:bg-muted/60 hover:ring-input focus-visible:bg-background focus-visible:ring-ring/50 placeholder:text-foreground/75 -mx-1.5 block w-[calc(100%+0.75rem)] resize-none rounded-md bg-transparent py-0.5 pr-7 pl-1.5 text-lg leading-snug font-semibold outline-none field-sizing-content hover:ring-1 focus-visible:ring-2",
                      m.title ? "break-words" : "break-all",
                    )}
                  />
                  <IconPencil
                    aria-hidden
                    className="text-muted-foreground pointer-events-none absolute top-1.5 -right-1 size-4 opacity-40 transition-opacity group-focus-within/title:opacity-0 group-hover/title:opacity-100 motion-reduce:transition-none"
                  />
                </div>
              ) : (
                <p className={cn("text-lg leading-snug font-semibold", m.title ? "break-words" : "break-all")}>{name}</p>
              )}
              {m.title ? (
                <p className="text-muted-foreground mt-0.5 truncate text-xs">{asset.filename}</p>
              ) : (
                editable && <p className="text-muted-foreground mt-0.5 text-xs">No title yet: click the name to give it one.</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {/* Under the title, not beside it: the title keeps the header's width. */}
                <SaveStatus
                  className="order-last ml-auto"
                  fallback={
                    <span suppressHydrationWarning title={new Date(asset.updatedAt).toLocaleString()}>
                      Edited {ago(asset.updatedAt)}
                    </span>
                  }
                />
                <StatusBadges asset={asset} />
                {!editable && asset.state !== "deleted" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" tabIndex={0} className="text-muted-foreground">
                        <IconEye /> View only
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-64">You can look at this one, not change it. Ask an editor of its collection for edit access.</TooltipContent>
                  </Tooltip>
                )}
                <BrandRules assetId={asset.id} leave={leave} />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <ForAgents
                subject="This asset"
                about="What an agent reads before using this asset: its title, credit and fields, the brand rules that point at it, and ready-made sizes."
                reads={(origin) => [
                  { label: "MCP tool", text: call("describe_asset", { id: asset.id }) },
                  ...(hasPreview(asset)
                    ? [{ label: "A size to hand out", text: call("rendition_url", { id: asset.id, width: 1200, format: "webp" }) }]
                    : []),
                  { label: "REST", text: curl(`${origin}/api/v1/assets/${asset.id}/description`) },
                ]}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton variant="ghost" label="More">
                    <IconDots />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {menu.map((g, i) => (
                    <Fragment key={i}>
                      {i > 0 && <DropdownMenuSeparator />}
                      {g.map((it) => (
                        <DropdownMenuItem key={it.id} variant={it.destructive ? "destructive" : "default"} onSelect={it.run}>
                          {it.icon} {it.label}
                          {it.shortcut && <DropdownMenuShortcut>{it.shortcut}</DropdownMenuShortcut>}
                        </DropdownMenuItem>
                      ))}
                    </Fragment>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {/* On a phone the sheet scrolls under this header, so its close lives here, not in the corner. */}
              <DialogClose asChild>
                <IconButton variant="ghost" label="Close" className="md:hidden">
                  <IconX />
                </IconButton>
              </DialogClose>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 content-start gap-4 px-6 py-4 md:overflow-y-auto">
            <Can do="asset.review" on={asset}>
              <Review
                asset={asset}
                fields={fields}
                formRef={formRef}
                flush={flush}
                onDecided={onDecided}
                rejecting={rejecting}
                setRejecting={setRejecting}
                approve={approve}
                approveLabel={pending && asset.status === "proposed" ? "Approve with suggestions" : "Approve"}
                approveError={approveError}
              />
            </Can>
            <Lifecycle asset={asset} onChanged={onReviewed} approve={approve} />
            {asset.supersededBy && (
              <Replaced by={asset.supersededBy} stacked={!!asset.stackId} onOpen={(to) => leave(() => onOpen(to))} />
            )}

            <Writable do="asset.edit" on={asset} when={editable}>
              {editable && <EditHint />}
              <Group title="Details">
                {editable ? (
                  <div data-prop="description">
                    <Textarea
                      key={keyOf("description")}
                      id={`${id}-description`}
                      name="description"
                      defaultValue={m.description ?? ""}
                      maxLength={2000}
                      rows={1}
                      aria-label="Description"
                      placeholder="Add a description: what it shows, where it is used"
                      className={cn(ghost, "-mx-3 min-h-9 w-[calc(100%+1.5rem)] resize-none field-sizing-content")}
                      {...field("description")}
                    />
                    {errors.description && (
                      <p id={`${id}-description-error`} role="alert" className="text-destructive text-xs">
                        {errors.description}
                      </p>
                    )}
                  </div>
                ) : m.description ? (
                  <p className="pb-1 text-sm whitespace-pre-wrap">{m.description}</p>
                ) : (
                  !described && <p className="text-muted-foreground text-sm">Nothing written about it yet.</p>
                )}
                <Property label="Tags" htmlFor={`${id}-tags`} error={errors.tags} text={asset.tags.length ? <ChipList values={asset.tags} /> : null}>
                  <div data-prop="tags">
                    <MultiCombobox
                      key={keyOf("tags")}
                      id={`${id}-tags`}
                      name="tags"
                      options={tags}
                      defaultValue={asset.tags}
                      placeholder="Add tags"
                      creatable
                      onSearch={searchTags}
                      onChange={() => setTimeout(() => void flush())}
                      {...field("tags")}
                    />
                  </div>
                </Property>
                {collections.length > 0 && (
                  <CollectionsProperty asset={asset} collections={collections} id={`${id}-collections`} onSaved={onSaved} />
                )}
                {fields.length > 0 && (
                  <FieldInputs
                    rows
                    defs={fields}
                    values={asset.fields}
                    inherited={asset.inherited}
                    sources={sources}
                    errors={Object.fromEntries(fields.map((d) => [d.key, errors[`field:${d.key}`]]))}
                    revs={Object.fromEntries(fields.map((d) => [d.key, rev[`field:${d.key}`] ?? 0]))}
                    onChange={() => void flush()}
                  />
                )}
                {(["creator", "copyright"] as const).map((k) => (
                  <Property key={k} label={k === "creator" ? "Creator" : "Copyright"} htmlFor={`${id}-${k}`} error={errors[k]} text={m[k]}>
                    <div data-prop={k}>
                      <Input
                        key={keyOf(k)}
                        id={`${id}-${k}`}
                        name={k}
                        defaultValue={m[k] ?? ""}
                        maxLength={2000}
                        placeholder={k === "creator" ? "Who made it" : "Add a copyright line"}
                        className={ghost}
                        {...field(k)}
                      />
                    </div>
                  </Property>
                ))}
              </Group>

              {(editable || asset.private) && (
                <Group title="Access">
                  <Property
                    label={
                      <>
                        <IconLock className="size-3.5" /> Private
                      </>
                    }
                    htmlFor={`${id}-private`}
                    text={asset.private ? "Yes: only people added, and admins" : null}
                  >
                    <div data-prop="private" className="flex min-h-9 items-center gap-2">
                      <Switch
                        key={keyOf("private")}
                        id={`${id}-private`}
                        name="private"
                        defaultChecked={!!asset.private}
                        onCheckedChange={() => setTimeout(() => void flush())}
                      />
                      <span className="text-muted-foreground text-xs">Only people you add, and admins, see it.</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" aria-label="More about private" className="text-muted-foreground hover:text-foreground rounded-full">
                            <IconInfoCircle className="size-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-64">
                          People added to one of its collections see it too. In only private collections, it is private anyway.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </Property>
                </Group>
              )}

              <div className="grid gap-3">
                <RightsInputs asset={asset} k={keyOf("rights")} errors={errors} onChange={() => setTimeout(() => void flush())} />
                <ProvenanceInputs asset={asset} k={keyOf} errors={errors} onOpen={(to) => leave(() => onOpen(to))} onChange={() => setTimeout(() => void flush())} />
                <FileFacts asset={asset} />
              </div>
            </Writable>
            <Versions asset={asset} onChanged={onReviewed} onOpen={(v) => leave(() => onOpen(v))} />
          </div>
        </ReadOnly.Provider>
      </form>
    </>
  );
}

/** A titled part of the panel: what is in it says itself, before anything is opened. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-0.5">
      <h3 id={id} className="py-1 text-sm font-medium">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Said once, until dismissed: every value in the panel is a field, and what
 * is typed saves itself. A ghost field reads as text, so without this the
 * panel reads as a record to look at.
 */
function EditHint() {
  const [seen, setSeen] = usePref("artbucket:tip:asset-edit", false);
  if (seen) return null;
  return (
    <div role="note" className="bg-muted/50 animate-in fade-in-0 flex items-start gap-2.5 rounded-lg border p-3 text-xs">
      <IconPencil className="text-muted-foreground mt-px size-3.5 shrink-0" />
      <p className="text-muted-foreground flex-1">
        <span className="text-foreground font-medium">Click any value to change it.</span> Each saves as you leave it, and goes out
        with the file when it is downloaded.
      </p>
      <button
        type="button"
        onClick={() => setSeen(true)}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 -my-0.5 rounded px-1 font-medium outline-none focus-visible:ring-2"
      >
        Got it
      </button>
    </div>
  );
}

/** What the file itself says, and when it came: read, never edited. */
function FileFacts({ asset }: { asset: Asset }) {
  const m = asset.metadata ?? {};
  const type = fileTypeBadge(asset.filename, asset.mime, asset.probe);
  const size = asset.width && asset.height ? `${asset.width} × ${asset.height}` : null;
  const when = (d: string) => new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const rows: [string, React.ReactNode][] = [
    ["File name", <span key="f" className="break-all">{asset.filename}</span>],
    ["Type", `${type} (${asset.mime})`],
    ["Dimensions", size && `${size} px`],
    ["Size", formatBytes(asset.size)],
    ["Taken", m.capturedAt && new Date(m.capturedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })],
    ["Camera", m.camera],
    ["Lens", m.lens],
    [
      "Location",
      m.gps && (
        <a
          key="gps"
          href={`https://www.openstreetmap.org/?mlat=${m.gps.lat}&mlon=${m.gps.lon}#map=15/${m.gps.lat}/${m.gps.lon}`}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          {m.gps.lat.toFixed(4)}, {m.gps.lon.toFixed(4)}
        </a>
      ),
    ],
    ["Added", <span key="a" suppressHydrationWarning>{when(asset.createdAt)}</span>],
    ["Last changed", <span key="u" suppressHydrationWarning>{when(asset.updatedAt)}</span>],
  ];
  return (
    <Fold title="File" summary={[type, size, formatBytes(asset.size)].filter(Boolean).join(" · ")} remember="file">
      <dl className="grid gap-x-2 gap-y-1.5 text-sm [grid-template-columns:7rem_minmax(0,1fr)]">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <Fragment key={k}>
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="min-w-0">{v}</dd>
            </Fragment>
          ))}
      </dl>
    </Fold>
  );
}

/**
 * An icon, looked at: big, and at the sizes it runs at, crisp as the vector.
 * One drawn in one ink takes the color of what is around it, so it is shown
 * in the text's color on the chosen background, and says so.
 */
function IconStage({ asset, bg, name }: { asset: Asset; bg: PreviewBg | "auto"; name: string }) {
  const src = `/a/${asset.id}`;
  const mono = isMono(asset);
  const ink = bg === "dark" ? "text-white" : bg === "light" ? "text-neutral-900" : "text-foreground";
  return (
    <div className={cn("absolute inset-0 flex flex-col items-center justify-center gap-8 p-6", ink)}>
      <IconGlyph src={src} mono={mono} label={name} className="size-32 md:size-48" />
      <div className="flex items-end gap-6" role="group" aria-label="At the sizes it runs at">
        {[16, 24, 32, 48].map((px) => (
          <figure key={px} className="flex flex-col items-center gap-1.5">
            <IconGlyph src={src} mono={mono} style={{ width: px, height: px }} />
            <figcaption className="text-2xs tabular-nums opacity-60">{px}</figcaption>
          </figure>
        ))}
      </div>
      {mono && <p className="text-2xs max-w-56 text-center opacity-60">One color: it takes the color of the text around it.</p>}
    </div>
  );
}

/** Chips a reader sees, where an editor has the picker. */
function ChipList({ values }: { values: string[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {values.map((v) => (
        <Badge key={v} variant="secondary">
          {v}
        </Badge>
      ))}
    </span>
  );
}

/**
 * Membership, saved per collection as it changes. Only collections the
 * person may change are offered; the others it is in show as locked chips.
 * A refusal names the collection and takes the chip back.
 */
function CollectionsProperty({
  asset,
  collections,
  id,
  onSaved,
}: {
  asset: Asset;
  collections: Collection[];
  id: string;
  onSaved: () => void;
}) {
  const can = useCan();
  const [inCols, setInCols] = useState(asset.collections);
  const [seen, setSeen] = useState(asset.collections.join());
  if (asset.collections.join() !== seen) {
    setSeen(asset.collections.join());
    setInCols(asset.collections);
  }
  const options: Option[] = collections
    .filter((c) => can("collection.edit", c) || asset.collections.includes(c.id))
    .map((c) => ({ value: c.id, label: c.name, hint: c.count, locked: !can("collection.edit", c) }));
  const nameOf = (cid: string) => collections.find((c) => c.id === cid)?.name ?? "a collection";

  async function change(next: string[]) {
    const before = inCols;
    setInCols(next);
    const moves = collections.flatMap((c) => {
      const had = before.includes(c.id);
      return had === next.includes(c.id) ? [] : [{ c, add: !had }];
    });
    const results = await Promise.all(
      moves.map(({ c, add }) =>
        sendResult("POST", `/api/v1/collections/${c.id}/assets`, add ? { add: [asset.id] } : { remove: [asset.id] }, { quiet: true }).then(
          (r) => ({ c, add, ok: r.ok }),
        ),
      ),
    );
    const failed = results.filter((r) => !r.ok);
    if (failed.length) {
      const names = (add: boolean) =>
        failed
          .filter((r) => r.add === add)
          .map((r) => nameOf(r.c.id))
          .join(", ");
      toast.error([names(true) && `Couldn't add to ${names(true)}`, names(false) && `Couldn't remove from ${names(false)}`].filter(Boolean).join(". "));
      setInCols((cur) => {
        let out = cur;
        for (const r of failed) out = r.add ? out.filter((x) => x !== r.c.id) : [...out, r.c.id];
        return out;
      });
    }
    if (results.some((r) => r.ok)) onSaved();
  }

  return (
    <Property label="Collections" htmlFor={id} text={inCols.length ? <ChipList values={inCols.map(nameOf)} /> : null}>
      <div data-prop="collection">
        <MultiCombobox id={id} options={options} value={inCols} onChange={(v) => void change(v)} placeholder="Add to a collection" />
      </div>
    </Property>
  );
}

const MODEL_RELEASE: Option[] = [
  { value: "released", label: "Signed" },
  { value: "missing", label: "Missing: editorial use only" },
  { value: "not-needed", label: "Not needed" },
];
const ORIGIN: Option[] = [
  { value: "shot", label: "Shot or made in house" },
  { value: "licensed", label: "Licensed" },
  { value: "generated", label: "Generated by a model" },
];

const localDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString();
const today = () => new Date().toISOString().slice(0, 10);

function rightsSummary(r: Asset["rights"]) {
  const parts = [
    r?.license,
    r?.territories?.length ? r.territories.join(", ") : null,
    r?.channels?.length ? r.channels.join(", ") : null,
    r?.embargo && `from ${localDate(r.embargo)}`,
    r?.expires && `until ${localDate(r.expires)}`,
    r?.modelRelease === "missing" && "editorial only",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Any use, anywhere";
}

function provenanceSummary(a: Asset) {
  const parts = [
    a.origin && ORIGIN.find((o) => o.value === a.origin)?.label,
    a.generator,
    a.c2pa && "Content Credentials",
    a.supersededBy && "replaced",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Nothing recorded";
}

/** A date that says what it does as you pick it: a past last day takes links down, a future embargo holds them. */
function DateProperty({
  label,
  name,
  value,
  error,
  says,
}: {
  label: string;
  name: string;
  value: string;
  error?: string;
  says: (v: string) => { text: string; warn: boolean } | null;
}) {
  const id = useId();
  const [v, setV] = useState(value);
  const note = v ? says(v) : null;
  const noteId = `${id}-note`;
  return (
    <Property label={label} htmlFor={id} error={error} text={value && localDate(value)}>
      <div data-prop={name} className="grid gap-1">
        <Input
          id={id}
          name={name}
          type="date"
          defaultValue={value}
          onChange={(e) => setV(e.target.value)}
          className={ghost}
          aria-invalid={error ? true : undefined}
          aria-describedby={[note && noteId, describedBy(id, { error })].filter(Boolean).join(" ") || undefined}
        />
        {note && (
          <p id={noteId} className={cn("text-xs", note.warn ? "text-destructive" : "text-muted-foreground")}>
            {note.text}
          </p>
        )}
      </div>
    </Property>
  );
}

/** What it may be used for. /api/v1/check reads these; empty means unrestricted. */
function RightsInputs({
  asset,
  k,
  errors,
  onChange,
}: {
  asset: Asset;
  k: string;
  errors: Record<string, string>;
  onChange: () => void;
}) {
  const id = useId();
  const r = asset.rights;
  const err = (n: string) => ({
    "aria-invalid": errors[n] ? true : undefined,
    // Territories and channels say what empty means, under the value.
    "aria-describedby": describedBy(`${id}-${n}`, { hint: n === "territories" || n === "channels", error: errors[n] }),
  });
  return (
    <Fold title="Rights" summary={rightsSummary(r)} remember="rights">
      {/* Keyed as one: rights save whole, so a refusal puts them all back. */}
      <div key={k} className="grid gap-0.5">
        <Property label="License" htmlFor={`${id}-license`} error={errors.license} text={r?.license}>
          <div data-prop="license">
            <Input
              id={`${id}-license`}
              name="license"
              defaultValue={r?.license ?? ""}
              maxLength={200}
              placeholder="e.g. Royalty-free, CC BY 4.0"
              className={ghost}
              {...err("license")}
            />
          </div>
        </Property>
        <Property
          label="Territories"
          htmlFor={`${id}-territories`}
          hint="Empty: anywhere."
          error={errors.territories}
          text={r?.territories?.length ? <ChipList values={r.territories} /> : "Anywhere"}
        >
          <div data-prop="territories">
            <MultiCombobox
              id={`${id}-territories`}
              name="territories"
              options={regionOptions()}
              defaultValue={r?.territories ?? []}
              placeholder="Anywhere"
              creatable
              validate={territory}
              invalid="Two-letter country codes, e.g. DE."
              onChange={onChange}
              {...err("territories")}
            />
          </div>
        </Property>
        <Property
          label="Channels"
          htmlFor={`${id}-channels`}
          hint="Empty: any use."
          error={errors.channels}
          text={r?.channels?.length ? <ChipList values={r.channels} /> : "Any use"}
        >
          <div data-prop="channels">
            <MultiCombobox
              id={`${id}-channels`}
              name="channels"
              options={CHANNELS.map((value) => ({ value }))}
              defaultValue={r?.channels ?? []}
              placeholder="Any use"
              creatable
              onChange={onChange}
              {...err("channels")}
            />
          </div>
        </Property>
        <DateProperty
          label="Not before"
          name="embargo"
          value={r?.embargo ?? ""}
          error={errors.embargo}
          says={(v) => (v > today() ? { text: `Links start working on ${localDate(v)}.`, warn: false } : null)}
        />
        <DateProperty
          label="Last day of use"
          name="expires"
          value={r?.expires ?? ""}
          error={errors.expires}
          says={(v) => (v < today() ? { text: "This date has passed: saving takes its public and shared links down now.", warn: true } : null)}
        />
        <Property
          label="Model release"
          htmlFor={`${id}-release`}
          error={errors.modelRelease}
          text={MODEL_RELEASE.find((o) => o.value === r?.modelRelease)?.label}
        >
          <div data-prop="modelRelease">
            <Combobox
              id={`${id}-release`}
              name="modelRelease"
              options={MODEL_RELEASE}
              defaultValue={r?.modelRelease ?? ""}
              placeholder="Unknown"
              onChange={onChange}
              {...err("modelRelease")}
            />
          </div>
        </Property>
      </div>
    </Fold>
  );
}

/** Where it came from, and what replaced it. Content Credentials are read from the file, not edited. */
function ProvenanceInputs({
  asset,
  k,
  errors,
  onOpen,
  onChange,
}: {
  asset: Asset;
  k: (g: string) => string;
  errors: Record<string, string>;
  onOpen: (id: string) => void;
  onChange: () => void;
}) {
  const id = useId();
  const c = asset.c2pa;
  const err = (n: string) => ({ "aria-invalid": errors[n] ? true : undefined, "aria-describedby": describedBy(`${id}-${n}`, { error: errors[n] }) });
  return (
    <Fold title="Provenance" summary={provenanceSummary(asset)} remember="provenance">
      {c && (
        <div className="bg-muted/40 grid gap-1 rounded-lg border p-3 text-xs">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <IconCertificate className="size-4" /> Content Credentials
          </p>
          <p className="text-muted-foreground">
            {[
              c.signedBy && `Signed by ${c.signedBy}`,
              c.generator && `with ${c.generator}`,
              c.softwareAgent && `made by ${c.softwareAgent}`,
            ]
              .filter(Boolean)
              .join(", ") || "A manifest with nothing to show"}
            . {c.actions.length > 0 && `Actions: ${c.actions.map((a) => a.replace(/^c2pa\./, "")).join(", ")}. `}
            Kept intact in the original and in downloads; not verified here.
          </p>
        </div>
      )}
      <div className="grid gap-0.5">
        <Property label="Origin" htmlFor={`${id}-origin`} error={errors.origin} text={ORIGIN.find((o) => o.value === asset.origin)?.label}>
          <div data-prop="origin">
            <Combobox
              key={k("origin")}
              id={`${id}-origin`}
              name="origin"
              options={ORIGIN}
              defaultValue={asset.origin ?? ""}
              placeholder="Unknown"
              onChange={onChange}
              {...err("origin")}
            />
          </div>
        </Property>
        <Property label="Made with" htmlFor={`${id}-generator`} error={errors.generator} text={asset.generator}>
          <div data-prop="generator">
            <Input
              key={k("generator")}
              id={`${id}-generator`}
              name="generator"
              defaultValue={asset.generator ?? ""}
              maxLength={200}
              placeholder="The camera, tool or model"
              className={ghost}
              {...err("generator")}
            />
          </div>
        </Property>
        <Property label="Prompt" htmlFor={`${id}-prompt`} error={errors.prompt} text={asset.prompt}>
          <div data-prop="prompt">
            <Textarea
              key={k("prompt")}
              id={`${id}-prompt`}
              name="prompt"
              defaultValue={asset.prompt ?? ""}
              maxLength={10000}
              rows={1}
              placeholder="For a generated asset"
              className={cn(ghost, "min-h-9 resize-none field-sizing-content")}
              {...err("prompt")}
            />
          </div>
        </Property>
        <AssetRef
          key={k("parentAssetId")}
          name="parentAssetId"
          label="Made from"
          value={asset.parentAssetId}
          self={asset.id}
          pick="What was it made from?"
          about="The photo an edit started from, the image a model was given."
          onOpen={onOpen}
          onChange={onChange}
          error={errors.parentAssetId}
        />
        <AssetRef
          key={k("supersededBy")}
          name="supersededBy"
          label="Replaced by"
          value={asset.supersededBy}
          self={asset.id}
          pick="What replaces it?"
          about="Checks then refuse this asset and point to the replacement instead."
          consequence="Checks refuse this asset now, and point to this one instead."
          onOpen={onOpen}
          onChange={onChange}
          error={errors.supersededBy}
        />
      </div>
    </Fold>
  );
}

/** Another asset, by reference: a hidden input carries its id with the form. */
function AssetRef({
  name,
  label,
  value,
  self,
  pick,
  about,
  consequence,
  onOpen,
  onChange,
  error,
}: {
  name: string;
  label: string;
  value: string | null;
  self: string;
  pick: string;
  about: string;
  /** Said under it once one is picked: what picking it does. */
  consequence?: string;
  onOpen: (id: string) => void;
  onChange: () => void;
  error?: string;
}) {
  const [ref, setRef] = useState<Asset | null>(null);
  const [id, setId] = useState(value);
  const [picking, setPicking] = useState<boolean | null>(null);
  useEffect(() => {
    if (!id || ref?.id === id) return;
    let live = true;
    fetch(`/api/v1/assets/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && j && setRef(j.data))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id, ref]);
  const shown = id && ref?.id === id ? ref : null;
  const set = (next: string | null) => {
    setId(next);
    setTimeout(onChange);
  };
  const face = id && (
    <>
      <span className="bg-muted relative size-8 shrink-0 overflow-hidden rounded">
        {shown && hasPreview(shown) && <Thumb src={`/a/${id}/w_64,f_webp`} alt="" />}
      </span>
      <span className="truncate">{shown ? (shown.metadata?.title ?? shown.filename) : "…"}</span>
    </>
  );
  const chip = id && (
    // In place, through the viewer: what is typed is saved first.
    <button
      type="button"
      onClick={() => onOpen(id)}
      className="flex min-w-0 flex-1 items-center gap-2 rounded-md border p-1.5 text-left text-sm hover:underline"
    >
      {face}
    </button>
  );
  return (
    <Property
      label={label}
      hint={id ? consequence : about}
      error={error}
      text={face ? <span className="flex min-w-0 items-center gap-2">{face}</span> : null}
    >
      <div data-prop={name}>
        <input type="hidden" name={name} value={id ?? ""} />
        <div className="flex items-center gap-2">
          {chip || <span className="text-muted-foreground flex min-h-9 flex-1 items-center px-3 text-sm">None</span>}
          <Button type="button" variant="ghost" size="sm" onClick={() => setPicking(true)}>
            {id ? "Change" : "Pick"}
          </Button>
          {id && (
            <IconButton variant="ghost" label={`Clear ${label.toLowerCase()}`} onClick={() => set(null)}>
              <IconX />
            </IconButton>
          )}
        </div>
      </div>
      {picking !== null && (
        <LibraryPicker
          filter={(a) => a.id !== self}
          title={pick}
          description={about}
          onClose={() => setPicking(null)}
          onPick={(a) => {
            setRef(a as Asset);
            set(a.id);
            setPicking(null);
          }}
        />
      )}
    </Property>
  );
}

/** A replaced asset says so first, as a warning, and links to what replaced it. */
function Replaced({ by, stacked, onOpen }: { by: string; stacked: boolean; onOpen: (id: string) => void }) {
  return (
    <div role="status" className="grid gap-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <IconAlertTriangle className="size-4 text-amber-600 dark:text-amber-400" /> Replaced
      </p>
      <p className="text-muted-foreground text-xs">
        Checks refuse it and point to{" "}
        <button type="button" onClick={() => onOpen(by)} className="text-foreground underline">
          its replacement
        </button>
        .{" "}
        {stacked ? "Make this version current, under Versions, to use it again." : "Clear Replaced by, under Provenance, to use it again."}
      </p>
    </div>
  );
}

/** The brand rules that point at this asset: a chip that fades in once known, listing each. */
function BrandRules({ assetId, leave }: { assetId: string; leave: (next: () => void) => void }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const router = useRouter();
  useEffect(() => {
    let live = true;
    fetch(`/api/v1/brand/rules?asset=${assetId}`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => live && setRules(j.data))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [assetId]);
  if (!rules.length) return null;
  const several = new Set(rules.map((r) => r.brand)).size > 1;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="animate-in fade-in-0 slide-in-from-top-1 rounded-full">
          <Badge variant="secondary" className="hover:bg-secondary/70 cursor-pointer">
            <IconBook /> Used in {rules.length} brand {rules.length === 1 ? "rule" : "rules"}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1">
        <ul className="grid">
          {rules.map((r) => {
            const href = `/brand?brand=${r.brand}#rule-${r.key}`;
            return (
              <li key={r.id}>
                <Link
                  href={href}
                  onClick={(e) => {
                    e.preventDefault();
                    leave(() => router.push(href));
                  }}
                  className="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {several && <span className="text-muted-foreground">{r.brand} / </span>}
                    {ruleLabel(r.key)}
                  </span>
                  {r.context && (
                    <Badge variant="outline" title={r.context}>
                      {contextLabel(r.context)}
                    </Badge>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * What an agent suggested about this asset, and the buttons that decide it.
 * Each acts at once through the public PATCH, queued behind any property
 * save in flight. Accepting a tag merges with the chips on screen, not the
 * stored ones, so nothing typed is lost. A rejection is kept, with its
 * reason, for the agent that suggested it.
 */
function Review({
  asset,
  fields,
  formRef,
  flush,
  onDecided,
  rejecting,
  setRejecting,
  approve,
  approveLabel,
  approveError,
}: {
  asset: Asset;
  fields: FieldDef[];
  formRef: React.RefObject<HTMLFormElement | null>;
  /** The editor's save queue: `extra` goes out with whatever is typed, and reaches onReviewed. */
  flush: (extra: Record<string, unknown>) => Promise<Asset | boolean>;
  onDecided?: (before: Asset, after: Asset, message: string) => void;
  rejecting: boolean;
  setRejecting: (r: boolean) => void;
  approve: () => Promise<void>;
  approveLabel: string;
  approveError: string | null;
}) {
  // Which action is running, so only its button says so.
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  if (asset.status === "rejected") {
    return (
      <div className="bg-muted/40 grid gap-1 rounded-lg border p-3 text-sm">
        <p className="font-medium">Rejected</p>
        <p className="text-muted-foreground text-xs">
          Suggested by {asset.proposedBy ?? "an agent"}.{" "}
          {asset.reviewNote ? <>Reason: &ldquo;{asset.reviewNote}&rdquo;</> : "No reason given."} It stays out of the
          library; the agent can read why.
        </p>
      </div>
    );
  }
  const suggested = Object.entries(asset.proposedFields ?? {});
  if (asset.status !== "proposed" && !asset.proposedTags.length && !suggested.length) return null;

  const run = async (what: string, fn: () => Promise<unknown>) => {
    setBusy(what);
    await fn();
    setBusy(null);
  };
  const patch = (what: string, body: Record<string, unknown>) => run(what, () => flush(body));
  const onScreen = () => (formRef.current ? new FormData(formRef.current).getAll("tags").map(String) : asset.tags);
  const accept = (tags: string[], what: string) =>
    patch(what, { tags: [...new Set([...onScreen(), ...tags])], proposedTags: asset.proposedTags.filter((t) => !tags.includes(t)) });
  const dismiss = (tags: string[], what: string) => patch(what, { proposedTags: asset.proposedTags.filter((t) => !tags.includes(t)) });
  /** What is left waiting once `keys` are decided. */
  const keep = (keys: string[]) => Object.fromEntries(suggested.filter(([k]) => !keys.includes(k)));
  const defOf = (key: string) => fields.find((f) => f.key === key);
  const acceptValues = (keys: string[], what: string) => {
    const known = keys.filter((k) => defOf(k));
    return patch(what, { fields: Object.fromEntries(suggested.filter(([k]) => known.includes(k))), proposedFields: keep(known) });
  };
  const dismissValues = (keys: string[], what: string) => patch(what, { proposedFields: keep(keys) });
  const reject = () =>
    run("reject", async () => {
      const next = await flush({ status: "rejected", reviewNote: reason || null });
      if (typeof next !== "object") return;
      setRejecting(false);
      const message = `Rejected. ${asset.proposedBy ?? "The agent"} can read why.`;
      if (onDecided) onDecided(asset, next, message);
      else toast.success(message);
    });

  return (
    <div className="border-primary/30 bg-primary/5 grid gap-3 rounded-lg border p-3">
      {asset.status === "proposed" && (
        <div className="grid gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <IconSparkles className="text-primary-ink size-4" /> Suggested by {asset.proposedBy ?? "an agent"}
            <time dateTime={asset.createdAt} title={new Date(asset.createdAt).toLocaleString()} className="text-muted-foreground font-normal" suppressHydrationWarning>
              · {ago(asset.createdAt)}
            </time>
          </p>
          <p className="text-muted-foreground text-xs">It stays out of the library and search until you approve it.</p>
          {rejecting ? (
            <div className="grid gap-2">
              <Textarea
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    e.stopPropagation();
                    void reject();
                  }
                }}
                placeholder="Why not? The agent reads this, e.g. off-brand colors, low resolution"
                aria-label="Reason for rejecting"
                maxLength={2000}
                rows={2}
              />
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="destructive" disabled={!!busy} pending={busy === "reject"} onClick={reject}>
                  <IconX /> Reject
                  <Kbd keys={["mod", "↵"]} className="bg-background/20 border-transparent text-current max-sm:hidden" />
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={!!busy} onClick={() => setRejecting(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" disabled={!!busy} pending={busy === "approve"} onClick={() => run("approve", approve)}>
                <IconCheck /> {approveLabel}
                <Kbd keys={["A"]} className="bg-background/20 border-transparent text-current max-sm:hidden" />
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => setRejecting(true)}>
                <IconX /> Reject…
                <Kbd keys={["R"]} className="max-sm:hidden" />
              </Button>
            </div>
          )}
          {approveError && (
            <p role="alert" className="text-destructive animate-in fade-in-0 text-xs">
              {approveError}
            </p>
          )}
        </div>
      )}
      {asset.proposedTags.length > 0 && (
        <div className="grid gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <IconSparkles className="text-primary-ink size-4" /> Suggested tags
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {asset.proposedTags.map((t) => (
              <li key={t}>
                <Badge variant="outline" className="gap-0.5 border-dashed pr-0.5">
                  {t}
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => accept([t], `accept:${t}`)}
                    aria-label={`Accept tag ${t}`}
                    className="hover:bg-primary/15 focus-visible:ring-ring/50 grid size-5 place-items-center rounded-full outline-none focus-visible:ring-2"
                  >
                    <IconCheck className={cn("size-3", busy === `accept:${t}` && "animate-pulse")} />
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => dismiss([t], `dismiss:${t}`)}
                    aria-label={`Dismiss tag ${t}`}
                    className="hover:bg-muted-foreground/20 focus-visible:ring-ring/50 grid size-5 place-items-center rounded-full outline-none focus-visible:ring-2"
                  >
                    <IconX className={cn("size-3", busy === `dismiss:${t}` && "animate-pulse")} />
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
          {asset.proposedTags.length > 1 && (
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" disabled={!!busy} pending={busy === "accept:tags"} onClick={() => accept(asset.proposedTags, "accept:tags")}>
                Accept all
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={!!busy} pending={busy === "dismiss:tags"} onClick={() => dismiss(asset.proposedTags, "dismiss:tags")}>
                Dismiss all
              </Button>
            </div>
          )}
        </div>
      )}
      {suggested.length > 0 && (
        <div className="grid gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <IconSparkles className="text-primary-ink size-4" /> Suggested values
          </p>
          <ul className="grid gap-1">
            {suggested.map(([k, v]) => {
              const d = defOf(k);
              const label = d?.label ?? k;
              const shown = formatFieldValue(d, v);
              return (
                <li key={k} className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground shrink-0">{d ? label : `${k} (removed field)`}</span>
                  <span className="min-w-0 flex-1 truncate font-medium" title={shown}>
                    {shown}
                  </span>
                  {d && (
                    <IconButton variant="ghost" label={`Accept ${label}`} disabled={!!busy} pending={busy === `accept:${k}`} onClick={() => acceptValues([k], `accept:${k}`)}>
                      <IconCheck />
                    </IconButton>
                  )}
                  <IconButton variant="ghost" label={`Dismiss ${label}`} disabled={!!busy} pending={busy === `dismiss:${k}`} onClick={() => dismissValues([k], `dismiss:${k}`)}>
                    <IconX />
                  </IconButton>
                </li>
              );
            })}
          </ul>
          {suggested.length > 1 && (
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!!busy}
                pending={busy === "accept:values"}
                onClick={() => acceptValues(suggested.map(([k]) => k), "accept:values")}
              >
                Accept all
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={!!busy}
                pending={busy === "dismiss:values"}
                onClick={() => dismissValues(suggested.map(([k]) => k), "dismiss:values")}
              >
                Dismiss all
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The dialog while the asset a link names is still on its way: the same shape, pulsing. */
export function AssetEditorSkeleton() {
  return (
    <>
      <DialogTitle className="sr-only">Loading the asset</DialogTitle>
      <div className="bg-muted/50 relative min-h-64 border-b max-md:h-[45dvh] md:min-h-0 md:border-r md:border-b-0">
        <Skeleton className="absolute inset-6" />
      </div>
      <div className="grid content-start gap-4 px-6 py-5">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-5 w-24 rounded-full" />
        <div className="grid gap-3 pt-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-8" style={{ width: `${90 - i * 9}%` }} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
