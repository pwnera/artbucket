"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { IconFileTypePdf, IconFileZip, IconUpload } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { reason, refusal, sendResult } from "@/lib/send";
import { cn } from "@/lib/utils";

/**
 * The server's brand importer (BRAND_IMPORT_URL, me.brandImport), as a step of
 * New brand: a zip of the brand's files, or its guidelines PDF, uploaded in
 * parts; the server reads it in the background into a plan the person
 * reviews on the import's own page (components/brand-import-page.tsx). The
 * app draws it; its endpoints, under the URL:
 *
 *   GET  {url}                    { data: { notice, project, max, maxFiles, partSize, cap, used, brandRoom, imports } }
 *   POST {url}                    { filename, size }: { data: { id, partSize, parts } }
 *   PUT  {url}/{id}/parts/{n}     a part's bytes
 *   POST {url}/{id}/complete      every part sent: read it
 *
 * `onBusy` says when an upload runs (closing the dialog would end it);
 * `onStarted` takes the person to the import's page once it is uploaded.
 */

type Notice = { title: string; text: string; href?: string; label?: string };
/** An import as the project's list gives it (Intelligence's summary): where it is, who, when, what Apply made. */
export type ImportRow = {
  id: string;
  filename: string;
  bytes: number;
  status: string;
  label: string | null;
  progress: { done: number; total: number } | null;
  error: string | null;
  startedBy: { id: string; name: string | null };
  at: string;
  brands: { slug: string; name: string; created: boolean }[];
  /** Before Apply: the brands its plan proposes, by name. */
  proposed: string[];
  counts: {
    assets: number;
    deduped: number;
    left: number;
    failed: number;
  } | null;
  appliedBy: { id: string; name: string | null } | null;
  appliedAt: string | null;
  undoneAt: string | null;
  /** Stopped while being undone: carrying on is the undo's. */
  undoing: boolean;
  tagging: { queued: number; over: number } | null;
  archive: boolean;
  /** What the person asking may do with it (the importer checks the import.* actions and whose it is). */
  can: {
    open: boolean;
    edit: boolean;
    apply: boolean;
    undo: boolean;
    discard: boolean;
  };
};
type Start = {
  notice: Notice | null;
  project: string;
  max: number;
  maxFiles: number;
  partSize: number;
  cap: number;
  used: number;
  brandRoom: string | null;
  imports: ImportRow[];
};

export const size = (n: number) =>
  n < 1048576
    ? `${Math.max(1, Math.round(n / 1024))} KB`
    : n < 1073741824
      ? `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`
      : `${Number((n / 1073741824).toFixed(1))} GB`;
/** Parts sent at once. */
const AT_ONCE = 3;

