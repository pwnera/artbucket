"use client";

import { useEffect, useId, useState } from "react";
import { IconDownload, IconPhoto } from "@tabler/icons-react";
import { toast } from "sonner";
import type { Collection } from "@/components/collections";
import { MultiCombobox, type Option } from "@/components/combobox";
import { Field, FieldInputs, readFieldValues } from "@/components/fields";
import type { Asset } from "@/components/gallery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { FieldDef } from "@/lib/fields";
import { fileTypeBadge, formatBytes } from "@/lib/filename";

const TEXT = [
  { key: "title", label: "Title" },
  { key: "creator", label: "Creator" },
  { key: "copyright", label: "Copyright" },
] as const;

/**
 * One asset, editable. Saves through the public PATCH, and Download returns
 * the file with these edits written into it.
 */
export function AssetEditor({
  asset,
  fields,
  collections,
  onClose,
  onSaved,
}: {
  asset: Asset;
  fields: FieldDef[];
  collections: Collection[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [tags, setTags] = useState<Option[]>([]);
  const m = asset.metadata ?? {};

  // Every tag in the library, for autocomplete: an unfiltered search's facets.
  useEffect(() => {
    fetch("/api/v1/assets?limit=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b && setTags(b.facets.tags.map((t: { value: string; count: number }) => ({ value: t.value, hint: t.count }))));
  }, []);

  async function save(form: FormData) {
    setBusy(true);
    const str = (k: string) => String(form.get(k) ?? "");
    const res = await fetch(`/api/v1/assets/${asset.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: str("title"),
        description: str("description"),
        creator: str("creator"),
        copyright: str("copyright"),
        tags: form.getAll("tags").map(String),
        fields: readFieldValues(form, fields),
      }),
    });
    if (!res.ok) {
      setBusy(false);
      toast.error((await res.json()).error?.message ?? "Couldn't save");
      return;
    }
    // Membership goes through each collection's endpoint, only where it changed.
    const want = new Set(form.getAll("collection").map(String));
    const changes = collections.flatMap((c) => {
      const had = asset.collections.includes(c.id);
      if (had === want.has(c.id)) return [];
      const change = want.has(c.id) ? { add: [asset.id] } : { remove: [asset.id] };
      return [
        fetch(`/api/v1/collections/${c.id}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(change),
        }),
      ];
    });
    const failed = (await Promise.all(changes)).some((r) => !r.ok);
    setBusy(false);
    onSaved();
    if (failed) {
      toast.warning("Saved, but a collection change didn't go through");
      return;
    }
    toast.success("Saved");
    onClose();
  }

  const facts = [
    asset.width && asset.height ? `${asset.width} × ${asset.height}` : null,
    formatBytes(asset.size),
    m.camera,
    m.capturedAt?.slice(0, 10),
  ].filter(Boolean);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="grid max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-5xl md:h-[min(760px,calc(100dvh-2rem))] md:grid-cols-[1fr_380px] md:grid-rows-1 md:overflow-hidden">
        <div className="bg-muted/50 flex min-h-64 flex-col border-b md:min-h-0 md:border-r md:border-b-0">
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            {asset.mime.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/a/${asset.id}/w_960,f_webp`} alt="" className="max-h-[60vh] max-w-full rounded-md object-contain md:max-h-full" />
            ) : (
              <IconPhoto className="text-muted-foreground size-12" stroke={1.5} />
            )}
          </div>
          <div className="flex items-center gap-2 border-t px-4 py-3">
            <Badge variant="outline">{fileTypeBadge(asset.filename, asset.mime)}</Badge>
            <span className="text-muted-foreground truncate text-xs tabular-nums">{facts.join(" · ")}</span>
            <Button variant="outline" size="sm" className="ml-auto" asChild>
              {/* The file as stored, with these fields written into it. */}
              <a href={`/a/${asset.id}?download`} download>
                <IconDownload /> Download
              </a>
            </Button>
          </div>
        </div>

        <form action={save} className="flex min-h-0 flex-col md:h-full">
          <div className="border-b px-6 pt-6 pb-4 pr-12">
            <DialogTitle className="break-all">{asset.filename}</DialogTitle>
            <DialogDescription className="mt-1">Edits are written into the file on download.</DialogDescription>
          </div>

          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 py-4">
            {TEXT.map(({ key, label }) => (
              <Field key={key} label={label} htmlFor={`${id}-${key}`}>
                <Input id={`${id}-${key}`} name={key} defaultValue={m[key] ?? ""} maxLength={2000} />
              </Field>
            ))}
            <Field label="Description" htmlFor={`${id}-description`}>
              <Textarea
                id={`${id}-description`}
                name="description"
                defaultValue={m.description ?? ""}
                maxLength={2000}
                rows={3}
              />
            </Field>

            <Separator className="my-1" />
            <Field label="Tags" htmlFor={`${id}-tags`} hint="Enter or comma adds a new tag.">
              <MultiCombobox id={`${id}-tags`} name="tags" options={tags} defaultValue={asset.tags} placeholder="Add tags" creatable />
            </Field>
            {collections.length > 0 && (
              <Field label="Collections" htmlFor={`${id}-collections`}>
                <MultiCombobox
                  id={`${id}-collections`}
                  name="collection"
                  options={collections.map((c) => ({ value: c.id, label: c.name, hint: c.count }))}
                  defaultValue={asset.collections}
                  placeholder="Add to a collection"
                />
              </Field>
            )}

            {fields.length > 0 && (
              <>
                <Separator className="my-1" />
                <FieldInputs defs={fields} values={asset.fields} inherited={asset.inherited} />
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t px-6 py-4">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
