"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { relaxInherited, type FieldDef, type FieldValue } from "@/lib/fields";

export const inputClass =
  "bg-surface border-line focus:border-line-strong text-body text-ink w-full rounded-sm border px-3 py-2 outline-none";

/**
 * Form controls for the custom field schema, one per definition. Names are
 * `field:{key}` so they can share a <form> with the built-in fields.
 */
export function FieldInputs({
  defs,
  values = {},
  inherited = {},
}: {
  defs: FieldDef[];
  values?: Record<string, FieldValue>;
  /** Shown as the placeholder: what applies when this is left empty. */
  inherited?: Record<string, FieldValue>;
}) {
  return relaxInherited(defs, inherited).map((d) => {
    const name = `field:${d.key}`;
    const v = values[d.key];
    const from = inherited[d.key] === undefined ? undefined : String(inherited[d.key]);
    const label = (
      <>
        {d.label}
        {d.required && <span aria-hidden> *</span>}
      </>
    );
    if (d.type === "boolean") {
      return (
        <label key={d.key} className="text-label text-ink-muted flex items-center gap-2">
          <input type="checkbox" name={name} defaultChecked={v === true} className="accent-teal size-4" />
          {label}
        </label>
      );
    }
    return (
      <label key={d.key} className="text-label text-ink-muted flex flex-col gap-1">
        <span>{label}</span>
        {d.type === "select" ? (
          <select name={name} defaultValue={String(v ?? "")} required={d.required} className={inputClass}>
            <option value="">{from ? `Inherited: ${from}` : d.required ? "Choose one" : "None"}</option>
            {d.options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        ) : (
          <input
            name={name}
            type={d.type === "text" ? "text" : d.type}
            step={d.type === "number" ? "any" : undefined}
            defaultValue={v === undefined ? "" : String(v)}
            placeholder={from && `Inherited: ${from}`}
            required={d.required}
            maxLength={d.type === "text" ? 2000 : undefined}
            className={inputClass}
          />
        )}
      </label>
    );
  });
}

/**
 * Form values back to API values. An empty optional field is null (clear it);
 * an empty required one is omitted, so the server reports it rather than us
 * guessing a value.
 */
export function readFieldValues(form: FormData, defs: FieldDef[]) {
  const out: Record<string, FieldValue | null> = {};
  for (const d of defs) {
    const raw = form.get(`field:${d.key}`);
    if (d.type === "boolean") {
      out[d.key] = raw === "on" ? true : d.required ? false : null;
      continue;
    }
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s) {
      if (!d.required) out[d.key] = null;
      continue;
    }
    out[d.key] = d.type === "number" ? Number(s) : s;
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
  onSubmit,
  onCancel,
}: {
  defs: FieldDef[];
  count: number;
  /** From the collection being uploaded into. */
  inherited: Record<string, FieldValue>;
  onSubmit: (values: Record<string, FieldValue>) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      aria-labelledby="upload-fields-title"
      className="bg-surface-raised text-ink border-line shadow-lift m-auto w-[min(420px,calc(100vw-32px))] rounded-lg border p-0 backdrop:bg-black/40"
    >
      <form
        action={(form) => {
          const values = readFieldValues(form, defs);
          // Upload takes a complete set: drop the nulls that mean "clear".
          onSubmit(Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null)) as Record<string, FieldValue>);
        }}
        className="flex flex-col gap-4 p-6"
      >
        <div>
          <h2 id="upload-fields-title" className="text-title-2">
            Describe {count === 1 ? "this file" : `these ${count} files`}
          </h2>
          <p className="text-body text-ink-muted mt-1">Fields marked * are required by this library.</p>
        </div>
        <FieldInputs defs={defs} inherited={inherited} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={() => ref.current?.close()}>
            Cancel
          </Button>
          <Button type="submit">Upload</Button>
        </div>
      </form>
    </dialog>
  );
}
