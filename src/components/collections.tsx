"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { Field, FieldInputs, readFieldValues } from "@/components/fields";
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
import { Separator } from "@/components/ui/separator";
import type { FieldDef, FieldValue } from "@/lib/fields";

export type Collection = {
  id: string;
  name: string;
  fields: Record<string, FieldValue>;
  count: number;
};

/** fetch + JSON + a toast on failure. Resolves to `data`, or null when it failed. */
export async function send(method: string, url: string, payload?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  if (!res.ok) {
    const e = (await res.json().catch(() => null))?.error;
    // Zod detail names the offending property; surface it with the message.
    const where = e?.detail?.properties ? Object.keys(e.detail.properties).join(", ") : "";
    toast.error(`${e?.message ?? "Something went wrong"}${where ? ` (${where})` : ""}`);
    return null;
  }
  return res.status === 204 ? {} : ((await res.json()).data ?? {});
}

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
  const id = useId();
  const [busy, setBusy] = useState(false);
  const optional = fields.map((d) => ({ ...d, required: false }));

  async function save(form: FormData) {
    const values = readFieldValues(form, optional);
    const name = String(form.get("name") ?? "");
    setBusy(true);
    const data = collection
      ? await send("PATCH", `/api/v1/collections/${collection.id}`, { name, fields: values })
      : await send("POST", "/api/v1/collections", {
          name,
          fields: Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null)),
        });
    setBusy(false);
    if (data) {
      onSaved(data);
      onClose();
    }
  }

  async function remove() {
    if (!collection) return;
    if (await send("DELETE", `/api/v1/collections/${collection.id}`)) {
      toast.success(`Deleted ${collection.name}`);
      onSaved(null);
      onClose();
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <form action={save} className="grid gap-6">
          <DialogHeader>
            <DialogTitle>{collection ? "Edit collection" : "New collection"}</DialogTitle>
            <DialogDescription>
              {fields.length
                ? "Values set here are inherited by every asset in the collection, unless it sets its own."
                : "Group assets without moving them. An asset can sit in many collections."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="Name" htmlFor={id}>
              <Input id={id} name="name" required maxLength={120} defaultValue={collection?.name} autoFocus />
            </Field>
            {fields.length > 0 && (
              <>
                <Separator />
                <FieldInputs defs={optional} values={collection?.fields} />
              </>
            )}
          </div>
          <DialogFooter className="sm:justify-between">
            {collection ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" type="button" className="text-destructive" disabled={busy}>
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {collection.name}?</AlertDialogTitle>
                    <AlertDialogDescription>Its assets stay in the library.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={remove}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {collection ? "Save" : "Create"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
