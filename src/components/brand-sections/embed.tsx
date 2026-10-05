"use client";

import { useState } from "react";
import { IconExternalLink, IconWorld } from "@tabler/icons-react";
import { HEAD } from "@/components/brand-sections/look";
import { Body, PropText } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { Button } from "@/components/ui/button";
import { EMBED_HOSTS, framed } from "@/lib/pages";
import { cn } from "@/lib/utils";

/**
 * A live frame from a host the page lets in (lib/pages.ts EMBED_HOSTS, which
 * proxy.ts frame-src allows) at props.aspect; any other https address is a
 * link card to it, since the browser would refuse to frame it anyway. The
 * frame waits for a click: until then the reader's browser contacts no one
 * else, a placeholder of the same size names who would be.
 */

type Aspect = "16:9" | "4:3" | "1:1" | "auto";

const RATIO: Record<Exclude<Aspect, "auto">, string> = { "16:9": "aspect-video", "4:3": "aspect-[4/3]", "1:1": "aspect-square" };

// Cross-origin all, so scripts with their own origin can't reach this page. Popups open "watch on" and "open in" links.
const BASE = "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox";
const VIDEO = { sandbox: `${BASE} allow-presentation`, allow: "encrypted-media; fullscreen; picture-in-picture", auto: "aspect-video" };
const FIGMA = { name: "Figma", sandbox: BASE, allow: "fullscreen", auto: "aspect-video" };
// A document reads down the page: most of a screen tall. Forms post from Google's own origin.
const FRAME: Record<(typeof EMBED_HOSTS)[number], { name: string; sandbox: string; allow: string; auto: string }> = {
  "www.figma.com": FIGMA,
  "embed.figma.com": FIGMA,
  "www.youtube-nocookie.com": { name: "YouTube", ...VIDEO },
  "player.vimeo.com": { name: "Vimeo", ...VIDEO },
  "www.loom.com": { name: "Loom", ...VIDEO },
  "docs.google.com": { name: "Google Docs", sandbox: `${BASE} allow-forms`, allow: "fullscreen", auto: "h-[80svh] min-h-96" },
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
  const [on, setOn] = useState(false);
  // The schema holds it to https; a link card never carries another scheme either way.
  const address = (
    <PropText
      name="url"
      canvas
      as="p"
      label="Paste a link: YouTube, Vimeo, Loom, Figma or Google Docs play here; any other page shows as a card"
      className="app-tokens bg-background text-foreground rounded-lg border border-dashed px-3 py-2 font-mono text-xs break-all"
    />
  );
  if (!u || u.protocol !== "https:")
    return (
      <div className="space-y-6">
        <Body />
        {address}
      </div>
    );
  const host = u.hostname.replace(/^www\./, "");
  const name = s.title || host;
  const frame = framed(u.href) && FRAME[u.hostname as keyof typeof FRAME];
  return (
    <div className="space-y-6">
      <Body />
      {address}
      {frame ? (
        <>
          {on ? (
            <iframe
              src={u.href}
              title={s.title ? `${s.title}, from ${host}` : `From ${host}`}
              sandbox={frame.sandbox}
              allow={frame.allow}
              className={cn("bg-muted block w-full rounded-xl border print:hidden", aspect === "auto" ? frame.auto : RATIO[aspect])}
            />
          ) : (
            <div
              className={cn(
                "bg-muted flex w-full flex-col items-center justify-center gap-3 rounded-xl border p-6 text-center print:hidden",
                aspect === "auto" ? frame.auto : RATIO[aspect],
              )}
            >
              {s.title && <p className={cn(HEAD, "text-base")}>{s.title}</p>}
              <Button variant="outline" onClick={() => setOn(true)}>
                <IconWorld aria-hidden /> Load from {frame.name}
              </Button>
              <p className="text-muted-foreground max-w-sm text-xs text-pretty">Loading it connects to {frame.name}, which may set cookies.</p>
            </div>
          )}
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
