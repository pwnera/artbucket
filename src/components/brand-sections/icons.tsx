"use client";

import { useState } from "react";
import { IconCheck, IconCopy, IconDownload, IconSearch } from "@tabler/icons-react";
import { Body } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { copyText } from "@/components/copy-button";
import { IconGlyph } from "@/components/icon-glyph";
import { useSite } from "@/components/site/site-context";
import type { Media } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * An icon set: the brand's icons, live from the library (core/section-assets.ts,
 * as a collection section finds its assets; lib/pages.ts liveProps lists
 * what is tagged icon when the section names no source). Each is drawn crisp
 * at the section's size, a one-color icon in the text's color or the accent,
 * named under it. Readers filter them by name, copy one's SVG to paste into
 * a design tool, or download it; with `downloads: false`, only look.
 */

/** Glyph and tile per size: the tile grows with the glyph, so the names under them keep room. */
const SIZES = {
  small: { glyph: "size-5", tile: "grid-cols-[repeat(auto-fill,minmax(5rem,1fr))]" },
  medium: { glyph: "size-8", tile: "grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))]" },
  large: { glyph: "size-12", tile: "grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]" },
};

/** More than this many, and readers get a box to find one by name. */
const FILTER_FROM = 24;

const nameOf = (m: Media) => m.title || m.filename.replace(/\.svg$/i, "");
/** The original, as a download: a signed URL already has a query. */
const downloadUrl = (u: string) => `${u}${u.includes("?") ? "&" : "?"}download`;

export function IconsSection({ section: s }: SectionProps) {
  const { view, mode } = useSite();
  const found = view.collections[s.id];
  const [q, setQ] = useState("");
  const size = SIZES[(s.props.size as keyof typeof SIZES | undefined) ?? "medium"] ?? SIZES.medium;
  const accent = s.props.color === "accent";
  const takes = s.props.downloads !== false;
  // Only SVGs: a live query can match a PNG, which is no icon to recolor or paste.
  const icons = (found?.items ?? []).filter((m) => m.mime === "image/svg+xml");
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length ? icons.filter((m) => words.every((w) => nameOf(m).toLowerCase().includes(w))) : icons;

  return (
    <div className="space-y-6">
      <Body />
      {mode === "edit" && found?.error && <p className="text-destructive text-sm">Readers see nothing here: {found.error}</p>}
      {mode === "edit" && found && !found.error && icons.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No icons yet. Import a pack from Assets (Upload, then Import icons): they are tagged icon and show here.
        </p>
      )}
      {icons.length > FILTER_FROM && (
        <div className="relative max-w-xs">
          <IconSearch aria-hidden className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 opacity-60" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Find one of ${icons.length} icons`}
            aria-label="Find an icon"
            className="h-9 w-full rounded-(--brand-radius,0.5rem) border border-current/15 bg-transparent ps-8 pe-3 text-sm outline-none placeholder:opacity-60 focus-visible:ring-2 focus-visible:ring-(--brand-accent)"
          />
        </div>
      )}
      {shown.length > 0 && (
        <ul className={cn("grid gap-2", size.tile)}>
          {shown.map((m) => (
            <Icon key={m.id} m={m} glyph={size.glyph} accent={accent} takes={takes} />
          ))}
        </ul>
      )}
      {words.length > 0 && shown.length === 0 && <p className="text-sm opacity-70">No icon is named like &ldquo;{q}&rdquo;.</p>}
      {found && found.total > icons.length && !words.length && (
        <p className="text-sm tabular-nums opacity-70">
          {icons.length} of {found.total}
        </p>
      )}
    </div>
  );
}

function Icon({ m, glyph, accent, takes }: { m: Media; glyph: string; accent: boolean; takes: boolean }) {
  const [copied, setCopied] = useState(false);
  const name = nameOf(m);
  const copy = async () => {
    // The fetch is handed over as a promise, inside the click: Safari refuses a write that starts after it.
    if (!(await copyText(fetch(m.original).then((r) => (r.ok ? r.text() : null)), { what: name }))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const action =
    "grid size-7 place-items-center rounded-md opacity-70 outline-none hover:bg-current/10 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-(--brand-accent)";
  return (
    <li className="group/icon relative flex flex-col items-center gap-2 rounded-(--brand-radius,0.75rem) border border-current/10 px-2 pt-5 pb-3 text-center transition-colors hover:border-current/25">
      <span className={cn("flex items-center", accent && m.mono && "text-(--brand-accent-text)")}>
        <IconGlyph src={m.original} mono={m.mono} label={name} className={glyph} />
      </span>
      <span className="w-full truncate text-xs opacity-80" title={name}>
        {name}
      </span>
      {takes && (
        // Always there on touch, where nothing hovers.
        <span className="absolute end-1 top-1 flex gap-0.5 transition-opacity pointer-fine:opacity-0 pointer-fine:group-focus-within/icon:opacity-100 pointer-fine:group-hover/icon:opacity-100">
          <button type="button" onClick={copy} aria-label={`Copy ${name} as SVG`} title="Copy SVG" className={action}>
            {copied ? <IconCheck className="size-3.5" /> : <IconCopy className="size-3.5" />}
          </button>
          <a href={downloadUrl(m.original)} download={m.filename} aria-label={`Download ${name}`} title="Download SVG" className={action}>
            <IconDownload className="size-3.5" />
          </a>
        </span>
      )}
    </li>
  );
}
