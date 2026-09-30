"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  IconCheck,
  IconChevronLeft,
  IconCircleCheck,
  IconChevronRight,
  IconDownload,
  IconExternalLink,
  IconFile,
  IconFileTypePdf,
  IconFileZip,
  IconLoader2,
  IconMovie,
  IconMusic,
  IconPlayerPlayFilled,
  IconTypography,
} from "@tabler/icons-react";
import { HEAD, usePortaledLook } from "@/components/brand-sections/look";
import { CanIUse, type Use } from "@/components/can-i-use";
import { IconButton } from "@/components/icon-button";
import { Thumb } from "@/components/thumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fileTypeBadge, formatBytes } from "@/lib/filename";
import { isFont } from "@/lib/font";
import { cn } from "@/lib/utils";

/** A portal's check of one of its files for a use (POST /api/v1/portal/{slug}/check). */
export type Ask = (id: string, use: Use) => Promise<Response>;

export type PublicDownload = { label: string; hint: string; url: string; filename: string };

/** One file as a portal or a share link hands it out: signed URLs, no account needed. */
export type PublicItem = {
  id: string;
  filename: string;
  title: string | null;
  description: string | null;
  creator: string | null;
  copyright: string | null;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  /** 640px wide, for the tile; also what the preview sharpens over. */
  thumbnail: string | null;
  /** 1600px wide, for the lightbox. */
  preview: string | null;
  downloads: PublicDownload[];
  /** The file itself, inline: what "Open original" opens and a video plays. */
  original?: string | null;
};

export const meta = (a: PublicItem) =>
  [a.width && a.height ? `${a.width} × ${a.height}` : null, formatBytes(a.size), a.creator && `© ${a.creator}`].filter(Boolean).join(" · ");

const isVideo = (a: PublicItem) => a.mime.startsWith("video/");

const never = () => () => {};

/**
 * A date in the reader's own locale and zone. The server's are nobody's, so
 * the server and the first paint say it in UTC and agree; once hydrated, it
 * says it the reader's way.
 */
export function LocalDate({ at }: { at: string }) {
  const local = useSyncExternalStore(never, () => true, () => false);
  return <>{new Date(at).toLocaleDateString(local ? undefined : "en-US", local ? undefined : { timeZone: "UTC" })}</>;
}

/** What a file without a still shows as: its kind, not a broken photo. */
export function KindIcon({ item: a, className }: { item: PublicItem; className?: string }) {
  const Icon = isVideo(a)
    ? IconMovie
    : a.mime === "application/pdf"
      ? IconFileTypePdf
      : a.mime.startsWith("audio/")
        ? IconMusic
        : isFont(a.mime, a.filename)
          ? IconTypography
          : /zip|compressed|tar|gzip/.test(a.mime)
            ? IconFileZip
            : IconFile;
  return <Icon className={cn("size-8", className)} stroke={1.5} />;
}

/**
 * Its downloads, a button for one and a menu for several. A cold rendition
 * (Print, full size) can take seconds to start, so every click says it was
 * heard: a toast, and a check on the button or a spinner on the menu.
 */
