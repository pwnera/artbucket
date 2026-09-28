"use client";

import { useEffect, useState } from "react";
import {
  IconCheck,
  IconChevronRight,
  IconDownload,
  IconItalic,
  IconLoader2,
  IconPlus,
  IconSearch,
  IconTypography,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssetUrl } from "@/components/site/asset-url";
import { FONT_CATEGORIES, fontStyle, weightName } from "@/lib/font";
import { cn } from "@/lib/utils";

/**
 * A font asset, loaded from `url` (its /a/{id}, as this page builds it) under
 * its own family name, once per page. The weight range lets a variable font
 * answer every weight; a static one renders its own. A load that fails is
 * forgotten, so the next use tries again (a network blip, a signature that
 * came later).
 */
const loading = new Map<string, Promise<string>>();

function load(id: string, url: string) {
  let p = loading.get(id);
  if (!p) {
    const family = `asset-${id}`;
    p = new FontFace(family, `url(${url})`, { weight: "1 1000" }).load().then(
      (face) => {
        document.fonts.add(face);
        return family;
      },
      (e) => {
        loading.delete(id);
        throw e;
      },
    );
    loading.set(id, p);
  }
  return p;
}

/** The family to set text in: undefined while loading, null when the browser can't read it or there is no file. */
export function useAssetFont(id: string | undefined) {
  const url = useAssetUrl();
  const src = id && url(id);
  const [family, setFamily] = useState<string | null>();
  useEffect(() => {
    if (!id || !src) return;
    let live = true;
    load(id, src).then(
      (f) => live && setFamily(f),
      () => live && setFamily(null),
    );
    return () => {
      live = false;
    };
  }, [id, src]);
  return id ? family : null;
}

/** A card or row thumbnail: "Aa" in the face. */
export function FontThumb({ id, className }: { id: string; className?: string }) {
  const family = useAssetFont(id);
  if (family === undefined) return <Skeleton className="absolute inset-0 rounded-none" />;
  if (family === null) return <IconTypography className="text-muted-foreground size-1/3" stroke={1.5} />;
  return (
    <span className={cn("text-foreground leading-none", className)} style={{ fontFamily: family }} aria-hidden>
      Aa
    </span>
  );
}

const SIZES = [12, 16, 24, 36, 48, 72];
const SAMPLE = "The quick brown fox jumps over the lazy dog";

/**
 * The playground's words and size, kept while you step from one font to the
 * next (each remounts it) and across reloads of the tab. Storage can refuse
 * (a private window); the module copy still holds for the visit.
 */
const KEPT = "artbucket:font-sample";
type Kept = { text: string; size: number };
let kept: Kept | undefined;
function recall(): Kept {
  if (kept) return kept;
  try {
    const k = JSON.parse(sessionStorage.getItem(KEPT) ?? "null");
    if (typeof k?.text === "string" && typeof k.size === "number") return (kept = k);
  } catch {}
  return { text: SAMPLE, size: 48 };
}
function remember(k: Kept) {
  kept = k;
  try {
    sessionStorage.setItem(KEPT, JSON.stringify(k));
  } catch {}
}

/**
 * A playground over a size waterfall and the character set. It fills the
 * asset dialog's preview; `flow`, it sits in the page like any block (a type
 * section). `sample` is the page's own words to start from: then nothing is
 * kept, and each visit starts from them again.
 */
