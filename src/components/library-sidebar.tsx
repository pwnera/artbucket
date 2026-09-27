"use client";

import { IconAdjustments, IconBookmark, IconDots, IconPencil, IconPlus, IconX } from "@tabler/icons-react";
import { AppSidebar } from "@/components/app-sidebar";
import { CollectionIcon, type Collection } from "@/components/collections";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export type SavedSearch = { id: string; name: string; query: string };

/** Where you are in the library: everything, a collection, or a saved search. */
export function LibrarySidebar({
  collections,
  current,
  reviewing,
  onReview,
  onSelect,
  onNewCollection,
  onEditCollection,
  searches,
  activeSearch,
  onApplySearch,
  onDeleteSearch,
  onManageFields,
}: {
  collections: Collection[];
  current: string | null;
  reviewing: boolean;
  onReview: () => void;
  onSelect: (id: string | null) => void;
  onNewCollection: () => void;
  onEditCollection: (c: Collection) => void;
  searches: SavedSearch[];
  activeSearch: string | null;
  onApplySearch: (s: SavedSearch) => void;
  onDeleteSearch: (id: string) => void;
  onManageFields: () => void;
}) {
  const { setOpenMobile } = useSidebar();
  // On a phone the sidebar is a sheet; picking a place should reveal it.
  const go = (fn: () => void) => () => {
    fn();
    setOpenMobile(false);
  };

  return (
    <AppSidebar
      place={reviewing ? "review" : current === null && !activeSearch ? "files" : null}
      onFiles={() => onSelect(null)}
      onReview={onReview}
      footer={
        <SidebarMenuItem>
          <SidebarMenuButton onClick={go(onManageFields)} tooltip="Custom fields">
            <IconAdjustments /> <span>Custom fields</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      }
    >
        <SidebarGroup>
          <SidebarGroupLabel>Collections</SidebarGroupLabel>
          <SidebarGroupAction title="New collection" onClick={onNewCollection}>
            <IconPlus /> <span className="sr-only">New collection</span>
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {collections.map((c) => (
                <SidebarMenuItem key={c.id}>
                  <SidebarMenuButton isActive={current === c.id} onClick={go(() => onSelect(c.id))} tooltip={c.name}>
                    <CollectionIcon icon={c.icon} /> <span>{c.name}</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge className="group-hover/menu-item:opacity-0">{c.count}</SidebarMenuBadge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction showOnHover>
                        <IconDots /> <span className="sr-only">More for {c.name}</span>
                      </SidebarMenuAction>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start">
                      <DropdownMenuItem onClick={() => onEditCollection(c)}>
                        <IconPencil /> Edit collection
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              ))}
              {collections.length === 0 && (
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={onNewCollection} className="text-muted-foreground">
                    <IconPlus /> <span>New collection</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {searches.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Saved searches</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {searches.map((s) => (
                  <SidebarMenuItem key={s.id}>
                    <SidebarMenuButton
                      isActive={activeSearch === s.query}
                      onClick={go(() => onApplySearch(s))}
                      tooltip={s.name}
                    >
                      <IconBookmark /> <span>{s.name}</span>
                    </SidebarMenuButton>
                    <SidebarMenuAction showOnHover onClick={() => onDeleteSearch(s.id)}>
                      <IconX /> <span className="sr-only">Delete saved search {s.name}</span>
                    </SidebarMenuAction>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
    </AppSidebar>
  );
}
