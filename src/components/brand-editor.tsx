"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Command as CommandPrimitive, defaultFilter } from "cmdk";
import {
  IconBook,
  IconCheck,
  IconChevronDown,
  IconCode,
  IconCopy,
  IconDots,
  IconHash,
  IconLetterCase,
  IconHistory,
  IconList,
  IconLoader2,
  IconMessage,
  IconPalette,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSelector,
  IconShape,
  IconStar,
  IconTypography,
  IconVersions,
  IconX,
  type Icon,
} from "@tabler/icons-react";
import { IconEye } from "@tabler/icons-react";
import { Can, useCan, useMe } from "@/components/can";
import { IconButton } from "@/components/icon-button";
import { toast } from "sonner";
import { call, curl, ForAgents } from "@/components/agent-access";
import { History, who } from "@/components/brand-history";
import { useRemember } from "@/components/sidebar-prefs";
import { BrandDialog, brandHref, type BrandInfo } from "@/components/brand-switcher";
import { RenditionMenu } from "@/components/rendition-menu";
import { copy, Editable, ReadOnly } from "@/components/brand-values";
import { LOOK, useBrandLook } from "@/components/brand-sections/look";
import { AssetTile, Hero, Pairings, SectionHeader } from "@/components/brand-sections/parts";
import { blockOf, focusRule, onceDrawn, RuleView, Variants, type Dnd, type Ed, type Line, type Patch } from "@/components/brand-sections/rule-view";
import { behavior, flashEl, goTo, linkTo, TYPING, useActiveSection, useHashFlash } from "@/components/site/anchors";
import { FontStyles, FontThumb, ImportFamily } from "@/components/font-preview";
import { send } from "@/components/collections";
import { copyText, CopyButton } from "@/components/copy-button";
import { Thumb, type Asset } from "@/components/gallery";
import { AppHeader } from "@/components/page";
import { SaveStatus } from "@/components/save-status";
import { useShell } from "@/components/shell";
import { TokensDialog, tokensPath } from "@/components/tokens-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { colorsOf } from "@/lib/brand-theme";
import { fontFiles, isFont, isFontAsset, pickFace } from "@/lib/font";
import { hasPreview } from "@/lib/preview";
import { camel, ESSENTIALS, keyFor, PRESETS, type Preset } from "@/lib/presets";
import {
  contextLabel,
  fontLabel,
  fontValue,
  listStyle,
  resolve,
  ruleLabel,
  section,
  type RuleAsset,
  type Rule,
  type RuleType,
} from "@/lib/rules";
import { kebab } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { assetUrl } from "@/lib/asset-url";
import { sendResult } from "@/lib/send";
import { renditionLabel } from "@/lib/transform";
import { undoable } from "@/lib/undo";

const label = ruleLabel;

/** The sections a brand usually has, in the order a reader wants them. Any other key prefix is a section too. */
const SECTIONS: Record<string, { title: string; icon: Icon; lede: string }> = {
  color: { title: "Color", icon: IconPalette, lede: "The palette, graded for contrast against white and black." },
  logo: { title: "Logo", icon: IconShape, lede: "How the mark is used, and how it never is." },
  type: { title: "Typography", icon: IconTypography, lede: "The faces, and the scale they are set in." },
  tone: { title: "Voice and tone", icon: IconMessage, lede: "How the brand sounds when it writes." },
};
const ORDER = Object.keys(SECTIONS);
const rank = (s: string) => (ORDER.includes(s) ? ORDER.indexOf(s) : ORDER.length);
const meta = (name: string) => SECTIONS[name] ?? { title: label(name), icon: IconBook, lede: "" };

const TYPE_ICON: Record<RuleType, Icon> = {
  color: IconPalette,
  text: IconTypography,
  number: IconHash,
  list: IconList,
  font: IconLetterCase,
};

const copyOf = ({ key, context, type, value, usage, assets }: Rule) => ({ key, context, type, value, usage, assets });

/** The plain text rule: what "Create a text rule" makes. */
const TEXT = PRESETS.find((p) => p.id === "text")!;

/** The rule in Details: its key, and which of its variants. `kb`: opened from the keyboard, so focus goes in. */
type Open = { key: string; id: string; kb?: boolean };

/** Where a dragged block lands: before `before` in `section`, or at the section's end (null). */
type Drop = { section: string; before: string | null };

/** The latest version of the guidelines: who made it, and when. */
type Version = { actor: string; updatedAt: string };