export function FontPlayground({ id, sample, flow }: { id: string; sample?: string; flow?: boolean }) {
  const family = useAssetFont(id);
  const [text, setText] = useState(() => sample ?? recall().text);
  const [size, setSize] = useState(() => (sample === undefined ? recall().size : 48));
  // The face answers every weight (load()): a variable font shows its range, a static one its own.
  const [weight, setWeight] = useState(400);
  const [italic, setItalic] = useState(false);
  useEffect(() => {
    if (sample === undefined) remember({ text, size });
  }, [text, size, sample]);

  if (family === undefined) return <Skeleton className={flow ? "h-80 w-full" : "absolute inset-0 rounded-none"} />;
  if (family === null) return <p className="text-muted-foreground p-6 text-sm">This browser can&apos;t read this font file.</p>;

  const face = { fontFamily: family, fontWeight: weight, fontStyle: italic ? "italic" : "normal" };
  const words = text || sample || SAMPLE;
  return (
    <div className={cn("flex flex-col gap-6", !flow && "absolute inset-0 overflow-y-auto p-6")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* No autofocus: opening a font on a phone shouldn't raise the keyboard. */}
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type to try it"
          aria-label="Sample text"
          className="min-w-48 flex-1"
        />
        <label className="text-muted-foreground flex shrink-0 items-center gap-2 text-xs tabular-nums">
          <span className="sr-only">Size</span>
          <input
            type="range"
            min={8}
            max={160}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="accent-primary w-24"
          />
          <span className="w-10">{size}px</span>
        </label>
        <label className="text-muted-foreground flex shrink-0 items-center gap-2 text-xs tabular-nums">
          <span className="sr-only">Weight</span>
          <input
            type="range"
            min={100}
            max={900}
            step={100}
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
            aria-valuetext={weightName(weight)}
            className="accent-primary w-24"
          />
          <span className="w-8" title={weightName(weight)}>
            {weight}
          </span>
        </label>
        <Toggle variant="outline" size="sm" pressed={italic} onPressedChange={setItalic} aria-label="Italic">
          <IconItalic />
        </Toggle>
      </div>

      <p className="break-words" style={{ ...face, fontSize: size, lineHeight: 1.15 }}>
        {words}
      </p>

      <div className="grid gap-3 border-t pt-4">
        {SIZES.map((s) => (
          <div key={s} className="flex min-w-0 items-baseline gap-3">
            <span className="text-muted-foreground w-8 shrink-0 text-xs tabular-nums">{s}</span>
            <span className="min-w-0 truncate" style={{ ...face, fontSize: s }}>
              {words}
            </span>
          </div>
        ))}
      </div>

      <p className="border-t pt-4 text-2xl leading-relaxed break-all" style={face}>
        ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 &amp;@#%?!.,:;()[]{}&quot;&apos;
      </p>
    </div>
  );
}

type Family = { family: string; category: string; styles: string[] };

/**
 * The picker loads each shown family's regular style from Google, once per
 * page, so a person can see what they are choosing. Only this dialog does:
 * what it imports is served from the library.
 */
const previewed = new Set<string>();
/** Regular where the family has it, else its first style. */
const previewStyle = (f: Family) => {
  const s = f.styles.includes("400") ? "400" : (f.styles[0] ?? "400");
  return { weight: parseInt(s), italic: s.endsWith("i") };
};
function loadPreview(f: Family) {
  if (previewed.has(f.family)) return;
  previewed.add(f.family);
  const { weight, italic } = previewStyle(f);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${f.family.replace(/ /g, "+")}:ital,wght@${italic ? 1 : 0},${weight}&display=swap`;
  document.head.appendChild(link);
}
const previewFace = (f: Family) => {
  const { weight, italic } = previewStyle(f);
  return { fontFamily: `'${f.family}'`, fontWeight: weight, fontStyle: italic ? "italic" : "normal" };
};

/** Search Google Fonts, see each family set in your words, import the ones the brand uses. */
export function GoogleFontImport({
  into,
  onDone,
  open: controlled,
  onOpenChange,
}: {
  into?: string | null;
  onDone: () => void;
  /** Opened from elsewhere (a menu): no button of its own. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [own, setOwn] = useState(false);
  const open = controlled ?? own;
  const setOpen = onOpenChange ?? setOwn;
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [sample, setSample] = useState("The quick brown fox jumps over the lazy dog");
  const [found, setFound] = useState<{ data: Family[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    const params = new URLSearchParams({ q, limit: "40", ...(category && { category }) });
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/fonts/google?${params}`, { signal: ctl.signal });
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
  }, [open, q, category]);

  useEffect(() => found?.data.forEach(loadPreview), [found]);

  const add = async (family: string) => {
    setImporting(family);
    try {
      const res = await fetch("/api/v1/fonts/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ family, collections: into ? [into] : [] }),
      });
      const body = await res.json();
      if (!res.ok) return void toast.error(body.error?.message ?? "Couldn't import it");
      toast.success(`Imported ${body.family}`, { description: `${body.data.length} ${body.data.length === 1 ? "style" : "styles"}` });
      setImported((s) => new Set(s).add(family));
      onDone();
    } finally {
      setImporting(null);
    }
  };

  return (
    <>
{controlled === undefined && (
      <Button variant="outline" size="sm" className="ml-auto" title="Import a family from Google Fonts" onClick={() => setOpen(true)}>
        <IconTypography />
        <span className="hidden sm:inline">Google Fonts</span>
      </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 sm:max-w-3xl md:h-[min(760px,calc(100dvh-2rem))]">
          <DialogHeader>
            <DialogTitle>Google Fonts</DialogTitle>
            <DialogDescription>
              Importing adds every weight and italic as files in the library, and pages load them from here. Only these previews load
              from Google.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="relative">
              <IconSearch className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search families"
                aria-label="Search Google Fonts"
                autoFocus
                className="h-8 pl-8"
              />
            </div>
            <Input value={sample} onChange={(e) => setSample(e.target.value)} placeholder="Preview text" aria-label="Preview text" className="h-8" />
          </div>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={category || "all"}
            onValueChange={(v) => v && setCategory(v === "all" ? "" : v)}
            aria-label="Category"
            className="flex-wrap justify-start"
          >
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            {FONT_CATEGORIES.map((c) => (
              <ToggleGroupItem key={c} value={c}>
                {c}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <div className="-mx-6 min-h-0 flex-1 overflow-y-auto border-y">
            {error ? (
              <p className="text-muted-foreground p-6 text-sm">{error}</p>
            ) : !found ? (
              <div className="grid gap-3 p-6">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : found.data.length === 0 ? (
              <p className="text-muted-foreground p-6 text-sm">No family matches &ldquo;{q}&rdquo;.</p>
            ) : (
              <ul className="divide-y">
                {found.data.map((f) => (
                  <li key={f.family} className="flex items-center gap-4 px-6 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-muted-foreground text-xs">
                        <span className="text-foreground font-medium">{f.family}</span> · {f.category} · {f.styles.length}{" "}
                        {f.styles.length === 1 ? "style" : "styles"}
                      </p>
                      <p className="truncate text-2xl leading-snug" style={previewFace(f)}>
                        {sample || f.family}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={imported.has(f.family) ? "ghost" : "outline"}
                      disabled={importing !== null || imported.has(f.family)}
                      onClick={() => add(f.family)}
                    >
                      {importing === f.family ? <IconLoader2 className="animate-spin" /> : imported.has(f.family) ? <IconCheck /> : null}
                      {imported.has(f.family) ? "Imported" : "Import"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {found && found.total > found.data.length && (
            <p className="text-muted-foreground text-xs">
              The {found.data.length} most popular of {found.total}. Search to narrow it.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** A font rule with no files yet: fetch its family from Google Fonts and attach every style, in one click. */
export function ImportFamily({ family, onImported }: { family: string; onImported: (family: string, ids: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span>Shown only where {family} is installed.</span>
      <Button
        variant="outline"
        size="xs"
        pending={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const res = await fetch("/api/v1/fonts/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ family }),
            });
            const body = await res.json();
            if (!res.ok) return void toast.error(body.error?.message ?? "Couldn't import it", { description: "Add its files with Assets instead." });
            toast.success(`Imported ${body.family}`, { description: `${body.data.length} ${body.data.length === 1 ? "style" : "styles"}, now on this rule` });
            onImported(body.family, body.data.map((a: { id: string }) => a.id));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <IconLoader2 className="animate-spin" /> : <IconTypography />} Import from Google Fonts
      </Button>
      <span>or add its files with Assets.</span>
    </div>
  );
}

/**
 * One of a font rule's files: its style's name, set in that style. Read only,
 * it is the file itself, a download away; editing, it can come off the rule.
 */
export function FontStyleChip({
  id,
  filename,
  onRemove,
  download,
}: {
  id: string;
  filename: string;
  onRemove?: () => void;
  download?: boolean;
}) {
  const url = useAssetUrl();
  const family = useAssetFont(id);
  const { label } = fontStyle(filename);
  const name = (
    <span className="text-sm whitespace-nowrap" style={family ? { fontFamily: JSON.stringify(family) } : undefined}>
      {label}
    </span>
  );
  const chip = "group/chip bg-muted/50 inline-flex h-8 items-center gap-1 rounded-md border pe-1 ps-2.5";
  if (download)
    return (
      <a
        href={url(id, "?download")}
        download
        title={`Download ${filename || label}`}
        className={cn(chip, "hover:bg-muted transition-colors")}
      >
        {name}
        {/* Always there on touch, where nothing hovers. The reveals sit inside pointer-fine too, or the hide sorts after them and wins. */}
        <IconDownload className="text-muted-foreground size-3.5 transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover/chip:opacity-100 pointer-fine:group-focus-visible/chip:opacity-100" />
      </a>
    );
  return (
    <span className={chip} title={filename}>
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Take ${label} off the rule`}
          className="text-muted-foreground hover:text-foreground rounded p-0.5 transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover/chip:opacity-100 pointer-fine:focus-visible:opacity-100"
        >
          <IconX className="size-3.5" />
        </button>
      )}
    </span>
  );
}

/**
 * A font rule's files: how many styles, from which weight to which, over a
 * chip per file set in its own style, to download, take off or add to. A
 * family of more than eight folds to its one line.
 */
export function FontStyles({
  files,
  onRemove,
  onAdd,
}: {
  files: { id: string; filename?: string }[];
  /** Both left out: read only. */
  onRemove?: (id: string) => void;
  onAdd?: () => void;
}) {
  const [open, setOpen] = useState(files.length <= 8);
  const read = !onRemove && !onAdd;
  const styles = files.map((f) => fontStyle(f.filename ?? ""));
  const weights = styles.map((s) => s.weight);
  const [lo, hi] = [Math.min(...weights), Math.max(...weights)];
  const range = lo === hi ? weightName(lo) : `${weightName(lo)} to ${weightName(hi)}`;
  const italics = styles.some((s) => s.italic);
  return (
    <div className="grid gap-1.5 pt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-xs"
      >
        <IconChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        {files.length} {files.length === 1 ? "style" : "styles"} · {range}
        {italics && ", with italics"}
      </button>
      {open && (
        <div className="flex flex-wrap items-center gap-1.5">
          {files.map((f) => (
            <FontStyleChip
              key={f.id}
              id={f.id}
              filename={f.filename ?? ""}
              onRemove={onRemove && (() => onRemove(f.id))}
              download={read}
            />
          ))}
          {onAdd && (
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={onAdd} aria-label="Add font files">
              <IconPlus />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
