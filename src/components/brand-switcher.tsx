"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { IconCopy, IconDots, IconPencil, IconPlus, IconStar, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import { send } from "@/components/collections";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropLine, MoveItems, SectionAdd, SidebarSection, useSortable, type SortableItem } from "@/components/sidebar-prefs";
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export type BrandInfo = { slug: string; name: string; default: boolean; rules: number };

/** The default brand lives at /brand; any other at /brand?brand={slug}. */
export const brandHref = (b: { slug: string; default: boolean }, context?: string) => {
  const q = new URLSearchParams();
  if (!b.default) q.set("brand", b.slug);
  if (context) q.set("context", context);
  return `/brand${q.size ? `?${q}` : ""}`;
};

type Editing = { kind: "new" } | { kind: "rename"; brand: BrandInfo } | { kind: "copy"; brand: BrandInfo };

/** The sidebar's brands: switch between them, and make, rename, copy, promote or delete one. */
export function Brands({ brands, current, section }: { brands: BrandInfo[]; current?: string; section: SortableItem }) {
  const router = useRouter();
  const { sorted, item } = useSortable("brands", brands, (b) => b.slug);
  const { setOpenMobile } = useSidebar();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<BrandInfo | null>(null);

  async function makeDefault(b: BrandInfo) {
    if (!(await send("PATCH", `/api/v1/brands/${b.slug}`, { default: true }))) return;
    toast.success(`${b.name} is the default brand`);
    router.push(brandHref({ ...b, default: true }));
    router.refresh();
  }

  async function remove(b: BrandInfo) {
    if (!(await send("DELETE", `/api/v1/brands/${b.slug}`))) return;
    toast.success(`Deleted ${b.name}`);
    if (b.slug === current) router.push("/brand");
    router.refresh();
  }

  return (
    <SidebarSection
      id="brands"
      label="Brands"
      sortable={section}
      action={<SectionAdd label="New brand" icon={<IconPlus />} onClick={() => setEditing({ kind: "new" })} />}
    >
        <SidebarMenu>
          {sorted.map((b) => {
            const s = item(b.slug);
            return (
            <SidebarMenuItem key={b.slug} {...s.target} {...s.handle} className={s.dragging ? "opacity-50" : undefined}>
              <DropLine line={s.line} />
              <SidebarMenuButton asChild isActive={b.slug === current} tooltip={b.name}>
                <Link href={brandHref(b)} onClick={() => setOpenMobile(false)} draggable={false}>
                  <span className="bg-muted text-muted-foreground flex size-4 shrink-0 items-center justify-center rounded text-[11px] font-semibold uppercase">
                    {b.name[0]}
                  </span>
                  <span className="truncate">{b.name}</span>
                  {b.default && <IconStar className="text-muted-foreground ml-auto size-4" aria-label="default" />}
                </Link>
              </SidebarMenuButton>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuAction showOnHover>
                    <IconDots /> <span className="sr-only">More for {b.name}</span>
                  </SidebarMenuAction>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start">
                  <DropdownMenuItem onSelect={() => setEditing({ kind: "rename", brand: b })}>
                    <IconPencil /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setEditing({ kind: "copy", brand: b })}>
                    <IconCopy /> Duplicate
                  </DropdownMenuItem>
                  {!b.default && (
                    <DropdownMenuItem onSelect={() => makeDefault(b)}>
                      <IconStar /> Make default
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <MoveItems s={s} />
                  {!b.default && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(b)}>
                        <IconTrash /> Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
            );
          })}
        </SidebarMenu>

      {editing && (
        <BrandDialog
          editing={editing}
          brands={brands}
          onClose={() => setEditing(null)}
          onDone={(b) => {
            setEditing(null);
            router.push(brandHref(b));
            router.refresh();
          }}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its {deleting?.rules} rules and its whole history go with it. The assets stay in the library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deleting && remove(deleting)}>
              Delete brand
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarSection>
  );
}

function BrandDialog({
  editing,
  brands,
  onClose,
  onDone,
}: {
  editing: Editing;
  brands: BrandInfo[];
  onClose: () => void;
  onDone: (b: BrandInfo) => void;
}) {
  const id = useId();
  const renaming = editing.kind === "rename";
  const [name, setName] = useState(
    editing.kind === "rename" ? editing.brand.name : editing.kind === "copy" ? `${editing.brand.name} copy` : "",
  );
  const [from, setFrom] = useState(editing.kind === "copy" ? editing.brand.slug : "");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const b: BrandInfo | null = renaming
      ? await send("PATCH", `/api/v1/brands/${editing.brand.slug}`, { name })
      : await send("POST", "/api/v1/brands", { name, ...(from && { from }) });
    setBusy(false);
    if (b) onDone(b);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {renaming ? "Rename brand" : editing.kind === "copy" ? `Duplicate ${editing.brand.name}` : "New brand"}
            </DialogTitle>
            <DialogDescription>
              {renaming
                ? "The name shows everywhere; the brand's address stays the same."
                : "A brand has its own rules and its own history. Start empty, or from a copy of another."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input id={`${id}-name`} autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          {!renaming && (
            <div className="grid gap-2">
              <Label htmlFor={`${id}-from`}>Start from</Label>
              <Select value={from || "*"} onValueChange={(v) => setFrom(v === "*" ? "" : v)}>
                <SelectTrigger id={`${id}-from`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="*">Nothing: an empty brand</SelectItem>
                  {brands.map((b) => (
                    <SelectItem key={b.slug} value={b.slug}>
                      A copy of {b.name} ({b.rules} rules)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {renaming ? "Rename" : "Create brand"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
