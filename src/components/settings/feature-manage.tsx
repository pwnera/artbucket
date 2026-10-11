"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { sendResult } from "@/lib/send";
import { cn } from "@/lib/utils";

/**
 * What a server's feature says about itself under Manage (FEATURES_FILE's
 * `manage`, the address of its view): the app draws it, as it draws any
 * feature, and the feature says only text, numbers and links.
 *
 *   GET  {manage}                 { data: View }
 *   POST {manage}/actions/{id}    runs one of its actions: { data: View }, the view again
 *
 * `refresh`: while something runs there, the app reads the view again that
 * many seconds later, as long as Manage is open.
 */
export type ManageView = {
  badge: { label: string; tone: "on" | "off" | "neutral" } | null;
  lead: string | null;
  sections: {
    title: string;
    note?: string | null;
    meters?: { label: string; used: number; cap: number }[];
    figure?: { value: number; label: string } | null;
    progress?: { value: number; total: number; label: string } | null;
    text?: string | null;
    footnote?: string | null;
    links?: { label: string; href: string }[];
    actions?: { id: string; label: string; variant?: "default" | "outline" }[];
  }[];
  refresh: number | null;
};

const n = (x: number) => x.toLocaleString("en");
const pct = (part: number, whole: number) => (whole > 0 ? Math.min(100, Math.round((100 * part) / whole)) : 0);

export function FeatureManage({ name, url, open, onOpenChange }: { name: string; url: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const base = url.replace(/\/+$/, "");
  const [view, setView] = useState<ManageView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Read when Manage opens, again on Try again, and while something runs there (`refresh`), to follow it.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void sendResult("GET", base, undefined, { quiet: true }).then((r) => {
      if (!live) return;
      if (r.ok) {
        setFailed(null);
        setView(r.data as ManageView);
      } else setFailed(r.network ? "Couldn't reach the server" : (r.error?.message ?? `${name} couldn't say`));
    });
    return () => {
      live = false;
    };
  }, [open, base, name, attempt]);
  useEffect(() => {
    if (!open || !view?.refresh) return;
    const t = setTimeout(() => setAttempt((n) => n + 1), view.refresh * 1000);
    return () => clearTimeout(t);
  }, [open, view]);

  async function act(id: string) {
    setBusy(id);
    const r = await sendResult("POST", `${base}/actions/${encodeURIComponent(id)}`);
    setBusy(null);
    if (r.ok) setView(r.data as ManageView);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2.5">
            {name}
            {view?.badge && (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs leading-none font-medium",
                  view.badge.tone === "on" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                )}
              >
                {view.badge.tone === "on" && <span className="size-1.5 rounded-full bg-current" />}
                {view.badge.label}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>{view?.lead ?? (failed ? failed : "Reading what it says…")}</DialogDescription>
        </DialogHeader>
        {failed && !view && (
          <div>
            <Button size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          </div>
        )}
        {view?.sections.map((s) => (
          <section key={s.title} className="grid gap-3 rounded-lg border p-4">
            <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="font-display text-sm font-semibold">{s.title}</h3>
              {s.note && <span className="text-muted-foreground text-xs">{s.note}</span>}
            </header>
            {!!s.meters?.length && (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
                {s.meters.map((m) => (
                  <div key={m.label} className="bg-muted grid gap-1.5 rounded-lg p-3">
                    <span className="text-muted-foreground text-xs">{m.label}</span>
                    <b className="font-display text-xl font-semibold tabular-nums">
                      {n(m.used)} <small className="text-muted-foreground font-sans text-xs font-medium">of {n(m.cap)}</small>
                    </b>
                    <Progress value={pct(m.used, m.cap)} aria-label={`${pct(m.used, m.cap)}% used`} className={cn("h-1.5", m.used >= m.cap && "[&>*]:bg-warning")} />
                  </div>
                ))}
              </div>
            )}
            {s.figure && (
              <p className="flex items-baseline gap-2">
                <b className="font-display text-3xl font-semibold tabular-nums">{n(s.figure.value)}</b>
                <span className="text-muted-foreground text-sm">{s.figure.label}</span>
              </p>
            )}
            {s.progress && (
              <div className="grid gap-1.5">
                <span className="text-sm">{s.progress.label}</span>
                <Progress value={Math.max(pct(s.progress.value, s.progress.total), 2)} aria-label={s.progress.label} />
              </div>
            )}
            {s.text && <p className="text-muted-foreground text-sm text-pretty">{s.text}</p>}
            {(!!s.actions?.length || !!s.links?.length) && (
              <div className="flex flex-wrap gap-2">
                {s.actions?.map((x) => (
                  <Button key={x.id} size="sm" variant={x.variant === "outline" ? "outline" : "default"} pending={busy === x.id} disabled={!!busy} onClick={() => void act(x.id)}>
                    {x.label}
                  </Button>
                ))}
                {s.links?.map((l) =>
                  l.href.startsWith("/") ? (
                    <Button key={l.href} asChild size="sm" variant={s.actions?.length ? "ghost" : "outline"}>
                      <Link href={l.href} onClick={() => onOpenChange(false)}>
                        {l.label}
                      </Link>
                    </Button>
                  ) : (
                    <Button key={l.href} asChild size="sm" variant="outline">
                      <a href={l.href}>{l.label}</a>
                    </Button>
                  ),
                )}
              </div>
            )}
            {s.footnote && <p className="text-muted-foreground border-t pt-3 text-xs">{s.footnote}</p>}
          </section>
        ))}
      </DialogContent>
    </Dialog>
  );
}
