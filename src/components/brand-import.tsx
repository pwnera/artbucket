"use client";

import { useEffect, useId, useState } from "react";
import { IconCheck, IconFileTypePdf, IconUpload } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { jsonLines } from "@/lib/assistant-answer";
import { reason, refusal, sendResult } from "@/lib/send";
import { cn } from "@/lib/utils";

/**
 * The server's brand book importer (BRAND_IMPORT_URL, me.brandImport), as a
 * step of New brand: a guidelines PDF in, a draft brand out, made by the
 * server as the person. The app draws it; its endpoints, under the URL:
 *
 *   GET  {url}       { data: { notice, project, cap, max, used, imports } }:
 *                    why a book can't be imported here now ({ title, text,
 *                    href?, label? }), checked before one is picked, or the
 *                    month's books (used of cap) and the largest PDF (max, bytes)
 *   POST {url}/run   multipart: `book` (the PDF), `name`: the import, as JSON
 *                    lines: { type: "step", label }, then { type: "done", brand:
 *                    { slug, name }, report, written } or { type: "error", message }
 *
 * `onBusy` says when an import runs (closing the dialog would end it);
 * `onOpen` takes the person to the draft it made.
 */

type Notice = { title: string; text: string; href?: string; label?: string };
type Start = { notice: Notice | null; project: string; cap: number; max: number; used: number | null };
type Color = { name: string; hex: string };
/** What the import made, and what the reviewer should check first. */
type Done = {
  brand: { slug: string; name: string };
  report: { colors: number; fonts: number; estimated: Color[]; converted: Color[]; uploadLogos: string[]; uploadFonts: string[]; dropped: string[] };
  written: { rules: number; pages: number; notes: number; dropped: { what: string; why: string }[] };
};

