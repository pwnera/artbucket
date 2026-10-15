"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconCheck,
  IconChevronDown,
  IconFileTypePdf,
  IconFileZip,
  IconFolder,
  IconPalette,
  IconPhoto,
  IconSparkles,
  IconTrash,
} from "@/components/icons";
import { Card, size } from "@/components/brand-import";
import { useMe } from "@/components/can";
import { AppHeader, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/confirm";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sendResult } from "@/lib/send";
import { cn } from "@/lib/utils";

/**
 * One brand import's page, drawn from the server's importer (me.brandImport):
 * where it is while it is read, then its plan, which the person edits (each
 * change sent as it is made), applies, and can undo. The server's answers are
 * the import as `GET {url}/{id}` gives it; Apply and Undo stream JSON lines.
 */

type Source = { kind: "stated"; path: string | null; page: number | null } | { kind: "inferred"; paths: string[] };
type Rule = {
  key: string;
  context?: string;
  type: "color" | "font" | "text" | "list" | "number";
  value: unknown;
  label?: string;
  include: boolean;
  unchanged?: boolean;
  diff?: { current: unknown; take: boolean };
  source: Source;
  spec?: { unit?: string };
};
type FileView = {
  idx: number;
  path: string;
  name: string;
  ext: string;
  size: number;
  kind: string;
  tags: string[];
  description: string;
  sure: boolean | null;
  include: boolean;
  collection: string | null;
  brand: string | null;
  preview: boolean;
};
type Brand = {
  id: string;
  name: string;
  include: boolean;
  target: string | null;
  logo: FileView | null;
  logos: LogoEntry[];
  book: {
    path: string;
    idx?: number;
    error?: string;
    modified?: string | null;
  } | null;
  /** Its other guideline PDFs, in the order they'd be read: one can be read instead. */
  books: {
    idx: number;
    path: string;
    name: string;
    size: number;
    modified: string | null;
    read: boolean;
    error: string | null;
  }[];
  inferred: string[];
  rules: Rule[];
  pages: { slug: string; title: string; include: boolean; sections: number }[];
  files: number;
  fonts: string[];
};
/** A version of the logo and its file: one the archive has, or where it will be cut from the brand book. */
type LogoEntry = {
  key: string;
  context: string | null;
  label: string;
  idx: number | null;
  by: "rules" | "model" | "person" | null;
  cut: { page: number } | null;
  create?: boolean;
  file: FileView | null;
};
type Collection = {
  id: string;
  brand: string | null;
  name: string;
  include: boolean;
  files: number;
};
type Plan = {
  brands: Brand[];
  collections: Collection[];
  existing: { slug: string; name: string }[];
  loose: number;
  total: number;
  bytes: number;
  skipped: { idx: number; path: string; why: string; of: string | null }[];
  unsure: number;
  brandsBy: "model" | "rules";
  room: { needed: number; left: number | null };
  /** Files the plan leaves out (other formats, outside any brand, unticked), brought in to their own collection or not. */
  leftovers: { files: number; include: boolean };
};
type Applied = {
  brands: {
    slug: string | null;
    name: string;
    created: boolean;
    dropped: { what: string; why: string }[];
  }[];
  assets: number;
  deduped: number;
  /** Of them, files the plan left out, in their own collection. */
  left: number;
  failed: { path: string; error: string }[];
  collections: number;
  warnings: string[];
  /** Pass 2: the files brought in, queued for tagging (suggestions in Review), and those past the month's cap. */
  tagging: { queued: number; over: number } | null;
  undo: {
    at: string;
    removed: number;
    kept: { what: string; why: string }[];
  } | null;
  undoing: boolean;
};
type View = {
  id: string;
  filename: string;
  bytes: number;
  status: "uploading" | "processing" | "ready" | "applying" | "applied" | "undoing" | "failed" | "undone" | "discarded" | "expired";
  stage: string | null;
  label: string | null;
  error: string | null;
  progress: { done: number; total: number } | null;
  stats: {
    files: number;
    kept: number;
    duplicates: number;
    variants: number;
    junk: number;
  } | null;
  expires: string | null;
  plan: Plan | null;
  applied: Applied | null;
  /** What this person may do with it now (Intelligence checks the import.* actions and who started or applied it). */
  can: {
    apply: boolean;
    undo: boolean;
    discard: boolean;
    edit: boolean;
    open: boolean;
  };
  /** A plan this person may prepare but not apply: it waits for an Editor. */
  waiting: boolean;
  startedBy: { id: string; name: string | null };
  at: string;
  appliedBy: { id: string; name: string | null } | null;
  appliedAt: string | null;
  /** Until when it can be undone, once applied (30 days); null before, or when it can't any more. */
  undoUntil: string | null;
  /** Applied more than 30 days ago: it can no longer be undone. */
  undoPast: boolean;
};
/** "Oct 14, 6:01 PM". */
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const STAGES = [
  ["unpack", "Unpacking the archive"],
  ["read", "Looking at the files"],
  ["books", "Reading the guidelines"],
  ["plan", "Writing the plan"],
] as const;
/** A file's date as the archive gives it: "Oct 2026". */
const month = (iso: string) => new Date(iso).toLocaleDateString("en", { month: "short", year: "numeric" });
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

export function BrandImportPage({ id }: { id: string }) {
  const me = useMe();
  const router = useRouter();
  const url = me?.brandImport?.replace(/\/+$/, "") ?? null;
  const [view, setView] = useState<View | null>(null);
  const [missing, setMissing] = useState<string | null>(null);

  /** The import as it is now: shown, or why it can't be. */
  const load = useCallback(async () => {
    if (!url) return;
    const r = await sendResult("GET", `${url}/${id}`, undefined, {
      quiet: true,
    });
    if (r.ok) setView(r.data as View);
    else setMissing(r.network ? "Brand import can't be reached. Try again in a moment." : (r.error?.message ?? "There's no such import in this project."));
  }, [url, id]);
  // Read once on opening, after the first paint: never a render's own work.
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  // While it is uploaded, read, applied or undone (in the background), asked again every few seconds.
  const working = view != null && ["uploading", "processing", "applying", "undoing"].includes(view.status);
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => void load(), 2500);
    return () => clearInterval(t);
  }, [working, load]);

  /** The person's changes, sent as they are made: the plan comes back as it is now. */
  async function edit(...edits: object[]) {
    const r = await sendResult("PATCH", `${url}/${id}/plan`, { edits });
    if (r.ok) setView(r.data as View);
  }

  /** Apply or undo, started: it runs in the background, as you, and this page follows it. */
  async function start(kind: "apply" | "undo") {
    const r = await sendResult("POST", `${url}/${id}/${kind}`);
    if (r.ok) setView(r.data as View);
    router.refresh();
    return r.ok;
  }

  /** Guidelines that couldn't be read, read again: the import goes back to being read, and its plan is written anew. */
  async function reread() {
    const r = await sendResult("POST", `${url}/${id}/reread`);
    if (r.ok) setView(r.data as View);
  }

  /** Another of a brand's guideline PDFs read instead: the brand is written again from it. */
  async function switchBook(brand: string, idx: number) {
    const r = await sendResult("POST", `${url}/${id}/book`, { brand, idx });
    if (r.ok) setView(r.data as View);
  }

  async function discard() {
    const r = await sendResult("DELETE", `${url}/${id}`);
    if (r.ok) router.push("/brands");
    return r.ok;
  }

  const trail = [{ label: "Brands", href: "/brands" }, { label: "Imports", href: "/imports" }, { label: view?.filename ?? "Import" }];
  if (!url || missing) {
    return (
      <>
        <AppHeader trail={trail} />
        <Shell>
          <Card>
            <p className="font-medium">{url ? "This import can't be opened" : "Brand import is off on this server"}</p>
            <p className="text-muted-foreground text-sm">{missing ?? "It needs Intelligence."}</p>
          </Card>
        </Shell>
      </>
    );
  }
  if (!view) {
    return (
      <>
        <AppHeader trail={trail} />
        <Shell>
          <div className="bg-muted h-40 animate-pulse rounded-xl" />
        </Shell>
      </>
    );
  }

  const Kind = /\.pdf$/i.test(view.filename) ? IconFileTypePdf : IconFileZip;
  const describe = {
    uploading: "Waiting for its upload to finish.",
    processing: "Being read. You can leave this page: it carries on, and the plan waits here.",
    ready: "A plan to review. Nothing is added to the library until you apply it.",
    applying: "Being applied. You can leave this page: it carries on as you.",
    applied: "Applied. You can undo it as a whole.",
    undoing: "Being undone. You can leave this page: it carries on as you.",
    failed: view.applied ? "It stopped before the end." : "It couldn't be read.",
    undone: "Undone: what it added was removed.",
    discarded: "Discarded: its plan and files are gone.",
    expired: "Expired: nobody applied its plan in time, and its files are gone.",
  }[view.status];
  // Who started it and when, who applied it: every import's history, for everyone who may see it.
  const who = [
    `Started by ${view.startedBy.name ?? "someone"} ${when(view.at)}`,
    view.appliedAt && `applied${view.appliedBy?.name ? ` by ${view.appliedBy.name}` : ""} ${when(view.appliedAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      <AppHeader trail={trail} />
      <Shell>
        <PageHeader
          icon={<Kind />}
          title={view.filename}
          description={
            <>
              {describe}
              <span className="text-muted-foreground/80 block text-xs">{who}</span>
            </>
          }
          aside={<span className="text-muted-foreground text-sm tabular-nums">{size(view.bytes)}</span>}
        >
          {view.can.discard && <DiscardButton onDiscard={discard} />}
          {view.can.undo && !view.applied?.undoing && <UndoButton onUndo={() => start("undo")} />}
        </PageHeader>

        {(view.status === "applying" || view.status === "undoing") && <Running view={view} />}
        {view.status === "uploading" && (
          <Card>
            <p className="text-sm">This import is waiting for its upload. If you closed the window during it, start it again from New brand.</p>
          </Card>
        )}
        {view.status === "processing" && <Processing view={view} />}
        {view.status === "failed" && (
          <Card className="border-destructive/40">
            <p className="text-destructive flex items-center gap-2 font-medium">
              <IconAlertTriangle className="size-4" /> {view.error ?? "It couldn't be read"}
            </p>
            {view.applied?.undoing ? (
              <div>
                <Button size="sm" onClick={() => void start("undo")}>
                  Carry on undoing
                </Button>
              </div>
            ) : (
              view.can.apply && (
                <div>
                  <Button size="sm" onClick={() => void start("apply")}>
                    Carry on applying
                  </Button>
                </div>
              )
            )}
          </Card>
        )}
        {(view.status === "applied" || view.status === "undone") && view.applied && <Done view={view} onRetry={() => void start("apply")} />}
        {view.status === "ready" && !view.plan && (
          <Card>
            <p className="font-medium">A plan waits for review</p>
            <p className="text-muted-foreground text-sm">Opening it, and the files it holds, takes Contributor on this project; applying it, Editor.</p>
          </Card>
        )}
        {view.status === "ready" && view.plan && (
          <PlanView
            view={view}
            plan={view.plan}
            url={`${url}/${id}`}
            edit={edit}
            onApply={() => void start("apply")}
            onReread={() => void reread()}
            onUseBook={(b, i) => void switchBook(b, i)}
          />
        )}
      </Shell>
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-6 pb-28 md:px-6">{children}</div>;
}

/** Where reading is: its stages, the current one with its count. */
function Processing({ view }: { view: View }) {
  const at = STAGES.findIndex(([k]) => k === view.stage);
  const p = view.progress;
  return (
    <Card>
      <ol className="grid gap-2.5 text-sm" aria-live="polite">
        {STAGES.map(([k, label], i) => (
          <li key={k} className={cn("flex items-center gap-2.5", i !== at && "text-muted-foreground")}>
            <span className={cn("size-2 shrink-0 rounded-full", i < at ? "bg-success" : i === at ? "bg-primary animate-pulse" : "bg-muted-foreground/30")} />
            {i === at && view.label ? view.label : label}
            {i === at && p && p.total > 0 && (
              <span className="text-muted-foreground ml-auto tabular-nums">
                {p.done.toLocaleString("en")} of {p.total.toLocaleString("en")}
              </span>
            )}
          </li>
        ))}
      </ol>
      {p && p.total > 0 && <Progress value={(100 * p.done) / p.total} />}
      {view.stats && (
        <p className="text-muted-foreground text-xs">
          {plural(view.stats.files, "file")} in the archive: {plural(view.stats.kept, "to look at", "to look at")},{" "}
          {plural(view.stats.duplicates + view.stats.variants, "duplicate or other format", "duplicates or other formats")} and{" "}
          {plural(view.stats.junk, "system file")} left out.
        </p>
      )}
    </Card>
  );
}

/** Apply or Undo under way, in the background: where it is, and how far. */
function Running({ view }: { view: View }) {
  const p = view.progress;
  return (
    <Card>
      <p className="font-medium">{view.status === "applying" ? "Applying the plan" : "Undoing the import"}</p>
      <p className="flex items-center gap-2.5 text-sm" aria-live="polite">
        <span className="bg-primary size-2 shrink-0 animate-pulse rounded-full" />
        {view.label ?? "Working"}
      </p>
      {p && p.total > 0 && (
        <div className="grid gap-1.5">
          <Progress value={(100 * Math.min(p.done, p.total)) / p.total} />
          <span className="text-muted-foreground text-xs tabular-nums">
            {Math.min(p.done, p.total).toLocaleString("en")} of {plural(p.total, "file")}
          </span>
        </div>
      )}
      <p className="text-muted-foreground text-xs">You can close this page: it carries on as you, and this page shows where it is when you come back.</p>
    </Card>
  );
}

/** What Apply made, with the way to each brand; what an undo kept, and why. */
function Done({ view, onRetry }: { view: View; onRetry: () => void }) {
  const a = view.applied!;
  const undone = view.status === "undone";
  const dropped = a.brands.flatMap((b) => b.dropped.map((d) => `${d.what}: ${d.why}`));
  return (
    <Card>
      <div className="flex items-start gap-3.5">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", undone ? "bg-muted text-muted-foreground" : "bg-success/15 text-success")}>
          {undone ? <IconArrowBackUp className="size-5" /> : <IconCheck className="size-5" />}
        </span>
        <div className="grid gap-1">
          <p className="font-display text-lg font-semibold tracking-tight">{undone ? "This import was undone" : "Your brand is in"}</p>
          <p className="text-muted-foreground text-sm">
            {undone
              ? "The files, collections and brands it added were removed (deleted files stay restorable for 30 days), and the brands it changed are back as they were."
              : `${plural(a.assets, "file")} added${a.left ? ` (${plural(a.left, "file")} the plan left out, in a collection of their own)` : ""}${a.deduped ? `, ${plural(a.deduped, "file")} already in the library left as they were` : ""}, ${plural(a.collections, "collection")} made. Guideline pages are drafts until you release them.`}
          </p>
          {!undone && (view.undoUntil || view.undoPast) && (
            <p className="text-muted-foreground text-xs">
              {view.undoPast
                ? "It was applied more than 30 days ago: it can no longer be undone."
                : `It can be undone as a whole until ${new Date(view.undoUntil!).toLocaleDateString(undefined, { month: "long", day: "numeric" })}.`}
            </p>
          )}
        </div>
      </div>
      {!undone && (
        <div className="flex flex-wrap gap-2">
          {a.brands
            .filter((b) => b.slug)
            .map((b) => (
              <Button key={b.slug} asChild size="sm" variant="outline">
                <Link href={`/brands/${b.slug}`}>
                  <IconPalette /> {b.name}
                  {b.created ? "" : " (updated)"}
                </Link>
              </Button>
            ))}
          <Button asChild size="sm" variant="outline">
            <Link href="/">
              <IconPhoto /> The library
            </Link>
          </Button>
        </div>
      )}
      {!undone && a.tagging && a.tagging.queued + a.tagging.over > 0 && (
        <p className="text-muted-foreground text-sm">
          {a.tagging.queued > 0 && (
            <>
              Intelligence is tagging {plural(a.tagging.queued, "file")} in the background: their tags and alt text wait for you in{" "}
              <Link href="/review" className="text-foreground underline">
                Review
              </Link>
              .{" "}
            </>
          )}
          {a.tagging.over > 0 && `${plural(a.tagging.over, "file")} past this month's tagging allowance ${a.tagging.over === 1 ? "isn't" : "aren't"} tagged.`}
        </p>
      )}
      {a.warnings.length > 0 && !undone && (
        <ul className="text-warning grid gap-1 text-sm">
          {a.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      {a.failed.length > 0 && !undone && (
        <details className="text-sm">
          <summary className="text-warning w-max cursor-pointer">{plural(a.failed.length, "file")} couldn&apos;t be added</summary>
          {view.can.apply && (
            <Button size="sm" variant="outline" className="mt-2" onClick={onRetry}>
              Try them again
            </Button>
          )}
          <ul className="text-muted-foreground mt-2 grid gap-1">
            {a.failed.map((f) => (
              <li key={f.path}>
                <span className="text-foreground">{f.path}</span>: {f.error}
              </li>
            ))}
          </ul>
        </details>
      )}
      {(dropped.length > 0 || (a.undo?.kept.length ?? 0) > 0) && (
        <details className="text-muted-foreground text-sm">
          <summary className="w-max cursor-pointer">{plural(dropped.length + (a.undo?.kept.length ?? 0), "thing")} left as it was</summary>
          <ul className="mt-2 grid list-disc gap-1 ps-5">
            {dropped.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
            {a.undo?.kept.map((k, i) => (
              <li key={`u${i}`}>
                {k.what}: {k.why}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

/** The plan: what goes in, brand by brand, then the collections, then what was left out; Apply at the foot. */
function PlanView({
  view,
  plan,
  url,
  edit,
  onApply,
  onReread,
  onUseBook,
}: {
  view: View;
  plan: Plan;
  url: string;
  edit: (...e: object[]) => Promise<void>;
  onApply: () => void;
  onReread: () => void;
  onUseBook: (brand: string, idx: number) => void;
}) {
  const brands = plan.brands.filter((b) => b.include);
  const making = brands.filter((b) => !b.target).length;
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            [plan.total, "File going in", "Files going in"],
            [brands.length, "Brand", "Brands"],
            [plan.collections.filter((c) => c.include && c.files > 0).length, "Collection", "Collections"],
            [plan.skipped.length, "File left out", "Files left out"],
          ] as const
        ).map(([n, one, many]) => (
          <div key={many} className="bg-muted grid gap-0.5 rounded-lg px-3.5 py-3">
            <b className="font-display text-2xl font-semibold tabular-nums">{n.toLocaleString("en")}</b>
            <span className="text-muted-foreground text-xs">{n === 1 ? one : many}</span>
          </div>
        ))}
      </div>

      {plan.room.left != null && plan.room.needed > plan.room.left && (
        <Card className="border-warning/40 bg-warning/5">
          <p className="flex items-center gap-2 font-medium">
            <IconAlertTriangle className="text-warning size-4" /> This plan makes {plural(plan.room.needed, "new brand")}; your plan has room for{" "}
            {plan.room.left === 0 ? "no more" : plan.room.left}
          </p>
          <p className="text-muted-foreground text-sm">
            Put some into a brand you have, mark the ones that are a category of another brand (&quot;Not a brand?&quot;), or leave some out. Otherwise the ones
            past the limit aren&apos;t made.
          </p>
        </Card>
      )}

      {plan.brands.map((b) => (
        <BrandCard key={b.id} brand={b} plan={plan} url={url} edit={edit} onReread={onReread} onUseBook={onUseBook} />
      ))}

      <Section title="Collections" hint="From the archive's folders. Every file in a collection left out stays out.">
        <ul className="divide-y rounded-xl border">
          {plan.collections.map((c) => (
            <CollectionRow
              key={c.id}
              c={c}
              brand={plan.brands.find((b) => b.id === c.brand)?.name ?? null}
              many={plan.brands.length > 1}
              url={url}
              edit={edit}
            />
          ))}
          {plan.collections.length === 0 && (
            <li className="text-muted-foreground px-4 py-3 text-sm">The archive has no folders: its files go into the library without a collection.</li>
          )}
        </ul>
      </Section>

      {plan.skipped.length > 0 && (
        <details className="group rounded-xl border">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium">
            <IconChevronDown className="size-4 transition-transform group-open:rotate-180" />
            {plural(plan.skipped.length, "file")} left out
            <span className="text-muted-foreground font-normal">duplicates, other formats of the same artwork, system files</span>
          </summary>
          <ul className="divide-y border-t text-sm">
            {plan.skipped.map((s) => (
              <li key={s.idx} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2">
                <span className="min-w-0 flex-1 truncate">{s.path}</span>
                <span className="text-muted-foreground text-xs">
                  {s.why}
                  {s.of ? `: ${s.of.split("/").pop()} is kept` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {plan.leftovers.files > 0 && (
        <label className="flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm">
          <Checkbox className="mt-0.5" checked={plan.leftovers.include} onCheckedChange={(v) => void edit({ type: "leftovers", include: v === true })} />
          <span className="grid gap-0.5">
            <span className="font-medium">Also import the {plural(plan.leftovers.files, "file")} left out of the plan</span>
            <span className="text-muted-foreground">
              Other formats of an artwork, files outside any brand and the ones you unticked, into a collection of their own. Each says where it came from and
              why it was left out.
            </span>
          </span>
        </label>
      )}

      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur md:left-[var(--sidebar-width,0px)]">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 px-4 py-3 md:px-6">
          <p className="text-muted-foreground min-w-0 flex-1 text-sm">
            {plural(plan.total, "file")} ({size(plan.bytes)}){making ? `, ${plural(making, "new brand")}` : ""}
            {brands.length - making ? `, added to ${plural(brands.length - making, "existing brand")}` : ""}.{" "}
            {view.expires && (
              <span>
                The plan is kept until{" "}
                {new Date(view.expires).toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                })}
                .
              </span>
            )}
          </p>
          {view.waiting ? (
            <span className="text-muted-foreground text-sm font-medium">Waiting for an Editor to apply it</span>
          ) : (
            <Button onClick={onApply} disabled={plan.total === 0 && brands.length === 0}>
              <IconSparkles /> Apply the plan
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2.5">
      <header className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <span className="text-muted-foreground text-sm">{hint}</span>}
      </header>
      {children}
    </section>
  );
}

/** A brand of the plan: its name, where it goes, its logo, its guidelines' source, its rules and pages. */
function BrandCard({
  brand: b,
  plan,
  url,
  edit,
  onReread,
  onUseBook,
}: {
  brand: Brand;
  plan: Plan;
  url: string;
  edit: (...e: object[]) => Promise<void>;
  onReread: () => void;
  onUseBook: (brand: string, idx: number) => void;
}) {
  const others = plan.brands.filter((x) => x.id !== b.id);
  // Its folders: one of them can be a brand of its own, taken for part of this one.
  const folders = plan.collections.filter((c) => c.brand === b.id && c.files > 0);
  const colors = b.rules.filter((r) => r.type === "color");
  const fonts = b.rules.filter((r) => r.type === "font");
  const rest = b.rules.filter((r) => r.type !== "color" && r.type !== "font");
  const diffs = b.rules.filter((r) => r.diff).length;
  return (
    <section className={cn("bg-card grid gap-4 rounded-xl border p-4 sm:p-5", !b.include && "opacity-60")}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="bg-muted grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border">
          {b.logo?.preview ? (
            // A thumbnail from the importer, before the file is an asset: no rendition to ask for yet.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${url}/files/${b.logo.idx}/preview`}
              alt={b.logo.description || `${b.name} logo`}
              className="max-h-full max-w-full object-contain p-1.5"
            />
          ) : (
            <IconPalette className="text-muted-foreground size-6" />
          )}
        </div>
        <div className="grid min-w-0 flex-1 gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              key={b.name}
              aria-label="Brand name"
              defaultValue={b.name}
              maxLength={80}
              className="font-display h-9 max-w-xs text-base font-semibold"
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && name !== b.name) void edit({ type: "brand", id: b.id, name });
              }}
            />
            <Select
              value={b.target ?? "__new"}
              onValueChange={(v) =>
                void edit({
                  type: "brand",
                  id: b.id,
                  target: v === "__new" ? null : v,
                })
              }
            >
              <SelectTrigger size="sm" className="w-auto min-w-44" aria-label="Where it goes">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__new">A new brand</SelectItem>
                {plan.existing.map((x) => (
                  <SelectItem key={x.slug} value={x.slug}>
                    Into {x.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="text-muted-foreground ml-auto flex items-center gap-2 text-sm">
              <Checkbox checked={b.include} onCheckedChange={(v) => void edit({ type: "brand", id: b.id, include: v === true })} />
              Import this brand
            </label>
          </div>
          <p className="text-muted-foreground text-sm">
            {b.book && !b.book.error ? (
              <>
                Guidelines read from <span className="text-foreground">{b.book.path.split("/").pop()}</span>
                {b.book.modified && <> ({month(b.book.modified)})</>}
                {b.inferred.length > 0 && <>; its {b.inferred.join(" and ")} proposed from your files</>}.
              </>
            ) : b.inferred.length ? (
              <>
                {b.book ? "Its brand book couldn't be read" : "No brand book in the archive"}: its {b.inferred.join(" and ")} are proposed from your files.
                Check them.
              </>
            ) : b.book ? (
              <>Its brand book couldn&apos;t be read, and there&apos;s nothing in the files to infer guidelines from.</>
            ) : (
              <>No brand book, and nothing to infer guidelines from: the brand is made with its name{b.logo ? " and logo" : ""}.</>
            )}{" "}
            {plural(b.files, "file")}.
            {diffs > 0 && (
              <span className="text-warning">
                {" "}
                {plural(diffs, "rule")} {diffs === 1 ? "differs" : "differ"} from {plan.existing.find((x) => x.slug === b.target)?.name}
                &apos;s.
              </span>
            )}
          </p>
          {b.book?.error && (
            <div className="border-warning/40 bg-warning/5 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm">
              <IconAlertTriangle className="text-warning size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="text-foreground">{b.book.path.split("/").pop()}</span>: {b.book.error}
              </span>
              <Button size="xs" variant="outline" onClick={onReread}>
                Read it again
              </Button>
            </div>
          )}
          {(others.length > 0 || b.books.length > 0 || folders.length > 1) && (
            <div className="flex flex-wrap gap-1">
              {b.books.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="xs" variant="ghost" className="text-muted-foreground">
                      Use another guideline <IconChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-w-sm">
                    {b.books.map((x) => (
                      <DropdownMenuItem key={x.idx} onSelect={() => onUseBook(b.id, x.idx)} className="grid gap-0.5">
                        <span className="truncate">{x.name}</span>
                        <span className={cn("text-xs", x.error ? "text-warning" : "text-muted-foreground")}>
                          {x.error
                            ? `Couldn't be read: ${x.error}`
                            : [x.modified && month(x.modified), size(x.size), x.read ? "read already" : "not read yet"].filter(Boolean).join(" · ")}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {folders.length > 1 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="xs" variant="ghost" className="text-muted-foreground">
                      Two brands in one? <IconChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
                    {folders.map((c) => (
                      <DropdownMenuItem key={c.id} onSelect={() => void edit({ type: "split", collection: c.id })}>
                        Make {c.name} a brand of its own
                        <span className="text-muted-foreground ml-auto pl-3 text-xs tabular-nums">{plural(c.files, "file")}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {others.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="xs" variant="ghost" className="text-muted-foreground">
                      Not a brand? <IconChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {others.map((o) => (
                      <DropdownMenuItem key={`c-${o.id}`} onSelect={() => void edit({ type: "demote", id: b.id, into: o.id })}>
                        It&apos;s a category of {o.name}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    {others.map((o) => (
                      <DropdownMenuItem key={`m-${o.id}`} onSelect={() => void edit({ type: "merge", from: b.id, into: o.id })}>
                        Same brand as {o.name}: merge
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </div>
      </div>

      {b.include && b.logos.length > 0 && <LogoFiles brand={b} url={url} edit={edit} />}

      {b.include && (colors.length > 0 || fonts.length > 0 || rest.length > 0) && (
        <div className="grid gap-4">
          {colors.length > 0 && (
            <RuleGroup title="Colors">
              <div className="grid gap-2 sm:grid-cols-2">
                {colors.map((r) => (
                  <RuleRow
                    key={`${r.key}|${r.context ?? ""}`}
                    brand={b.id}
                    r={r}
                    edit={edit}
                    lead={<span className="size-8 shrink-0 rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/12%)]" style={{ background: String(r.value) }} />}
                  />
                ))}
              </div>
            </RuleGroup>
          )}
          {fonts.length > 0 && (
            <RuleGroup title="Typography">
              <div className="grid gap-2 sm:grid-cols-2">
                {fonts.map((r) => (
                  <RuleRow
                    key={`${r.key}|${r.context ?? ""}`}
                    brand={b.id}
                    r={r}
                    edit={edit}
                    lead={<span className="bg-muted font-display grid size-8 shrink-0 place-items-center rounded-md text-xs font-semibold">Aa</span>}
                  />
                ))}
              </div>
            </RuleGroup>
          )}
          {rest.length > 0 && (
            <details className="group">
              <summary className="text-muted-foreground flex w-max cursor-pointer items-center gap-1.5 text-sm">
                <IconChevronDown className="size-4 transition-transform group-open:rotate-180" />
                {plural(rest.length, "more rule")}: logo, voice, imagery and others
              </summary>
              <div className="mt-2 grid gap-2">
                {rest.map((r) => (
                  <RuleRow key={`${r.key}|${r.context ?? ""}`} brand={b.id} r={r} edit={edit} />
                ))}
              </div>
            </details>
          )}
          {b.pages.length > 0 && (
            <RuleGroup title="Guideline pages" hint="Made as drafts">
              <div className="flex flex-wrap gap-2">
                {b.pages.map((pg) => (
                  <label
                    key={pg.slug}
                    className={cn("flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm", !pg.include && "text-muted-foreground")}
                  >
                    <Checkbox
                      checked={pg.include}
                      disabled={pg.slug === "overview"}
                      onCheckedChange={(v) =>
                        void edit({
                          type: "page",
                          brand: b.id,
                          slug: pg.slug,
                          include: v === true,
                        })
                      }
                    />
                    {pg.title}
                  </label>
                ))}
              </div>
            </RuleGroup>
          )}
        </div>
      )}
    </section>
  );
}

/** Each version of the logo with its file, and the brand's other logo files to pick from instead. */
function LogoFiles({ brand: b, url, edit }: { brand: Brand; url: string; edit: (...e: object[]) => Promise<void> }) {
  const [choices, setChoices] = useState<FileView[] | null>(null);
  const load = useCallback(async () => {
    if (choices) return;
    const res = await fetch(`${url}/files?brand=${encodeURIComponent(b.id)}&kind=logo&limit=200`);
    if (res.ok) setChoices(((await res.json()) as { data: FileView[] }).data);
  }, [url, b.id, choices]);
  const thumb = (f: FileView | null) => (
    <span className="bg-muted grid size-12 shrink-0 place-items-center overflow-hidden rounded-md border">
      {f?.preview ? (
        // A thumbnail from the importer, before the file is an asset.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`${url}/files/${f.idx}/preview`} alt={f.description || f.name} className="max-h-full max-w-full object-contain p-1" />
      ) : (
        <IconPalette className="text-muted-foreground size-5" />
      )}
    </span>
  );
  return (
    <RuleGroup title="Logo files" hint="Each version of the logo, with its file">
      <div className="grid gap-2 xl:grid-cols-2">
        {b.logos.map((e) => (
          <div key={`${e.key}|${e.context ?? ""}`} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
            {thumb(e.file)}
            <div className="grid min-w-0 flex-1 gap-0.5">
              <strong className="truncate text-sm font-medium">{e.label}</strong>
              <span className="text-muted-foreground truncate text-xs">
                {e.file
                  ? `${e.file.name}${e.by === "person" ? "" : e.by === "model" ? ", matched by Intelligence" : ", matched by its name"}`
                  : e.cut && b.book && !b.book.error
                    ? `Cut from the brand book, page ${e.cut.page}`
                    : "No file: add one after, on its rule"}
              </span>
            </div>
            <Select
              value={e.idx != null ? String(e.idx) : "none"}
              onOpenChange={(open) => open && void load()}
              onValueChange={(v) =>
                void edit({
                  type: "logo",
                  brand: b.id,
                  key: e.key,
                  context: e.context,
                  idx: v === "none" ? null : Number(v),
                })
              }
            >
              <SelectTrigger size="sm" className="w-44 shrink-0" aria-label={`File for ${e.label}`}>
                <SelectValue placeholder="Pick" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{e.cut ? "Cut from the book" : "No file"}</SelectItem>
                {e.file && !choices?.some((c) => c.idx === e.file!.idx) && <SelectItem value={String(e.file.idx)}>{e.file.name}</SelectItem>}
                {(choices ?? []).map((c) => (
                  <SelectItem key={c.idx} value={String(c.idx)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </RuleGroup>
  );
}

function RuleGroup({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {title}
        {hint && <span className="ms-2 tracking-normal normal-case">{hint}</span>}
      </h3>
      {children}
    </div>
  );
}

/** A rule's key as words, for one the book gave no name: "type.heading" -> "Heading", "logo.clearSpace" -> "Logo clear space". */
const label = (key: string) => {
  const [group, ...rest] = key.split(".");
  const words = (rest.length ? (group === "type" || group === "color" ? rest : [group, ...rest]) : [group])
    .join(" ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const shown = (r: { type: string; value: unknown; spec?: { unit?: string } }, v: unknown = r.value): string => {
  if (r.type === "color") return String(v).toUpperCase();
  if (r.type === "font") return typeof v === "string" ? v : [(v as { family?: string }).family, (v as { weight?: number }).weight].filter(Boolean).join(" ");
  if (r.type === "list") return (Array.isArray(v) ? v : [v]).join(" · ");
  if (r.type === "number") return `${v}${r.spec?.unit ?? ""}`;
  return String(v ?? "");
};

/** One proposed rule: its value, where it came from, and against an existing brand, what it would change. */
function RuleRow({ brand, r, edit, lead }: { brand: string; r: Rule; edit: (...e: object[]) => Promise<void>; lead?: React.ReactNode }) {
  const name = r.label || label(r.key);
  const s = r.source;
  const source =
    s.kind === "stated" ? (
      <Badge variant="secondary" title={s.path ?? undefined}>
        Brand book{s.page ? ` p.${s.page}` : ""}
      </Badge>
    ) : (
      <Badge variant="warning" title={s.paths.length ? `From ${s.paths.join(", ")}` : undefined}>
        Inferred
      </Badge>
    );
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border px-3 py-2.5", (!r.include || r.unchanged) && "bg-muted/40")}>
      {!r.unchanged && !r.diff && (
        <Checkbox
          className="mt-1"
          aria-label={`Include ${name}`}
          checked={r.include}
          onCheckedChange={(v) =>
            void edit({
              type: "rule",
              brand,
              key: r.key,
              context: r.context ?? null,
              include: v === true,
            })
          }
        />
      )}
      {lead}
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <strong className={cn("font-medium", !r.include && !r.unchanged && "text-muted-foreground line-through")}>{name}</strong>
          {r.context && <span className="text-muted-foreground text-xs">{r.context}</span>}
          {source}
        </div>
        <span className="text-muted-foreground line-clamp-2 font-mono text-xs break-words">{shown(r)}</span>
        {r.unchanged && <span className="text-muted-foreground text-xs">Already the brand&apos;s: nothing changes.</span>}
        {r.diff && (
          <label className="flex flex-wrap items-center gap-2 text-xs">
            <Checkbox
              checked={r.diff.take}
              onCheckedChange={(v) =>
                void edit({
                  type: "rule",
                  brand,
                  key: r.key,
                  context: r.context ?? null,
                  take: v === true,
                })
              }
            />
            <span>
              Replace the brand&apos;s current <code className="font-mono">{shown(r, r.diff.current)}</code>
            </span>
            {r.type === "color" && (
              <span className="size-3.5 rounded-sm shadow-[inset_0_0_0_1px_rgb(0_0_0/12%)]" style={{ background: String(r.diff.current) }} />
            )}
          </label>
        )}
      </div>
    </div>
  );
}

/** A collection of the plan: its name, in or out, and its files on demand. */
function CollectionRow({
  c,
  brand,
  many,
  url,
  edit,
}: {
  c: Collection;
  brand: string | null;
  many: boolean;
  url: string;
  edit: (...e: object[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<FileView[] | null>(null);
  const [total, setTotal] = useState(0);
  const loadFiles = useCallback(async () => {
    const res = await fetch(`${url}/files?collection=${encodeURIComponent(c.id)}&limit=200`);
    if (!res.ok) return;
    const body = (await res.json()) as { data: FileView[]; total: number };
    setFiles(body.data);
    setTotal(body.total);
  }, [url, c.id]);
  async function toggle(f: FileView) {
    await edit({ type: "files", idxs: [f.idx], include: !f.include });
    await loadFiles();
  }
  return (
    <li className={cn(!c.include && "bg-muted/40")}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
        <Checkbox
          aria-label={`Include ${c.name}`}
          checked={c.include}
          onCheckedChange={(v) => void edit({ type: "collection", id: c.id, include: v === true })}
        />
        <IconFolder className="text-muted-foreground size-4 shrink-0" />
        <Input
          key={c.name}
          aria-label="Collection name"
          defaultValue={c.name}
          maxLength={120}
          className="h-8 max-w-60"
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== c.name) void edit({ type: "collection", id: c.id, name });
          }}
        />
        {many && brand && <span className="text-muted-foreground text-xs">{brand}</span>}
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground ml-auto flex items-center gap-1 text-sm"
          onClick={() => {
            if (!open) void loadFiles();
            setOpen(!open);
          }}
        >
          {plural(c.files, "file")}
          <IconChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && (
        <div className="border-t px-4 py-3">
          {!files ? (
            <div className="bg-muted h-24 animate-pulse rounded-lg" />
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                {files.map((f) => (
                  <li key={f.idx} className={cn("grid gap-1.5 rounded-lg border p-2", !f.include && "opacity-50")}>
                    <div className="bg-muted relative grid aspect-[4/3] place-items-center overflow-hidden rounded-md">
                      {f.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`${url}/files/${f.idx}/preview`}
                          alt={f.description || f.name}
                          loading="lazy"
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <span className="text-muted-foreground font-mono text-xs uppercase">{f.ext}</span>
                      )}
                      <span className="absolute top-1.5 left-1.5">
                        <Checkbox aria-label={`Include ${f.name}`} checked={f.include} onCheckedChange={() => void toggle(f)} className="bg-background" />
                      </span>
                    </div>
                    <span className="truncate text-xs font-medium" title={f.path}>
                      {f.name}
                    </span>
                    <span className="text-muted-foreground flex flex-wrap items-center gap-1 text-[0.6875rem]">
                      {f.kind}
                      {f.sure === false && (
                        <span className="text-warning" title="The model wasn't sure">
                          · check
                        </span>
                      )}
                      {f.tags.length > 0 && <span className="truncate">· {f.tags.slice(0, 3).join(", ")}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              {total > files.length && (
                <p className="text-muted-foreground mt-2 text-xs">
                  The first {files.length} of {total.toLocaleString("en")} shown.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

function DiscardButton({ onDiscard }: { onDiscard: () => Promise<boolean> }) {
  return (
    <Confirm
      title="Discard this import?"
      says="The plan and the uploaded archive are deleted. Nothing was added to the library, so nothing there changes."
      action="Discard"
      run={onDiscard}
    >
      <Button size="sm" variant="ghost">
        <IconTrash /> Discard
      </Button>
    </Confirm>
  );
}

function UndoButton({ onUndo }: { onUndo: () => Promise<boolean> }) {
  return (
    <Confirm
      title="Undo this import?"
      says="The files it added are deleted (restorable for 30 days), its collections and the brands it made are removed, and brands it added to get their rules back as they were. Files that were already in your library stay."
      action="Undo import"
      run={onUndo}
    >
      <Button size="sm" variant="outline">
        <IconArrowBackUp /> Undo import
      </Button>
    </Confirm>
  );
}
