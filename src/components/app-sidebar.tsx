"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Collapsible } from "radix-ui";
import {
  IconBook,
  IconBookmark,
  IconBookmarks,
  IconChartBar,
  IconChevronRight,
  IconClock,
  IconCompass,
  IconDots,
  IconFolder,
  IconFolderUp,
  IconFolders,
  IconInbox,
  IconLayoutSidebarLeftExpand,
  IconPalette,
  IconLock,
  IconPencil,
  IconPhoto,
  IconPlus,
  IconRobot,
  IconSearch,
  IconSettings,
  IconShare,
  IconTrash,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { AccountMenu, WorkspaceSwitcher, type Me } from "@/components/account";
import { Brands, type BrandInfo } from "@/components/brand-switcher";
import { CollectionIcon, type Collection } from "@/components/collections";
import { ExternalLink } from "@/components/external-link";
import { useCan } from "@/components/can";
import { ShareDialog, type ShareTarget } from "@/components/share-dialog";
import {
  DropLine,
  FOLD,
  Flyout,
  MoveItems,
  SectionAdd,
  SidebarSection,
  liveRecents,
  useRecents,
  useSections,
  useSortable,
  type Recent,
  type SectionId,
  type SortableItem,
} from "@/components/sidebar-prefs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import {
  Sidebar,
  SidebarContent,
  SidebarExpandedScope,
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
import { formatSize } from "@/lib/limits";
import { short } from "@/lib/time";
import { canonical, parseView, viewQuery } from "@/lib/view";
import { useKept } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { LinkIcon } from "@/components/link-pending";

export type SavedSearch = { id: string; name: string; query: string };

/**
 * The app's one sidebar, the same on every page: the places, BrandHub set
 * apart from them (it opens in a new tab), the library's
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
  /** The brand being shown, on its pages (/brands/{slug}/...). */
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
    connections: pathname === "/connections",
    portals: pathname === "/portals",
    insights: pathname.startsWith("/insights"),
    brands: pathname === "/brands" || pathname.startsWith("/brands/") || pathname === "/brand",
    review: inLibrary && view.review,
    // A collection or saved search is its own item, so none of these is lit for one.
    library: (inLibrary && !view.review && !view.collection && !onSearch) || pathname === "/activity",
  };

  const [stored] = useRecents();
  /** Whether a section has anything to show, so a folded rail offers no empty panel. */
  const shows = (id: SectionId) =>
    id === "recents"
      ? liveRecents(stored, collections, searches).length > 0
      : id === "searches"
        ? searches.length > 0
        : id === "brands" || collections.length > 0 || !!newCollection;
  /** A section, in the sidebar or in its panel. */
  const section = (id: SectionId) => {
    const sortable = sections.item(id);
    if (id === "recents") return <Recents key={id} section={sortable} collections={collections} searches={searches} />;
    if (id === "brands") return <Brands key={id} brands={brands} current={currentBrand} section={sortable} />;
    if (id === "collections")
      return (
        <Collections
          key={id}
          section={sortable}
          collections={collections}
          current={inLibrary && !onSearch ? view.collection : null}
          onNew={newCollection}
          onEdit={onEditCollection}
        />
      );
    return searches.length > 0 ? <Searches key={id} section={sortable} searches={searches} current={inLibrary ? query : null} onDelete={deleteSearch} /> : null;
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
              {/* The places, in the prototype's order. Team lives in Settings; each brand opens on its tabs from Brands. */}
              <Place href="/" label="Explore" icon={<IconPhoto />} active={at.library} />
              <Place href="/brands" label="Brands" icon={<IconPalette />} active={at.brands} />
              {can("portal.manage") && <Place href="/portals" label="Portals" icon={<IconWorld />} active={at.portals} />}
              {can("insights.read") && <Place href="/insights" label="Insights" icon={<IconChartBar />} active={at.insights} />}
              <Place href="/connections" label="Connections" icon={<IconRobot />} active={at.connections} />
              <Place
                href="/?review"
                label="Review"
                icon={<IconInbox />}
                active={at.review}
                // What waits is a call to act only for whoever may approve it: a viewer sees the queue, not a count to clear.
                badge={(can("asset.review") && reviewCount) || undefined}
                hint={can("asset.review") && reviewCount ? `${reviewCount} waiting` : undefined}
              />
            </SidebarMenu>
            {/* Out of the app, so set apart from the places: BrandHub, where the workspace's brands show, private ones too. */}
            {me.hubUrl && (
              <SidebarMenu className="mt-3">
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="BrandHub">
                    <ExternalLink href={me.hubUrl}>
                      <IconCompass /> <span>BrandHub</span>
                    </ExternalLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>

        {children}

        {/* Folded to icons, each section is an icon whose panel flies out beside the rail. */}
        <FlyoutRail items={sections.sorted.filter(shows).map((id) => ({ id, ...RAIL[id] }))} render={section} />

        {/* The person's own arrangement: sections in their order, each foldable and sortable. */}
        {sections.sorted.map(section)}
      </SidebarContent>

      <SidebarFooter>
        {can("organization.manage") && <StorageLine />}
        <SidebarMenu>
          <ExpandItem />
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

/**
 * What the organization's storage stands at, against its plan when it has
 * one: "38 GB of 100 GB". Organization admins only, as GET /api/v1/usage is;
 * hidden folded to the rail.
 */
function StorageLine() {
  // false: it couldn't be read, and the line goes.
  const [usage, setUsage] = useState<{ used: number; max: number | null } | false | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/v1/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => live && setUsage(b ? { used: b.data.used.storage, max: b.data.limits?.storage ?? null } : false))
      .catch(() => live && setUsage(false));
    return () => {
      live = false;
    };
  }, []);
  // Its line is held while it loads, so the footer doesn't jump when it lands.
  if (usage === false) return null;
  if (!usage) return <span aria-hidden className="h-4 group-data-[collapsible=icon]:hidden" />;
  return (
    <Link
      href="/settings/organization/usage"
      className="text-muted-foreground hover:text-foreground animate-in fade-in-0 h-4 px-2 text-xs tabular-nums duration-300 group-data-[collapsible=icon]:hidden"
    >
      {formatSize(usage.used)}
      {usage.max !== null && ` of ${formatSize(usage.max)}`} used
    </Link>
  );
}

