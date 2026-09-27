"use client";

import { useEffect, useRef, useState } from "react";
import type { DotLottie } from "@lottiefiles/dotlottie-web";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { parseLink } from "@/lib/preview";
import { cn } from "@/lib/utils";

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

  useEffect(() => {
    let gone = false;
    import("@lottiefiles/dotlottie-web").then(({ DotLottie }) => {
      if (gone || !canvas.current) return;
      const p = new DotLottie({ canvas: canvas.current, src, loop: true, renderConfig: { autoResize: true } });
      p.addEventListener("load", () => setLoaded(true));
      player.current = p;
    });
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

  return <canvas ref={canvas} className={cn("size-full", className)} />;
}

/** Add a Figma, Google Docs, Sheets, Slides or Drive file by its link: kept as the link, shown as the service's embed. */
export function LinkImport({
  into,
  open,
  onOpenChange,
  onDone,
}: {
  into?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const add = async (form: FormData) => {
    const url = String(form.get("url") ?? "").trim();
    if (!parseLink(url)) return void toast.error("That isn't a Figma, Google Docs, Sheets, Slides or Drive link");
    setBusy(true);
    try {
      const res = await fetch("/api/v1/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, collections: into ? [into] : [] }),
      });
      const body = await res.json();
      if (!res.ok) return void toast.error(body.error?.message ?? "Couldn't add it");
      toast.success(body.deduped ? "Already in the library" : `Added ${body.data.filename}`);
      onOpenChange(false);
      onDone();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a link</DialogTitle>
          <DialogDescription>
            A Figma file or a Google Doc, Sheet, Slides deck or Drive file, shown live. Files shared by link also get a
            thumbnail; private ones show to people signed in with access.
          </DialogDescription>
        </DialogHeader>
        <form action={add} className="flex gap-2">
          <Input name="url" type="url" required autoFocus placeholder="https://docs.google.com/presentation/d/…" aria-label="Link" />
          <Button type="submit" disabled={busy}>
            Add
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
