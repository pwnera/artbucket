"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Collapsible } from "radix-ui";
import {
  IconBook,
  IconBookmark,
  IconDots,
  IconFolder,
  IconFolderUp,
  IconLock,
  IconPencil,
  IconPhoto,
  IconPlus,
  IconRobot,
  IconSearch,
  IconSettings,
  IconShare,
  IconTrash,
  IconUsers,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { AccountMenu, WorkspaceSwitcher, type Me } from "@/components/account";
import { Brands, type BrandInfo } from "@/components/brand-switcher";
import { CollectionIcon, type Collection } from "@/components/collections";
import { useCan } from "@/components/can";
import { ShareDialog, type ShareTarget } from "@/components/share-dialog";
import {
  DropLine,
  FOLD,
  MoveItems,
  SectionAdd,
  SidebarSection,
  liveRecents,
  useRecents,
  useSections,
  useSortable,
  type Recent,
  type SortableItem,
} from "@/components/sidebar-prefs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
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
  SidebarSeparator,
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
 *
 * ⌘K and the "?" sheet are the shell's (components/shell.tsx); these open them.
 */
export function AppSidebar({
  me,
  collections,
  brands,
  searches,
  reviewCount,
  currentBrand,
  openSearch,
  openShortcuts,
  onNewCollection,
  onEditCollection,
  onDeleteSearch,
  children,
}: {
  me: Me;
  collections: Collection[];
  brands: BrandInfo[];
  searches: SavedSearch[];
  reviewCount: number;
  /** The brand being shown, on the brand page. */
  currentBrand?: string;
  openSearch: () => void;
  openShortcuts: () => void;
  /** The shell's dialogs; each is left out for whoever may not use it. */
  onNewCollection?: () => void;
  onEditCollection?: (c: Collection) => void;
  onDeleteSearch?: (id: string) => void;
  children?: React.ReactNode;
}) {
  const sections = useSections();
  const can = useCan();
  // Offered only to whoever may: the page passes what it can do, this keeps what they may.
  const newCollection = can("collection.create") ? onNewCollection : undefined;
  const deleteSearch = can("search.delete") ? onDeleteSearch : undefined;
  const pathname = usePathname();
  const params = useSearchParams();
  const inLibrary = pathname === "/";
  const view = parseView(params);
  const query = viewQuery(view, false);
  const onSearch = inLibrary && searches.some((s) => canonical(s.query) === query);
  const at = {
    // With several brands, the brand's own row below is lit instead: one place, one lit entry.
    brand: pathname === "/brand" && brands.length < 2,
    agents: pathname === "/agents",
    team: pathname === "/team",
    portals: pathname === "/portals",
    // A collection or saved search is its own item, so none of these is lit for one.
    // Review is a tab of Assets, so Assets stays lit on it.
    assets: (inLibrary && !view.collection && !onSearch) || pathname === "/activity",
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <WorkspaceSwitcher me={me} />
          </SidebarMenuItem>
          <SidebarMenuItem>
            {/* Jump, Notion style: it looks like a field, and ⌘K opens it from anywhere. The page's own field filters it. */}
            <SidebarMenuButton
              onClick={openSearch}
              aria-keyshortcuts="Meta+K Control+K"
              tooltip={{
                children: (
                  <>
                    Jump to
                    <Kbd keys={["mod", "K"]} className="ml-2" />
                  </>
                ),
              }}
              className="bg-background text-muted-foreground hover:text-foreground border shadow-xs group-data-[collapsible=icon]:border-0"
            >
              <IconSearch /> <span>Jump to…</span>
              <Kbd keys={["mod", "K"]} className="ml-auto group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Sections space themselves (see SidebarSection), so folded ones sit close. */}
      <SidebarContent className="gap-0">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* What waits in Review shows on Assets, whose tab it is. */}
              <Place
                href="/"
                label="Assets"
                icon={<IconPhoto />}
                active={at.assets}
                badge={reviewCount || undefined}
                hint={reviewCount ? `${reviewCount} waiting in Review` : undefined}
              />
              <Place href="/brand" label="Guidelines" icon={<IconBook />} active={at.brand} />
              <Place href="/agents" label="Agents" icon={<IconRobot />} active={at.agents} />
              {can("portal.manage") && <Place href="/portals" label="Portals" icon={<IconWorld />} active={at.portals} />}
              {(can("member.manage") || can("share.manage")) && <Place href="/team" label="Team" icon={<IconUsers />} active={at.team} />}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {children}

        {/* The person's own arrangement: sections in their order, each foldable and sortable. */}
        {sections.sorted.map((id) => {
          const section = sections.item(id);
          if (id === "recents") return <Recents key={id} section={section} collections={collections} searches={searches} />;
          if (id === "brands") return <Brands key={id} brands={brands} current={currentBrand} section={section} />;
          if (id === "collections")
            return (
              <Collections
                key={id}
                section={section}
                collections={collections}
                current={inLibrary && !onSearch ? view.collection : null}
                onNew={newCollection}
                onEdit={onEditCollection}
              />
            );
          return searches.length > 0 ? (
            <Searches key={id} section={section} searches={searches} current={inLibrary ? query : null} onDelete={deleteSearch} />
          ) : null;
        })}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname.startsWith("/settings")} tooltip="Settings">
              <NavLink href="/settings">
                <IconSettings /> <span>Settings</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarSeparator />
        <SidebarMenu>
          <SidebarMenuItem>
            <AccountMenu me={me} openShortcuts={openShortcuts} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

export const RECENT_ICON: Record<Recent["kind"], React.ReactNode> = {
  asset: <IconPhoto />,
  collection: <IconFolder />,
  search: <IconBookmark />,
  brand: <IconBook />,
};

/** What you opened lately, newest first, with how long ago, under today's names. */
function Recents({ section, collections, searches }: { section: SortableItem; collections: Collection[]; searches: SavedSearch[] }) {
  const [stored, setRecents] = useRecents();
  const recents = liveRecents(stored, collections, searches).slice(0, 5);
  return (
    // Grows in with the first thing opened, and folds away when cleared, rather than popping.
    <Collapsible.Root open={recents.length > 0}>
      <Collapsible.Content className={FOLD}>
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
            {recents.map((r) => (
              <SidebarMenuItem key={`${r.kind}-${r.id}`}>
                <SidebarMenuButton asChild tooltip={r.label}>
                  <NavLink href={r.href}>
                    {RECENT_ICON[r.kind]} <span>{r.label}</span>
                  </NavLink>
                </SidebarMenuButton>
                <SidebarMenuBadge className="text-muted-foreground font-normal" suppressHydrationWarning>
                  {short(r.at)}
                </SidebarMenuBadge>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarSection>
      </Collapsible.Content>
    </Collapsible.Root>
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
  const [sharing, setSharing] = useState<ShareTarget | null>(null);
  const can = useCan();
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
              {/* On touch the dots never hide: the count sits beside them, and the name ends before both. */}
              <SidebarMenuButton asChild isActive={current === c.id} tooltip={c.name} className="pointer-coarse:pr-14">
                <NavLink href={`/?collection=${c.id}`} draggable={false}>
                  <CollectionIcon icon={c.icon} />{" "}
                  <span>
                    {c.name}
                    {c.private && <IconLock className="text-muted-foreground ml-1 inline size-3 align-[-1px]" aria-label="Private" />}
                  </span>
                </NavLink>
              </SidebarMenuButton>
              {/* Out of the dots' way whenever they show: hovered, focused, or their menu open. */}
              <SidebarMenuBadge className="transition-opacity group-hover/menu-item:opacity-0 group-focus-within/menu-item:opacity-0 group-has-data-[state=open]/menu-item:opacity-0 pointer-coarse:right-7">
                {c.count}
              </SidebarMenuBadge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuAction showOnHover>
                    <IconDots /> <span className="sr-only">More for {c.name}</span>
                  </SidebarMenuAction>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start">
                  {onEdit && can("collection.edit", c) && (
                    <DropdownMenuItem onSelect={() => onEdit(c)}>
                      <IconPencil /> Edit collection
                    </DropdownMenuItem>
                  )}
                  {can("collection.share", c) && (
                    <DropdownMenuItem onSelect={() => setSharing({ kind: "view", collection: c })}>
                      <IconShare /> Share a link
                    </DropdownMenuItem>
                  )}
                  {can("collection.collect", c) && (
                    <DropdownMenuItem onSelect={() => setSharing({ kind: "upload", collection: c })}>
                      <IconFolderUp /> Request uploads
                    </DropdownMenuItem>
                  )}
                  {(can("collection.edit", c) || can("collection.share", c)) && <DropdownMenuSeparator />}
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
      {sharing && <ShareDialog target={sharing} onClose={() => setSharing(null)} />}
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
          {icon}{" "}
          <span>
            {label}
            {/* What the number counts, for a screen reader; the badge itself is only a picture of it. */}
            {hint && <span className="sr-only">, {hint}</span>}
          </span>
        </NavLink>
      </SidebarMenuButton>
      {badge !== undefined && (
        // Keyed so a change pops in; the peer overrides keep it white when Assets is hovered or lit.
        <SidebarMenuBadge
          key={badge}
          aria-hidden
          className="bg-primary text-primary-foreground peer-hover/menu-button:text-primary-foreground peer-data-[active=true]/menu-button:text-primary-foreground animate-in zoom-in-50 rounded-full px-1.5 duration-200"
        >
          {badge}
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}

const isLibrary = (href: string) => href === "/" || href.startsWith("/?");

/**
 * Move within the library without a round trip: it draws its view from the
 * URL. A new place starts at its top, as a Link would; opening an asset
 * keeps your place under it.
 */
export function pushView(href: string) {
  window.history.pushState(null, "", href);
  if (!new URL(href, window.location.href).searchParams.has("asset")) window.scrollTo({ top: 0, behavior: "instant" });
}

/** Go to `href`: within the library when you are in it, else as a navigation. For ⌘K and the keyboard. */
export function useNavigate() {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback((href: string) => (pathname === "/" && isLibrary(href) ? pushView(href) : router.push(href)), [router, pathname]);
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
        if (pathname !== "/" || !isLibrary(href)) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        pushView(href);
      }}
    >
      {children}
    </Link>
  );
}
