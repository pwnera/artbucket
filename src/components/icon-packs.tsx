"use client";

import { useEffect, useRef, useState } from "react";
import { IconArrowLeft, IconCheck, IconExternalLink, IconIcons, IconSearch } from "@tabler/icons-react";
import { toast } from "sonner";
import { IconGlyph, svgDataUri } from "@/components/icon-glyph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ICON_GROUP_NAMES, type IconGroup, type IconSet } from "@/lib/icons";
import { cn } from "@/lib/utils";

/** Icons asked for at once; the API takes up to 100 per import. */
const BATCH = 50;
const PAGE = 96;

/** Search for what is typed after a pause, dropping an answer overtaken by a newer question. */
function useSearch<T>(url: string | null) {
  const [found, setFound] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(url, { signal: ctl.signal });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error?.message ?? "Search failed");
        setFound(body);
        setError(null);
      } catch (e) {
        if (!ctl.signal.aborted) setError(e instanceof Error ? e.message : "Search failed");
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [url]);
  return { found, error, setFound };
}

/**
 * Open source icon packs, as Google Fonts are for type: find a set (Tabler,
 * Lucide, Material Symbols, Simple Icons for brands...), look through its
 * icons, pick the ones the brand uses and import them. Each becomes an SVG
 * asset tagged `icon`, credited to the set's author, its license in its
 * rights. Nothing here loads from Iconify: the set cards' samples come
 * through the API too.
 */
