"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconArrowBackUp, IconCheck, IconEye, IconFileTypePdf, IconFileZip, IconPlayerPlay, IconSearch, IconTrash, IconUpload } from "@/components/icons";
import { BrandImport, Card, size, statusOf, type ImportRow } from "@/components/brand-import";
import { useCan, useMe } from "@/components/can";
import { Confirm } from "@/components/confirm";
import { refreshImportSignal, useImportSignal } from "@/components/import-signal";
import { AppHeader, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { sendResult } from "@/lib/send";
import { cn } from "@/lib/utils";

/**
 * The project's brand imports, every one kept as its history (Intelligence's GET /brand-import, a page at a time),
 * newest first, as a table like the catalog's: where each is, who started it, what it made, when, and what can be done
 * with it now. Found by name or starter, narrowed by status and to one's own, as the Brands page filters. A row opens
 * the import. Shown only where the server offers brand import (me.brandImport: Intelligence on in the project) and to
 * whoever may see imports (import.read); starting one takes import.run, so a Contributor starts here (New brand is an
 * Editor's).
 */
type Page = {
  imports: ImportRow[];
  total: number;
  can: { run: boolean; apply: boolean; manage: boolean };
};
type Status = "all" | "needs" | "running" | "done";
const PAGE = 50;
const STATUSES: Record<Status, string> = {
  all: "All",
  needs: "Waiting for review",
  running: "In progress",
  done: "Done",
};

/** The app's badge for each status: what waits on someone stands out, what is over steps back. */
const VARIANT: Record<string, React.ComponentProps<typeof Badge>["variant"]> = {
  uploading: "secondary",
  processing: "secondary",
  applying: "secondary",
  undoing: "secondary",
  ready: "warning",
  failed: "outline",
  applied: "success",
  undone: "outline",
  discarded: "outline",
  expired: "outline",
};
const AT_WORK = ["uploading", "processing", "applying", "undoing"];

/** What the actions that take a second thought say before they run. */
const WARN: Record<
  "apply" | "undo" | "discard",
  {
    title: (r: ImportRow) => string;
    says: (r: ImportRow) => React.ReactNode;
    action: string;
  }
> = {
  apply: {
    title: (r) => `Apply ${r.filename} without opening its plan?`,
    says: (r) =>
      `It makes ${r.proposed.length ? r.proposed.join(", ") : "the brands it proposes"}, with the rules, pages and collections of its plan, and adds its files to the library, as you. Nobody reviews it first. You can undo it as a whole for 30 days.`,
    action: "Approve and apply",
  },
  undo: {
    title: (r) => `Undo ${r.filename}?`,
    says: () =>
      "The files, collections and brands it added are removed (deleted files stay restorable for 30 days), and the brands it changed go back as they were. Changes made to them since are lost. It runs in the background.",
    action: "Undo import",
  },
  discard: {
    title: (r) => `Discard ${r.filename}?`,
    says: () => "Its plan and the archive's files are deleted, and can't be brought back. It stays in this list as discarded.",
    action: "Discard",
  },
};
const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/** A choice of a few, as the Brands page draws one. */
function Segments<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="bg-muted flex rounded-md p-0.5">
      {(Object.keys(options) as T[]).map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          onClick={() => onChange(o)}
          className="text-muted-foreground aria-checked:bg-background aria-checked:text-foreground rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap aria-checked:shadow-sm"
        >
          {options[o]}
        </button>
      ))}
    </div>
  );
}

