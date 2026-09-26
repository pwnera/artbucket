"use client";

import Link from "next/link";
import {
  IconAdjustments,
  IconBookmark,
  IconDots,
  IconPalette,
  IconPencil,
  IconPhoto,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import { Logo, ThemeToggle } from "@/components/brand";
import { CollectionIcon, type Collection } from "@/components/collections";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

export type SavedSearch = { id: string; name: string; query: string };

/** Where you are in the library: everything, a collection, or a saved search. */
export function LibrarySidebar({
  collections,
  current,
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
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" onClick={go(() => onSelect(null))} className="gap-3">
              <Logo />
              <span className="truncate text-base font-semibold tracking-tight">Artbucket</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={current === null && !activeSearch}
                  onClick={go(() => onSelect(null))}
                  tooltip="All files"
                >
                  <IconPhoto /> <span>All files</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

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
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={go(onManageFields)} tooltip="Custom fields">
              <IconAdjustments /> <span>Custom fields</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Design system">
              <Link href="/design">
                <IconPalette /> <span>Design system</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem className="flex justify-end group-data-[collapsible=icon]:justify-center">
            <ThemeToggle />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
