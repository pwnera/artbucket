"use client";

import { useId } from "react";
import { Combobox } from "@/components/combobox";
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
import { Switch } from "@/components/ui/switch";
import { relaxInherited, type FieldDef, type FieldValue } from "@/lib/fields";

/** A label over its control, with an optional hint under it. */
export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

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
  return relaxInherited(defs, inherited).map((d) => (
    <FieldInput key={d.key} def={d} value={values[d.key]} inherited={inherited[d.key]} />
  ));
}

function FieldInput({ def: d, value: v, inherited }: { def: FieldDef; value?: FieldValue; inherited?: FieldValue }) {
  const id = useId();
  const name = `field:${d.key}`;
  const from = inherited === undefined ? undefined : `Inherited: ${inherited}`;
  const label = (
    <>
      {d.label}
      {d.required && <span className="text-destructive">*</span>}
    </>
  );

  if (d.type === "boolean") {
    return (
      <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
        <Label htmlFor={id}>{label}</Label>
        <Switch id={id} name={name} defaultChecked={v === true} />
      </div>
    );
  }
  return (
    <Field label={label} htmlFor={id}>
      {d.type === "select" ? (
        <Combobox
          id={id}
          name={name}
          options={d.options.map((o) => ({ value: o }))}
          defaultValue={v === undefined ? "" : String(v)}
          placeholder={from ?? (d.required ? "Choose one" : "None")}
          required={d.required}
        />
      ) : (
        <Input
          id={id}
          name={name}
          type={d.type === "text" ? "text" : d.type}
          step={d.type === "number" ? "any" : undefined}
          defaultValue={v === undefined ? "" : String(v)}
          placeholder={from}
          required={d.required}
          maxLength={d.type === "text" ? 2000 : undefined}
        />
      )}
    </Field>
  );
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
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
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
            <DialogDescription>Fields marked * are required by this library.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <FieldInputs defs={defs} inherited={inherited} />
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
