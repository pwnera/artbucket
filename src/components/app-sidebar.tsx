"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  IconActivity,
  IconAdjustments,
  IconBook,
  IconBookmark,
  IconDots,
  IconFolder,
  IconInbox,
  IconPalette,
  IconPencil,
  IconPhoto,
  IconPlus,
  IconRobot,
  IconSearch,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { Logo } from "@/components/brand";
import { Brands, type BrandInfo } from "@/components/brand-switcher";
import { CollectionIcon, type Collection } from "@/components/collections";
import { CommandPalette } from "@/components/command-palette";
import {
  DropLine,
  MoveItems,
  SectionAdd,
  SidebarSection,
  useRecents,
  useSections,
  useSortable,
  type SortableItem,
} from "@/components/sidebar-prefs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { short } from "@/lib/time";
import { canonical, parseView, viewQuery } from "@/lib/view";

export type SavedSearch = { id: string; name: string; query: string };

/**
 * The app's one sidebar, the same on every page: the places, the library's
 * collections and saved searches, the brands, and whatever the current page
 * adds. Every item is a link, and every view it links to is a URL.
 *
 * Library links move within the page (history.pushState) when you are
 * already on it: the library draws its own view from the URL, so there is no
 * server round trip to wait for.
 */
export function AppSidebar({
  collections,
  brands,
  searches,
  reviewCount,
  currentBrand,
  onNewCollection,
  onEditCollection,
  onDeleteSearch,
  onUpload,
  children,
}: {
  collections: Collection[];
  brands: BrandInfo[];
  searches: SavedSearch[];
  reviewCount: number;
  /** The brand being shown, on the brand page. */
  currentBrand?: string;
  /** The library's dialogs; elsewhere these actions are left out. */
  onNewCollection?: () => void;
  onEditCollection?: (c: Collection) => void;
  onDeleteSearch?: (id: string) => void;
  /** Offered in ⌘K where the page can upload. */
  onUpload?: () => void;
  children?: React.ReactNode;
}) {
  const sections = useSections();
  // ⌘K (or Ctrl+K) opens search from anywhere, even inside a text field.
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearching((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const pathname = usePathname();
  const params = useSearchParams();
  const inLibrary = pathname === "/";
  const view = parseView(params);
  const query = viewQuery(view, false);
  const onSearch = inLibrary && searches.some((s) => canonical(s.query) === query);
  const at = {
    brand: pathname === "/brand",
    agents: pathname === "/agents",
    // A collection or saved search is its own item, so none of these is lit for one.
    assets: inLibrary && !view.review && !view.collection && !onSearch,
    review: inLibrary && view.review && !view.collection && !onSearch,
    activity: pathname === "/activity",
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="gap-3">
              <NavLink href="/">
                <Logo />
                <span className="truncate text-base font-semibold tracking-tight">Artbucket</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            {/* Search, Notion style: it looks like a field, and ⌘K opens it from anywhere. */}
            <SidebarMenuButton
              onClick={() => setSearching(true)}
              tooltip="Search (⌘K)"
              className="bg-background text-muted-foreground hover:text-foreground border shadow-xs group-data-[collapsible=icon]:border-0"
            >
              <IconSearch /> <span>Search or jump to</span>
              <kbd className="bg-muted ml-auto rounded px-1.5 font-[system-ui] text-[11px] group-data-[collapsible=icon]:hidden">⌘K</kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <CommandPalette
          open={searching}
          onOpenChange={setSearching}
          collections={collections}
          brands={brands}
          searches={searches}
          onUpload={onUpload}
          onNewCollection={onNewCollection}
        />
      </SidebarHeader>

      {/* Sections space themselves (see SidebarSection), so folded ones sit close. */}
      <SidebarContent className="gap-0">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <Place href="/" label="Assets" icon={<IconPhoto />} active={at.assets} />
              <Place
                href="/?review"
                label="Review"
                icon={<IconInbox />}
                active={at.review}
                badge={reviewCount || undefined}
                hint={reviewCount ? `${reviewCount} waiting for you` : undefined}
              />
              <Place href="/brand" label="Guidelines" icon={<IconBook />} active={at.brand} />
              <Place href="/agents" label="Agents" icon={<IconRobot />} active={at.agents} />
              <Place href="/activity" label="Activity" icon={<IconActivity />} active={at.activity} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {children}

        {/* The person's own arrangement: sections in their order, each foldable and sortable. */}
        {sections.sorted.map((id) => {
          const section = sections.item(id);
          if (id === "recents") return <Recents key={id} section={section} />;
          if (id === "brands") return <Brands key={id} brands={brands} current={currentBrand} section={section} />;
          if (id === "collections")
            return (
              <Collections
                key={id}
                section={section}
                collections={collections}
                current={inLibrary && !onSearch ? view.collection : null}
                onNew={onNewCollection}
                onEdit={onEditCollection}
              />
            );
          return searches.length > 0 ? (
            <Searches key={id} section={section} searches={searches} current={inLibrary ? query : null} onDelete={onDeleteSearch} />
          ) : null;
        })}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={inLibrary && view.fields} tooltip="Custom fields">
              <NavLink href="/?fields">
                <IconAdjustments /> <span>Custom fields</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {/* A contributor's page, not a user's: only while developing. */}
          {process.env.NODE_ENV === "development" && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Design system">
                <Link href="/design">
                  <IconPalette /> <span>Design system</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/** What you opened lately, newest first, with how long ago. */
function Recents({ section }: { section: SortableItem }) {
  const [recents, setRecents] = useRecents();
  if (!recents.length) return null;
  const icon = { asset: <IconPhoto />, collection: <IconFolder />, search: <IconBookmark />, brand: <IconBook /> };
  return (
    <SidebarSection
      id="recents"
      label="Recents"
      sortable={section}
      menu={
        <DropdownMenuItem onSelect={() => setRecents([])}>
          <IconX /> Clear recents
        </DropdownMenuItem>
      }
    >
      <SidebarMenu>
        {recents.slice(0, 5).map((r) => (
          <SidebarMenuItem key={`${r.kind}-${r.id}`}>
            <SidebarMenuButton asChild tooltip={r.label}>
              <NavLink href={r.href}>
                {icon[r.kind]} <span>{r.label}</span>
              </NavLink>
            </SidebarMenuButton>
            <SidebarMenuBadge className="text-muted-foreground font-normal" suppressHydrationWarning>
              {short(r.at)}
            </SidebarMenuBadge>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarSection>
  );
}

function Collections({
  section,
  collections,
  current,
  onNew,
  onEdit,
}: {
  section: SortableItem;
  collections: Collection[];
  current: string | null;
  onNew?: () => void;
  onEdit?: (c: Collection) => void;
}) {
  const { sorted, item } = useSortable("collections", collections, (c) => c.id);
  return (
    <SidebarSection
      id="collections"
      label="Collections"
      sortable={section}
      action={onNew && <SectionAdd label="New collection" icon={<IconPlus />} onClick={onNew} />}
    >
      <SidebarMenu>
        {sorted.map((c) => {
          const s = item(c.id);
          return (
            <SidebarMenuItem key={c.id} {...s.target} {...s.handle} className={s.dragging ? "opacity-50" : undefined}>
              <DropLine line={s.line} />
              <SidebarMenuButton asChild isActive={current === c.id} tooltip={c.name}>
                <NavLink href={`/?collection=${c.id}`} draggable={false}>
                  <CollectionIcon icon={c.icon} /> <span>{c.name}</span>
                </NavLink>
              </SidebarMenuButton>
              <SidebarMenuBadge className="group-hover/menu-item:opacity-0">{c.count}</SidebarMenuBadge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuAction showOnHover>
                    <IconDots /> <span className="sr-only">More for {c.name}</span>
                  </SidebarMenuAction>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start">
                  {onEdit && (
                    <>
                      <DropdownMenuItem onSelect={() => onEdit(c)}>
                        <IconPencil /> Edit collection
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <MoveItems s={s} />
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          );
        })}
        {collections.length === 0 && onNew && (
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onNew} className="text-muted-foreground">
              <IconPlus /> <span>New collection</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
      </SidebarMenu>
    </SidebarSection>
  );
}

function Searches({
  section,
  searches,
  current,
  onDelete,
}: {
  section: SortableItem;
  searches: SavedSearch[];
  current: string | null;
  onDelete?: (id: string) => void;
}) {
  const { sorted, item } = useSortable("searches", searches, (x) => x.id);
  return (
    <SidebarSection id="searches" label="Saved searches" sortable={section}>
      <SidebarMenu>
        {sorted.map((x) => {
          const s = item(x.id);
          return (
            <SidebarMenuItem key={x.id} {...s.target} {...s.handle} className={s.dragging ? "opacity-50" : undefined}>
              <DropLine line={s.line} />
              <SidebarMenuButton asChild isActive={current === canonical(x.query)} tooltip={x.name}>
                <NavLink href={`/?${canonical(x.query)}`} draggable={false}>
                  <IconBookmark /> <span>{x.name}</span>
                </NavLink>
              </SidebarMenuButton>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuAction showOnHover>
                    <IconDots /> <span className="sr-only">More for {x.name}</span>
                  </SidebarMenuAction>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start">
                  <MoveItems s={s} />
                  {onDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => onDelete(x.id)}>
                        <IconTrash /> Delete saved search
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarSection>
  );
}

function Place({
  href,
  label,
  icon,
  active,
  badge,
  hint,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  badge?: number;
  /** What the badge counts. */
  hint?: string;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={hint ? `${label}: ${hint}` : label}>
        <NavLink href={href}>
          {icon} <span>{label}</span>
        </NavLink>
      </SidebarMenuButton>
      {badge !== undefined && (
        <SidebarMenuBadge className="bg-primary text-primary-foreground rounded-full px-1.5" title={hint}>
          {badge}
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}

/**
 * A link that closes the phone sheet, and moves within the library without
 * a round trip when you are already in it.
 */
export function NavLink({
  href,
  children,
  ...props
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  "aria-current"?: "page";
  draggable?: boolean;
}) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  return (
    <Link
      href={href}
      {...props}
      onClick={(e) => {
        setOpenMobile(false);
        const library = href === "/" || href.startsWith("/?");
        if (pathname !== "/" || !library) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        window.history.pushState(null, "", href);
      }}
    >
      {children}
    </Link>
  );
}
