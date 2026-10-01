"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { IconCopy, IconDots, IconLayoutList, IconLoader2, IconPencil, IconPlus, IconStar, IconTrash } from "@tabler/icons-react";
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
import { NewBrand } from "@/components/new-brand";
import { DropLine, MoveItems, SectionAdd, SidebarSection, useSortable, type SortableItem } from "@/components/sidebar-prefs";
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { brandPath, builderPath } from "@/lib/site";
import { undoable } from "@/lib/undo";
import { cn } from "@/lib/utils";

export type BrandInfo = { slug: string; name: string; default: boolean; rules: number };

/** A brand in the app: its Overview, the tab it opens on. */
export const brandHref = (b: { slug: string }) => brandPath(b.slug);

type Editing = { kind: "rename"; brand: BrandInfo } | { kind: "copy"; brand: BrandInfo };

/**
 * A dialog's subject, kept after it closes: the dialog fades out still
 * naming it, instead of reading "Delete ?" on the way out. `n` counts
 * openings, so each one starts fresh.
 */
type Kept<T> = { of: T; open: boolean; n: number } | null;
const opening = <T,>(of: T) => (k: Kept<T>) => ({ of, open: true, n: (k?.n ?? 0) + 1 });
const closing = <T,>(k: Kept<T>) => k && { ...k, open: false };

/** The brand's initial, or a spinner while its page is on the way: same box, only opacity changes. */
export function BrandTile({ name }: { name: string }) {
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
  const pathname = usePathname();
  const { sorted, item } = useSortable("brands", brands, (b) => b.slug);
  const { setOpenMobile } = useSidebar();
  const [editing, setEditing] = useState<Kept<Editing>>(null);
  const [deleting, setDeleting] = useState<Kept<BrandInfo>>(null);
  // ?new=brand opens New brand: a link from elsewhere (the Git integration) that means "start one here".
  const params = useSearchParams();
  const asked = params.get("new") === "brand";
  const [creating, setCreating] = useState<Kept<true>>(() => (asked ? opening<true>(true)(null) : null));
  // Asked once: a reload shouldn't open it again.
  useEffect(() => {
    if (!asked) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("new");
    window.history.replaceState(window.history.state, "", url);
  }, [asked]);

  async function makeDefault(b: BrandInfo) {
    const was = brands.find((x) => x.default);
    if (!(await send("PATCH", `/api/v1/brands/${b.slug}`, { default: true }))) return;
    // A brand's address names it, default or not: only the star moves.
    router.refresh();
    if (!was) return void toast.success(`${b.name} is the default brand`);
    undoable(`${b.name} is the default brand`, {
      undo: async () => {
        if (!(await send("PATCH", `/api/v1/brands/${was.slug}`, { default: true }))) return false;
        router.refresh();
      },
    });
  }

  /** Resolves true once deleted; false keeps the dialog open to try again. */
  async function remove(b: BrandInfo) {
    if (!(await send("DELETE", `/api/v1/brands/${b.slug}`))) return false;
    toast.success(`Deleted ${b.name}`);
    if (b.slug === current) router.push("/brands");
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
          <SectionAdd label="New brand" icon={<IconPlus />} onClick={() => setCreating(opening(true))} />
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
                      <Can do="brand.delete">
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(opening(b))}>
                          <IconTrash /> Delete
                        </DropdownMenuItem>
                      </Can>
                    </Can>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
            );
          })}
          {/* Every brand, and who sees each on BrandHub (app/(app)/brands). */}
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={current === undefined && pathname === "/brands"} className="text-muted-foreground">
              <Link href="/brands" onClick={() => setOpenMobile(false)}>
                <IconLayoutList className="size-4" />
                <span>All brands</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
    </SidebarSection>

      {/* Both stay mounted once opened, so they fade out whole; a new opening starts a fresh form.
          Outside the section: its folded content unmounts, and "New brand" stays clickable then. */}
      {creating && (
        <NewBrand
          key={creating.n}
          open={creating.open}
          onClose={() => setCreating(closing)}
          onDone={(b) => {
            setCreating(closing);
            toast.success(`Created ${b.name}`);
            // A new brand starts from its setup, in the guidelines.
            router.push(builderPath(b.slug));
            router.refresh();
          }}
        />
      )}

      {editing && (
        <BrandDialog
          key={editing.n}
          open={editing.open}
          editing={editing.of}
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

/** Rename a brand, or duplicate it (POST /api/v1/brands with `from`): the sidebar's menu, and Use this brand's Duplicate. */
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
