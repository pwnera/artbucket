"use client";

import { useEffect, useState } from "react";
import {
  IconArrowLeft,
  IconArrowRight,
  IconArrowsSort,
  IconFlag,
  IconHistory,
  IconRestore,
  IconSparkles,
} from "@tabler/icons-react";
import { Can, useCan } from "@/components/can";
import { toast } from "sonner";
import { send } from "@/components/collections";
import { Thumb } from "@/components/gallery";
import { renditionLabel } from "@/components/rendition-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Editable } from "@/components/brand-values";
import type { FieldChange, RuleChange, SnapRule, VersionKind } from "@/lib/history";
import { day } from "@/lib/time";
import { contextLabel, fontLabel, ruleLabel, type FontValue, type RuleAsset, type RuleValue } from "@/lib/rules";
import { cn } from "@/lib/utils";

type Meta = {
  number: number;
  kind: VersionKind;
  name: string | null;
  actor: string;
  summary: string;
  restoredFrom: number | null;
  rules: number;
  createdAt: string;
  updatedAt: string;
};
type Detail = Omit<Meta, "rules"> & { rules: SnapRule[]; against: number | "current" | null; diff: RuleChange[] };

const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const stamp = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });


/**
 * A brand's version history, like a doc's: every change is kept, grouped by
 * day; open a version to see what changed, name it, or put it back.
 * Everything here is /api/v1/brands/{slug}/versions.
 */