/** Folded, the way back to the whole sidebar; dragging its edge out does the same. */
function ExpandItem() {
  const { setOpen } = useSidebar();
  return (
    <SidebarMenuItem className="hidden group-data-[collapsible=icon]:block">
      <SidebarMenuButton
        onClick={() => setOpen(true)}
        tooltip={{
          children: (
            <>
              Expand sidebar <Kbd keys={["mod", "B"]} className="ml-2" />
            </>
          ),
        }}
      >
        <IconLayoutSidebarLeftExpand /> <span>Expand sidebar</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** Each section's icon on the folded rail. */
const RAIL: Record<SectionId, { label: string; icon: React.ReactNode }> = {
  recents: { label: "Recents", icon: <IconClock /> },
  brands: { label: "Brands", icon: <IconPalette /> },
  collections: { label: "Collections", icon: <IconFolders /> },
  searches: { label: "Saved searches", icon: <IconBookmarks /> },
};

/** How long the pointer rests on an icon before its panel opens, or away before it closes. */
const HOVER_MS = 120;

/**
 * Folded to icons, the sections the sidebar lists stay one move away: each
 * is an icon on the rail, and its panel flies out beside it, the section
 * whole, with every action it has (add, share, edit, move, delete). Resting
 * the pointer on an icon opens its panel and moving away closes it; a click,
 * or anything done inside, keeps it open until a click elsewhere, Esc, its
 * close button, or following one of its links.
 */
function FlyoutRail({ items, render }: { items: { id: SectionId; label: string; icon: React.ReactNode }[]; render: (id: SectionId) => React.ReactNode }) {
  const { state, isMobile } = useSidebar();
  const folded = state === "collapsed" && !isMobile;
  const [open, setOpen] = useState<{ id: SectionId; pinned: boolean; keyboard?: boolean } | null>(null);
  // Unfolded, the sections are in the sidebar itself.
  if (open && !folded) setOpen(null);
  const panel = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLUListElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const base = useId();
  const later = (fn: () => void) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(fn, HOVER_MS);
  };
  const close = useCallback(() => {
    clearTimeout(timer.current);
    setOpen(null);
  }, []);
  const flyout = useMemo(() => ({ close }), [close]);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    // A click elsewhere closes it; not one in its menus or the dialogs they open, which sit outside it on the page.
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element;
      if (panel.current?.contains(t) || rail.current?.contains(t) || t.closest?.("[data-radix-popper-content-wrapper], [role=dialog], [role=alertdialog]"))
        return;
      setOpen(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);
  useEffect(() => {
    // Opened from the keyboard, focus goes into it, as into a menu.
    if (open?.keyboard) (panel.current?.querySelector<HTMLElement>("a[href]") ?? panel.current?.querySelector<HTMLElement>("button"))?.focus();
  }, [open]);

  const shown = open && items.find((i) => i.id === open.id);
  // Kept a moment once closed, so the panel slides away rather than vanishing.
  const kept = useKept(shown || null);
  if (!items.length) return null;
  return (
    <SidebarGroup className="hidden group-data-[collapsible=icon]:flex">
      <SidebarGroupContent>
        <SidebarMenu ref={rail}>
          {items.map((i) => {
            const on = open?.id === i.id;
            return (
              <SidebarMenuItem key={i.id}>
                <SidebarMenuButton
                  id={`${base}-${i.id}`}
                  isActive={on}
                  aria-expanded={on}
                  aria-controls={on ? `${base}-panel` : undefined}
                  onClick={(e) => {
                    clearTimeout(timer.current);
                    // A click on the one showing: pinned, it closes; opened by hovering, it stays.
                    setOpen((o) => (o?.id === i.id && o.pinned ? null : { id: i.id, pinned: true, keyboard: e.detail === 0 }));
                  }}
                  onPointerEnter={(e) => {
                    if (e.pointerType !== "mouse") return;
                    later(() => setOpen((o) => (o?.id === i.id ? o : { id: i.id, pinned: false })));
                  }}
                  onPointerLeave={(e) => {
                    if (e.pointerType !== "mouse") return;
                    later(() => setOpen((o) => (o?.pinned ? o : null)));
                  }}
                  onKeyDown={(e) => e.key === "Escape" && on && close()}
                  className="relative"
                >
                  {i.icon} <span className="sr-only">{i.label}</span>
                  <IconChevronRight aria-hidden className="text-muted-foreground absolute end-0 top-1/2 !size-2.5 -translate-y-1/2" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
      {kept &&
        createPortal(
          <div
            ref={panel}
            id={`${base}-panel`}
            role="region"
            aria-label={kept.label}
            onPointerEnter={() => clearTimeout(timer.current)}
            onPointerLeave={(e) => e.pointerType === "mouse" && later(() => setOpen((o) => (o?.pinned ? o : null)))}
            // Anything done inside keeps it open while the pointer wanders (a menu, a dialog).
            onPointerDownCapture={() => setOpen((o) => o && (o.pinned ? o : { ...o, pinned: true }))}
            onClick={(e) => {
              // Following a link leaves it; a menu's items live outside it on the page, so only its own links count.
              const a = (e.target as Element).closest("a[href]");
              if (a && panel.current?.contains(a)) close();
            }}
            onKeyDown={(e) => {
              if (e.key !== "Escape" || !panel.current?.contains(e.target as Node)) return;
              close();
              document.getElementById(`${base}-${kept.id}`)?.focus();
            }}
            className={cn(
              "bg-sidebar text-sidebar-foreground fixed inset-y-0 start-(--sidebar-width-icon,3rem) z-30 hidden w-64 overflow-y-auto border-e shadow-xl md:block",
              shown
                ? "animate-in fade-in-0 slide-in-from-left-2 duration-150"
                : "animate-out fade-out-0 slide-out-to-left-2 fill-mode-forwards pointer-events-none duration-100 ease-in",
            )}
          >
            <SidebarExpandedScope>
              <Flyout.Provider value={flyout}>{render(kept.id)}</Flyout.Provider>
            </SidebarExpandedScope>
          </div>,
          document.body,
        )}
    </SidebarGroup>
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
          <LinkIcon icon={icon} />{" "}
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
