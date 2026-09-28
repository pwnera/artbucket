"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  IconCheck,
  IconChevronLeft,
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
import { fileTypeBadge, formatBytes } from "@/lib/filename";
import { isFont } from "@/lib/font";
import { cn } from "@/lib/utils";

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
              <span className="text-muted-foreground ml-auto pl-4 text-xs">{d.hint}</span>
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
        <Badge variant="secondary" className="bg-background/80 absolute top-2 left-2 font-mono text-2xs backdrop-blur">
          PDF
        </Badge>
      )}
    </div>
  );
}

/**
 * The public grid, the same for a portal and a share link: tiles that open a
 * lightbox you can step through with ← and →, linkable as ?asset={id}.
 * `asset` opens that one on arrival. `busy` dims it while a search runs.
 */
export function PublicGrid({ items, asset = null, busy = false }: { items: PublicItem[]; asset?: string | null; busy?: boolean }) {
  const [openId, setOpenId] = useState<string | null>(asset);
  const at = items.findIndex((a) => a.id === openId);
  const open = at >= 0 ? items[at] : null;
  const show = (id: string | null) => {
    setOpenId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("asset", id);
    else url.searchParams.delete("asset");
    history.replaceState(null, "", url);
  };
  const step = (by: number) => {
    const next = items[at + by];
    if (next) show(next.id);
  };

  return (
    <>
      <ul aria-busy={busy || undefined} className={cn("grid grid-cols-2 gap-4 transition-opacity sm:grid-cols-3 lg:grid-cols-4", busy && "opacity-60")}>
        {items.map((a) => {
          const name = a.title ?? a.filename;
          return (
            <li key={a.id} className="bg-card text-card-foreground overflow-hidden rounded-xl border shadow-xs transition-shadow hover:shadow-md">
              <button
                type="button"
                onClick={() => show(a.id)}
                className="bg-muted relative block aspect-square w-full outline-offset-[-2px] transition-opacity active:opacity-80"
                aria-label={`Look at ${name}`}
              >
                {a.thumbnail ? (
                  // Tiles are ~270px: 320 for a 1x screen, and the API's own 640 for a 2x one.
                  <Thumb src={a.thumbnail.replace("/w_640,", "/w_320,")} alt={name} />
                ) : (
                  <span className="text-muted-foreground absolute inset-0 flex items-center justify-center">
                    <KindIcon item={a} />
                  </span>
                )}
                {(!a.thumbnail || !a.mime.startsWith("image/")) && (
                  <Badge variant="secondary" className="bg-background/80 absolute top-2 left-2 font-mono text-2xs backdrop-blur">
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
              <div className="flex items-center gap-2 border-t p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={name}>
                    {name}
                  </p>
                  <p className="text-muted-foreground truncate text-xs tabular-nums">{meta(a)}</p>
                </div>
                <Downloads item={a} />
              </div>
            </li>
          );
        })}
      </ul>
      <Dialog open={!!open} onOpenChange={(o) => !o && show(null)}>
        {open && (
          <DialogContent
            className="sm:max-w-3xl max-sm:h-svh max-sm:max-h-none max-sm:max-w-none max-sm:content-start max-sm:rounded-none max-sm:border-0"
            onKeyDown={(e) => {
              if (e.target instanceof Element && e.target.closest("input, textarea, video")) return;
              const by = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
              if (!by) return;
              e.preventDefault();
              step(by);
            }}
          >
            <DialogHeader>
              <DialogTitle className="pr-8 leading-snug break-words">{open.title ?? open.filename}</DialogTitle>
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
              {open.original && (
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
    </>
  );
}