export function IconPackImport({
  into,
  onDone,
  open,
  onOpenChange,
}: {
  /** The collection being looked at: imports go there too. */
  into?: string | null;
  onDone: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [set, setSet] = useState<IconSet | null>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setTimeout(() => setSet(null), 200);
      }}
    >
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 sm:max-w-4xl md:h-[min(780px,calc(100dvh-2rem))]">
        {set ? (
          <SetView set={set} into={into} onBack={() => setSet(null)} onDone={onDone} />
        ) : (
          <SetsView open={open} onPick={setSet} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SetsView({ open, onPick }: { open: boolean; onPick: (s: IconSet) => void }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<IconGroup | "">("");
  const params = new URLSearchParams({ q, limit: "120", ...(group && { group }) });
  const { found, error } = useSearch<{ data: IconSet[]; total: number }>(open ? `/api/v1/icons?${params}` : null);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Icon packs</DialogTitle>
        <DialogDescription>
          Open source sets, through Iconify. Pick the icons you use: each becomes an SVG in the library, credited, with its license
          in its rights.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="relative">
          <IconSearch className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search sets: tabler, material, MIT"
            aria-label="Search icon sets"
            autoFocus
            className="h-8 pl-8"
          />
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={group || "all"}
          onValueChange={(v) => v && setGroup(v === "all" ? "" : (v as IconGroup))}
          aria-label="Kind of set"
          className="flex-wrap justify-start"
        >
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          {ICON_GROUP_NAMES.map((g) => (
            <ToggleGroupItem key={g} value={g}>
              {g === "Interface" ? "UI" : g}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="-mx-6 min-h-0 flex-1 overflow-y-auto border-y px-6 py-4">
        {error ? (
          <p className="text-muted-foreground text-sm">{error}</p>
        ) : !found ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : found.data.length === 0 ? (
          <p className="text-muted-foreground text-sm">No set matches &ldquo;{q}&rdquo;.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {found.data.map((s) => (
              <li key={s.prefix}>
                <button
                  type="button"
                  onClick={() => onPick(s)}
                  className="hover:border-foreground/20 hover:bg-muted/40 focus-visible:ring-ring/50 grid h-full w-full gap-3 rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-2"
                >
                  <SetSamples set={s} />
                  <span className="grid gap-0.5">
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {s.total.toLocaleString()} icons{s.license && ` · ${s.license.title}`}
                      {s.author && ` · ${s.author.name}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {found && found.total > found.data.length && (
        <p className="text-muted-foreground text-xs">
          {found.data.length} of {found.total} sets. Search to narrow it.
        </p>
      )}
    </>
  );
}

/**
 * A set's samples, asked for once its card comes near the view: a list of
 * 120 sets asking for all of theirs at once is 120 requests.
 */
function SetSamples({ set }: { set: IconSet }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState(false);
  const [icons, setIcons] = useState<{ name: string; svg: string }[] | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const seen = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setNear(true);
      },
      { rootMargin: "200px" },
    );
    seen.observe(el);
    return () => seen.disconnect();
  }, [near]);
  useEffect(() => {
    if (!near || !set.samples.length) return;
    const ctl = new AbortController();
    fetch(`/api/v1/icons/${set.prefix}/samples`, { signal: ctl.signal })
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((body: { data: { name: string; svg: string }[] }) => setIcons(body.data))
      .catch(() => !ctl.signal.aborted && setIcons([]));
    return () => ctl.abort();
  }, [near, set.prefix, set.samples.length]);
  return (
    <span ref={ref} className="flex h-6 items-center gap-3" aria-hidden>
      {icons
        ? icons.map((i) => <IconGlyph key={i.name} src={svgDataUri(i.svg)} mono={!set.palette} className="size-6" />)
        : set.samples.map((n) => <Skeleton key={n} className="size-6" />)}
    </span>
  );
}

type Browse = { set: IconSet; categories: string[]; total: number; data: { name: string; svg: string }[] };

function SetView({ set, into, onBack, onDone }: { set: IconSet; into?: string | null; onBack: () => void; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const params = new URLSearchParams({ q, limit: String(PAGE), ...(category && { category }) });
  const { found, error, setFound } = useSearch<Browse>(`/api/v1/icons/${set.prefix}?${params}`);
  const [more, setMore] = useState(false);
  // Picked by name, in the order picked; what was imported stays marked while the dialog is open.
  const [picked, setPicked] = useState<string[]>([]);
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<number | null>(null);
  const last = useRef<string | null>(null);
  const shown = found?.data ?? [];
  const mono = !set.palette;

  const loadMore = async () => {
    if (!found) return;
    setMore(true);
    try {
      const res = await fetch(`/api/v1/icons/${set.prefix}?${params}&offset=${found.data.length}`);
      const body = await res.json();
      if (!res.ok) return void toast.error(body.error?.message ?? "Couldn't load more");
      setFound({ ...found, data: [...found.data, ...body.data] });
    } finally {
      setMore(false);
    }
  };

  /** A click picks or drops one; Shift-click picks the run from the last one clicked, as in a file manager. */
  const toggle = (name: string, run: boolean) => {
    const names = shown.map((i) => i.name).filter((n) => !imported.has(n));
    const from = last.current ? names.indexOf(last.current) : -1;
    const to = names.indexOf(name);
    last.current = name;
    if (run && from >= 0 && to >= 0) {
      const span = names.slice(Math.min(from, to), Math.max(from, to) + 1);
      return setPicked((p) => [...p, ...span.filter((n) => !p.includes(n))]);
    }
    setPicked((p) => (p.includes(name) ? p.filter((n) => n !== name) : [...p, name]));
  };

  const run = async () => {
    const all = picked;
    setProgress(0);
    let done = 0;
    const failed: string[] = [];
    try {
      for (let i = 0; i < all.length; i += BATCH) {
        const icons = all.slice(i, i + BATCH);
        const res = await fetch("/api/v1/icons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prefix: set.prefix, icons, collections: into ? [into] : [] }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(body.error?.message ?? "Couldn't import them", { description: done ? `${done} imported before it stopped.` : undefined });
          break;
        }
        failed.push(...(body.missing ?? []));
        const landed = icons.filter((n) => !(body.missing ?? []).includes(n));
        done += landed.length;
        setImported((s) => new Set([...s, ...landed]));
        setPicked((p) => p.filter((n) => !landed.includes(n)));
        setProgress(Math.round(((i + icons.length) / all.length) * 100));
      }
    } finally {
      setProgress(null);
    }
    if (done) {
      toast.success(`Imported ${done} ${done === 1 ? "icon" : "icons"} from ${set.name}`, {
        description: [
          set.license && `Tagged icon, under ${set.license.title}${set.author ? `, credited to ${set.author.name}` : ""}.`,
          failed.length && `${failed.length} not found in the set.`,
        ]
          .filter(Boolean)
          .join(" "),
      });
      onDone();
    }
  };

  return (
    <>
      <DialogHeader className="gap-1">
        <div className="flex items-center gap-2 pr-8">
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="All icon sets" className="-ml-2">
            <IconArrowLeft />
          </Button>
          <DialogTitle className="truncate">{set.name}</DialogTitle>
          {set.license && (
            <Badge variant="outline" asChild={!!set.license.url}>
              {set.license.url ? (
                <a href={set.license.url} target="_blank" rel="noreferrer" title="Read the license">
                  {set.license.title} <IconExternalLink />
                </a>
              ) : (
                set.license.title
              )}
            </Badge>
          )}
        </div>
        <DialogDescription>
          {set.total.toLocaleString()} icons{set.author && ` by ${set.author.name}`}. Click to pick, Shift-click to pick a run. Each is
          imported at the size it is drawn at, {set.height ? `${set.height}px` : "its own grid"}.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="relative">
          <IconSearch className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${set.name}: arrow, user, brand`}
            aria-label={`Search ${set.name}`}
            autoFocus
            className="h-8 pl-8"
          />
        </div>
        {(found?.categories.length ?? 0) > 0 && (
          <Select value={category || "all"} onValueChange={(v) => setCategory(v === "all" ? "" : v)}>
            <SelectTrigger size="sm" className="w-full" aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Every category</SelectItem>
              {found!.categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="-mx-6 min-h-0 flex-1 overflow-y-auto border-y px-6 py-4">
        {error ? (
          <p className="text-muted-foreground text-sm">{error}</p>
        ) : !found ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] gap-2">
            {Array.from({ length: 32 }, (_, i) => (
              <Skeleton key={i} className="aspect-square" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="text-muted-foreground text-sm">No icon in {set.name} matches &ldquo;{q}&rdquo;.</p>
        ) : (
          <div className="grid gap-4">
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] gap-2" aria-label={`${set.name} icons`}>
              {shown.map((i) => {
                const on = picked.includes(i.name);
                const got = imported.has(i.name);
                return (
                  <li key={i.name}>
                    <button
                      type="button"
                      aria-pressed={got ? undefined : on}
                      disabled={got || progress !== null}
                      onClick={(e) => toggle(i.name, e.shiftKey)}
                      title={i.name}
                      className={cn(
                        "focus-visible:ring-ring/50 relative flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-lg border p-1.5 transition-colors outline-none focus-visible:ring-2",
                        on ? "border-primary bg-primary/5 ring-primary ring-1" : "hover:border-foreground/20 hover:bg-muted/40",
                        got && "opacity-60",
                      )}
                    >
                      <IconGlyph src={svgDataUri(i.svg)} mono={mono} className="size-7" />
                      <span className="text-muted-foreground line-clamp-2 w-full text-center text-[10px] leading-tight [overflow-wrap:anywhere]">
                        {i.name}
                      </span>
                      {(on || got) && (
                        <span
                          className={cn(
                            "absolute top-1 right-1 grid size-4 place-items-center rounded-full",
                            got ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
                          )}
                        >
                          <IconCheck className="size-3" />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            {shown.length < found.total && (
              <Button variant="outline" size="sm" className="justify-self-center" pending={more} onClick={loadMore}>
                Show more ({(found.total - shown.length).toLocaleString()} left)
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {progress !== null ? (
          <div className="flex min-w-48 flex-1 items-center gap-3">
            <Progress value={progress} className="h-1.5" aria-label="Importing" />
            <span className="text-muted-foreground text-xs tabular-nums">{progress}%</span>
          </div>
        ) : (
          <>
            <span className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
              {picked.length ? `${picked.length} picked` : found ? `${found.total.toLocaleString()} ${q || category ? "matching" : "icons"}` : ""}
            </span>
            {shown.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPicked((p) => [...p, ...shown.map((i) => i.name).filter((n) => !p.includes(n) && !imported.has(n))])}
              >
                Pick all shown
              </Button>
            )}
            {picked.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setPicked([])}>
                Clear
              </Button>
            )}
          </>
        )}
        <Button className="ml-auto" disabled={!picked.length || progress !== null} pending={progress !== null} onClick={run}>
          <IconIcons />
          {picked.length ? `Import ${picked.length} ${picked.length === 1 ? "icon" : "icons"}` : "Import"}
        </Button>
      </div>
    </>
  );
}
