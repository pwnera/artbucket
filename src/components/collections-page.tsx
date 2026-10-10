"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { IconFolders, IconLock, IconPencil, IconPlus, IconSitemap } from "@tabler/icons-react";
import { useCan } from "@/components/can";
import { CollectionIcon } from "@/components/collections";
import { IconButton } from "@/components/icon-button";
import { AppHeader, PageHeader } from "@/components/page";
import { PinButton } from "@/components/pin-button";
import { useShell } from "@/components/shell";
import { Button } from "@/components/ui/button";

/**
 * The project's collections, each opening in Explore with its assets; a new
 * one, and each one's edit, are the shell's dialog. Governance (lineage,
 * access, shares) is the catalog's.
 */
export function CollectionsPage() {
  const { collections, openCollection } = useShell();
  const can = useCan();
  // ?new (the catalog's +): the new collection's dialog, once.
  const asked = useSearchParams().has("new");
  useEffect(() => {
    if (!asked || !can("collection.create")) return;
    openCollection("new");
    const url = new URL(window.location.href);
    url.searchParams.delete("new");
    window.history.replaceState(window.history.state, "", url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked]);
  return (
    <>
      <AppHeader trail={[{ label: "Collections" }]} />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-6 pb-16 md:px-6">
        <PageHeader
          icon={<IconFolders />}
          title="Collections"
          aside={<span className="text-muted-foreground text-sm tabular-nums">{collections.length}</span>}
          description="Sets of assets that carry field values down to them. Open one to see its assets in Explore."
        >
          {can("collection.create") && (
            <Button size="sm" onClick={() => openCollection("new")}>
              <IconPlus /> New collection
            </Button>
          )}
        </PageHeader>
        {collections.length ? (
          <ul className="bg-card divide-y rounded-xl border">
            {collections.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                <CollectionIcon icon={c.icon} className="text-muted-foreground size-5" />
                <Link href={`/?collection=${c.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                  {c.name}
                </Link>
                {c.private && <IconLock aria-label="Private" className="text-muted-foreground size-4" />}
                <span className="text-muted-foreground text-sm tabular-nums">{c.count.toLocaleString()} assets</span>
                <IconButton variant="ghost" size="icon-sm" label={`${c.name} in the catalog`} asChild>
                  <Link href={`/catalog?o=${c.id}`}>
                    <IconSitemap />
                  </Link>
                </IconButton>
                <PinButton pin={{ id: c.id, type: "collection", label: c.name, href: `/?collection=${c.id}` }} />
                {can("collection.edit", c) && (
                  <IconButton variant="ghost" size="icon-sm" label={`Edit ${c.name}`} onClick={() => openCollection(c)}>
                    <IconPencil />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-8 text-center text-sm">No collections yet.</p>
        )}
      </div>
    </>
  );
}
