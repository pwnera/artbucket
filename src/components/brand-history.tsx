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
  IconWorldUpload,
} from "@tabler/icons-react";
import type { Me } from "@/components/account";
import { Can, useCan, useMe } from "@/components/can";
import { send } from "@/components/collections";
import { Confirm } from "@/components/confirm";
import { Thumb } from "@/components/gallery";
import { InfoTip } from "@/components/info-tip";
import { FileThumb } from "@/components/thumb";
import { renditionLabel } from "@/components/rendition-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Editable } from "@/components/brand-values";
import type { ThemeSettings } from "@/lib/brand-theme";
import type { FieldChange, RuleChange, SnapRule, VersionKind } from "@/lib/history";
import type { SnapPage } from "@/lib/pages";
import { day } from "@/lib/time";
import { undoable } from "@/lib/undo";
import { contextLabel, fontLabel, ruleLabel, ruleName, section, type FontValue, type RuleAsset, type RuleValue } from "@/lib/rules";
import { cn } from "@/lib/utils";
import { RetryLine } from "@/components/retry-line";

type Meta = {
  number: number;
  kind: VersionKind;
  name: string | null;
  actor: string;
  summary: string;
  restoredFrom: number | null;
  /** Rule keys, "page:{slug}" and "theme". */
  changed: string[];
  rules: number;
  /** Null for a version from before pages. */
  pages: number | null;
  publishedAt: string | null;
  publishedBy: string | null;
  note: string | null;
  noteImage: string | null;
  createdAt: string;
  updatedAt: string;
};
type Mode = "made" | "now";
type Detail = Omit<Meta, "rules" | "pages"> & {
  rules: SnapRule[];
  pages: SnapPage[] | null;
  /** Null for a version from before themes. */
  theme: ThemeSettings | null;
  against: number | "current" | null;
  diff: RuleChange[];
  /** "page:{slug}" for each page that differs. */
  pageDiff: string[];
  /** Against "current": whether a restore would change the theme. */
  themeChanged: boolean;
};

const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const stamp = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Who made a version, in words: the baseline artbucket recorded, an edit
 * with no one signed in, you, or the person or key by name.
 */
