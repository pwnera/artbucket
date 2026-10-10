"use client";

import { useContext, useId, useState } from "react";
import { Combobox } from "@/components/combobox";
import { IconChevronRight, IconPencil } from "@/components/icons";
import { ReadOnly } from "@/components/brand-values";
import { usePref } from "@/components/sidebar-prefs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { relaxInherited, type FieldDef, type FieldValue } from "@/lib/fields";
import { cn } from "@/lib/utils";

/** The ids a control names in aria-describedby: its hint and, when set, its error. */
export const describedBy = (htmlFor: string | undefined, { hint, error }: { hint?: unknown; error?: unknown }) =>
  htmlFor ? [hint && `${htmlFor}-hint`, error && `${htmlFor}-error`].filter(Boolean).join(" ") || undefined : undefined;

/** Under the control: the error when there is one, the hint otherwise. Ids match describedBy(). */
function Note({ htmlFor, hint, error }: { htmlFor?: string; hint?: React.ReactNode; error?: React.ReactNode }) {
  return (
    <>
      {hint && (
        <p id={htmlFor && `${htmlFor}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p id={htmlFor && `${htmlFor}-error`} role="alert" className="text-destructive animate-in fade-in-0 slide-in-from-top-1 text-xs">
          {error}
        </p>
      )}
    </>
  );
}

/**
 * A label over its control, with an optional hint under it. `error` shows
 * in place, with role=alert; the control names both with describedBy().
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className ? `grid gap-2 ${className}` : "grid gap-2"}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      <Note htmlFor={htmlFor} hint={hint} error={error} />
    </div>
  );
}

/**
 * A ghost control: it reads as text at rest, as a Notion property does, and
 * shows it is a field when pointed at (its outline) or empty (what adding
 * one takes, in the placeholder). The focus ring stays, so the keyboard is
 * never lost.
 */
export const ghost =
  "border-transparent bg-transparent shadow-none dark:bg-transparent hover:border-input hover:bg-background focus-visible:bg-background placeholder:text-muted-foreground";

/**
 * One property of a document: the label on the left, the value on the right,
 * a hint or an error under the value. Read-only (ReadOnly), it shows `text`
 * instead of the control, and nothing at all when that is empty.
 */
export function Property({
  label,
  htmlFor,
  hint,
  error,
  text,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  /** What a reader sees in place of the control. */
  text?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const readOnly = useContext(ReadOnly);
  if (readOnly && (text === undefined || text === null || text === "" || (Array.isArray(text) && !text.length))) return null;
  return (
    <div data-slot="property" className={cn("group/prop grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-x-2", className)}>
      <Label htmlFor={readOnly ? undefined : htmlFor} className="text-muted-foreground flex min-h-9 w-28 items-center gap-1 text-sm font-normal">
        {label}
        {/* Pointed at, the row says it can be changed; while it is being changed, it says nothing. */}
        {!readOnly && (
          <IconPencil
            aria-hidden
            className="ml-auto size-3 shrink-0 opacity-0 transition-opacity group-focus-within/prop:opacity-0! group-hover/prop:opacity-60 motion-reduce:transition-none"
          />
        )}
      </Label>
      <div className="grid min-w-0 gap-1">
        {readOnly ? <div className="flex min-h-9 items-center text-sm break-words">{text}</div> : children}
        {!readOnly && <Note htmlFor={htmlFor} hint={hint} error={error} />}
      </div>
    </div>
  );
}

/**
 * A section folded to one line that says what is in it: Rights and
 * Provenance are set once and read often. Closed, its inputs still submit.
 * Whether it is open is remembered per viewer, under `remember`.
 */
export function Fold({
  title,
  summary,
  remember,
  children,
}: {
  title: React.ReactNode;
  summary: React.ReactNode;
  remember: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = usePref(`artbucket:fold:${remember}`, false);
  return (
    <details open={open} onToggle={(e) => e.currentTarget.open !== open && setOpen(e.currentTarget.open)} className="group min-w-0">
      <summary className="hover:bg-muted/50 -mx-2 flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1 text-sm font-medium transition-colors [&::-webkit-details-marker]:hidden">
        <IconChevronRight className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none" />
        {title}
        <span className="text-muted-foreground ml-auto min-w-0 truncate text-xs font-normal">{summary}</span>
      </summary>
      <div className="grid gap-2 pt-3">{children}</div>
    </details>
  );
}

/** A value as the rest of the panel says it: Yes/No, a local date, a number grouped from five digits. */
export function formatFieldValue(def: Pick<FieldDef, "type"> | undefined, v: unknown): string {
  if (v === undefined || v === null || v === "") return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean" || def?.type === "boolean") return v === true || v === "true" ? "Yes" : "No";
  if (def?.type === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T00:00:00`).toLocaleDateString();
  // Grouped from five digits: 12,500 views, but the year 2008, not 2,008.
  if (def?.type === "number" && typeof v === "number") return Number.isInteger(v) && Math.abs(v) < 10_000 ? String(v) : v.toLocaleString();
  return String(v);
}

/**
 * What a control for `d` holds, as the form submits it: a required yes/no
 * starts at No, since it has no Unset. The editor compares against this to
 * know what changed.
 */
export function fieldFormValue(d: FieldDef, v: FieldValue | undefined) {
  if (d.type === "boolean") return v === undefined ? (d.required ? "false" : "") : String(v);
  return v === undefined ? "" : String(v);
}

/**
 * Form controls for the custom field schema, one per definition. Names are
 * `field:{key}` so they can share a <form> with the built-in fields. `rows`
 * lays them out as property rows; `onChange` hears a pick (a select, a yes or
 * no) that no input event announces; `errors` shows under each, by key.
 */
export function FieldInputs({
  defs,
  values = {},
  inherited = {},
  sources = {},
  rows,
  errors = {},
  revs = {},
  onChange,
}: {
  defs: FieldDef[];
  values?: Record<string, FieldValue>;
  /** What applies when a field is left empty: shown in it, and marked where it comes from. */
  inherited?: Record<string, FieldValue>;
  /** The collection each inherited value comes from, by field key. */
  sources?: Record<string, string>;
  rows?: boolean;
  errors?: Record<string, React.ReactNode>;
  /** Bumped by key to put a control back to `values` (a refused save, a change made elsewhere). */
  revs?: Record<string, number>;
  onChange?: () => void;
}) {
  return relaxInherited(defs, inherited).map((d) => (
    <FieldInput
      key={`${d.key}:${revs[d.key] ?? 0}`}
      def={d}
      value={values[d.key]}
      inherited={inherited[d.key]}
      source={sources[d.key]}
      rows={rows}
      error={errors[d.key]}
      onChange={onChange}
    />
  ));
}

function FieldInput({
  def: d,
  value: v,
  inherited,
  source,
  rows,
  error,
  onChange,
}: {
  def: FieldDef;
  value?: FieldValue;
  inherited?: FieldValue;
  source?: string;
  rows?: boolean;
  error?: React.ReactNode;
  onChange?: () => void;
}) {
  const id = useId();
  const name = `field:${d.key}`;
  const [flag, setFlag] = useState(fieldFormValue(d, v));
  const from = inherited === undefined ? undefined : formatFieldValue(d, inherited);
  const unset = d.type === "boolean" ? flag === "" : v === undefined || v === "";
  const note = describedBy(id, { error });
  const badge = from !== undefined && unset && (
    <Badge variant="secondary" className="ml-auto font-normal" title="Inherited: leave it empty to keep it">
      from {source ?? "a collection"}
    </Badge>
  );
  // An inherited value is a value, not a hint: it reads as one, and says where it's from.
  const label = (
    <>
      {d.label}
      {d.required && (
        <span aria-hidden className="text-destructive">
          *
        </span>
      )}
      {!rows && badge}
    </>
  );

  const control =
    d.type === "boolean" ? (
      <div className="flex min-h-9 flex-wrap items-center gap-2">
        {/* Yes, No, or (when optional) Unset, so an inherited Yes can be overridden with No. */}
        <ToggleGroup
          id={id}
          type="single"
          variant="outline"
          size="sm"
          value={flag || (d.required ? "" : "unset")}
          onValueChange={(x) => {
            if (!x) return;
            setFlag(x === "unset" ? "" : x);
            setTimeout(() => onChange?.());
          }}
          aria-label={d.label}
          aria-describedby={note}
          aria-invalid={!!error || undefined}
        >
          <ToggleGroupItem value="true">Yes</ToggleGroupItem>
          <ToggleGroupItem value="false">No</ToggleGroupItem>
          {!d.required && <ToggleGroupItem value="unset">Unset</ToggleGroupItem>}
        </ToggleGroup>
        <input type="hidden" name={name} value={flag} />
        {from !== undefined && flag === "" && <span className="text-muted-foreground text-xs">{from}</span>}
      </div>
    ) : d.type === "select" ? (
      <Combobox
        id={id}
        name={name}
        options={d.options.map((o) => ({ value: o }))}
        defaultValue={fieldFormValue(d, v)}
        placeholder={from ?? (rows ? "Choose one" : d.required ? "Choose one" : "None")}
        required={d.required}
        onChange={() => setTimeout(() => onChange?.())}
        aria-describedby={note}
        aria-invalid={!!error || undefined}
      />
    ) : (
      <Input
        id={id}
        name={name}
        type={d.type === "text" ? "text" : d.type}
        step={d.type === "number" ? "any" : undefined}
        defaultValue={fieldFormValue(d, v)}
        placeholder={from ?? (rows ? `Add ${d.label.toLowerCase()}` : undefined)}
        required={d.required}
        maxLength={d.type === "text" ? 2000 : undefined}
        aria-describedby={note}
        aria-invalid={!!error || undefined}
        className={rows ? ghost : undefined}
      />
    );

  const inheritedLook = from !== undefined ? "[&_input::placeholder]:text-foreground/80 [&_[data-placeholder]]:text-foreground/80" : undefined;
  if (rows)
    return (
      <Property
        label={label}
        htmlFor={id}
        error={error}
        hint={badge || undefined}
        text={formatFieldValue(d, v ?? inherited)}
        className={inheritedLook}
      >
        <div data-prop={name}>{control}</div>
      </Property>
    );
  return (
    <Field label={label} htmlFor={id} error={error} className={inheritedLook}>
      {control}
    </Field>
  );
}

/**
 * Form values back to API values. An empty optional field is null (clear it);
 * an empty required one is omitted, so the server reports it rather than us
 * guessing a value. A yes/no submits "true", "false", or "" for unset.
 */
export function readFieldValues(form: FormData, defs: FieldDef[]) {
  const out: Record<string, FieldValue | null> = {};
  for (const d of defs) {
    const raw = form.get(`field:${d.key}`);
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s) {
      if (!d.required) out[d.key] = null;
      continue;
    }
    out[d.key] = d.type === "boolean" ? s === "true" : d.type === "number" ? Number(s) : s;
  }
  return out;
}

/**
 * Shown before an upload when the schema has required fields: the values apply
 * to every file in the batch. The platform's `required` handles the obvious
 * cases; the server is still the one that enforces them.
 */
export function UploadFieldsDialog({
  defs,
  count,
  inherited,
  from,
  open = true,
  onSubmit,
  onCancel,
}: {
  defs: FieldDef[];
  count: number;
  /** From the collection being uploaded into. */
  inherited: Record<string, FieldValue>;
  /** That collection's name. */
  from?: string;
  /** False plays the close animation while the parent keeps it mounted. */
  open?: boolean;
  onSubmit: (values: Record<string, FieldValue>) => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <form
          action={(form) => {
            const values = readFieldValues(form, defs);
            // Upload takes a complete set: drop the nulls that mean "clear".
            onSubmit(
              Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null)) as Record<string, FieldValue>,
            );
          }}
          className="grid gap-6"
        >
          <DialogHeader>
            <DialogTitle>Describe {count === 1 ? "this file" : `these ${count} files`}</DialogTitle>
            <DialogDescription>Fields marked * are required.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <FieldInputs
              defs={defs}
              inherited={inherited}
              sources={from ? Object.fromEntries(Object.keys(inherited).map((k) => [k, from])) : {}}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">Upload</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