export function History({
  brand,
  open,
  onOpenChange,
  edits,
  onRestored,
}: {
  brand: { slug: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bumped on every edit, so an open history keeps up. */
  edits: number;
  onRestored: () => void;
}) {
  const [versions, setVersions] = useState<Meta[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!open) return;
    let live = true;
    fetch(`/api/v1/brands/${brand.slug}/versions`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => live && setVersions(j.data));
    return () => {
      live = false;
    };
  }, [open, brand.slug, edits, tick]);

  const latest = versions?.[0]?.number;
  const days = new Map<string, Meta[]>();
  for (const v of versions ?? []) days.set(day(v.updatedAt), [...(days.get(day(v.updatedAt)) ?? []), v]);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setSelected(null);
      }}
    >
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <IconHistory className="size-5" /> Version history
          </SheetTitle>
          <SheetDescription>
            {brand.name}. Every change is kept; edits close together are one version. Name a version to keep it as a
            checkpoint.
          </SheetDescription>
        </SheetHeader>

        {selected !== null ? (
          <VersionDetail
            key={`${selected}-${tick}`}
            brand={brand.slug}
            number={selected}
            current={selected === latest}
            onBack={() => setSelected(null)}
            onChanged={() => setTick((t) => t + 1)}
            onRestored={(n) => {
              onRestored();
              setTick((t) => t + 1);
              setSelected(n);
            }}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {!versions &&
              [0, 1, 2, 3].map((i) => <Skeleton key={i} className="m-2 h-14" />)}
            {versions?.length === 0 && (
              <p className="text-muted-foreground p-6 text-center text-sm">
                No changes yet. The first edit starts the history, with the rules as they are now kept as version 1.
              </p>
            )}
            {[...days].map(([label, vs]) => (
              <section key={label} className="mb-2">
                <h3 className="text-muted-foreground px-3 pt-3 pb-1 text-xs font-medium">{label}</h3>
                <ol>
                  {vs.map((v) => (
                    <li key={v.number}>
                      <button
                        type="button"
                        onClick={() => setSelected(v.number)}
                        className="hover:bg-muted focus-visible:bg-muted flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left outline-none"
                      >
                        <KindIcon kind={v.kind} named={!!v.name} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className={cn("truncate text-sm", v.name ? "font-semibold" : "font-medium")}>
                              {v.name ?? v.summary}
                            </span>
                            {v.number === latest && <Badge variant="secondary">Current</Badge>}
                          </div>
                          <div className="text-muted-foreground truncate text-xs">
                            {time(v.updatedAt)} · {v.actor}
                            {v.name && ` · ${v.summary}`}
                          </div>
                        </div>
                        <span className="text-muted-foreground pt-0.5 font-mono text-xs tabular-nums">v{v.number}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function KindIcon({ kind, named }: { kind: VersionKind; named: boolean }) {
  const I = named ? IconFlag : kind === "restore" ? IconRestore : kind === "baseline" ? IconSparkles : null;
  return (
    <span
      className={cn(
        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
        named ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {I ? <I className="size-3" /> : <span className="bg-muted-foreground/60 size-1.5 rounded-full" />}
    </span>
  );
}

/** One version: when, who, its name, the changes, and the way back to it. */
function VersionDetail({
  brand,
  number,
  current,
  onBack,
  onChanged,
  onRestored,
}: {
  brand: string;
  number: number;
  current: boolean;
  onBack: () => void;
  onChanged: () => void;
  onRestored: (version: number) => void;
}) {
  const [mode, setMode] = useState<"made" | "now">("made");
  const [v, setV] = useState<Detail | null>(null);
  const can = useCan();

  useEffect(() => {
    let live = true;
    fetch(`/api/v1/brands/${brand}/versions/${number}${mode === "now" ? "?against=current" : ""}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && setV(j?.data ?? null));
    return () => {
      live = false;
    };
  }, [brand, number, mode]);

  async function restore() {
    const r = await send("POST", `/api/v1/brands/${brand}/versions/${number}/restore`);
    if (!r) return;
    toast.success(
      `Restored version ${number}. What you had is kept as the version before it.` +
        (r.droppedAssets ? ` ${r.droppedAssets} deleted asset${r.droppedAssets > 1 ? "s were" : " was"} left out.` : ""),
    );
    onRestored(r.version);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b p-4">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
          <IconArrowLeft /> All versions
        </Button>
        {v ? (
          <>
            <div className="space-y-1">
              <Can do="brand.edit" otherwise={<p className="text-lg font-semibold">{v.name || `Version ${number}`}</p>}>
                <Editable
                  value={v.name ?? ""}
                  placeholder={`Name version ${number}`}
                  label={`Name version ${number}`}
                  className="text-lg font-semibold"
                  onSave={async (name) => {
                    if (await send("PATCH", `/api/v1/brands/${brand}/versions/${number}`, { name: name || null })) onChanged();
                  }}
                />
              </Can>
              <p className="text-muted-foreground text-sm">
                v{number} · {stamp(v.updatedAt)} · {v.actor} · {v.rules.length} rules
                {v.kind === "restore" && v.restoredFrom && ` · restored version ${v.restoredFrom}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={mode}
                onValueChange={(m) => m && setMode(m as "made" | "now")}
              >
                <ToggleGroupItem value="made">What changed</ToggleGroupItem>
                <ToggleGroupItem value="now" disabled={current}>
                  Compared with now
                </ToggleGroupItem>
              </ToggleGroup>
              {!current && can("brand.edit") && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" className="ml-auto">
                      <IconRestore /> Restore this version
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Restore version {number}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        The brand&apos;s rules go back to how they were in this version. Nothing is lost: the rules you
                        have now stay in the history, and you can restore them the same way.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={restore}>Restore</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </>
        ) : (
          <Skeleton className="h-16" />
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {v && (
          <p className="text-muted-foreground text-sm">
            {mode === "now"
              ? "What restoring would undo: how the rules changed from this version to now."
              : v.kind === "baseline"
                ? "Where this brand's history starts: every rule it had."
                : v.against
                  ? `How version ${v.against} became this one.`
                  : "Everything in this version."}
          </p>
        )}
        {v && !v.diff.length && <p className="text-sm">No differences.</p>}
        {v?.diff.map((c) => <Change key={`${c.change}-${c.key}-${c.context}`} change={c} />)}
      </div>
    </div>
  );
}

const CHANGE_STYLE: Record<RuleChange["change"], string> = {
  added: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  removed: "bg-red-500/15 text-red-700 dark:text-red-400",
  changed: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  moved: "bg-muted text-muted-foreground",
};

function Change({ change: c }: { change: RuleChange }) {
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex items-center gap-2">
        <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase", CHANGE_STYLE[c.change])}>
          {c.change}
        </span>
        <span className="truncate text-sm font-medium">{ruleLabel(c.key)}</span>
        {c.context && (
          <Badge variant="secondary" title={c.context}>
            {contextLabel(c.context)}
          </Badge>
        )}
        <code className="text-muted-foreground ml-auto truncate font-mono text-xs">{c.key}</code>
      </div>
      {c.change === "added" && <Value rule={c.after} />}
      {c.change === "removed" && (
        <div className="opacity-60">
          <Value rule={c.before} />
        </div>
      )}
      {c.change === "moved" && (
        <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <IconArrowsSort className="size-4" /> Moved within its section
        </p>
      )}
      {c.change === "changed" && (
        <div className="space-y-3">
          {c.fields.map((f) => (
            <Field key={f.field} f={f} />
          ))}
          {c.moved && (
            <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <IconArrowsSort className="size-4" /> and moved within its section
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const text = (v: unknown) =>
  v === null || v === ""
    ? "nothing"
    : Array.isArray(v)
      ? v.join(", ")
      : typeof v === "object"
        ? fontLabel(v as FontValue)
        : String(v);
const FIELD: Record<FieldChange["field"], string> = { value: "Value", usage: "Note", assets: "Assets", type: "Kind" };

/** One field, before and after, drawn the way the page draws it. */
function Field({ f }: { f: FieldChange }) {
  const body = (() => {
    const isColor = (v: unknown) => typeof v === "string" && /^#[0-9a-f]{6}/i.test(v);
    if (f.field === "value" && isColor(f.before) && isColor(f.after)) {
      return (
        <div className="flex items-center gap-3">
          <Swatch hex={f.before as string} />
          <IconArrowRight className="text-muted-foreground size-4" />
          <Swatch hex={f.after as string} />
        </div>
      );
    }
    if (f.field === "value" && Array.isArray(f.before) && Array.isArray(f.after)) {
      const [was, is] = [f.before.map(String), f.after.map(String)];
      return (
        <ul className="space-y-0.5 text-sm">
          {is.map((x, i) => (
            <li key={`is-${i}`} className={cn(!was.includes(x) && "text-emerald-700 dark:text-emerald-400")}>
              {was.includes(x) ? "  " : "+ "}
              {x}
            </li>
          ))}
          {was
            .filter((x) => !is.includes(x))
            .map((x, i) => (
              <li key={`was-${i}`} className="text-red-700 line-through dark:text-red-400">
                − {x}
              </li>
            ))}
        </ul>
      );
    }
    if (f.field === "assets") {
      return (
        <div className="flex items-center gap-3">
          <Assets list={f.before as RuleAsset[]} dim />
          <IconArrowRight className="text-muted-foreground size-4 shrink-0" />
          <Assets list={f.after as RuleAsset[]} />
        </div>
      );
    }
    return (
      <div className="space-y-1 text-sm">
        <p className="text-red-700 line-through dark:text-red-400">{text(f.before)}</p>
        <p className="text-emerald-700 dark:text-emerald-400">{text(f.after)}</p>
      </div>
    );
  })();
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-medium">{FIELD[f.field]}</p>
      {body}
    </div>
  );
}

function Swatch({ hex }: { hex: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="size-8 rounded-md ring-1 ring-black/10 dark:ring-white/10" style={{ backgroundColor: hex }} />
      <code className="font-mono text-xs">{hex}</code>
    </span>
  );
}

function Assets({ list, dim }: { list: RuleAsset[]; dim?: boolean }) {
  if (!list.length) return <span className="text-muted-foreground text-sm">none</span>;
  return (
    <div className={cn("flex flex-wrap gap-2", dim && "opacity-50")}>
      {list.map((a) => (
        <div key={a.id} className="grid w-14 gap-0.5">
          <div className="bg-checker relative size-14 overflow-hidden rounded-md border">
            <Thumb src={`/a/${a.id}/w_56,f_webp`} alt="" className="p-1" />
          </div>
          <span className="text-muted-foreground truncate text-center text-[11px]">{renditionLabel(a.rendition)}</span>
        </div>
      ))}
    </div>
  );
}

/** A rule's value in brief, for an added or removed rule. */
function Value({ rule: r }: { rule: SnapRule }) {
  const v: RuleValue = r.value;
  return (
    <div className="space-y-2 text-sm">
      {r.type === "color" ? <Swatch hex={v as string} /> : <p>{text(v)}</p>}
      {r.usage && <p className="text-muted-foreground">{r.usage}</p>}
      {r.assets.length > 0 && <Assets list={r.assets} />}
    </div>
  );
}