export function Downloads({ item, variant = "ghost", size = "default" }: { item: PublicItem; variant?: "ghost" | "default"; size?: "default" | "lg" }) {
  const [started, setStarted] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const heard = (d: PublicDownload) => {
    toast(`Downloading ${d.filename}`, { description: d.hint });
    setStarted(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStarted(false), 1500);
  };
  const label = `Download ${item.filename}`;

  // For reference only (a page's `download: false`): nothing to offer.
  if (!item.downloads.length) return null;
  if (item.downloads.length === 1) {
    const d = item.downloads[0];
    const icon = started ? <IconCheck className="text-success animate-in zoom-in-50" /> : <IconDownload />;
    const link = (children: React.ReactNode) => (
      <a href={d.url} download={d.filename} onClick={() => heard(d)}>
        {children}
      </a>
    );
    if (variant === "ghost") {
      return (
        <IconButton variant="ghost" label={label} asChild>
          {link(icon)}
        </IconButton>
      );
    }
    return (
      <Button size={size} asChild>
        {link(
          <>
            {icon} Download
          </>,
        )}
      </Button>
    );
  }
  const icon = started ? <IconLoader2 className="animate-spin" /> : <IconDownload />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "ghost" ? (
          <IconButton variant="ghost" label={label}>
            {icon}
          </IconButton>
        ) : (
          <Button size={size}>
            {icon} Download
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Download as</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {item.downloads.map((d) => (
          <DropdownMenuItem key={d.url} asChild>
            <a href={d.url} download={d.filename} onClick={() => heard(d)}>
              <span className="font-medium">{d.label}</span>
              <span className="text-muted-foreground ms-auto ps-4 text-xs">{d.hint}</span>
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The big picture of one file: a video plays, an image sharpens over the
 * tile's still (already cached) instead of flashing an empty box.
 */
export function Stage({ item: a, className }: { item: PublicItem; className?: string }) {
  const [ready, setReady] = useState(false);
  if (isVideo(a) && a.original) {
    return (
      <video controls preload="metadata" poster={a.preview ?? undefined} src={a.original} className={cn("w-full rounded-md bg-black", className)} />
    );
  }
  const src = a.preview ?? a.thumbnail;
  return (
    <div className={cn("bg-checker relative flex items-center justify-center overflow-hidden rounded-md", className)}>
      {a.thumbnail && !ready && (
        <div aria-hidden className="absolute inset-0 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url("${a.thumbnail}")` }} />
      )}
      {src ? (
        // A rendition already sized for this: next/image would only resize it again.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={(img) => {
            if (img?.complete && img.naturalWidth) setReady(true);
          }}
          src={src}
          alt={a.title ?? a.filename}
          onLoad={() => setReady(true)}
          className="relative size-full object-contain"
        />
      ) : (
        <span className="text-muted-foreground">
          <KindIcon item={a} className="size-12" />
        </span>
      )}
      {a.mime === "application/pdf" && (
        <Badge variant="secondary" className="bg-background/80 absolute start-2 top-2 font-mono text-2xs backdrop-blur">
          PDF
        </Badge>
      )}
    </div>
  );
}

/**
 * The public grid, the same for a portal, a share link and a page's
 * collection: tiles that open the lightbox. `asset` is the ?asset={id} the
 * page arrived with, opened at once; a grid given one (even null) keeps
 * ?asset= in step, so the open file can be linked. `busy` dims it while a
 * search runs. `ask` puts "Can I use this?" by the open file's downloads.
 */
export function PublicGrid({ items, asset, busy = false, ask }: { items: PublicItem[]; asset?: string | null; busy?: boolean; ask?: Ask }) {
  const [openId, setOpenId] = useState<string | null>(asset ?? null);
  const linked = asset !== undefined;
  const show = (id: string | null) => {
    setOpenId(id);
    if (!linked) return;
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("asset", id);
    else url.searchParams.delete("asset");
    history.replaceState(null, "", url);
  };

  return (
    // Columns follow the grid's own width, so a page section and a narrowed preview get as many as fit. In a
    // portal's or a share's column (max-w-6xl, px-8) 36rem and 60rem fall where sm and lg did.
    <div className="@container">
      <ul aria-busy={busy || undefined} className={cn("grid grid-cols-2 gap-4 transition-opacity @xl:grid-cols-3 @min-[60rem]:grid-cols-4", busy && "opacity-60")}>
        {items.map((a) => {
          const name = a.title ?? a.filename;
          return (
            // Corners as the brand draws them (--brand-radius), on a portal's or a page's site; the app's elsewhere.
            <li
              key={a.id}
              className="group/tile bg-card text-card-foreground overflow-hidden rounded-[var(--brand-radius,var(--radius-xl))] border shadow-xs transition-[box-shadow,translate] duration-200 hover:-translate-y-0.5 hover:shadow-lg motion-reduce:hover:translate-y-0"
            >
              <button
                type="button"
                onClick={() => show(a.id)}
                className="bg-muted relative block aspect-square w-full outline-offset-[-2px] transition-opacity active:opacity-80"
                aria-label={`Look at ${name}`}
                aria-haspopup="dialog"
              >
                {a.thumbnail ? (
                  // Tiles are ~270px: 320 for a 1x screen, and the API's own 640 for a 2x one.
                  <Thumb src={a.thumbnail.replace("/w_640,", "/w_320,")} alt={name} />
                ) : (
                  // No still: the kind, and its type set large, on a wash of the accent.
                  <span className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[color-mix(in_oklab,var(--primary)_7%,var(--muted))]">
                    <KindIcon item={a} className="transition-transform duration-200 group-hover/tile:-translate-y-0.5 motion-reduce:transform-none" />
                    <span className="text-foreground/80 [font-family:var(--brand-head,var(--font-display))] text-xl font-semibold tracking-tight">
                      {fileTypeBadge(a.filename, a.mime)}
                    </span>
                  </span>
                )}
                {a.thumbnail && !a.mime.startsWith("image/") && (
                  <Badge variant="secondary" className="bg-background/80 absolute start-2 top-2 font-mono text-2xs backdrop-blur">
                    {fileTypeBadge(a.filename, a.mime)}
                  </Badge>
                )}
                {isVideo(a) && a.thumbnail && (
                  <span aria-hidden className="absolute inset-0 flex items-center justify-center">
                    <span className="bg-background/80 rounded-full p-3 shadow-sm backdrop-blur">
                      <IconPlayerPlayFilled className="size-5" />
                    </span>
                  </span>
                )}
              </button>
              <div className="grid gap-2 border-t p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={name}>
                    {name}
                  </p>
                  <p className="text-muted-foreground truncate text-xs tabular-nums">{meta(a)}</p>
                </div>
                {/* Its presets, a download each, as the prototype's press portal lists them: Web, Social, Print, Original. */}
                {a.downloads.length > 0 && (
                  <ul aria-label={`Download ${name}`} className="flex flex-wrap gap-1">
                    {a.downloads.map((d) => (
                      <li key={d.url}>
                        <a
                          href={d.url}
                          download={d.filename}
                          title={d.hint}
                          onClick={() => toast(`Downloading ${d.filename}`, { description: d.hint })}
                          className="bg-muted hover:bg-accent focus-visible:ring-ring/50 inline-flex rounded-[calc(var(--brand-radius,var(--radius-md))*0.6)] border px-2 py-0.5 text-xs outline-none focus-visible:ring-2"
                        >
                          {d.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {ask && a.downloads.length > 0 && <AskUse ask={ask} id={a.id} className="justify-self-start" />}
              </div>
            </li>
          );
        })}
      </ul>
      <Lightbox items={items} openId={openId} onOpen={show} ask={ask} />
    </div>
  );
}

/**
 * One file of `items` at a time, big, over the page: ← and → step through
 * them, Esc closes, and focus goes back to the tile that opened it. Its
 * downloads, and "Open original", only when it has downloads. `openId` null
 * (or one not in `items`) is closed. `ask`: "Can I use this?" beside them.
 */
export function Lightbox({ items, openId, onOpen, ask }: { items: PublicItem[]; openId: string | null; onOpen: (id: string | null) => void; ask?: Ask }) {
  const at = items.findIndex((a) => a.id === openId);
  const open = at >= 0 ? items[at] : null;
  // It portals out of the site: it takes the site's look along, as the nav sheet does.
  const look = usePortaledLook();
  // With no DialogTrigger, Radix has nothing to give focus back to on close: remember what had it.
  const opener = useRef<HTMLElement | null>(null);
  const step = (by: number) => {
    const next = items[at + by];
    if (next) onOpen(next.id);
  };

  return (
    <Dialog open={!!open} onOpenChange={(o) => !o && onOpen(null)}>
      {open && (
        <DialogContent
          style={look?.style}
          lang={look?.lang}
          dir={look?.dir}
          className={cn(
            look && [look.className, "bg-background text-foreground"],
            "sm:max-w-3xl max-sm:h-svh max-sm:max-h-none max-sm:max-w-none max-sm:content-start max-sm:rounded-none max-sm:border-0",
          )}
          onOpenAutoFocus={() => {
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            opener.current?.focus();
          }}
          onKeyDown={(e) => {
            if (e.target instanceof Element && e.target.closest("input, textarea, video")) return;
            const by = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
            if (!by) return;
            e.preventDefault();
            step(by);
          }}
        >
          <DialogHeader>
            <DialogTitle className={cn("pe-8 leading-snug break-words", look && HEAD)}>{open.title ?? open.filename}</DialogTitle>
            <DialogDescription>{[meta(open), open.copyright].filter(Boolean).join(" · ")}</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Stage key={open.id} item={open} className={isVideo(open) && open.original ? "max-h-[60vh] max-sm:max-h-[65svh]" : "h-[60vh] max-sm:h-[60svh]"} />
            {/* aria-disabled, not disabled, at the ends: a disabled button drops focus to <body>, where ← and → no longer reach the dialog. */}
            {items.length > 1 && (
              <>
                <IconButton
                  variant="secondary"
                  label="Previous"
                  shortcut={["←"]}
                  className="bg-background/80 absolute top-1/2 left-2 -translate-y-1/2 rounded-full shadow-sm backdrop-blur aria-disabled:opacity-50 aria-disabled:active:scale-100"
                  aria-disabled={at === 0 || undefined}
                  onClick={() => step(-1)}
                >
                  <IconChevronLeft />
                </IconButton>
                <IconButton
                  variant="secondary"
                  label="Next"
                  shortcut={["→"]}
                  className="bg-background/80 absolute top-1/2 right-2 -translate-y-1/2 rounded-full shadow-sm backdrop-blur aria-disabled:opacity-50 aria-disabled:active:scale-100"
                  aria-disabled={at === items.length - 1 || undefined}
                  onClick={() => step(1)}
                >
                  <IconChevronRight />
                </IconButton>
              </>
            )}
          </div>
          {open.description && <p className="text-sm">{open.description}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {items.length > 1 && (
              <span className="text-muted-foreground mr-auto text-xs tabular-nums">
                {at + 1} of {items.length}
              </span>
            )}
            {ask && open.downloads.length > 0 && <AskUse key={open.id} ask={ask} id={open.id} button />}
            {open.original && open.downloads.length > 0 && (
              <Button variant="outline" asChild>
                <a href={open.original} target="_blank" rel="noreferrer">
                  <IconExternalLink /> Open original
                </a>
              </Button>
            )}
            <Downloads item={open} variant="default" />
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

/**
 * "Can I use this?" for one file: a popover with the use check, on a tile
 * (a link, as the prototype's press portal has it) or in the lightbox (a
 * button). It portals out of the site: it takes the site's look along.
 */
function AskUse({ ask, id, button, className }: { ask: Ask; id: string; button?: boolean; className?: string }) {
  const look = usePortaledLook();
  return (
    <Popover>
      <PopoverTrigger asChild>
        {button ? (
          <Button variant="ghost" className={className}>
            <IconCircleCheck /> Can I use this?
          </Button>
        ) : (
          <button type="button" className={cn("text-xs text-(--brand-accent,var(--primary)) underline underline-offset-2 outline-none focus-visible:ring-2", className)}>
            Can I use this?
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align={button ? "end" : "start"} style={look?.style} lang={look?.lang} dir={look?.dir} className={cn(look && [look.className, "bg-background text-foreground"], "w-80")}>
        <CanIUse ask={(use) => ask(id, use)} />
      </PopoverContent>
    </Popover>
  );
}
