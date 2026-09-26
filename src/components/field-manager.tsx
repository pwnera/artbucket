"use client";

import { useEffect, useRef, useState } from "react";
import { inputClass } from "@/components/fields";
import { AlertIcon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FIELD_TYPES, type FieldDef, type FieldType } from "@/lib/fields";

const TYPE_LABEL: Record<FieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  boolean: "Yes / no",
  select: "Pick list",
};

/** "Usage rights" -> "usage_rights": the key values are stored under. */
export const keyFor = (label: string) =>
  label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+|_+$/g, "")
    .slice(0, 40);

const splitOptions = (s: string) =>
  s
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

/**
 * The library's custom field schema: add, adjust, remove. Everything goes
 * through /api/v1/fields. A field's type can't change once made, so the row
 * shows it as text; make a new field instead.
 */
export function FieldManager({
  fields,
  onClose,
  onChanged,
}: {
  fields: FieldDef[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<FieldType>("text");
  const [label, setLabel] = useState("");
  useEffect(() => ref.current?.showModal(), []);

  async function send(method: string, url: string, payload?: unknown) {
    setError(null);
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    if (!res.ok) {
      const e = (await res.json()).error;
      // Zod detail names the offending property; surface it with the message.
      const where = e?.detail?.properties ? Object.keys(e.detail.properties).join(", ") : "";
      setError(`${e?.message ?? "Something went wrong"}${where ? ` (${where})` : ""}`);
      return false;
    }
    onChanged();
    return true;
  }

  async function add(form: FormData) {
    const ok = await send("POST", "/api/v1/fields", {
      key: keyFor(label),
      label: label.trim(),
      type,
      options: type === "select" ? splitOptions(String(form.get("options") ?? "")) : [],
      required: form.get("required") === "on",
      position: fields.length,
    });
    if (ok) {
      setLabel("");
      setType("text");
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current.close()}
      aria-labelledby="field-manager-title"
      className="bg-surface-raised text-ink border-line shadow-lift m-auto w-[min(640px,calc(100vw-32px))] rounded-lg border p-0 backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h2 id="field-manager-title" className="text-title-2">
            Custom fields
          </h2>
          <p className="text-body text-ink-muted mt-1">
            Fields every asset in this library can carry. Required ones must be filled when files are
            uploaded, or come from a collection.
          </p>
        </div>

        {fields.length > 0 ? (
          <ul className="divide-line border-line divide-y rounded-card border">
            {fields.map((f) => (
              <FieldRow key={f.key} field={f} send={send} />
            ))}
          </ul>
        ) : (
          <p className="text-body text-ink-muted">No custom fields yet.</p>
        )}

        <form action={add} className="border-line flex flex-col gap-3 rounded-card border p-4">
          <h3 className="text-title-3">Add a field</h3>
          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <label className="text-label text-ink-muted flex flex-col gap-1">
              Name
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
                maxLength={80}
                placeholder="Campaign"
                className={inputClass}
              />
            </label>
            <label className="text-label text-ink-muted flex flex-col gap-1">
              Type
              <select
                value={type}
                onChange={(e) => setType(e.target.value as FieldType)}
                className={inputClass}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {type === "select" && (
            <label className="text-label text-ink-muted flex flex-col gap-1">
              Options, comma separated
              <input name="options" required placeholder="web, print, social" className={inputClass} />
            </label>
          )}
          <label className="text-body flex items-center gap-2">
            <input type="checkbox" name="required" className="accent-teal size-4" />
            Required at upload
          </label>
          <div className="flex items-center gap-3">
            <span className="text-meta text-ink-muted flex-1">
              {label && (keyFor(label) ? `Stored as ${keyFor(label)}` : "Start the name with a letter")}
            </span>
            <Button type="submit" disabled={!keyFor(label)}>
              Add field
            </Button>
          </div>
        </form>

        {error && (
          <p role="status" className="text-body text-danger flex items-center gap-2">
            <AlertIcon size={20} />
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => ref.current?.close()}>
            Done
          </Button>
        </div>
      </div>
    </dialog>
  );
}

/** One field: label, required and options are editable; key and type are fixed. */
function FieldRow({
  field: f,
  send,
}: {
  field: FieldDef;
  send: (method: string, url: string, payload?: unknown) => Promise<boolean>;
}) {
  const url = `/api/v1/fields/${f.key}`;
  return (
    <li>
      <form
        action={async (form) => {
          await send("PATCH", url, {
            label: String(form.get("label") ?? "").trim(),
            required: form.get("required") === "on",
            ...(f.type === "select" ? { options: splitOptions(String(form.get("options") ?? "")) } : {}),
          });
        }}
        className="flex flex-wrap items-center gap-3 px-4 py-3"
      >
        <input
          name="label"
          defaultValue={f.label}
          required
          maxLength={80}
          aria-label={`Name of ${f.key}`}
          className={cn(inputClass, "w-40 flex-none")}
        />
        <span className="text-meta text-ink-muted w-20">{TYPE_LABEL[f.type]}</span>
        {f.type === "select" && (
          <input
            name="options"
            defaultValue={f.options.join(", ")}
            required
            aria-label={`Options for ${f.label}`}
            className={cn(inputClass, "w-auto min-w-32 flex-1")}
          />
        )}
        <label className="text-label text-ink-muted flex items-center gap-1.5">
          <input
            type="checkbox"
            name="required"
            defaultChecked={f.required}
            className="accent-teal size-4"
          />
          Required
        </label>
        <span className="ml-auto flex gap-1">
          <Button type="submit" variant="ghost" size="sm">
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm(`Delete "${f.label}"? Its value is removed from every asset and collection.`)) {
                void send("DELETE", url);
              }
            }}
          >
            Delete
          </Button>
        </span>
      </form>
    </li>
  );
}
