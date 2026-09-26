"use client";

import { useEffect, useRef, useState } from "react";
import { FieldInputs, inputClass, readFieldValues } from "@/components/fields";
import { AlertIcon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import type { FieldDef, FieldValue } from "@/lib/fields";

export type Collection = {
  id: string;
  name: string;
  fields: Record<string, FieldValue>;
  count: number;
};

/**
 * Create or edit a collection: its name and the values its members inherit.
 * Nothing is required of a collection, so every field is optional here.
 */
export function CollectionDialog({
  collection,
  fields,
  onClose,
  onSaved,
}: {
  /** Absent to create one. */
  collection?: Collection;
  fields: FieldDef[];
  onClose: () => void;
  onSaved: (c: Collection | null) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => ref.current?.showModal(), []);
  const optional = fields.map((d) => ({ ...d, required: false }));

  async function send(method: string, url: string, payload?: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error?.message ?? "Something went wrong");
      return null;
    }
    return (await res.json()).data;
  }

  async function save(form: FormData) {
    const values = readFieldValues(form, optional);
    const name = String(form.get("name") ?? "");
    const data = collection
      ? await send("PATCH", `/api/v1/collections/${collection.id}`, { name, fields: values })
      : await send("POST", "/api/v1/collections", {
          name,
          fields: Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null)),
        });
    if (data) {
      onSaved(data);
      ref.current?.close();
    }
  }

  async function remove() {
    if (!collection) return;
    if (!confirm(`Delete "${collection.name}"? Its assets stay in the library.`)) return;
    if (await send("DELETE", `/api/v1/collections/${collection.id}`)) {
      onSaved(null);
      ref.current?.close();
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="collection-title"
      className="bg-surface-raised text-ink border-line shadow-lift m-auto w-[min(420px,calc(100vw-32px))] rounded-lg border p-0 backdrop:bg-black/40"
    >
      <form action={save} className="flex flex-col gap-4 p-6">
        <h2 id="collection-title" className="text-title-2">
          {collection ? "Edit collection" : "New collection"}
        </h2>
        <label className="text-label text-ink-muted flex flex-col gap-1">
          Name
          <input
            name="name"
            required
            maxLength={120}
            defaultValue={collection?.name}
            autoFocus
            className={inputClass}
          />
        </label>
        {fields.length > 0 && (
          <fieldset className="flex flex-col gap-4">
            <legend className="text-body text-ink-muted mb-2">
              Values every asset in this collection inherits, unless it sets its own.
            </legend>
            <FieldInputs defs={optional} values={collection?.fields} />
          </fieldset>
        )}
        {error && (
          <p role="status" className="text-body text-danger flex items-center gap-2">
            <AlertIcon size={20} />
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {collection && (
            <Button variant="ghost" type="button" onClick={remove} disabled={busy}>
              Delete
            </Button>
          )}
          <span className="flex-1" />
          <Button variant="ghost" type="button" onClick={() => ref.current?.close()}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy} aria-busy={busy}>
            {collection ? "Save" : "Create"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
