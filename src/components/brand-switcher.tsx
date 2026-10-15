"use client";

import { useId, useState } from "react";
import { send } from "@/components/collections";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brandPath } from "@/lib/site";

export type BrandInfo = { id: string; slug: string; name: string; default: boolean; rules: number; private?: boolean };

/** A brand in the app: its Overview, the tab it opens on. */
export const brandHref = (b: { slug: string }) => brandPath(b.slug);

type Editing = { kind: "rename"; brand: BrandInfo } | { kind: "copy"; brand: BrandInfo };

/** Rename a brand, or duplicate it (POST /api/v1/brands with `from`): the brand header's menu. */
export function BrandDialog({
  open,
  editing,
  onClose,
  onDone,
}: {
  open: boolean;
  editing: Editing;
  onClose: () => void;
  onDone: (b: BrandInfo) => void;
}) {
  const id = useId();
  const renaming = editing.kind === "rename";
  const [initial] = useState(renaming ? editing.brand.name : `${editing.brand.name} copy`);
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const b: BrandInfo | null = renaming
      ? await send("PATCH", `/api/v1/brands/${editing.brand.slug}`, { name })
      : await send("POST", "/api/v1/brands", { name, from: editing.brand.slug });
    setBusy(false);
    if (b) onDone(b);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" guard={{ dirty: name !== initial, onDiscard: onClose }}>
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {renaming ? "Rename brand" : `Duplicate ${editing.brand.name}`}
            </DialogTitle>
            <DialogDescription>
              {renaming
                ? "Its address stays the same."
                : "Copies its rules, pages and theme."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input id={`${id}-name`} autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" pending={busy} disabled={!name.trim()}>
              {renaming ? "Rename" : "Create brand"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
