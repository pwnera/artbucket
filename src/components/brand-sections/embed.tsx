"use client";

import { IconExternalLink, IconWorld } from "@tabler/icons-react";
import { HEAD } from "@/components/brand-sections/look";
import { Body } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { EMBED_HOSTS, framed } from "@/lib/pages";
import { cn } from "@/lib/utils";

/**
 * A live frame from a host the page lets in (lib/pages.ts EMBED_HOSTS, which
 * proxy.ts frame-src allows) at props.aspect; any other https address is a
 * link card to it, since the browser would refuse to frame it anyway.
 */

type Aspect = "16:9" | "4:3" | "1:1" | "auto";

const RATIO: Record<Exclude<Aspect, "auto">, string> = { "16:9": "aspect-video", "4:3": "aspect-[4/3]", "1:1": "aspect-square" };

// Cross-origin all, so scripts with their own origin can't reach this page. Popups open "watch on" and "open in" links.
const BASE = "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox";
const VIDEO = { sandbox: `${BASE} allow-presentation`, allow: "encrypted-media; fullscreen; picture-in-picture", auto: "aspect-video" };
// A document reads down the page: most of a screen tall. Forms post from Google's own origin.
const FRAME: Record<(typeof EMBED_HOSTS)[number], { sandbox: string; allow: string; auto: string }> = {
  "www.figma.com": { sandbox: BASE, allow: "fullscreen", auto: "aspect-video" },
  "embed.figma.com": { sandbox: BASE, allow: "fullscreen", auto: "aspect-video" },
  "www.youtube-nocookie.com": VIDEO,
  "player.vimeo.com": VIDEO,
  "www.loom.com": VIDEO,
  "docs.google.com": { sandbox: `${BASE} allow-forms`, allow: "fullscreen", auto: "h-[80svh] min-h-96" },
};

const parse = (url: unknown) => {
  try {
    return typeof url === "string" ? new URL(url) : null;
  } catch {
    return null;
  }
};

export function EmbedSection({ section: s }: SectionProps) {
  const u = parse(s.props.url);
  const aspect = (s.props.aspect as Aspect | undefined) ?? "auto";
  // The schema holds it to https; a link card never carries another scheme either way.
  if (!u || u.protocol !== "https:") return <Body />;
  const host = u.hostname.replace(/^www\./, "");
  const name = s.title || host;
  const frame = framed(u.href) && FRAME[u.hostname as keyof typeof FRAME];
  return (
    <div className="space-y-6">
      <Body />
      {frame ? (
        <>
          <iframe
            src={u.href}
            title={s.title ? `${s.title}, from ${host}` : `From ${host}`}
            loading="lazy"
            sandbox={frame.sandbox}
            allow={frame.allow}
            className={cn("bg-muted block w-full rounded-xl border print:hidden", aspect === "auto" ? frame.auto : RATIO[aspect])}
          />
          {/* Paper can't play it: where to find it instead. */}
          <p className="hidden text-sm break-all print:block">{u.href}</p>
        </>
      ) : (
        <a
          href={u.href}
          target="_blank"
          rel="noreferrer"
          className="bg-card text-card-foreground hover:bg-muted flex max-w-xl items-center gap-4 rounded-xl border p-4 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-(--brand-accent)"
        >
          <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
            <IconWorld aria-hidden className="text-muted-foreground size-5" stroke={1.5} />
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn(HEAD, "block truncate text-base")}>{name}</span>
            <span className="text-muted-foreground block truncate text-sm">{host}</span>
          </span>
          <IconExternalLink aria-hidden className="text-muted-foreground size-4 shrink-0" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
    </div>
  );
}