export function ImportsPage() {
  const me = useMe();
  const can = useCan();
  const router = useRouter();
  const url = me?.brandImport && can("import.read") ? me.brandImport.replace(/\/+$/, "") : null;
  const [status, setStatus] = useState<Status>("all");
  const [whose, setWhose] = useState<"everyone" | "mine">("everyone");
  const [typed, setTyped] = useState("");
  const [find, setFind] = useState("");
  const [page, setPage] = useState<Page | null>(null);
  const [more, setMore] = useState<ImportRow[]>([]);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  // An action that takes a second thought (applying without opening the plan, undoing, discarding) asks first. What
  // it asks about stays while the dialog closes, so its words and button don't empty during the closing animation.
  const [confirming, setConfirming] = useState<{
    kind: "apply" | "undo" | "discard";
    row: ImportRow;
  } | null>(null);
  const [asking, setAsking] = useState(false);
  const ask = (kind: "apply" | "undo" | "discard", row: ImportRow) => {
    setConfirming({ kind, row });
    setAsking(true);
  };

  // What's typed is asked for once the typing stops.
  useEffect(() => {
    const t = setTimeout(() => setFind(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);
  const query = useCallback(
    (offset: number) => {
      const q = new URLSearchParams({
        limit: String(PAGE),
        offset: String(offset),
      });
      if (status !== "all") q.set("filter", status);
      if (whose === "mine") q.set("mine", "1");
      if (find) q.set("q", find);
      return `${url}?${q}`;
    },
    [url, status, whose, find],
  );
  const load = useCallback(async () => {
    if (!url) return;
    const r = await sendResult("GET", query(0), undefined, { quiet: true });
    if (r.ok) {
      setPage(r.data as Page);
      setMore([]);
    }
  }, [url, query]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  // While one is at work, asked again every few seconds: its progress moves here too.
  const rows = [...(page?.imports ?? []), ...more];
  const working = rows.some((i) => AT_WORK.includes(i.status));
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [working, load]);

  async function showMore() {
    const r = await sendResult("GET", query(rows.length), undefined, {
      quiet: true,
    });
    if (r.ok) setMore((m) => [...m, ...(r.data as Page).imports]);
  }
  const open = (id: string) => router.push(`/imports/${id}`);
  /** Apply or Undo carried on, or Undo started: it runs in the background, and the list follows it. */
  async function run(row: ImportRow, kind: "apply" | "undo") {
    const r = await sendResult("POST", `${url}/${row.id}/${kind}`);
    if (!r.ok) return false;
    refreshImportSignal();
    await load();
    return true;
  }
  async function discard(row: ImportRow) {
    const r = await sendResult("DELETE", `${url}/${row.id}`);
    if (!r.ok) return false;
    refreshImportSignal();
    await load();
    return true;
  }

  const trail = [{ label: "Brands", href: "/brands" }, { label: "Imports" }];
  if (!url) {
    return (
      <>
        <AppHeader trail={trail} />
        <Shell>
          <Card>
            <p className="font-medium">Brand import is off here</p>
            <p className="text-muted-foreground text-sm">It comes with Intelligence, where it is on in the project, for people who may see imports.</p>
          </Card>
        </Shell>
      </>
    );
  }

  const filtered = status !== "all" || whose === "mine" || !!find;
  return (
    <>
      <AppHeader trail={trail} />
      <Shell>
        <PageHeader
          icon={<IconFileZip />}
          title="Imports"
          description="Every brand import of this project: what it is doing, who started it, what it made."
          aside={page && <span className="text-muted-foreground text-sm tabular-nums">{page.total}</span>}
        >
          {page?.can.run && (
            <Button size="sm" onClick={() => setStarting(true)}>
              <IconUpload /> Import your brand
            </Button>
          )}
        </PageHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <IconSearch aria-hidden className="text-muted-foreground absolute start-2.5 top-1/2 size-4 -translate-y-1/2" />
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Find an import"
              aria-label="Find an import by its archive or who started it"
              className="h-8 ps-8"
            />
          </div>
          <Segments label="Status" value={status} options={STATUSES} onChange={setStatus} />
          <Segments label="Whose" value={whose} options={{ everyone: "Everyone", mine: "Mine" }} onChange={setWhose} />
        </div>

        {!page ? (
          <div className="bg-muted h-40 animate-pulse rounded-xl" />
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {filtered
              ? "No import matches these filters."
              : "No imports yet. An import reads a zip of your brand's files, or its guidelines PDF, into brands, collections and guidelines you review before anything is added."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-left text-xs whitespace-nowrap">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Archive</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium max-lg:hidden">Started by</th>
                  <th className="px-4 py-2.5 font-medium max-lg:hidden">Brand</th>
                  <th className="px-4 py-2.5 text-end font-medium max-xl:hidden">Date</th>
                  <th className="px-4 py-2.5 text-end font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((i) => (
                  <ImportRowLine
                    key={i.id}
                    row={i}
                    onOpen={open}
                    onCarryOn={() => void run(i, i.undoing ? "undo" : "apply")}
                    onApprove={() => ask("apply", i)}
                    onUndo={() => ask("undo", i)}
                    onDiscard={() => ask("discard", i)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {page && rows.length < page.total && (
          <div>
            <Button variant="outline" onClick={() => void showMore()}>
              Show {Math.min(PAGE, page.total - rows.length).toLocaleString()} more
            </Button>
          </div>
        )}
      </Shell>

      <Confirm
        open={asking}
        onOpenChange={setAsking}
        destructive={confirming?.kind !== "apply"}
        title={confirming ? WARN[confirming.kind].title(confirming.row) : ""}
        says={confirming ? WARN[confirming.kind].says(confirming.row) : null}
        action={confirming ? WARN[confirming.kind].action : ""}
        run={() => (confirming ? (confirming.kind === "discard" ? discard(confirming.row) : run(confirming.row, confirming.kind)) : false)}
      />

      <Dialog open={starting} onOpenChange={(o) => !o && !busy && setStarting(false)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import your brand</DialogTitle>
            <DialogDescription>A zip of your brand&apos;s files, or its guidelines PDF. Nothing is added until the plan is applied.</DialogDescription>
          </DialogHeader>
          <BrandImport
            url={url}
            onBusy={setBusy}
            onStarted={(id) => {
              refreshImportSignal();
              router.push(`/imports/${id}`);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * One import, as a row: its archive, its status (with its progress while at work), who, its brands (made, or proposed
 * before Apply), when, and its actions: what this person may do with it at this stage (the importer's `can`).
 */
function ImportRowLine({
  row: i,
  onOpen,
  onCarryOn,
  onApprove,
  onUndo,
  onDiscard,
}: {
  row: ImportRow;
  onOpen: (id: string) => void;
  onCarryOn: () => void;
  onApprove: () => void;
  onUndo: () => void;
  onDiscard: () => void;
}) {
  const s = statusOf(i);
  const Kind = /\.pdf$/i.test(i.filename) ? IconFileTypePdf : IconFileZip;
  const p = i.progress;
  const applied = !!i.appliedAt || !!i.counts;
  const may = i.can;
  const actions = {
    approve: i.status === "ready" && may.apply,
    carryOn: i.status === "failed" && applied && may.apply,
    undo: (i.status === "applied" || (i.status === "failed" && applied && !i.undoing)) && may.undo,
    discard: ["uploading", "ready", "failed"].includes(i.status) && !applied && may.discard,
  };
  // Its brands: those Apply made or changed; before it, those its plan proposes.
  const made = i.brands.map((b) => ({
    key: b.slug,
    name: b.created ? b.name : `${b.name} (updated)`,
    href: `/brands/${b.slug}`,
  }));
  const shown = i.status === "undone" ? [] : made.length ? made : i.status === "ready" ? i.proposed.map((name) => ({ key: name, name, href: null })) : [];
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <tr
      tabIndex={0}
      onClick={() => onOpen(i.id)}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onOpen(i.id)}
      className="hover:bg-accent/60 focus-visible:bg-accent cursor-pointer outline-none"
    >
      <td className="w-full max-w-0 min-w-40 px-4 py-2.5 lg:max-w-56 lg:w-auto">
        <span className="flex min-w-0 items-center gap-2.5" title={i.filename}>
          <Kind className="text-muted-foreground size-4 shrink-0" />
          <span className="truncate font-medium">{i.filename}</span>
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums max-lg:hidden">{size(i.bytes)}</span>
        </span>
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        <span className="flex items-center gap-1.5">
          <Badge variant={VARIANT[i.status] ?? "outline"} className={i.status === "failed" ? "text-destructive" : undefined}>
            {s.label}
          </Badge>
          {p && p.total > 0 && AT_WORK.includes(i.status) && (
            <span className="text-muted-foreground text-xs tabular-nums">
              {Math.min(p.done, p.total).toLocaleString("en")} / {p.total.toLocaleString("en")}
            </span>
          )}
        </span>
      </td>
      <td className="text-muted-foreground px-4 py-2.5 whitespace-nowrap max-lg:hidden">{i.startedBy.name ?? "-"}</td>
      <td className="px-4 py-2.5 whitespace-nowrap max-lg:hidden">
        {i.status === "undone" ? (
          <span className="text-muted-foreground">Taken back</span>
        ) : shown.length ? (
          <span className="flex items-center gap-1.5">
            {shown[0].href ? (
              <Link href={shown[0].href} onClick={stop} className="truncate hover:underline">
                {shown[0].name}
              </Link>
            ) : (
              <span className="text-muted-foreground truncate">{shown[0].name}</span>
            )}
            {!made.length && <span className="text-muted-foreground text-xs">proposed</span>}
            {shown.length > 1 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="cursor-default" onClick={stop}>
                    +{shown.length - 1}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">{shown.map((b) => b.name).join(", ")}</TooltipContent>
              </Tooltip>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </td>
      <td className="text-muted-foreground px-4 py-2.5 text-end whitespace-nowrap tabular-nums max-xl:hidden">{day(i.appliedAt ?? i.at)}</td>
      <td className="px-4 py-1.5" onClick={stop} onKeyDown={stop}>
        {/* Glued, as one group of icons, each named on hover: what it does here, for this import. */}
        <span
          role="group"
          aria-label={`Actions for ${i.filename}`}
          className="bg-background float-end inline-flex divide-x overflow-hidden rounded-md border shadow-xs"
        >
          {actions.approve && (
            <Act label="Approve: apply its plan without opening it" onClick={onApprove} className="text-primary-ink">
              <IconCheck />
            </Act>
          )}
          {actions.carryOn && (
            <Act label={i.undoing ? "Carry on undoing, from where it stopped" : "Carry on applying, from where it stopped"} onClick={onCarryOn}>
              <IconPlayerPlay />
            </Act>
          )}
          {actions.undo && (
            <Act label="Undo: remove what it added, put back what it changed" onClick={onUndo}>
              <IconArrowBackUp />
            </Act>
          )}
          {actions.discard && (
            <Act label="Discard its plan and its files" onClick={onDiscard} className="text-destructive">
              <IconTrash />
            </Act>
          )}
          <Act label="Open the import" onClick={() => onOpen(i.id)}>
            <IconEye />
          </Act>
        </span>
      </td>
    </tr>
  );
}

/** One action of a row's group: an icon, its meaning said on hover and to screen readers. */
function Act({ label, onClick, className, children }: { label: string; onClick: () => void; className?: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className={cn(
            "text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent grid size-8 place-items-center outline-none [&_svg]:size-4",
            className,
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-6 pb-16 md:px-6">{children}</div>;
}

/** The Brands page's way to its imports: only where brand import is offered, for whoever may see imports. */
export function ImportsButton() {
  const me = useMe();
  const can = useCan();
  if (!me?.brandImport || !can("import.read")) return null;
  return (
    <Button asChild size="sm" variant="outline">
      <Link href="/imports">
        <IconFileZip /> Imports
      </Link>
    </Button>
  );
}

/** What's at work, or waiting, said on the Brands page: the newest import at work, else the plans to apply. */
export function ImportsBanner() {
  const me = useMe();
  const can = useCan();
  const s = useImportSignal(me?.brandImport && can("import.read") ? me.brandImport.replace(/\/+$/, "") : null);
  if (!s) return null;
  const l = s.latest;
  if (l) {
    const doing = l.status === "applying" ? "is being applied" : l.status === "undoing" ? "is being undone" : "is being read";
    const p = l.progress;
    return (
      <Card className="border-primary/30 bg-primary/5 flex flex-wrap items-center gap-3 sm:flex">
        <span className="bg-primary size-2 shrink-0 animate-pulse rounded-full" />
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-medium">{l.filename}</span> {doing}
          {l.label ? `: ${l.label.toLowerCase()}` : ""}
          {p && p.total > 0 && l.status !== "processing" ? ` · ${Math.min(p.done, p.total).toLocaleString("en")} of ${p.total.toLocaleString("en")} files` : ""}
          {s.running > 1 ? ` · ${s.running - 1} more at work` : ""}
        </p>
        <Button asChild size="sm" variant="outline">
          <Link href={`/imports/${l.id}`}>Open</Link>
        </Button>
      </Card>
    );
  }
  if (!s.waiting && !s.stopped) return null;
  const what = [
    s.waiting && `${s.waiting} ${s.waiting === 1 ? "plan waits" : "plans wait"} to be applied`,
    s.stopped && `${s.stopped} ${s.stopped === 1 ? "import" : "imports"} stopped`,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <Card className="flex flex-wrap items-center gap-3 sm:flex">
      <p className="min-w-0 flex-1 text-sm">{what}.</p>
      <Button asChild size="sm" variant="outline">
        <Link href="/imports">See imports</Link>
      </Button>
    </Card>
  );
}