export function BrandImport({ url, onBusy, onStarted }: { url: string; onBusy: (busy: boolean) => void; onStarted: (id: string) => void }) {
  const id = useId();
  const base = url.replace(/\/+$/, "");
  const [start, setStart] = useState<Start | null>(null);
  const [failed, setFailed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [wrong, setWrong] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  const running = sent !== null && !error;
  useEffect(() => {
    onBusy(running);
  }, [running, onBusy]);

  function pick(f: File | undefined) {
    if (!f || !start) return;
    setFile(null);
    if (!/\.(zip|pdf)$/i.test(f.name)) return setWrong("Pick a .zip of your brand's files, or its guidelines as a PDF.");
    if (f.size > start.max) return setWrong(`${f.name} is ${size(f.size)}: ${size(start.max)} at most.`);
    setWrong(null);
    setFile(f);
  }

  /** The file in parts, a few at a time, each tried again once or twice: a dropped connection costs a part, not the upload. */
  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || running) return;
    setError(null);
    setSent(0);
    try {
      const made = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, size: file.size }),
      });
      if (!made.ok) throw new Error(await refusal(made, "The upload couldn't start"));
      const { data } = (await made.json()) as {
        data: { id: string; partSize: number; parts: number };
      };
      let done = 0;
      const queue = Array.from({ length: data.parts }, (_, i) => i + 1);
      const worker = async () => {
        for (let n = queue.shift(); n !== undefined; n = queue.shift()) {
          const blob = file.slice((n - 1) * data.partSize, n * data.partSize);
          for (let tries = 1; ; tries++) {
            const res = await fetch(`${base}/${data.id}/parts/${n}`, {
              method: "PUT",
              body: blob,
            }).catch(() => null);
            if (res?.ok) break;
            if (tries >= 3) throw new Error(res ? await refusal(res, "A part of the file didn't arrive") : "The connection dropped. Try again.");
          }
          done += blob.size;
          setSent(done);
        }
      };
      await Promise.all(Array.from({ length: Math.min(AT_ONCE, data.parts) }, worker));
      const finished = await fetch(`${base}/${data.id}/complete`, {
        method: "POST",
      });
      if (!finished.ok) throw new Error(await refusal(finished, "The upload couldn't finish"));
      onStarted(data.id);
    } catch (err) {
      setError(reason(err, "The upload failed"));
    }
  }

  if (failed) {
    return (
      <Card>
        <p className="font-medium">Brand import can&apos;t be reached</p>
        <p className="text-muted-foreground text-sm">Try again in a moment.</p>
        <div>
          <Button type="button" size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
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

  const left = Math.max(start.cap - start.used, 0);
  const Kind = file && /\.pdf$/i.test(file.name) ? IconFileTypePdf : file ? IconFileZip : IconUpload;
  return (
    <div className="grid gap-5">
      <form onSubmit={upload} className="grid gap-4">
        <p className="text-muted-foreground text-sm">
          Upload everything {start.project} has: logos, fonts, photos, templates, guidelines. Intelligence sorts it, reads any brand book it finds and proposes
          brands, collections and guidelines for you to review.
        </p>
        {sent === null ? (
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
            <Kind className={cn("size-7", file && "text-primary-ink")} />
            <strong className="text-foreground font-medium">{file ? file.name : "Choose a .zip or a PDF"}</strong>
            <span>{file ? size(file.size) : `or drop it here. Up to ${size(start.max)} and ${start.maxFiles.toLocaleString("en")} files.`}</span>
            {wrong && <span className="text-destructive">{wrong}</span>}
            <input
              id={`${id}-file`}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed,.pdf,application/pdf"
              className="sr-only"
              onChange={(e) => pick(e.target.files?.[0])}
            />
          </label>
        ) : (
          <Card>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium">{error ? "The upload stopped" : `Uploading ${file?.name}`}</span>
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {size(sent)} of {size(file?.size ?? 0)}
              </span>
            </div>
            <Progress value={file ? (100 * sent) / file.size : 0} />
            {error ? (
              <p className="text-destructive text-sm">{error}</p>
            ) : (
              <p className="text-muted-foreground text-xs">Keep this open until the upload ends. Reading it carries on without you.</p>
            )}
          </Card>
        )}
        {start.brandRoom && <p className="text-warning text-xs">{start.brandRoom}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!file || running}>
            {error ? "Try again" : "Upload and read"}
          </Button>
          <span className="text-muted-foreground text-xs">
            {left.toLocaleString("en")} of {start.cap.toLocaleString("en")} files left to read this month.
          </span>
        </div>
      </form>
      {start.imports.length > 0 && <Imports base="/imports" imports={start.imports} />}
    </div>
  );
}

const STATUS: Record<string, [string, string]> = {
  uploading: ["Uploading", "bg-primary/10 text-primary-ink"],
  processing: ["Reading", "bg-primary/10 text-primary-ink"],
  ready: ["Plan ready", "bg-warning/15 text-warning"],
  applying: ["Applying", "bg-primary/10 text-primary-ink"],
  applied: ["Applied", "bg-success/15 text-success"],
  undoing: ["Undoing", "bg-primary/10 text-primary-ink"],
  failed: ["Stopped", "bg-destructive/10 text-destructive"],
  undone: ["Undone", "bg-muted text-muted-foreground"],
  discarded: ["Discarded", "bg-muted text-muted-foreground"],
  expired: ["Expired", "bg-muted text-muted-foreground"],
};

/** An import's status in words, and the colour it is shown in: the stage under way, while one is. */
export function statusOf(i: Pick<ImportRow, "status" | "label">) {
  const [label, tone] = STATUS[i.status] ?? [i.status, "bg-muted text-muted-foreground"];
  return { label: i.label ?? label, tone };
}

/** The project's latest imports, each a link to its page. */
export function Imports({ base, imports }: { base: string; imports: ImportRow[] }) {
  return (
    <section className="grid gap-2">
      <div className="flex items-baseline gap-3">
        <h3 className="text-sm font-semibold">Recent imports</h3>
        <Link href="/imports" className="text-muted-foreground ml-auto text-xs hover:underline">
          See all imports
        </Link>
      </div>
      <ul className="divide-y rounded-lg border text-sm">
        {imports.slice(0, 5).map((i) => (
          <li key={i.id}>
            <Link href={`${base}/${i.id}`} className="hover:bg-accent/50 flex items-center gap-3 px-3 py-2">
              {/\.pdf$/i.test(i.filename) ? (
                <IconFileTypePdf className="text-muted-foreground size-4 shrink-0" />
              ) : (
                <IconFileZip className="text-muted-foreground size-4 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate">{i.filename}</span>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs", statusOf(i).tone)}>{statusOf(i).label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("bg-card grid gap-3 rounded-xl border p-4", className)}>{children}</div>;
}