const mb = (n: number) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function BrandImport({ url, onBusy, onOpen }: { url: string; onBusy: (busy: boolean) => void; onOpen: (slug: string) => void }) {
  const id = useId();
  const base = url.replace(/\/+$/, "");
  const [start, setStart] = useState<Start | null>(null);
  const [failed, setFailed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [wrong, setWrong] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [over, setOver] = useState(false);
  const [steps, setSteps] = useState<string[] | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    void sendResult("GET", base, undefined, { quiet: true }).then((r) => {
      if (!live) return;
      setFailed(!r.ok);
      if (r.ok) setStart(r.data as Start);
    });
    return () => {
      live = false;
    };
  }, [base, attempt]);
  /** Read again: after a failure, or an import that failed (the month's count may have moved). */
  const again = () => {
    setFailed(false);
    setAttempt((n) => n + 1);
  };
  useEffect(() => {
    onBusy(running);
  }, [running, onBusy]);

  function pick(f: File | undefined) {
    if (!f || !start) return;
    setFile(null);
    if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) return setWrong("That isn't a PDF.");
    if (f.size > start.max) return setWrong(`${f.name} is ${mb(f.size)}: ${mb(start.max)} at most.`);
    setWrong(null);
    setFile(f);
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!file || running) return;
    const body = new FormData();
    body.append("book", file);
    if (name.trim()) body.append("name", name.trim());
    setRunning(true);
    setError(null);
    setDone(null);
    setSteps([`Uploading ${file.name}`]);
    let finished = false;
    try {
      const res = await fetch(`${base}/run`, { method: "POST", body });
      if (!res.ok || !res.body) throw new Error(await refusal(res, "The import couldn't start"));
      for await (const ev of jsonLines(res)) {
        if (ev.type === "step" && typeof ev.label === "string") {
          const label = ev.label;
          setSteps((s) => [...(s ?? []), label]);
        } else if (ev.type === "done") {
          finished = true;
          setDone(ev as unknown as Done);
        } else if (ev.type === "error") throw new Error(typeof ev.message === "string" ? ev.message : "The import failed");
      }
      if (!finished) throw new Error("The import stopped before the end. Try again.");
    } catch (err) {
      setError(reason(err, "The import failed"));
    } finally {
      setRunning(false);
    }
  }

  if (failed) {
    return (
      <Card>
        <p className="font-medium">Brand book import can&apos;t be reached</p>
        <p className="text-muted-foreground text-sm">Try again in a moment.</p>
        <div>
          <Button type="button" size="sm" variant="outline" onClick={again}>
            Try again
          </Button>
        </div>
      </Card>
    );
  }
  if (!start) return <Card className="text-muted-foreground min-h-48 animate-pulse text-sm">Checking what this project can import…</Card>;
  if (start.notice) {
    const n = start.notice;
    return (
      <Card>
        <p className="font-medium">{n.title}</p>
        <p className="text-muted-foreground text-sm">{n.text}</p>
        {n.href && (
          <div>
            <Button asChild size="sm">
              <a href={n.href}>{n.label ?? "Open"}</a>
            </Button>
          </div>
        )}
      </Card>
    );
  }
  if (done) return <Result done={done} onOpen={onOpen} />;
  if (steps) {
    return (
      <Card>
        <ol className="grid gap-2 text-sm" aria-live="polite">
          {steps.map((s, i) => {
            const now = running && i === steps.length - 1;
            return (
              <li key={i} className={cn("flex items-center gap-2.5", !now && "text-muted-foreground")}>
                <span className={cn("size-2 shrink-0 rounded-full", now ? "bg-primary animate-pulse" : error && i === steps.length - 1 ? "bg-destructive" : "bg-success")} />
                {s}
              </li>
            );
          })}
        </ol>
        {error && (
          <div className="grid gap-3">
            <p className="text-destructive text-sm">{error}</p>
            <div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setSteps(null);
                  setError(null);
                  again();
                }}
              >
                Try again
              </Button>
            </div>
          </div>
        )}
      </Card>
    );
  }

  const room = Math.max(start.cap - (start.used ?? 0), 0);
  return (
    <form onSubmit={run} className="grid gap-4">
      <p className="text-muted-foreground text-sm">
        Intelligence reads every page of {start.project}&apos;s guidelines PDF (a brand book, or a Frontify export) and makes a draft brand: colors with their
        print values, typefaces, logo rules, voice, and pages like the book&apos;s chapters. You review it before anyone sees it.
      </p>
      <label
        htmlFor={`${id}-file`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          pick(e.dataTransfer.files[0]);
        }}
        className={cn(
          "text-muted-foreground hover:border-primary hover:bg-primary/5 grid cursor-pointer place-items-center gap-1.5 rounded-xl border-[1.5px] border-dashed px-4 py-7 text-center text-sm",
          over && "border-primary bg-primary/5",
        )}
      >
        {file ? <IconFileTypePdf className="text-primary-ink size-7" /> : <IconUpload className="size-7" />}
        <strong className="text-foreground font-medium">{file ? file.name : "Choose a PDF"}</strong>
        <span>{file ? mb(file.size) : `or drop it here. Up to ${Math.round(start.max / 1048576)} MB and 600 pages.`}</span>
        {wrong && <span className="text-destructive">{wrong}</span>}
        <input id={`${id}-file`} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
      </label>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-name`}>Brand name</Label>
        <Input id={`${id}-name`} value={name} maxLength={80} placeholder="As the book names it" onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!file}>
          Import
        </Button>
        <span className="text-muted-foreground text-xs">
          Takes a minute or two for a 40-page book. {room} of {start.cap} left this month.
        </span>
      </div>
    </form>
  );
}

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("bg-card grid gap-3 rounded-xl border p-4", className)}>{children}</div>;
}

/** The draft made: what it holds, what to check first, what was left out, and the way to it. */
function Result({ done, onOpen }: { done: Done; onOpen: (slug: string) => void }) {
  const { report: r, written: w, brand: b } = done;
  const left = [...r.dropped, ...w.dropped.map((d) => `${d.what}: ${d.why}`)];
  const chip = (hex: string) => <span className="size-8 shrink-0 rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/12%)]" style={{ background: hex }} />;
  const icon = (c: React.ReactNode) => <span className="bg-muted text-muted-foreground font-display grid size-8 shrink-0 place-items-center rounded-md text-xs font-semibold">{c}</span>;
  const checks: { lead: React.ReactNode; title: React.ReactNode; why: string }[] = [
    ...r.estimated.map((c) => ({
      lead: chip(c.hex),
      title: <ColorTitle c={c} tag="Estimated" warn />,
      why: "Shown only as a swatch in the book: compare it with the printed page.",
    })),
    ...r.converted.map((c) => ({ lead: chip(c.hex), title: <ColorTitle c={c} tag="Converted" />, why: "Worked out from its print values: check it on screen." })),
    ...(r.uploadLogos.length
      ? [{ lead: icon(<IconUpload className="size-4" />), title: plural(r.uploadLogos.length, "logo file", "logo files") + " to upload", why: `${r.uploadLogos.join(", ")}. A PDF rarely holds usable originals.` }]
      : []),
    ...(r.uploadFonts.length
      ? [{ lead: icon("Aa"), title: plural(r.uploadFonts.length, "typeface", "typefaces") + " to add", why: `${r.uploadFonts.join(", ")} ${r.uploadFonts.length === 1 ? "isn't" : "aren't"} on Google Fonts: add the font files.` }]
      : []),
  ];
  return (
    <div className="grid gap-5">
      <div className="flex items-start gap-3.5">
        <span className="bg-success/15 text-success grid size-9 shrink-0 place-items-center rounded-full">
          <IconCheck className="size-5" />
        </span>
        <div>
          <p className="font-display text-lg font-semibold tracking-tight">{b.name} is ready for review</p>
          <p className="text-muted-foreground text-sm">A draft: nobody outside the team sees it until you release it.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            [r.colors, "Color", "Colors"],
            [r.fonts, "Typeface", "Typefaces"],
            [w.rules, "Rule", "Rules"],
            [w.pages, "Page", "Pages"],
          ] as const
        ).map(([n, one, many]) => (
          <div key={many} className="bg-muted grid gap-0.5 rounded-lg px-3.5 py-3">
            <b className="font-display text-2xl font-semibold tabular-nums">{n}</b>
            <span className="text-muted-foreground text-xs">{n === 1 ? one : many}</span>
          </div>
        ))}
      </div>
      {checks.length ? (
        <section className="grid gap-2">
          <header className="flex items-baseline justify-between gap-4">
            <h3 className="text-sm font-semibold">Check first</h3>
            {w.notes > 0 && <span className="text-muted-foreground text-xs">Also left as comments on its pages</span>}
          </header>
          <ul className="divide-y rounded-lg border">
            {checks.map((c, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                {c.lead}
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <strong className="flex flex-wrap items-center gap-2 text-sm font-medium">{c.title}</strong>
                  <span className="text-muted-foreground text-xs">{c.why}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-muted-foreground text-sm">Nothing stood out. Read it through against the book before you release it.</p>
      )}
      {left.length > 0 && (
        <details className="text-muted-foreground text-sm">
          <summary className="w-max cursor-pointer">{plural(left.length, "thing", "things")} left out</summary>
          <ul className="mt-2 grid list-disc gap-1 ps-5">
            {left.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </details>
      )}
      <div>
        <Button type="button" onClick={() => onOpen(b.slug)}>
          Review the draft
        </Button>
      </div>
    </div>
  );
}

function ColorTitle({ c, tag, warn = false }: { c: Color; tag: string; warn?: boolean }) {
  return (
    <>
      {c.name} <code className="text-muted-foreground font-mono text-xs">{c.hex.toUpperCase()}</code>
      <span className={cn("rounded-full px-2 py-0.5 text-[0.6875rem] leading-none font-medium", warn ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground")}>{tag}</span>
    </>
  );
}
