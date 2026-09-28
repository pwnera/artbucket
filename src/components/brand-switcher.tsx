"use client";

import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { IconCopy, IconDots, IconLoader2, IconPencil, IconPlus, IconStar, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import { Can } from "@/components/can";
import { send } from "@/components/collections";
import { Confirm } from "@/components/confirm";
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
import { undoable } from "@/lib/undo";
import { cn } from "@/lib/utils";

export type BrandInfo = { slug: string; name: string; default: boolean; rules: number };

/** The default brand lives at /brand; any other at /brand?brand={slug}. */
export const brandHref = (b: { slug: string; default: boolean }, context?: string) => {
  const q = new URLSearchParams();
  if (!b.default) q.set("brand", b.slug);
  if (context) q.set("context", context);
  return `/brand${q.size ? `?${q}` : ""}`;
};

type Editing = { kind: "new" } | { kind: "rename"; brand: BrandInfo } | { kind: "copy"; brand: BrandInfo };

/**
 * A dialog's subject, kept after it closes: the dialog fades out still
 * naming it, instead of reading "Delete ?" on the way out. `n` counts
 * openings, so each one starts fresh.
 */
type Kept<T> = { of: T; open: boolean; n: number } | null;
const opening = <T,>(of: T) => (k: Kept<T>) => ({ of, open: true, n: (k?.n ?? 0) + 1 });
const closing = <T,>(k: Kept<T>) => k && { ...k, open: false };

/** The brand's initial, or a spinner while its page is on the way: same box, only opacity changes. */
function BrandTile({ name }: { name: string }) {
  const { pending } = useLinkStatus();
  return (
    <span className="bg-muted text-muted-foreground in-data-[active=true]:bg-primary in-data-[active=true]:text-primary-foreground relative flex size-4 shrink-0 items-center justify-center rounded text-2xs font-semibold uppercase transition-colors">
      <span className={cn("transition-opacity", pending && "opacity-0")}>{name[0]}</span>
      <IconLoader2 aria-hidden className={cn("absolute size-3 opacity-0 transition-opacity", pending && "animate-spin opacity-100")} />
    </span>
  );
}

/** The sidebar's brands: switch between them, and make, rename, copy, promote or delete one. */
export function Brands({ brands, current, section }: { brands: BrandInfo[]; current?: string; section: SortableItem }) {
  const router = useRouter();
  const { sorted, item } = useSortable("brands", brands, (b) => b.slug);
  const { setOpenMobile } = useSidebar();
  const [editing, setEditing] = useState<Kept<Editing>>(null);
  const [deleting, setDeleting] = useState<Kept<BrandInfo>>(null);

  async function makeDefault(b: BrandInfo) {
    const was = brands.find((x) => x.default);
    if (!(await send("PATCH", `/api/v1/brands/${b.slug}`, { default: true }))) return;
    router.push(brandHref({ ...b, default: true }));
    router.refresh();
    if (!was) return void toast.success(`${b.name} is the default brand`);
    undoable(`${b.name} is the default brand`, {
      // The old default back, and this brand still on screen, at its own address again.
      undo: async () => {
        if (!(await send("PATCH", `/api/v1/brands/${was.slug}`, { default: true }))) return false;
        router.push(brandHref(b));
        router.refresh();
      },
    });
  }

  /** Resolves true once deleted; false keeps the dialog open to try again. */
  async function remove(b: BrandInfo) {
    if (!(await send("DELETE", `/api/v1/brands/${b.slug}`))) return false;
    toast.success(`Deleted ${b.name}`);
    if (b.slug === current) router.push("/brand");
    router.refresh();
    return true;
  }

  return (
    <>
    <SidebarSection
      id="brands"
      label="Brands"
      sortable={section}
      action={
        <Can do="brand.edit">
          <SectionAdd label="New brand" icon={<IconPlus />} onClick={() => setEditing(opening<Editing>({ kind: "new" }))} />
        </Can>
      }
    >
        <SidebarMenu>
          {sorted.map((b) => {
            const s = item(b.slug);
            return (
            <SidebarMenuItem key={b.slug} {...s.target} {...s.handle} className={s.dragging ? "opacity-50" : undefined}>
              <DropLine line={s.line} />
              <SidebarMenuButton asChild isActive={b.slug === current} tooltip={b.name}>
                <Link href={brandHref(b)} onClick={() => setOpenMobile(false)} draggable={false}>
                  <BrandTile name={b.name} />
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
                  <Can do="brand.edit">
                    <DropdownMenuItem onSelect={() => setEditing(opening<Editing>({ kind: "rename", brand: b }))}>
                      <IconPencil /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setEditing(opening<Editing>({ kind: "copy", brand: b }))}>
                      <IconCopy /> Duplicate
                    </DropdownMenuItem>
                    {!b.default && (
                      <DropdownMenuItem onSelect={() => void makeDefault(b)}>
                        <IconStar /> Make default
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                  </Can>
                  <MoveItems s={s} />
                  {!b.default && (
                    <Can do="brand.edit">
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(opening(b))}>
                        <IconTrash /> Delete
                      </DropdownMenuItem>
                    </Can>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
    </SidebarSection>

      {/* Both stay mounted once opened, so they fade out whole; a new opening starts a fresh form.
          Outside the section: its folded content unmounts, and "New brand" stays clickable then. */}
      {editing && (
        <BrandDialog
          key={editing.n}
          open={editing.open}
          editing={editing.of}
          brands={brands}
          onClose={() => setEditing(closing)}
          onDone={(b) => {
            setEditing(closing);
            toast.success(editing.of.kind === "rename" ? `Renamed to ${b.name}` : `Created ${b.name}`);
            router.push(brandHref(b));
            router.refresh();
          }}
        />
      )}

      {deleting && (
        <Confirm
          open={deleting.open}
          onOpenChange={(o) => !o && setDeleting(closing)}
          title={`Delete ${deleting.of.name}?`}
          says={`Its ${deleting.of.rules} rules and its whole history go with it. The assets stay in the library.`}
          action="Delete brand"
          run={() => remove(deleting.of)}
        />
      )}
    </>
  );
}

function BrandDialog({
  open,
  editing,
  brands,
  onClose,
  onDone,
}: {
  open: boolean;
  editing: Editing;
  brands: BrandInfo[];
  onClose: () => void;
  onDone: (b: BrandInfo) => void;
}) {
  const id = useId();
  const renaming = editing.kind === "rename";
  const [initial] = useState(editing.kind === "rename" ? editing.brand.name : editing.kind === "copy" ? `${editing.brand.name} copy` : "");
  const [name, setName] = useState(initial);
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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" guard={{ dirty: name !== initial, onDiscard: onClose }}>
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
            <Button type="submit" pending={busy} disabled={!name.trim()}>
              {renaming ? "Rename" : "Create brand"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