/** The page's sections, in the order a reader wants them: the usual ones first, the rest by name. */
const sectionsOf = (rs: Pick<Rule, "key">[]) =>
  [...new Set(rs.map((r) => section(r.key)))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

/**
 * Every key as the page shows them: sections in page order, keys in their
 * current order. What /order is sent, so agents read the rules in the order
 * people do.
 */
export function pageOrder(rs: Pick<Rule, "key">[]) {
  const keys = [...new Set(rs.map((r) => r.key))];
  return sectionsOf(rs).flatMap((s) => keys.filter((k) => section(k) === s));
}

/** Rules in API order that the page shows in that order too. */
const inPageOrder = (rs: Pick<Rule, "key">[]) => pageOrder(rs).join() === [...new Set(rs.map((r) => r.key))].join();

/** Rules sorted by `keys`, stably, so each key's default stays ahead of its variants. Keys it lacks go last. */
function arrange(rs: Rule[], keys: string[]) {
  const at = new Map(keys.map((k, i) => [k, i]));
  return [...rs].sort((a, b) => (at.get(a.key) ?? keys.length) - (at.get(b.key) ?? keys.length));
}

/** A new rule's place: after its key's other variants, else after `after`'s, else at its section's end, else last. */
function place(rs: Rule[], made: Rule, after?: string | null) {
  const last = (test: (r: Rule) => boolean) => {
    for (let i = rs.length - 1; i >= 0; i--) if (test(rs[i])) return i;
    return -1;
  };
  let i = last((x) => x.key === made.key);
  if (i < 0 && after) i = last((x) => x.key === after);
  if (i < 0) i = last((x) => section(x.key) === section(made.key));
  if (i < 0) i = rs.length - 1;
  return [...rs.slice(0, i + 1), made, ...rs.slice(i + 1)];
}

/** `keys` with `key` moved before `before`, or to the end of section `sec` when that is null. */
function moveKey(keys: string[], key: string, sec: string, before: string | null) {
  const rest = keys.filter((k) => k !== key);
  const at = before ? rest.indexOf(before) : -1;
  const end = rest.map(section).lastIndexOf(sec);
  rest.splice(at >= 0 ? at : end >= 0 ? end + 1 : rest.length, 0, key);
  return rest;
}

/** What someone wrote, as text they can paste back when the server refuses it. */
function written({ value, usage }: Patch) {
  const v = value ?? usage;
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return v.join("\n");
  return typeof v === "object" ? fontLabel(v) : String(v);
}

const titleFor = (brand: BrandInfo, context?: string) => `${brand.name} guidelines${context ? ` · ${contextLabel(context)}` : ""}`;

/** "Dark background" as a context: dark-background. */
const slug = (v: string) =>
  v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Who made a version, as History says it; null for the app's own baseline, which nobody made. */
const byWhom = (actor: string, me: ReturnType<typeof useMe>) => (actor === "artbucket" ? null : who(actor, me));

/** The time, for the refs that note when a write landed (in handlers, never while rendering). */
const now = () => Date.now();

async function latestVersion(slug: string): Promise<Version | null> {
  const res = await fetch(`/api/v1/brands/${slug}/versions`, { cache: "no-store" }).catch(() => null);
  return res?.ok ? (((await res.json().catch(() => null))?.data?.[0] as Version | undefined) ?? null) : null;
}

// ---- blocks in the DOM --------------------------------------------------------

const flash = (key: string) => onceDrawn(() => blockOf(key), flashEl);

// Wide enough for Details beside the page and the sidebar both.
const WIDE = "(min-width: 1536px)";
const onWide = (cb: () => void) => {
  const m = matchMedia(WIDE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const isWide = () => matchMedia(WIDE).matches;

/**
 * The guidelines, read like a document and edited in place, Notion style:
 * anyone who may edit clicks a rule's name, value or note and types, "/" adds
 * a rule where they are, and a block's six-dot handle drags it and holds its
 * menu. Details opens in a side panel for what the page can't show: the key,
 * variants, files. Each change is one call to /api/v1/brand/rules; the page
 * holds nothing the API doesn't.
 *
 * Every variant loads once. A context is a view of them (lib/rules.ts
 * resolve), so switching it redraws in place, with no request.
 */
export function BrandEditor({
  brand,
  initial,
  contexts: initialContexts,
  initialContext,
}: {
  brand: BrandInfo;
  /** Every rule and variant, in API order. */
  initial: Rule[];
  contexts: string[];
  initialContext?: string;
}) {
  const [rules, setRules] = useState(initial);
  const [contexts, setContexts] = useState(initialContexts);
  const [context, setContext] = useState(initialContext);
  // No Edit mode: whoever may edit edits the page, by the same check the API makes.
  const canEdit = useCan()("brand.edit");
  const me = useMe();
  // Editors get the rich editor's code up front, so clicking into a text never waits on it.
  useEffect(() => {
    if (canEdit) void import("@/components/rich-text");
  }, [canEdit]);
  const [open, setOpen] = useState<Open | null>(null);
  // The last rule Details showed: it keeps its content while the panel slides away.
  const [kept, setKept] = useState<Open | null>(null);
  if (open && open !== kept) setKept(open);
  // A plain rule picked at the end of the page, waiting for a section to go in; `name` when it came typed.
  const [draft, setDraft] = useState<{ preset: Preset; name?: string } | null>(null);
  // The block a ghost line opened under, from its + or "/".
  const [below, setBelow] = useState<string | null>(null);
  const [picking, setPicking] = useState<Rule | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<Drop | null>(null);
  // Made on this visit: nothing reads their keys yet, so renaming them needs no warning.
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  // `to`: a drop into another section, which renames the key into it.
  const [renaming, setRenaming] = useState<{ rule: Rule; key: string; to?: Drop } | null>(null);
  // Bumped when a rename or an edit is called off, so the fields show what is saved again.
  const [resets, setResets] = useState(0);
  const [adding, setAdding] = useState(false);
  // In a context view, whether an edit to a rule shown from the default is for this context or every one: asked once a visit.
  // Keyed by context: the question named one.
  const [scopeOf, setScopeOf] = useState<Record<string, "only" | "every">>({});
  const [asking, setAsking] = useState<{ rule: Rule; body: Patch } | null>(null);
  // A rule that is mostly its files, just made: its picker opens once its name is in, not over it.
  const pickAfterName = useRef<string | null>(null);
  const sheet = useRef<HTMLDivElement>(null);

  // The rules as of the last render, for work that outlives it: a retry, an undo, the order a create sends.
  const live = useRef(rules);
  useEffect(() => {
    live.current = rules;
  });
  const latest = (r: Rule) => live.current.find((x) => x.id === r.id) ?? r;

  // Writes to one rule go out one at a time, and a response older than the latest edit is dropped.
  const queue = useRef(new Map<string, Promise<unknown>>());
  const seq = useRef(new Map<string, number>());
  const bump = (id: string) => {
    const n = (seq.current.get(id) ?? 0) + 1;
    seq.current.set(id, n);
    return n;
  };
  function queued<T>(id: string, run: () => Promise<T>) {
    // Chained on settling: one failed write must not stall every later one, or keep isBusy() true.
    const p = (queue.current.get(id) ?? Promise.resolve()).catch(() => {}).then(run);
    queue.current.set(id, p);
    const done = () => void (queue.current.get(id) === p && queue.current.delete(id));
    p.then(done, done);
    return p;
  }
  /** A write to some rule is still out: a reload now would draw over it. */
  const isBusy = () => queue.current.size > 0;

  // Opening a brand's guidelines puts them at the top of Recents.
  const remember = useRemember();
  useEffect(() => {
    remember({ kind: "brand", id: brand.slug, label: `${brand.name} guidelines`, href: brandHref(brand) });
  }, [brand, remember]);

  // The rule in Details stays in view beside it.
  const openKey = open?.key;
  useEffect(() => {
    if (openKey) blockOf(openKey)?.scrollIntoView({ behavior: behavior(), block: "nearest" });
  }, [openKey]);

  const [history, setHistory] = useState(false);
  const [tokens, setTokens] = useState(false);
  // Bumped after every change, so an open history shows it.
  const [edits, setEdits] = useState(0);
  // "Updated 2h ago by claude" on the cover: fetched on load and on coming back, and set by our own writes.
  const [last, setLast] = useState<Version | null>(null);
  // When this page last wrote, and the newest version it has drawn: a newer one that isn't ours is someone else's.
  const wrote = useRef(0);
  const drawn = useRef(0);
  const landed = () => {
    wrote.current = now();
    setEdits((n) => n + 1);
    // What the server just recorded, without asking it again.
    setLast({ actor: "web", updatedAt: new Date(wrote.current).toISOString() });
  };
  // Whether the API's order is the page's. Agents append keys wherever, so a loaded order may be interleaved
  // (color.a, type.x, color.b) where the page groups by section: then the next create holds it to the page.
  const synced = useRef(inPageOrder(initial));

  /** This brand's rules endpoint; the default brand needs no ?brand. */
  const rulesUrl = (path = "") => `/api/v1/brand/rules${path}${brand.default ? "" : `?brand=${encodeURIComponent(brand.slug)}`}`;

  /** Everything again, every variant: after a History restore, a refused write, or coming back to the tab. */
  async function reload() {
    const res = await fetch(rulesUrl(), { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const json = await res.json().catch(() => null);
    if (!json) return;
    setRules(json.data);
    setContexts(json.contexts);
    // Someone else's order may have come with it.
    synced.current = inPageOrder(json.data);
    setEdits((n) => n + 1);
  }

  // Someone else changed the guidelines while you were mid-edit: a pill offers their version instead of drawing over yours.
  const [stale, setStale] = useState<Version | null>(null);
  useEffect(() => {
    let on = true;
    void latestVersion(brand.slug).then((v) => {
      if (!on || !v) return;
      setLast(v);
      drawn.current = Date.parse(v.updatedAt);
    });
    return () => {
      on = false;
    };
  }, [brand.slug]);

  // Teammates and agents edit these too: coming back to the tab picks up their changes, unless you are typing.
  const back = useRef<() => Promise<void>>(undefined);
  useEffect(() => {
    back.current = async () => {
      const v = await latestVersion(brand.slug);
      if (v) setLast(v);
      const at = v ? Date.parse(v.updatedAt) : 0;
      // Our own writes land within moments of making them; the slack allows for the server's clock.
      const theirs = at > drawn.current && at > wrote.current + 5000;
      const el = document.activeElement;
      if (isBusy() || (el instanceof HTMLElement && el.matches("input, textarea, [contenteditable=true]"))) {
        if (theirs) setStale(v);
        return;
      }
      drawn.current = Math.max(drawn.current, at);
      setStale(null);
      await reload();
    };
  });
  useEffect(() => {
    let t = 0;
    const onBack = () => {
      // Switching tabs fires both events.
      if (document.visibilityState !== "visible" || Date.now() - t < 2000) return;
      t = Date.now();
      void back.current?.();
    };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => {
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
    };
  }, []);

  /** In place, as the URL says: nothing remounts, the scroll stays, no request. */
  function switchTo(c?: string) {
    document.title = document.title.replace(titleFor(brand, context), titleFor(brand, c));
    setContext(c);
    window.history.replaceState(null, "", brandHref(brand, c));
  }

  /**
   * Optimistic, and never silently lost: offline, the change stays on the
   * page with a Retry; refused, the server's copy comes back and what was
   * written can still be copied.
   */
  function save(r: Rule, body: Patch) {
    const n = bump(r.id);
    const id = `save-${r.id}`;
    setRules((rs) => rs.map((x) => (x.id === r.id ? { ...x, ...body } : x)));
    return queued(r.id, async () => {
      const res = await sendResult("PATCH", `/api/v1/brand/rules/${r.id}`, body, { quiet: true });
      if (res.ok) {
        toast.dismiss(id);
        if (seq.current.get(r.id) === n) setRules((rs) => rs.map((x) => (x.id === r.id ? (res.data as Rule) : x)));
        landed();
      } else if (res.network) {
        toast.error(`Couldn't save ${label(latest(r).key)}`, {
          id,
          duration: Infinity,
          // A later edit has its own retry; this one would put the older text back.
          action: { label: "Retry", onClick: () => seq.current.get(r.id) === n && void save(latest(r), body) },
        });
      } else {
        const text = written(body);
        // Signed out has its own toast (lib/send.ts).
        if (res.status !== 401)
          toast.error(res.error?.message ?? `Couldn't save ${label(r.key)}`, {
            id,
            duration: 10_000,
            ...(text && { action: { label: "Copy what you wrote", onClick: () => void copyText(text, { what: "what you wrote" }) } }),
          });
        await reload();
      }
    });
  }

  /**
   * An edit from the page or Details. In a context view, a rule shown from
   * the default belongs to every context: the first such edit asks whether
   * it is for this one only.
   */
  function edit(r: Rule, body: Patch) {
    const inherited = !!context && r.context === null && !rules.some((x) => x.key === r.key && x.context === context);
    if (!inherited || scopeOf[context] === "every") return save(r, body);
    if (scopeOf[context] === "only") return override(r, body);
    setAsking({ rule: r, body });
  }

  // Overrides still being made, by key and context: an edit meanwhile goes to the one coming, not a second POST.
  const making = useRef(new Map<string, Promise<Rule | null>>());

  /** The context's own version, made with the change in one call, so there is no flash of the old value. */
  async function override(r: Rule, body: Patch) {
    const at = `${r.key}\n${context}`;
    const coming = making.current.get(at);
    const ready = coming && (await coming);
    if (ready) return save(latest(ready), body);
    const p = create({ ...copyOf(r), context: context!, ...body });
    making.current.set(at, p);
    const made = await p.finally(() => making.current.get(at) === p && making.current.delete(at));
    if (made) setOpen((o) => (o?.id === r.id ? { key: made.key, id: made.id } : o));
  }

  /** Holds the API to `keys`, the full page order. */
  async function putOrder(keys: string[]) {
    if (await send("PUT", rulesUrl("/order"), { keys })) {
      synced.current = true;
      landed();
    } else await reload();
  }

  /**
   * POST a rule and put the response in place. `fresh`: made on this visit,
   * so renaming it needs no warning (an undone delete is not). `order`: the
   * page order to hold after it, sent when the API's would differ.
   */
  async function create(
    body: Omit<Rule, "id">,
    { fresh: isFresh = true, after, order }: { fresh?: boolean; after?: string | null; order?: string[] } = {},
  ) {
    const made: Rule | null = await send("POST", rulesUrl(), body);
    if (!made) return null;
    const before = pageOrder(live.current);
    const keys = order ?? pageOrder(place(live.current, made, after));
    setRules((rs) => arrange(place(rs, made, after), keys));
    if (made.context) setContexts((c) => [...new Set([...c, made.context!])].sort());
    if (isFresh) setFresh((f) => new Set(f).add(made.id));
    landed();
    // The API puts a new key last; anywhere else on the page, it is told where.
    const api = before.includes(made.key) ? before : [...before, made.key];
    if (!synced.current || keys.join() !== api.join()) await putOrder(keys);
    return made;
  }

  const taken = new Set(rules.map((r) => r.key));
  const shown = context ? resolve(rules, context) : rules;
  // The first of each font key: what a type scale can be set in.
  const fonts = shown.filter((r, i) => r.type === "font" && shown.findIndex((x) => x.key === r.key) === i);

  /**
   * A new rule where you are: after `after` (null: its section's end), named
   * `name` in section `at`, with the caret in it. `named`: the name is set,
   * so the caret goes to the value; otherwise to the name, selected.
   */
  async function insertAfter(after: string | null, p: Preset, at: string, name: string, named = !!p.name) {
    const key = keyFor(at, name, taken);
    if (!key) return void toast.error("Give it a name with a letter in it");
    const made = await create(
      { key, context: context ?? null, type: p.type, value: p.value, usage: p.usage ?? null, assets: [] },
      { after: after && section(after) === at ? after : null },
    );
    if (!made) return;
    flash(made.key);
    if (named) return focusRule(made.key, "value", p.assets && (() => setPicking(made)));
    if (p.assets) pickAfterName.current = made.id;
    focusRule(made.key, "name");
  }

  /** Picked from a ghost line in section `at` (null: the end of the page), under `after` if it opened under a block. */
  function pick(p: Preset, at: string | null, after: string | null = null) {
    const home = p.section || at;
    if (!home) return setDraft({ preset: p });
    // A fixed rule exists once: picking it again goes to it.
    const existing = p.name && rules.find((r) => r.key === keyFor(home, p.name!, new Set()));
    if (existing) {
      flash(existing.key);
      return focusRule(existing.key, "block");
    }
    void insertAfter(after, p, home, p.name ?? p.suggest ?? p.label);
  }

  /** The empty page's one click: the rules most guidelines start with, in page order already. */
  async function essentials() {
    setAdding(true);
    const made = new Set(taken);
    // One after another: the order they are made in is the order agents read them.
    for (const id of ESSENTIALS) {
      const p = PRESETS.find((x) => x.id === id)!;
      const key = keyFor(p.section, p.name!, made)!;
      made.add(key);
      const r: Rule | null = await send("POST", rulesUrl(), { key, type: p.type, value: p.value, usage: p.usage ?? null });
      if (r) setFresh((f) => new Set(f).add(r.id));
    }
    await reload();
    setAdding(false);
    toast.success("Added the essentials. Click into any of them to make it yours.");
  }

  /** A new name renames the rule's key, and its context versions with it; one agents may read asks first. */
  function proposeRename(r: Rule, name: string, to?: Drop) {
    const others = new Set([...taken].filter((k) => k !== r.key));
    const key = keyFor(to?.section ?? section(r.key), name, others);
    if (!key || key === r.key) return setResets((n) => n + 1);
    if (rules.filter((x) => x.key === r.key).every((x) => fresh.has(x.id))) return void rename(r, key, to);
    setRenaming({ rule: r, key, to });
  }

  async function rename(r: Rule, key: string, to?: Drop) {
    // A value save still out for any variant would answer with the old key: those answers are dropped.
    for (const x of live.current) if (x.key === r.key) bump(x.id);
    const saved = await queued(r.id, () => send("PATCH", `/api/v1/brand/rules/${r.id}`, { key }));
    if (!saved) return setResets((n) => n + 1);
    const renamed = live.current.map((x) => (x.key === r.key ? { ...x, key } : x));
    setRules((rs) => rs.map((x) => (x.key === r.key ? { ...x, key } : x)));
    setOpen((o) => (o?.key === r.key ? { ...o, key } : o));
    landed();
    if (!to) return;
    // Dropped into another section: there, where it was dropped.
    flash(key);
    await reorder(moveKey(pageOrder(renamed), key, to.section, to.before));
  }

  /** Gone at once, back if the server says no, and undoable in place for 8s. */
  async function remove(r: Rule) {
    const order = pageOrder(live.current);
    const i = live.current.findIndex((x) => x.id === r.id);
    const rest = live.current.filter((x) => x.id !== r.id);
    // The block leaves only when nothing of its key is still shown here.
    const gone = !rest.some((x) => x.key === r.key && (!context || x.context === null || x.context === context));
    const block = gone ? blockOf(r.key) : null;
    const deleting = send("DELETE", `/api/v1/brand/rules/${r.id}`);
    if (block) {
      block.setAttribute("data-leaving", "");
      await new Promise((ok) => setTimeout(ok, 150));
    }
    setRules((rs) => rs.filter((x) => x.id !== r.id));
    // Details stays on the rule's other variants, if it has any.
    const other = rest.find((x) => x.key === r.key);
    setOpen((o) => (o?.id === r.id ? (other ? { key: r.key, id: other.id } : null) : o));
    if (!(await deleting)) {
      block?.removeAttribute("data-leaving");
      setRules((rs) => (rs.some((x) => x.id === r.id) ? rs : [...rs.slice(0, i), r, ...rs.slice(i)]));
      return false;
    }
    landed();
    undoable(`Deleted ${label(r.key)}${r.context ? ` for ${contextLabel(r.context)}` : ""}`, {
      undo: async () => {
        // Back where it was: after whatever preceded it then and is still here.
        const now = pageOrder(live.current);
        let keys: string[] | undefined;
        if (!now.includes(r.key)) {
          const prev = order
            .slice(0, order.indexOf(r.key))
            .reverse()
            .find((k) => now.includes(k));
          keys = [...now];
          keys.splice(prev ? now.indexOf(prev) + 1 : 0, 0, r.key);
        }
        // Not fresh: agents knew this key, so renaming it still warns.
        const made = await create(copyOf(r), { fresh: false, order: keys });
        // send() has said why.
        if (!made) return false;
      },
    });
    return true;
  }

  async function addVariant(r: Rule, c: string) {
    const made = await create({ ...copyOf(r), context: c });
    if (made) setOpen({ key: r.key, id: made.id });
  }

  /** Optimistic: the page redraws in the new order while the PUT goes out. `keys` is the full page order. */
  async function reorder(keys: string[]) {
    setRules((rs) => arrange(rs, keys));
    await putOrder(keys);
  }

  /** Every variant of `key` again, as "<name> copy", just below it. */
  async function duplicate(key: string) {
    const group = live.current.filter((x) => x.key === key);
    const twin = keyFor(section(key), `${label(key)} copy`, new Set(live.current.map((x) => x.key)));
    if (!twin || !group.length) return;
    for (const x of group) if (!(await create({ ...copyOf(x), key: twin }, { after: key }))) break;
    flash(twin);
    focusRule(twin, "block");
  }

  /** `key` before `before` in section `sec` (null: at its end). Into another section, that is a rename first. */
  async function dropAt(key: string, sec: string, before: string | null) {
    if (section(key) !== sec) {
      const r = live.current.find((x) => x.key === key);
      if (r) proposeRename(r, label(key), { section: sec, before });
      return;
    }
    const keys = pageOrder(live.current);
    const next = moveKey(keys, key, sec, before);
    if (next.join() === keys.join()) return;
    flash(key);
    await reorder(next);
  }

  const sections = new Map<string, Rule[]>();
  for (const r of shown) sections.set(section(r.key), [...(sections.get(section(r.key)) ?? []), r]);
  const names = sectionsOf(shown);
  /** A section's keys, in order. A key's section is part of its name. */
  const keysIn = (name: string) => [...new Set((sections.get(name) ?? []).map((r) => r.key))];

  /** One step up or down its section, from the keyboard or the block menu. */
  function step(key: string, d: -1 | 1) {
    const ks = keysIn(section(key));
    const i = ks.indexOf(key);
    if (i + d < 0 || i + d >= ks.length) return;
    const selected = document.activeElement === blockOf(key);
    void dropAt(key, section(key), d < 0 ? ks[i - 1] : (ks[i + 2] ?? null));
    // Moving a node in the DOM can drop its focus; a selected block stays selected.
    if (selected) requestAnimationFrame(() => document.activeElement !== blockOf(key) && blockOf(key)?.focus());
  }

  // The contents, the breadcrumb and j/k follow the section you are reading.
  const active = useActiveSection(names.map((n) => `section-${n}`))?.replace(/^section-/, "") ?? null;
  useHashFlash();

  // Reading: the page as its readers see it, in the reader (?view=read), with nothing to edit.
  const router = useRouter();
  const readHref = `/brand?${new URLSearchParams({ brand: brand.slug, ...(context && { context }), view: "read" })}`;

  // The page's keys, away from fields and dialogs: h History, t Tokens, j and k the next and previous section.
  const afterG = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof Element && t.closest(TYPING)) return;
      const key = e.key.toLowerCase();
      // G then a letter goes somewhere (components/shortcuts.tsx): G T is Team, not Tokens.
      if (key === "g") return void (afterG.current = Date.now());
      if (Date.now() - afterG.current < 1000) return;
      if (key === "h") setHistory(true);
      else if (key === "t") setTokens(true);
      else if (key === "p" && canEdit) router.push(readHref);
      else if (key === "j" || key === "k") {
        const i = active ? names.indexOf(active) : -1;
        const to = names[key === "j" ? i + 1 : Math.max(i - 1, 0)];
        if (!to) return;
        goTo(`section-${to}`);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const look = useBrandLook(rules);

  // What Details is open on: the page reflow, the Toc and the sidebar follow this.
  const group = open ? rules.filter((r) => r.key === open.key) : [];
  const current = group.find((r) => r.id === open?.id) ?? group[0];
  // What Details draws: the open rule, or the last one while the panel slides away.
  const body = open ?? kept;
  const bodyGroup = body ? rules.filter((r) => r.key === body.key) : [];
  const bodyRule = bodyGroup.find((r) => r.id === body?.id) ?? bodyGroup[0];
  // What a new rule in a context view is for.
  const only = context && `Type / to add a rule for ${contextLabel(context)} only`;

  // Details beside the page: below 1536px the sidebar folds to its rail to make room, and comes back after.
  const wide = useSyncExternalStore(onWide, isWide, () => true);
  const { setSqueeze, setBrands } = useShell();
  const squeeze = !!current && !wide;
  useEffect(() => setSqueeze(squeeze), [squeeze, setSqueeze]);
  useEffect(() => () => setSqueeze(false), [setSqueeze]);

  // One steady line, in the gap above where the dragged block would land (below the last, at a section's end).
  const keys = pageOrder(rules);
  const moves = !!drag && !!over && moveKey(keys, drag, over.section, over.before).join() !== keys.join();
  const lineFor = (name: string, key: string, ks: string[]): Line | null =>
    !moves || over!.section !== name ? null : over!.before === key ? "before" : over!.before === null && ks.at(-1) === key ? "after" : null;

  const dndFor = (key: string, name: string, ks: string[]): Dnd => ({
    onDragStart: () => setDrag(key),
    onDragEnd: () => {
      setDrag(null);
      setOver(null);
    },
    onDragOver: (e) => {
      if (!drag) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const box = e.currentTarget.getBoundingClientRect();
      // The lower half of a block means before the next one, so the line never jumps across the gap.
      const before = e.clientY > box.top + box.height / 2 ? (ks[ks.indexOf(key) + 1] ?? null) : key;
      if (over?.section !== name || over.before !== before) setOver({ section: name, before });
    },
    onDrop: (e) => {
      e.preventDefault();
      if (drag && over) void dropAt(drag, over.section, over.before);
      setDrag(null);
      setOver(null);
    },
  });

  const edFor = (key: string, name: string, ks: string[]): Ed => {
    const i = ks.indexOf(key);
    return {
      taken,
      resets,
      fresh: rules.filter((x) => x.key === key).every((x) => fresh.has(x.id)),
      context: context && contextLabel(context),
      canMove: [i > 0, i < ks.length - 1],
      dnd: dndFor(key, name, ks),
      onPatch: (r, b) => void edit(r, b),
      onRename: (r, n) => proposeRename(r, n),
      onNamed: (r) => {
        if (pickAfterName.current !== r.id) return;
        pickAfterName.current = null;
        requestAnimationFrame(() => setPicking(latest(r)));
      },
      onDelete: remove,
      onDetails: (id, kb) => setOpen({ key, id, kb }),
      onInsert: () => setBelow(key),
      onDuplicate: () => void duplicate(key),
      onMove: (d) => step(key, d),
      onCopyLink: () => void copy(linkTo(`rule-${key}`), "link"),
    };
  };

  // Dialogs keep their subject while they fade out, so they never close reading "Rename ?".
  const [lastRename, setLastRename] = useState(renaming);
  if (renaming && renaming !== lastRename) setLastRename(renaming);
  const renamed = renaming ?? lastRename;
  const [lastAsk, setLastAsk] = useState(asking);
  if (asking && asking !== lastAsk) setLastAsk(asking);
  const asked = asking ?? lastAsk;
  // The picker too; `n` counts openings, so each starts from the rule as it is then.
  const [lastPick, setLastPick] = useState<{ rule: Rule; n: number } | null>(null);
  if (picking && picking !== lastPick?.rule) setLastPick({ rule: picking, n: (lastPick?.n ?? 0) + 1 });

  // The title renames the brand, Notion style: saved when you leave it.
  const [titleResets, setTitleResets] = useState(0);
  async function renameBrand(name: string) {
    if (name === brand.name) return;
    const b: BrandInfo | null = await send("PATCH", `/api/v1/brands/${brand.slug}`, { name });
    // Refused (send has said why): the saved name comes back.
    if (!b) return setTitleResets((n) => n + 1);
    setBrands((bs) => bs.map((x) => (x.slug === brand.slug ? { ...x, name: b.name } : x)));
    document.title = document.title.replace(titleFor(brand, context), titleFor(b, context));
    router.refresh();
  }

  /** The cover's empty logo tile: a logo rule, with the library open on it. */
  function addLogo() {
    const p = PRESETS.find((x) => x.id === "logo-file")!;
    const existing = rules.find((r) => r.key === keyFor("logo", p.suggest!, new Set()));
    if (existing) return setPicking(existing);
    void insertAfter(null, p, "logo", p.suggest!, true);
  }

  const colorsIn = (name: string) => colorsOf(sections.get(name) ?? []);

  return (
    <>
      {names.length > 1 && !current && <Toc names={names} active={active} />}

      <AppHeader trail={<Trail brand={brand} context={context} names={names} active={active} />}>
        <span aria-live="polite">
          {stale && (
            <Button
              variant="secondary"
              size="xs"
              className="rounded-full"
              onClick={() => {
                drawn.current = Math.max(drawn.current, Date.parse(stale.updatedAt));
                setStale(null);
                void reload();
              }}
            >
              <span className="sr-only sm:not-sr-only">Updated{byWhom(stale.actor, me) ? ` by ${byWhom(stale.actor, me)}` : ""} · </span>
              Refresh
            </Button>
          )}
        </span>
        {/* Saving, Saved, Not saved: when it was last edited, and by whom, is on the cover. */}
        <SaveStatus className="hidden sm:flex" />
        {contexts.length > 0 && <ContextPicker contexts={contexts} context={context} onChange={switchTo} />}
        <IconButton
          variant="ghost"
          label="Copy a link to this page"
          className="hidden sm:inline-flex"
          onClick={() => copy(window.location.href, "link")}
        >
          <IconCopy />
        </IconButton>
        <IconButton
          variant="ghost"
          label="Tokens: colors, fonts and the type scale as code"
          shortcut={["T"]}
          className="hidden sm:inline-flex"
          onClick={() => setTokens(true)}
        >
          <IconCode />
        </IconButton>
        <IconButton variant="ghost" label="History" shortcut={["H"]} className="hidden sm:inline-flex" onClick={() => setHistory(true)}>
          <IconHistory />
        </IconButton>
        {canEdit && (
          <IconButton variant="ghost" label="Preview as readers see it" shortcut={["P"]} className="hidden sm:inline-flex" asChild>
            <Link href={readHref}>
              <IconEye />
            </Link>
          </IconButton>
        )}
        <ForAgents
          about={`These rules as data, in this order${context ? `, resolved for ${contextLabel(context)}` : ", every variant included"}. Agents read them before making anything on-brand.`}
          reads={brandReads(brand, context)}
        />
        {/* On a phone the header keeps its room for the name: the rest fold into one menu. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton variant="ghost" label="More" className="sm:hidden">
              <IconDots />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => setTokens(true)}>
              <IconCode /> Tokens
              <DropdownMenuShortcut>
                <Kbd keys={["T"]} />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setHistory(true)}>
              <IconHistory /> History
              <DropdownMenuShortcut>
                <Kbd keys={["H"]} />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            {canEdit && (
              <DropdownMenuItem asChild>
                <Link href={readHref}>
                  <IconEye /> Preview
                  <DropdownMenuShortcut>
                    <Kbd keys={["P"]} />
                  </DropdownMenuShortcut>
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => void copy(window.location.href, "link")}>
              <IconCopy /> Copy link
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </AppHeader>

      <div
        style={look}
        className={cn(
          LOOK,
          // sm:pl-16 is the gutter's room: the + and the handle sit left of each block.
          "mx-auto w-full max-w-4xl space-y-16 px-4 pt-10 pb-32 transition-[padding,max-width] duration-300 ease-out motion-reduce:transition-none sm:pt-14 sm:pr-8 sm:pl-16",
          // Room for Details: the page reflows beside it rather than under it.
          current && "lg:max-w-[90rem] lg:pr-[34rem]",
        )}
      >
        <TokensDialog brand={brand} context={context} open={tokens} onOpenChange={setTokens} />
        <History
          brand={brand}
          open={history}
          onOpenChange={setHistory}
          edits={edits}
          onRestored={() => void reload()}
        />
        <ReadOnly.Provider value={!canEdit}>
          <Hero
            brand={brand}
            rules={shown}
            all={rules}
            context={context}
            updated={last && { at: last.updatedAt, who: byWhom(last.actor, me) }}
            title={
              canEdit ? (
                <Editable
                  key={titleResets}
                  value={brand.name}
                  label="Brand name"
                  onSave={(v) => {
                    if (!v) return false;
                    void renameBrand(v);
                  }}
                />
              ) : undefined
            }
            onAddLogo={canEdit ? addLogo : undefined}
          />

          {!rules.length && (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconBook />
                </EmptyMedia>
                <EmptyTitle>{canEdit ? "Start your guidelines" : "No guidelines yet"}</EmptyTitle>
                <EmptyDescription>
                  {canEdit ? (
                    <>
                      Add the rules most brands begin with (clear space, minimum size, logo don&apos;ts, a type scale,
                      voice, words to avoid) and edit them into yours, or type / below to start blank.
                    </>
                  ) : (
                    "Someone with edit access can start them."
                  )}
                </EmptyDescription>
              </EmptyHeader>
              {canEdit && (
                <Button pending={adding} onClick={essentials}>
                  <IconPlus /> {adding ? "Adding..." : "Add the essentials"}
                </Button>
              )}
            </Empty>
          )}

          {names.map((name) => {
            const ks = keysIn(name);
            // A palette reads as a grid of cards; editors keep one column, where a drop lands between rows.
            const palette = !canEdit && sections.get(name)!.every((r) => r.type === "color");
            return (
              <section key={name} id={`section-${name}`} className="@container scroll-mt-20">
                <SectionHeader id={`section-${name}`} {...meta(name)} />
                <div className={palette ? PALETTE : "space-y-4"}>
                  {ks.map((key) => {
                    const view = sections.get(name)!.filter((r) => r.key === key);
                    const first = rules.find((r) => r.key === key)!.id;
                    return (
                      // Keyed by the key's first rule, which a rename and a context's own version both leave in place.
                      <Fragment key={first}>
                        <RuleView
                          rules={view}
                          anchor={`rule-${key}`}
                          inherited={!!context && view[0].context === null}
                          // A new key, not a new variant of one already on the page.
                          entering={fresh.has(first)}
                          selected={open?.key === key ? current?.id : undefined}
                          line={lineFor(name, key, ks)}
                          dragging={drag === key}
                          stacked={palette}
                          ed={canEdit ? edFor(key, name, ks) : undefined}
                        />
                        {canEdit && below === key && (
                          <GhostLine
                            at={name}
                            initial="/"
                            autoFocus
                            placeholder={only || "Type / to add a rule"}
                            onPick={(p) => pick(p, name, key)}
                            onCreateText={(q) => void insertAfter(key, TEXT, name, q, true)}
                            onClose={(back) => {
                              setBelow(null);
                              if (back) focusRule(key, "block");
                            }}
                          />
                        )}
                      </Fragment>
                    );
                  })}
                  {!palette && <Pairings colors={colorsIn(name)} />}
                  {canEdit && (
                    <GhostLine
                      at={name}
                      placeholder={only || "Type / to add a rule"}
                      onPick={(p) => pick(p, name)}
                      onCreateText={(q) => void insertAfter(null, TEXT, name, q, true)}
                    />
                  )}
                </div>
                {palette && <Pairings colors={colorsIn(name)} className="mt-8" />}
              </section>
            );
          })}

          {canEdit && (
            <section className="space-y-1">
              {draft && (
                <DraftLine
                  icon={IconBook}
                  initial=""
                  placeholder="Name the new section, e.g. Imagery"
                  hint={(v) =>
                    `A new section${camel(v) ? ` (${camel(v)})` : ""} for ${draft.name ? `"${draft.name}"` : `the ${draft.preset.label.toLowerCase()}`}. Enter to add, Esc to cancel.`
                  }
                  check={(v) => (camel(v) ? undefined : "Give it a name with a letter in it")}
                  onCancel={() => setDraft(null)}
                  onCommit={async (v) => {
                    const p = draft.preset;
                    await insertAfter(null, p, camel(v), draft.name ?? p.name ?? p.suggest ?? p.label, !!(draft.name ?? p.name));
                    setDraft(null);
                  }}
                />
              )}
              <GhostLine
                at={null}
                placeholder={only || (rules.length ? "Type / to add a rule or a section" : "Type / to add the first rule")}
                onPick={(p) => pick(p, null)}
                onCreateText={(q) => setDraft({ preset: TEXT, name: q })}
              />
            </section>
          )}
        </ReadOnly.Provider>

        <Sheet open={!!current} modal={false} onOpenChange={(o) => !o && setOpen(null)}>
          <SheetContent
            ref={sheet}
            // Docked beside the page, which moves with it: no shadow.
            className="w-full gap-0 p-0 shadow-none sm:max-w-lg"
            // Under the header, so its controls stay in reach.
            style={{ top: "3.5rem", height: "calc(100svh - 3.5rem)" }}
            // Opened from the keyboard, focus goes in; clicked, it stays where you were.
            onOpenAutoFocus={(e) => !open?.kb && e.preventDefault()}
            // Closed, focus goes back to the block, unless it has already moved on to the page.
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              const el = document.activeElement;
              if (kept && (!el || el === document.body || sheet.current?.contains(el))) blockOf(kept.key)?.focus();
            }}
            // A standard side sheet: the page stays live beside it, and shows each change.
            onInteractOutside={(e) => e.preventDefault()}
            // Esc in a field puts the field back; only outside one does it close the panel.
            onEscapeKeyDown={(e) => {
              const el = document.activeElement;
              if (!(el instanceof HTMLElement) || !el.matches("input, textarea, [contenteditable=true]")) return;
              e.preventDefault();
              // The panel hears Esc before the rich editor can: leave the editor here, which saves it.
              if (el.isContentEditable) el.blur();
            }}
          >
            {bodyRule && (
              <RulePanel
                key={bodyGroup[0].id}
                rules={bodyGroup}
                rule={bodyRule}
                contexts={contexts}
                fonts={fonts}
                resets={resets}
                onSelect={(id) => setOpen({ key: bodyRule.key, id })}
                onPatch={(b) => void edit(bodyRule, b)}
                onRename={(name) => proposeRename(bodyRule, name)}
                onVariant={(c) => addVariant(bodyRule, c)}
                onPickAssets={() => setPicking(bodyRule)}
              />
            )}
          </SheetContent>
        </Sheet>

        <AlertDialog
          open={!!renaming}
          onOpenChange={(o) => {
            if (o) return;
            setRenaming(null);
            setResets((n) => n + 1);
          }}
        >
          {renamed && (
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {renamed.to
                    ? `Move ${label(renamed.rule.key)} to ${meta(renamed.to.section).title}?`
                    : `Rename ${renamed.rule.key}?`}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Agents, the API and design tokens know this rule as{" "}
                  <code className="font-mono">{renamed.rule.key}</code>
                  {["color", "number", "font"].includes(renamed.rule.type) && (
                    <>
                      {" "}
                      (CSS <code className="font-mono">--{kebab(renamed.rule.key)}</code>)
                    </>
                  )}
                  . It becomes <code className="font-mono">{renamed.key}</code>, with its variants, and anything
                  still asking for the old name stops finding it.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{renamed.to ? "Leave it" : "Keep the name"}</AlertDialogCancel>
                <AlertDialogAction onClick={() => void rename(renamed.rule, renamed.key, renamed.to)}>
                  {renamed.to ? "Move" : "Rename"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          )}
        </AlertDialog>

        <AlertDialog
          open={!!asking}
          onOpenChange={(o) => {
            if (o) return;
            // Called off: the fields show what is saved again.
            setAsking(null);
            setResets((n) => n + 1);
          }}
        >
          {asked && context && (
            // It opens mid-edit, and Cancel puts the saved text back: only a button answers it, never a stray Esc.
            <AlertDialogContent onEscapeKeyDown={(e) => e.preventDefault()}>
              <AlertDialogHeader>
                <AlertDialogTitle>Change {label(asked.rule.key)} for {contextLabel(context)} only?</AlertDialogTitle>
                <AlertDialogDescription>
                  This rule comes from the default, which every context shares. Changing it there changes it for
                  everyone, agents included. Your choice holds for {contextLabel(context)} until you leave the page.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="outline"
                  onClick={() => {
                    setScopeOf((s) => ({ ...s, [context]: "every" }));
                    setAsking(null);
                    void save(asked.rule, asked.body);
                  }}
                >
                  For every context
                </AlertDialogAction>
                <AlertDialogAction
                  onClick={() => {
                    setScopeOf((s) => ({ ...s, [context]: "only" }));
                    setAsking(null);
                    void override(asked.rule, asked.body);
                  }}
                >
                  Only for {contextLabel(context)}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          )}
        </AlertDialog>

        {lastPick && (
          <AssetPicker
            key={lastPick.n}
            open={!!picking}
            rule={lastPick.rule}
            onClose={() => setPicking(null)}
            onSave={async (assets) => {
              await edit(latest(lastPick.rule), { assets });
              setPicking(null);
            }}
          />
        )}
      </div>
    </>
  );
}


// ---- page furniture ---------------------------------------------------------

/** A palette section's cards, for readers. */
const PALETTE = "grid gap-x-6 gap-y-8 @2xl:grid-cols-2";

/**
 * A brand's guidelines as a reader sees them, with nothing to edit: a brand
 * portal's tab (components/portal-view.tsx). The same sections, rules, cover
 * and contents as the page above, in the same order. The portal owns the
 * page's h1, so the brand's name is an h2 here.
 */
export function Guidelines({ name, rules }: { name: string; rules: Rule[] }) {
  const sections = new Map<string, Rule[]>();
  for (const r of rules) sections.set(section(r.key), [...(sections.get(section(r.key)) ?? []), r]);
  const names = sectionsOf(rules);
  const keysIn = (n: string) => [...new Set((sections.get(n) ?? []).map((r) => r.key))];
  const active = useActiveSection(names.map((n) => `section-${n}`))?.replace(/^section-/, "") ?? null;
  useHashFlash();
  const look = useBrandLook(rules);
  return (
    <ReadOnly.Provider value={true}>
      {names.length > 1 && <Toc names={names} active={active} />}
      <div style={look} className={cn(LOOK, "space-y-16")}>
        <Hero brand={{ name }} rules={rules} portal />
        {!rules.length && <p className="text-muted-foreground text-sm">No guidelines here yet.</p>}
        {names.map((n) => {
          const palette = sections.get(n)!.every((r) => r.type === "color");
          return (
            <section key={n} id={`section-${n}`} className="@container scroll-mt-20">
              <SectionHeader id={`section-${n}`} {...meta(n)} />
              <div className={palette ? PALETTE : "space-y-4"}>
                {keysIn(n).map((key) => (
                  <RuleView
                    key={key}
                    rules={sections.get(n)!.filter((r) => r.key === key)}
                    anchor={`rule-${key}`}
                    line={null}
                    dragging={false}
                    stacked={palette}
                  />
                ))}
              </div>
              <Pairings colors={colorsOf(sections.get(n)!)} className="mt-4" />
            </section>
          );
        })}
      </div>
    </ReadOnly.Provider>
  );
}

/**
 * Where you are, Notion style: the guidelines, this brand (a switcher when
 * there are more), and the section you are reading (a menu of them where the
 * contents rail doesn't fit).
 */
function Trail({ brand, context, names, active }: { brand: BrandInfo; context?: string; names: string[]; active: string | null }) {
  const { brands } = useShell();
  const router = useRouter();
  // The new-brand dialog, kept while it fades out; `n` counts openings.
  const [making, setMaking] = useState<{ open: boolean; n: number } | null>(null);
  const crumb = "hover:bg-muted hover:text-foreground -mx-1 flex min-w-0 items-center gap-1 rounded-md px-1 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50";
  const at = active ? meta(active) : null;
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex-1 overflow-hidden">
      <ol className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm whitespace-nowrap">
        <li className="hidden sm:block">
          {/* This brand's, in the context shown: the page itself, from the top. */}
          <Link href={brandHref(brand, context)} className="hover:text-foreground">
            Guidelines
          </Link>
        </li>
        <li aria-hidden className="hidden sm:block">
          /
        </li>
        <li className="text-foreground min-w-0 font-medium">
          {brands.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger className={crumb}>
                <span className="truncate">{brand.name}</span>
                <IconSelector className="size-3.5 shrink-0 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                {brands.map((b) => (
                  <DropdownMenuItem key={b.slug} asChild>
                    <Link href={brandHref(b)}>
                      <IconCheck className={cn(b.slug !== brand.slug && "invisible")} />
                      <span className="truncate">{b.name}</span>
                      {b.default && <IconStar className="text-muted-foreground ml-auto" aria-label="default" />}
                    </Link>
                  </DropdownMenuItem>
                ))}
                <Can do="brand.edit">
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setMaking((m) => ({ open: true, n: (m?.n ?? 0) + 1 }))}>
                    <IconPlus /> New brand
                  </DropdownMenuItem>
                </Can>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                goTo("top");
              }}
              className={crumb}
            >
              <span className="truncate">{brand.name}</span>
            </a>
          )}
        </li>
        {names.length > 0 && (
          <>
            <li aria-hidden className={cn(!at && "xl:hidden")}>
              /
            </li>
            {/* Below xl the rail doesn't fit: the section is a menu of them all. */}
            <li className="min-w-0 xl:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger className={crumb}>
                  <span className="truncate">{at?.title ?? "Contents"}</span>
                  <IconChevronDown className="size-3.5 shrink-0 opacity-60" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {names.map((n) => {
                    const { title, icon: I } = meta(n);
                    return (
                      <DropdownMenuItem key={n} onSelect={() => goTo(`section-${n}`)}>
                        <I /> {title}
                        {n === active && <IconCheck className="ml-auto" />}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
            {at && (
              <li className="hidden truncate xl:block" aria-current="location">
                {at.title}
              </li>
            )}
          </>
        )}
      </ol>
      {making && (
        <BrandDialog
          key={making.n}
          open={making.open}
          editing={{ kind: "new" }}
          brands={brands}
          onClose={() => setMaking((m) => m && { ...m, open: false })}
          onDone={(b) => {
            setMaking((m) => m && { ...m, open: false });
            toast.success(`Created ${b.name}`);
            router.push(brandHref(b));
            router.refresh();
          }}
        />
      )}
    </nav>
  );
}

/**
 * The page's contents, Notion style: a dash per section on the right edge,
 * the one you are reading drawn longer, names on hover or keyboard focus
 * (always there for a screen reader). The sidebar stays the app's; this is
 * the page's. Only from xl, where the page leaves a gutter for it.
 */
function Toc({ names, active }: { names: string[]; active: string | null }) {
  return (
    <nav
      aria-label="On this page"
      className="group/toc hover:bg-popover focus-within:bg-popover fixed top-1/3 right-3 z-20 hidden rounded-lg border border-transparent p-2 transition-[background-color,box-shadow,border-color] duration-150 focus-within:border-inherit focus-within:shadow-md hover:border-inherit hover:shadow-md xl:block"
    >
      <ul className="flex flex-col gap-1">
        {names.map((name) => {
          const on = active === name;
          return (
            <li key={name}>
              <a
                href={`#section-${name}`}
                onClick={(e) => {
                  e.preventDefault();
                  goTo(`section-${name}`);
                }}
                className="focus-visible:ring-ring/50 flex items-center justify-end gap-3 rounded py-1 outline-none focus-visible:ring-2"
                aria-current={on ? "location" : undefined}
              >
                <span
                  className={cn(
                    "sr-only text-sm whitespace-nowrap opacity-0 transition-opacity duration-150",
                    "group-focus-within/toc:not-sr-only group-focus-within/toc:opacity-100 group-hover/toc:not-sr-only group-hover/toc:opacity-100",
                    on ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {meta(name).title}
                </span>
                <span className={cn("h-0.5 rounded-full transition-all", on ? "bg-foreground w-5" : "bg-muted-foreground/40 w-3")} />
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Which context the page shows: every rule and variant, or what one context resolves to. */
function ContextPicker({
  contexts,
  context,
  onChange,
}: {
  contexts: string[];
  context?: string;
  onChange: (context?: string) => void;
}) {
  return (
    <Select value={context ?? "*"} onValueChange={(v) => onChange(v === "*" ? undefined : v)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <SelectTrigger
            size="sm"
            aria-label="Show the rules for a context"
            // A dot says a context is on, where a phone shows only the icon.
            className={cn(context && "after:bg-primary relative after:absolute after:top-1 after:right-1 after:size-1.5 after:rounded-full sm:after:hidden")}
          >
            <IconVersions />
            {/* On a phone, the icon: the header's room goes to the other controls. */}
            <span className="hidden sm:inline">
              <SelectValue />
            </span>
          </SelectTrigger>
        </TooltipTrigger>
        <TooltipContent>Show the rules as they apply in one context</TooltipContent>
      </Tooltip>
      <SelectContent align="end">
        <SelectItem value="*">All contexts</SelectItem>
        {contexts.map((c) => (
          <SelectItem key={c} value={c}>
            {contextLabel(c)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** How an agent reads this page: the same rules, in the same order, resolved for the context shown. */
function brandReads(brand: BrandInfo, context?: string) {
  return (origin: string) => {
    const uri = brand.default ? "artbucket://brand/rules" : `artbucket://brands/${brand.slug}/rules`;
    const q = new URLSearchParams();
    if (!brand.default) q.set("brand", brand.slug);
    if (context) q.set("context", context);
    return [
      { label: "MCP tool", text: call("brand_rules", { brand: brand.default ? undefined : brand.slug, context }) },
      { label: "MCP resource", text: `${uri}${context ? `/${context}` : ""}` },
      { label: "REST", text: curl(`${origin}/api/v1/brand/rules${q.size ? `?${q}` : ""}`) },
      { label: "Design tokens", text: curl(`${origin}${tokensPath(brand, context, "json")}`) },
    ];
  };
}

// ---- rules ------------------------------------------------------------------

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="@container space-y-2">
      <h3 className="text-muted-foreground text-xs font-medium">{title}</h3>
      {children}
    </div>
  );
}

/**
 * What the page can't show of a rule: its name and the key agents know it
 * by, its variants, its assets or files, the face it is set in. Everything
 * else is edited on the page. Everything saves as you leave it.
 */
function RulePanel({
  rules,
  rule: r,
  contexts,
  fonts,
  resets,
  onSelect,
  onPatch,
  onRename,
  onVariant,
  onPickAssets,
}: {
  rules: Rule[];
  rule: Rule;
  /** The brand's contexts: what a new variant is likely for. */
  contexts: string[];
  /** The brand's font rules, one per key: what a type scale can be set in. */
  fonts: Rule[];
  resets: number;
  onSelect: (id: string) => void;
  onPatch: (body: Patch) => void;
  onRename: (name: string) => void;
  onVariant: (context: string) => Promise<void>;
  onPickAssets: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const files = fontFiles(r);
  const others = r.assets.filter((a) => !isFontAsset(a));
  const setIn =
    section(r.key) === "type" &&
    (r.type === "text" || (r.type === "list" && listStyle(r.key, r.value as (string | number)[]) === "scale"));
  return (
    <>
      <SheetHeader className="gap-1 border-b pr-12">
        <SheetDescription className="text-xs">{meta(section(r.key)).title}</SheetDescription>
        <SheetTitle asChild>
          <div>
            <Editable
              key={`${r.key}:${resets}`}
              value={label(r.key)}
              label="Name"
              className="text-lg font-semibold"
              onSave={(v) => v && onRename(v)}
            />
          </div>
        </SheetTitle>
        <div className="text-muted-foreground flex items-center gap-1 text-xs">
          <Tooltip>
            <TooltipTrigger asChild>
              <code className="font-mono" tabIndex={0}>
                {r.key}
              </code>
            </TooltipTrigger>
            <TooltipContent>Agents and the API know the rule by this key</TooltipContent>
          </Tooltip>
          <CopyButton text={r.key} label="Copy the key" what="key" />
        </div>
      </SheetHeader>

      <div className="flex flex-wrap items-center gap-1 border-b px-4 py-2">
        {rules.length > 1 && <Variants rules={rules} current={r} onPick={onSelect} />}
        {!adding && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => setAdding(true)}>
                <IconPlus /> {rules.length > 1 ? "Variant" : "Add a variant for a context"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>A version of this rule for one context: agents working there get it instead</TooltipContent>
          </Tooltip>
        )}
      </div>
      {adding && (
        <div className="border-b px-2 py-2">
          <DraftLine
            icon={IconVersions}
            initial=""
            placeholder="Where it differs, e.g. Dark background"
            options={contexts.filter((c) => !rules.some((x) => x.context === c))}
            optionLabel={contextLabel}
            // Typed as words, saved as a slug: nobody has to know the format.
            hint={(v) => `${slug(v) ? `Saved as ${slug(v)}. ` : ""}Agents working there get this variant instead. Enter to add, Esc to cancel.`}
            check={(v) =>
              !slug(v) ? "Give it a name with a letter or a number in it" : slug(v).length > 64 ? "Keep it under 64 characters" : undefined
            }
            onCancel={() => setAdding(false)}
            onCommit={async (c) => {
              await onVariant(slug(c));
              setAdding(false);
            }}
          />
        </div>
      )}

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        <Part title={r.type === "font" ? "Files" : "Assets"}>
          {files.length > 0 && (
            <FontStyles
              files={files}
              onRemove={(id) => onPatch({ assets: r.assets.filter((x) => x.id !== id) })}
              onAdd={onPickAssets}
            />
          )}
          {r.type === "font" && files.length === 0 && (
            <ImportFamily
              family={fontValue(r.value).family}
              onImported={(family, ids) =>
                onPatch({
                  value: { ...fontValue(r.value), family },
                  assets: [...r.assets, ...ids.map((id) => ({ id, rendition: null }))],
                })
              }
            />
          )}
          <div className="flex flex-wrap gap-2">
            {others.map((a) => (
              <AssetTile
                key={a.id}
                asset={a}
                onChange={(rendition) => onPatch({ assets: r.assets.map((x) => (x.id === a.id ? { ...x, rendition } : x)) })}
                onRemove={() => onPatch({ assets: r.assets.filter((x) => x.id !== a.id) })}
              />
            ))}
            <button
              type="button"
              onClick={onPickAssets}
              className="text-muted-foreground hover:text-foreground hover:border-foreground/30 flex size-28 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs transition-colors"
            >
              <IconPlus className="size-5" />
              {r.type === "font" ? "Add files" : "Add assets"}
            </button>
          </div>
        </Part>
        {setIn && (
          <Part title="Typeface">
            <SetIn rule={r} fonts={fonts} onPatch={onPatch} />
          </Part>
        )}
      </div>
    </>
  );
}

/**
 * Which of the brand's fonts a typography rule (a scale, a sentence) is set
 * in. The choice is the font rule's file at its weight, attached to the rule,
 * so an agent reading it gets the file to set it in.
 */
function SetIn({ rule: r, fonts, onPatch }: { rule: Rule; fonts: Rule[]; onPatch: (body: Pick<Rule, "assets">) => void }) {
  const current = r.assets.find(isFontAsset);
  const chosen = current && fonts.find((f) => f.assets.some((a) => a.id === current.id));
  return (
    <div className="text-muted-foreground flex items-center gap-2 text-xs">
      Set in
      <Select
        value={chosen?.key ?? (current ? "file" : "none")}
        onValueChange={(k) => {
          if (k === "file") return;
          const f = fonts.find((x) => x.key === k);
          const file = f && pickFace(fontFiles(f), fontValue(f.value).weight);
          onPatch({ assets: [...r.assets.filter((a) => !isFontAsset(a)), ...(file ? [{ id: file.id, rendition: null }] : [])] });
        }}
      >
        <SelectTrigger size="sm" className="h-7 text-xs" aria-label="The font this rule is set in">
          <IconLetterCase />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">The page&apos;s font</SelectItem>
          {current && !chosen && <SelectItem value="file">{current.title || current.filename}</SelectItem>}
          {fonts.map((f) => (
            <SelectItem key={f.key} value={f.key} disabled={!fontFiles(f).length}>
              {label(f.key)} · {fontValue(f.value).family}
              {!fontFiles(f).length && " (no files yet)"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ---- adding -----------------------------------------------------------------

/** "Create a text rule" matches nothing, so it shows only when nothing else does. */
const CREATE = "\u0000create";
const unslashed = (q: string) => q.replace(/^\//, "").trim();
const filterPresets = (value: string, search: string, keywords?: string[]) =>
  value === CREATE ? 0 : defaultFilter(value, unslashed(search), keywords);

/**
 * Notion's empty line: type / (or anything) and the named building blocks
 * filter as you type, this section's first, the plain kinds last; Enter
 * picks. Nothing matching offers a plain text rule named what you typed.
 * One cmdk root spans the line and the portaled list, so the arrows work
 * while the caret stays in the line.
 */
function GhostLine({
  at,
  placeholder,
  initial = "",
  autoFocus,
  onPick,
  onCreateText,
  onClose,
}: {
  /** The section it adds to; null at the end of the page. */
  at: string | null;
  placeholder: string;
  /** "/" opens it with the list showing, from a block's + or its "/" key. */
  initial?: string;
  autoFocus?: boolean;
  onPick: (p: Preset) => void;
  onCreateText: (name: string) => void;
  /** Opened under a block: it goes once left empty. `back`: Esc, so focus returns to the block. */
  onClose?: (back: boolean) => void;
}) {
  const [q, setQ] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  const groups = new Map<string, Preset[]>();
  for (const p of PRESETS) groups.set(p.section, [...(groups.get(p.section) ?? []), p]);
  const order = [...groups.keys()].sort(
    (a, b) => Number(b === at) - Number(a === at) || Number(a === "") - Number(b === "") || rank(a) - rank(b),
  );
  const name = unslashed(q);
  const done = () => {
    setQ("");
    onClose?.(false);
  };
  return (
    <Command shouldFilter filter={filterPresets} className="overflow-visible bg-transparent">
      <Popover open={!!q} onOpenChange={(o) => !o && setQ("")}>
        <PopoverAnchor asChild>
          <CommandPrimitive.Input
            ref={input}
            autoFocus={autoFocus}
            value={q}
            onValueChange={setQ}
            placeholder={placeholder}
            aria-label={placeholder}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQ("");
                e.currentTarget.blur();
                onClose?.(true);
              } else if (e.key === "Backspace" && !q && onClose) {
                e.preventDefault();
                onClose(true);
              }
            }}
            onBlur={() => !q && onClose?.(false)}
            className="placeholder:text-muted-foreground/50 hover:bg-muted/40 focus:bg-muted/40 w-full rounded-lg bg-transparent px-2 py-1.5 text-sm transition-colors outline-none"
          />
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="w-80 p-0"
          // The caret stays in the line; the arrows reach the list through cmdk.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.target === input.current && e.preventDefault()}
          onInteractOutside={(e) => e.target === input.current && e.preventDefault()}
        >
          <CommandList className="max-h-80">
            <CommandEmpty className="p-1">
              {name && (
                <CommandItem
                  forceMount
                  value={CREATE}
                  onSelect={() => {
                    onCreateText(name);
                    done();
                  }}
                >
                  <IconTypography />
                  <span className="truncate">Create a text rule &ldquo;{name}&rdquo;</span>
                </CommandItem>
              )}
            </CommandEmpty>
            {order.map((g) => (
              <CommandGroup key={g || "basic"} heading={g ? meta(g).title : at ? `Plain, in ${meta(at).title}` : "Plain, in a new section"}>
                {groups.get(g)!.map((p) => {
                  const I = TYPE_ICON[p.type];
                  return (
                    <CommandItem
                      key={p.id}
                      value={`${p.label} ${p.hint} ${g}`}
                      onSelect={() => {
                        onPick(p);
                        done();
                      }}
                    >
                      <I />
                      <div className="min-w-0">
                        <div>{p.label}</div>
                        <div className="text-muted-foreground truncate text-xs">{p.hint}</div>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </PopoverContent>
      </Popover>
    </Command>
  );
}

/** A one-line prompt in the flow: a new section's name, a variant's context. */
function DraftLine({
  icon: I,
  initial,
  placeholder,
  hint,
  options,
  optionLabel,
  check,
  onCommit,
  onCancel,
}: {
  icon: Icon;
  initial: string;
  placeholder: string;
  /** Offered as you type. */
  options?: string[];
  /** How an option reads beside its value. */
  optionLabel?: (option: string) => string;
  hint: string | ((v: string) => string);
  check: (v: string) => string | undefined;
  onCommit: (v: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const list = useId();
  return (
    <div className="bg-muted/40 space-y-1 rounded-lg px-2 py-2">
      <div className="flex items-center gap-2">
        <I className="text-muted-foreground size-4 shrink-0" />
        <input
          autoFocus
          value={v}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-invalid={!!problem}
          list={options?.length ? list : undefined}
          disabled={busy}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setV(e.target.value);
            setProblem(undefined);
          }}
          onBlur={() => !busy && (v === initial || !v.trim()) && onCancel()}
          onKeyDown={async (e) => {
            if (e.key === "Escape") return onCancel();
            if (e.key !== "Enter") return;
            e.preventDefault();
            const bad = check(v.trim());
            if (bad) return setProblem(bad);
            setBusy(true);
            await onCommit(v.trim());
            setBusy(false);
          }}
          className="placeholder:text-muted-foreground/60 min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        {!!options?.length && (
          <datalist id={list}>
            {options.map((o) => (
              <option key={o} value={o}>
                {optionLabel?.(o)}
              </option>
            ))}
          </datalist>
        )}
      </div>
      <p className={cn("pl-6 text-xs", problem ? "text-destructive" : "text-muted-foreground")}>{problem ?? (typeof hint === "function" ? hint(v.trim()) : hint)}</p>
    </div>
  );
}

// ---- assets -----------------------------------------------------------------

/** Search the library and pick what a rule points at; order is the order you pick in. */
function AssetPicker({
  open,
  rule,
  onClose,
  onSave,
}: {
  /** Kept mounted while it closes, so it fades out whole. */
  open: boolean;
  rule: Rule;
  onClose: () => void;
  onSave: (assets: RuleAsset[]) => Promise<void>;
}) {
  // A font rule's files are named after the family, without its spaces: DMSans-Bold.ttf.
  const [q, setQ] = useState(rule.type === "font" ? fontValue(rule.value).family.replace(/ +/g, "") : "");
  const [results, setResults] = useState<Asset[] | null>(null);
  // A search on the way: the last results stay, dimmed, until it lands.
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [picked, setPicked] = useState(rule.assets);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Only the latest query answers: an older, slower one is called off, not drawn over it.
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/v1/assets?limit=48${q ? `&q=${encodeURIComponent(q)}` : ""}`, { signal: ctl.signal });
        if (!res.ok) throw new Error(res.statusText);
        setResults((await res.json()).data);
        setFailed(false);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setFailed(true);
      }
      setSearching(false);
    }, 200);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, attempt]);

  const toggle = (id: string) =>
    setPicked((p) => (p.some((x) => x.id === id) ? p.filter((x) => x.id !== id) : [...p, { id, rendition: null }]));
  const setRendition = (id: string, rendition: string | null) =>
    setPicked((p) => p.map((x) => (x.id === id ? { ...x, rendition } : x)));
  // What the rule and the search have shown: a file with no preview has no renditions to offer.
  const [kinds, setKinds] = useState<Record<string, { mime: string; preview: boolean }>>(() =>
    Object.fromEntries(rule.assets.flatMap((a) => (a.mime ? [[a.id, { mime: a.mime, preview: !!a.preview }]] : []))),
  );
  if (results?.some((a) => !(a.id in kinds)))
    setKinds((k) => ({ ...k, ...Object.fromEntries(results.map((a) => [a.id, { mime: a.mime, preview: hasPreview(a) }])) }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{rule.type === "font" ? "Files" : "Assets"} for {label(rule.key)}</DialogTitle>
          <DialogDescription>
            {rule.type === "font"
              ? "The family's font files, one per style. Agents get each file's URL."
              : "The logo it governs, examples of it done right. Pick a size under each to say which one the rule means; agents get that exact URL."}
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the library"
            className="pr-8 pl-8"
          />
          {searching && results && (
            <IconLoader2 aria-label="Searching" className="text-muted-foreground absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin" />
          )}
        </div>
        {picked.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Picked, in order">
            {picked.map(({ id, rendition }, i) => (
              <div key={id} className="grid w-20 shrink-0 gap-1">
                <div className="bg-checker relative size-20 overflow-hidden rounded-md border">
                  {kinds[id] && isFont(kinds[id].mime, "") ? (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <FontThumb id={id} className="text-2xl" />
                    </span>
                  ) : (
                    <Thumb src={assetUrl(id, "/w_80,f_webp")} alt="" className="p-1" />
                  )}
                  <span className="bg-primary text-primary-foreground absolute bottom-0.5 left-0.5 flex size-4 items-center justify-center rounded-full text-2xs">
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    aria-label="Unpick"
                    onClick={() => toggle(id)}
                    className="bg-background/90 absolute top-0.5 right-0.5 rounded-full p-0.5 shadow-sm"
                  >
                    <IconX className="size-3" />
                  </button>
                </div>
                {kinds[id] && isFont(kinds[id].mime, "") ? null : kinds[id] && !kinds[id].preview ? (
                  <span className="text-muted-foreground truncate text-center text-2xs">Original</span>
                ) : (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="hover:bg-muted flex items-center justify-center gap-0.5 truncate rounded px-1 text-2xs font-medium"
                        title="Which size the rule means"
                      >
                        <span className="truncate">{renditionLabel(rendition)}</span>
                        <IconChevronDown className="size-3 shrink-0" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-80 p-0">
                      <RenditionMenu value={rendition} onChange={(r) => setRendition(id, r)} />
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            ))}
          </div>
        )}
        {/* The scroll box and the grid are separate: square tiles in a height-capped grid squash into each other. */}
        <div className="-mx-1 max-h-[50vh] overflow-y-auto p-1">
          {failed ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-muted-foreground text-sm">Couldn&apos;t load the library.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFailed(false);
                  setAttempt((n) => n + 1);
                }}
              >
                <IconRefresh /> Retry
              </Button>
            </div>
          ) : (
          <div className={cn("grid grid-cols-3 gap-2 transition-opacity sm:grid-cols-4", searching && results && "opacity-60")}>
            {!results && Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="aspect-square rounded-md" />)}
            {results?.map((a) => {
              const n = picked.findIndex((x) => x.id === a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={n >= 0}
                  onClick={() => toggle(a.id)}
                  className={cn(
                    "group bg-muted relative aspect-square overflow-hidden rounded-md border text-left",
                    n >= 0 && "ring-primary ring-2",
                  )}
                >
                  {hasPreview(a) ? (
                    <Thumb src={assetUrl(a.id, "/w_160,f_webp")} alt={a.filename} />
                  ) : isFont(a.mime, a.filename) ? (
                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2">
                      <FontThumb id={a.id} className="text-3xl" />
                      <span className="text-muted-foreground w-full truncate text-center text-2xs">{a.filename}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground absolute inset-0 flex items-center justify-center p-2 text-center text-xs break-all">
                      {a.filename}
                    </span>
                  )}
                  {n >= 0 && (
                    <span className="bg-primary text-primary-foreground absolute top-1 left-1 flex size-5 items-center justify-center rounded-full text-xs">
                      {n + 1}
                    </span>
                  )}
                </button>
              );
            })}
            {results?.length === 0 && (
              <p className="text-muted-foreground col-span-full py-8 text-center text-sm">Nothing found.</p>
            )}
          </div>
          )}
        </div>
        <DialogFooter className="items-center">
          <span className="text-muted-foreground mr-auto text-sm">{picked.length} picked</span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            pending={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(picked);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
