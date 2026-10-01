"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { DotLottie } from "@lottiefiles/dotlottie-web";
import { IconMovieOff } from "@tabler/icons-react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/submit-button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { parseLink } from "@/lib/preview";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/info-tip";

/**
 * A Lottie animation, JSON or dotLottie. Plays while `playing` (and the viewer
 * hasn't asked for reduced motion), else rests on its first frame. The player
 * loads only when one is on screen.
 *
 * ponytail: its WebAssembly comes from jsDelivr, the player's default. Serve
 * it from here (DotLottie.setWasmUrl) if a deployment can't reach the CDN.
 */
export function Lottie({ src, playing = true, className }: { src: string; playing?: boolean; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const player = useRef<DotLottie | null>(null);
  const [loaded, setLoaded] = useState(false);
  // A broken file says so, instead of sitting there as an empty canvas.
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    import("@lottiefiles/dotlottie-web")
      .then(({ DotLottie }) => {
        if (gone || !canvas.current) return;
        const p = new DotLottie({ canvas: canvas.current, src, loop: true, renderConfig: { autoResize: true } });
        p.addEventListener("load", () => setLoaded(true));
        p.addEventListener("loadError", () => !gone && setFailed(src));
        player.current = p;
      })
      .catch(() => !gone && setFailed(src));
    return () => {
      gone = true;
      player.current?.destroy();
      player.current = null;
      setLoaded(false);
    };
  }, [src]);

  useEffect(() => {
    if (!loaded) return;
    if (playing && !matchMedia("(prefers-reduced-motion: reduce)").matches) player.current?.play();
    else player.current?.pause();
  }, [playing, loaded]);

  if (failed === src)
    return (
      <Empty size="sm" className="size-full border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconMovieOff />
          </EmptyMedia>
          <EmptyDescription>This animation can&apos;t play</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return <canvas ref={canvas} className={cn("size-full", className)} />;
}

/** Add a Figma, Google Docs, Sheets, Slides or Drive file by its link: kept as the link, shown as the service's embed. */
export function LinkImport({
  into,
  open,
  onOpenChange,
  onDone,
  defaultValue = "",
}: {
  into?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** With the id of the asset it made, or found already there. */
  onDone: (ids: string[]) => void;
  /** A link to start from: one pasted onto the page. */
  defaultValue?: string;
}) {
  const id = useId();
  const [url, setUrl] = useState(defaultValue);
  const [seen, setSeen] = useState({ open, defaultValue });
  if (seen.open !== open || seen.defaultValue !== defaultValue) {
    setSeen({ open, defaultValue });
    if (open) setUrl(defaultValue);
  }
  // Checked as you type, beside the field, so a wrong link never costs a round trip.
  const link = parseLink(url.trim());
  const wrong = url.trim() !== "" && !link;
  const add = async () => {
    if (!link) return;
    const res = await fetch("/api/v1/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.trim(), collections: into ? [into] : [] }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (!res?.ok) return void toast.error(body?.error?.message ?? "Couldn't add it");
    toast.success(body.deduped ? "Already in the library" : `Added ${body.data.filename}`);
    onOpenChange(false);
    onDone([body.data.id]);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a link</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            A Figma or Google file, shown live.
            <InfoTip>
              A Figma file or a Google Doc, Sheet, Slides deck or Drive file. Files shared by link also get a thumbnail; private ones show to
              people signed in with access.
            </InfoTip>
          </DialogDescription>
        </DialogHeader>
        <form action={add} className="grid gap-1.5">
          <div className="flex gap-2">
            <Input
              name="url"
              type="url"
              required
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://docs.google.com/presentation/d/…"
              aria-label="Link"
              aria-invalid={wrong || undefined}
              aria-describedby={`${id}-hint`}
            />
            <SubmitButton disabled={!link}>Add</SubmitButton>
          </div>
          <p id={`${id}-hint`} className={cn("min-h-4 text-xs", wrong ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
            {link ? `${link.service === "Figma" ? "Figma" : `Google ${link.service}`} file` : wrong ? "That isn't a Figma, Google Docs, Sheets, Slides or Drive link" : ""}
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