export const who = (actor: string, me: Me | null) =>
  actor === "artbucket" ? "Start of history" : actor === "web" ? "Someone on the web" : me?.user && actor === me.actor ? "You" : actor;

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
  const [failed, setFailed] = useState(false);
  const me = useMe();

  useEffect(() => {
    if (!open) return;
    let live = true;
    fetch(`/api/v1/brands/${brand.slug}/versions`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => live && setVersions(j.data))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [open, brand.slug, edits, tick]);

  const latest = versions?.[0]?.number;
  // What readers see now: the newest version published.
  const live = versions?.find((v) => v.publishedAt)?.number;
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
          <SheetDescription className="flex items-center gap-1.5">
            {brand.name}
            <InfoTip>Every change is kept; edits close together are one version. Name a version to keep it as a checkpoint.</InfoTip>
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
            // Undo can land after the sheet moved on or closed: refresh, don't navigate.
            onUndone={() => {
              onRestored();
              setTick((t) => t + 1);
            }}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {failed && !versions && (
              <div className="p-4">
                <RetryLine what="the history" retry={() => (setFailed(false), setTick((t) => t + 1))} />
              </div>
            )}
            {!versions && !failed &&
              [0, 1, 2, 3].map((i) => <Skeleton key={i} className="m-2 h-14" />)}
            {versions?.length === 0 && (
              <p className="text-muted-foreground p-6 text-center text-sm">
                No changes yet: the first edit starts the history.
              </p>
            )}
            {[...days].map(([label, vs]) => (
              <section key={label} className="mb-2">
                <h3 className="text-muted-foreground px-3 pt-3 pb-1 text-xs font-medium">{label}</h3>
                <ol>
                  {vs.map((v) => (
                    // The line down to the next dot, so a day reads as a timeline.
                    <li
                      key={v.number}
                      className="relative before:absolute before:top-7 before:-bottom-3 before:start-[1.375rem] before:w-px before:bg-border last:before:hidden"
                    >
                      <button
                        type="button"
                        onClick={() => setSelected(v.number)}
                        className="hover:bg-muted focus-visible:bg-muted flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-start outline-none"
                      >
                        <KindIcon kind={v.kind} named={!!v.name} published={!!v.publishedAt} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className={cn("truncate text-sm", v.name ? "font-semibold" : "font-medium")}>
                              {v.name ?? v.summary}
                            </span>
                            {v.number === latest && <Badge variant="secondary">Current</Badge>}
                            {v.publishedAt && (
                              <Badge variant={v.number === live ? "success" : "outline"}>{v.number === live ? "Live" : "Released"}</Badge>
                            )}
                          </div>
                          <div className="text-muted-foreground truncate text-xs">
                            {time(v.updatedAt)} · {who(v.actor, me)}
                            {v.name && ` · ${v.summary}`}
                          </div>
                        </div>
                        {/* A released version is a release, @n; a save is v{n}. */}
                        <span className="text-muted-foreground pt-0.5 font-mono text-xs tabular-nums">{v.publishedAt ? `@${v.number}` : `v${v.number}`}</span>
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

/** A version's dot on the timeline: a publish, a named checkpoint, a restore, the start. */
function KindIcon({ kind, named, published }: { kind: VersionKind; named: boolean; published: boolean }) {
  const I = published ? IconWorldUpload : named ? IconFlag : kind === "restore" ? IconRestore : kind === "baseline" ? IconSparkles : null;
  return (
    <span
      className={cn(
        // Positioned, so it sits over the timeline's line.
        "relative mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
        published ? "bg-success text-background" : named ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
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
  onUndone,
}: {
  brand: string;
  number: number;
  current: boolean;
  onBack: () => void;
  onChanged: () => void;
  onRestored: (version: number) => void;
  onUndone: () => void;
}) {
  const [mode, setMode] = useState<Mode>("made");
  // The diff is kept with the mode it was fetched for: switching dims the old one until the new one lands.
  const [got, setGot] = useState<{ mode: Mode; v: Detail | null } | null>(null);
  const v = got?.v ?? null;
  const stale = !!got && got.mode !== mode;
  const can = useCan();
  const me = useMe();
  const themed = !!v?.themeChanged;
  const [attempt, setAttempt] = useState(0);
  // Which ask failed: another version or mode loads afresh.
  const asked = `${number}|${mode}|${attempt}`;
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/v1/brands/${brand}/versions/${number}${mode === "now" ? "?against=current" : ""}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => live && setGot({ mode, v: j?.data ?? null }))
      .catch(() => live && setFailed(asked));
    return () => {
      live = false;
    };
  }, [brand, number, mode, attempt, asked]);

  // Resolves to send()'s result, so a failed restore keeps the confirm open.
  async function restore() {
    const r = await send("POST", `/api/v1/brands/${brand}/versions/${number}/restore`);
    if (!r) return null;
    // What you had is the version just before the restore: putting it back is the same call.
    undoable(`Restored version ${number}`, {
      description:
        "What you had is kept in the history." +
        (r.droppedAssets ? ` ${r.droppedAssets} deleted asset${r.droppedAssets > 1 ? "s were" : " was"} left out.` : ""),
      undo: async () => {
        const x = await send("POST", `/api/v1/brands/${brand}/versions/${r.version - 1}/restore`);
        // send() has said why; don't also say Undone.
        if (!x) return false;
        onUndone();
      },
    });
    onRestored(r.version);
    return r;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b p-4">
        <Button variant="ghost" size="sm" className="-ms-2" onClick={onBack}>
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
                {v.publishedAt ? `@${number}` : `v${number}`} · {stamp(v.updatedAt)} · {who(v.actor, me)} · {v.rules.length} rules
                {v.pages && ` · ${v.pages.length} pages`}
                {v.kind === "restore" && v.restoredFrom && ` · restored version ${v.restoredFrom}`}
              </p>
            </div>
            {v.publishedAt && <Published v={v} />}
            <div className="flex flex-wrap items-center gap-2">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={mode}
                onValueChange={(m) => m && setMode(m as Mode)}
              >
                <ToggleGroupItem value="made">What changed</ToggleGroupItem>
                <ToggleGroupItem value="now" disabled={current}>
                  Compared with now
                </ToggleGroupItem>
              </ToggleGroup>
              {!current && can("brand.edit") && (
                <Confirm
                  title={`Restore version ${number}?`}
                  says={`The brand's ${restores(v)} go back to this version. What you have now stays in the history.`}
                  action="Restore"
                  destructive={false}
                  run={restore}
                >
                  <Button size="sm" className="ms-auto">
                    <IconRestore /> Restore this version
                  </Button>
                </Confirm>
              )}
            </div>
          </>
        ) : failed === asked ? (
          <RetryLine what="this version" retry={() => setAttempt((n) => n + 1)} />
        ) : (
          <Skeleton className="h-16" />
        )}
      </div>

      <div
        aria-busy={stale}
        className={cn("min-h-0 flex-1 space-y-3 overflow-y-auto p-4 transition-opacity", stale && "opacity-50")}
      >
        {v && (
          <p className="text-muted-foreground text-sm">
            {got?.mode === "now"
              ? "What restoring would undo."
              : v.kind === "baseline"
                ? "Where the history starts."
                : v.against
                  ? `How version ${v.against} became this one.`
                  : "Everything in this version."}
          </p>
        )}
        {v && !v.diff.length && !v.pageDiff.length && !themed && <p className="text-sm">No differences.</p>}
        {v?.diff.map((c) => (
          <Change
            key={`${c.change}-${c.key}-${c.context}`}
            change={c}
            label={v.rules.find((r) => r.key === c.key && r.context === c.context)?.label}
          />
        ))}
        {v?.pageDiff.map((p) => {
          const slug = p.slice(5);
          return <Other key={p} tag="page" name={v.pages?.find((x) => x.slug === slug)?.title ?? slug} code={slug} />;
        })}
        {themed && <Other tag="theme" name="Theme" code="theme" />}
      </div>
    </div>
  );
}

/** What a restore puts back: a version from before pages or themes leaves them as they are. */
const restores = (v: Detail) =>
  new Intl.ListFormat("en", { type: "conjunction" }).format(
    ["rules", ...(v.pages ? ["pages"] : []), ...(v.theme ? ["theme"] : [])],
  );

/** The publish mark: when, by whom, and the note readers got with it. */
function Published({ v }: { v: Detail }) {
  const me = useMe();
  return (
    <div className="bg-success/10 space-y-2 rounded-lg p-3 text-sm">
      <p className="text-success flex items-center gap-1.5 font-medium">
        <IconWorldUpload className="size-4" /> Released {stamp(v.publishedAt!)}
        {v.publishedBy && ` · ${who(v.publishedBy, me)}`}
      </p>
      {/* An unnamed version takes the note as its name, so it already reads above. */}
      {v.note && v.note !== v.name && <p className="whitespace-pre-line">{v.note}</p>}
      {v.noteImage && (
        <div className="bg-checker relative aspect-video overflow-hidden rounded-md border">
          <Thumb src={`/a/${v.noteImage}/w_560,f_webp`} alt="" />
        </div>
      )}
    </div>
  );
}

const TAG = "rounded px-1.5 py-0.5 text-2xs font-semibold tracking-wide uppercase";

/** A page or the theme that changed. The diff names them only; the page itself shows the rest. */
function Other({ tag, name, code }: { tag: string; name: string; code: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border p-3">
      <span className={cn(TAG, "bg-muted text-muted-foreground")}>{tag}</span>
      <span className="truncate text-sm font-medium">{name}</span>
      <code className="text-muted-foreground ms-auto truncate font-mono text-xs">{code}</code>
    </div>
  );
}

const CHANGE_STYLE: Record<RuleChange["change"], string> = {
  added: "bg-success/15 text-success",
  removed: "bg-destructive/15 text-destructive",
  changed: "bg-warning/15 text-warning",
  moved: "bg-muted text-muted-foreground",
};

/** `label`: the rule's heading in this version, which a change or a move doesn't carry. */
function Change({ change: c, label }: { change: RuleChange; label?: string | null }) {
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex items-center gap-2">
        <span className={cn(TAG, CHANGE_STYLE[c.change])}>{c.change}</span>
        <span className="truncate text-sm font-medium">
          {ruleName(c.change === "added" ? c.after : c.change === "removed" ? c.before : { key: c.key, label })}
        </span>
        {c.context && (
          <Badge variant="secondary" title={c.context}>
            {contextLabel(c.context)}
          </Badge>
        )}
        <code className="text-muted-foreground ms-auto truncate font-mono text-xs">{c.key}</code>
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
            <Field key={f.field} f={f} ruleKey={c.key} />
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
const FIELD: Record<FieldChange["field"], string> = {
  value: "Value",
  usage: "Note",
  assets: "Assets",
  type: "Kind",
  label: "Heading",
  spec: "Details",
};
// A spec detail in brief: gradients and CMYK tuples read fine as JSON.
const brief = (v: unknown) => (v === undefined ? "nothing" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** One field, before and after, drawn the way the page draws it. */
function Field({ f, ruleKey }: { f: FieldChange; ruleKey: string }) {
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
            <li key={`is-${i}`} className={cn(!was.includes(x) && "text-success")}>
              {was.includes(x) ? "  " : "+ "}
              {x}
            </li>
          ))}
          {was
            .filter((x) => !is.includes(x))
            .map((x, i) => (
              <li key={`was-${i}`} className="text-destructive line-through">
                − {x}
              </li>
            ))}
        </ul>
      );
    }
    if (f.field === "spec") {
      // Only the details that moved, each before and after.
      const [was, is] = [(f.before ?? {}) as Record<string, unknown>, (f.after ?? {}) as Record<string, unknown>];
      const keys = [...new Set([...Object.keys(was), ...Object.keys(is)])].filter(
        (k) => JSON.stringify(was[k]) !== JSON.stringify(is[k]),
      );
      return (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {keys.map((k) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground font-mono text-xs leading-5">{k}</dt>
              <dd className="min-w-0 break-words">
                <span className="text-destructive line-through">{brief(was[k])}</span>{" "}
                <IconArrowRight className="text-muted-foreground inline size-3.5" />{" "}
                <span className="text-success">{brief(is[k])}</span>
              </dd>
            </div>
          ))}
        </dl>
      );
    }
    if (f.field === "assets") {
      return (
        <div className="flex items-center gap-3">
          <Assets list={f.before as RuleAsset[]} dim fonts={section(ruleKey) === "type"} />
          <IconArrowRight className="text-muted-foreground size-4 shrink-0" />
          <Assets list={f.after as RuleAsset[]} fonts={section(ruleKey) === "type"} />
        </div>
      );
    }
    // No label reads as the key in words, which is what readers saw.
    const say = (v: unknown) => (f.field === "label" && v === null ? `${ruleLabel(ruleKey)} (from the key)` : text(v));
    return (
      <div className="space-y-1 text-sm">
        <p className="text-destructive line-through">{say(f.before)}</p>
        <p className="text-success">{say(f.after)}</p>
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

/** A rule's files, before or after. `fonts`: a type rule's, which a version's snapshot names by id alone, so their kind comes from the rule. */
function Assets({ list, dim, fonts }: { list: RuleAsset[]; dim?: boolean; fonts?: boolean }) {
  if (!list.length) return <span className="text-muted-foreground text-sm">none</span>;
  return (
    <div className={cn("flex flex-wrap gap-2", dim && "opacity-50")}>
      {list.map((a) => (
        <div key={a.id} className="grid w-14 gap-0.5">
          <div className="bg-checker relative size-14 overflow-hidden rounded-md border">
            <FileThumb file={fonts ? { mime: "font/woff2" } : a} src={`/a/${a.id}/w_56,f_webp`} className="p-1" />
          </div>
          <span className="text-muted-foreground truncate text-center text-2xs">{renditionLabel(a.rendition)}</span>
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
      {r.assets.length > 0 && <Assets list={r.assets} fonts={r.type === "font"} />}
    </div>
  );
}
