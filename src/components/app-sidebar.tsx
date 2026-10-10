"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  IconBook,
  IconBookmark,
  IconChartBar,
  IconCirclePlus,
  IconCompass,
  IconFileText,
  IconFolder,
  IconFolderUp,
  IconFolders,
  IconIcons,
  IconInbox,
  IconLayoutGrid,
  IconLayoutSidebarLeftExpand,
  IconLink,
  IconListCheck,
  IconLock,
  IconMailForward,
  IconPalette,
  IconPhoto,
  IconPinnedOff,
  IconPlus,
  IconRobot,
  IconSearch,
  IconSettings,
  IconSitemap,
  IconSparkles,
  IconTypography,
  IconUpload,
  IconWorld,
} from "@/components/icons";
import { AccountMenu, ProjectSwitcher, type Me } from "@/components/account";
import { useAssistant } from "@/components/assistant";
import { ExternalLink } from "@/components/external-link";
import { useCan } from "@/components/can";
import { usePins, type Recent } from "@/components/sidebar-prefs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useShell, type AddId } from "@/components/shell";
import { Kbd } from "@/components/ui/kbd";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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
import { canonical, parseView, viewQuery } from "@/lib/view";
import { LinkIcon } from "@/components/link-pending";

export type SavedSearch = { id: string; name: string; query: string };

/**
 * The app's one sidebar, the same on every page: the places (Explore,
 * Catalog, Review, Insights), and at the foot Connections, Settings and
 * BrandHub, which opens in a new tab. Every item is a link, and every view
 * it links to is a URL.
 *
 * Library links move within the page (history.pushState) when you are
 * already on it: the library draws its own view from the URL, so there is no
 * server round trip to wait for.
 *
 * ⌘K and the "?" sheet are the shell's (components/shell.tsx); these open them.
 */
export function AppSidebar({
  me,
  searches,
  reviewCount,
  openSearch,
  openShortcuts,
  children,
}: {
  me: Me;
  searches: SavedSearch[];
  reviewCount: number;
  openSearch: () => void;
  openShortcuts: () => void;
  children?: React.ReactNode;
}) {
  const can = useCan();
  const pathname = usePathname();
  const params = useSearchParams();
  const inLibrary = pathname === "/";
  const view = parseView(params);
  const query = viewQuery(view, false);
  const onSearch = inLibrary && searches.some((s) => canonical(s.query) === query);
  const at = {
    catalog: pathname.startsWith("/catalog"),
    connections: pathname === "/connections",
    insights: pathname.startsWith("/insights"),
    brands: pathname === "/brands" || pathname.startsWith("/brands/") || pathname === "/brand",
    collections: pathname === "/collections" || (inLibrary && !!view.collection),
    portals: pathname === "/portals",
    review: pathname === "/review",
    // A collection or saved search is its own item, so none of these is lit for one.
    library: inLibrary && !view.collection && !onSearch,
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <ProjectSwitcher me={me} />
          </SidebarMenuItem>
          <SidebarMenuItem>
            {/* Jump, Notion style: a quiet row, and ⌘K opens it from anywhere. The page's own field filters it. */}
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
              className="text-muted-foreground hover:text-foreground"
            >
              <IconSearch /> <span>Jump to…</span>
              <Kbd keys={["mod", "K"]} className="ml-auto group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </SidebarMenuItem>
          <AskRow />
          <SidebarMenuItem>
            <NewMenu me={me} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Sections space themselves (see SidebarSection), so folded ones sit close. */}
      <SidebarContent className="gap-0">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* The places: find it, govern it, what waits on you, how it is used. The catalog holds every object. */}
              <Place href="/" label="Explore" icon={<IconSearch />} active={at.library} />
              <Place href="/catalog" label="Catalog" icon={<IconSitemap />} active={at.catalog} />
              <Place
                href="/review"
                label="Review"
                icon={<IconInbox />}
                active={at.review}
                // What waits is a call to act only for whoever may approve it: a viewer sees the queue, not a count to clear.
                badge={(can("asset.review") && reviewCount) || undefined}
                hint={can("asset.review") && reviewCount ? `${reviewCount} waiting` : undefined}
              />
              {can("insights.read") && <Place href="/insights" label="Insights" icon={<IconChartBar />} active={at.insights} />}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* What a brand is made of and how it reaches people, apart from the places to find and govern it. */}
        <SidebarGroup>
          <SidebarGroupLabel>Content</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <Place href="/brands" label="Brands" icon={<IconPalette />} active={at.brands} />
              <Place href="/collections" label="Collections" icon={<IconFolders />} active={at.collections} />
              {can("portal.manage") && <Place href="/portals" label="Portals" icon={<IconWorld />} active={at.portals} />}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <Pinned current={pathname + (params.size ? `?${params}` : "")} />

        {children}

      </SidebarContent>

      <SidebarFooter>
        {can("organization.manage") && <StorageLine />}
        <SidebarMenu>
          <ExpandItem />
          <Place href="/connections" label="Connections" icon={<IconRobot />} active={at.connections} />
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname.startsWith("/settings")} tooltip="Settings">
              <NavLink href="/settings">
                <IconSettings /> <span>Settings</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {/* Out of the app (it opens in a new tab), so last: BrandHub, where the project's brands show, private ones too. */}
          {me.hubUrl && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="BrandHub">
                <ExternalLink href={me.hubUrl}>
                  <IconCompass /> <span>BrandHub</span>
                </ExternalLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
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

export const RECENT_ICON: Record<Recent["kind"], React.ReactNode> = {
  asset: <IconPhoto />,
  collection: <IconFolder />,
  search: <IconBookmark />,
  brand: <IconBook />,
};

/** Every way to add files, in the New menu's order: Explore runs them (shell's `add`); from anywhere else, they open Explore to run there. */
const ADD: { id: AddId; label: string; icon: typeof IconPlus; hint?: string }[] = [
  { id: "files", label: "Upload files", icon: IconUpload },
  { id: "folder", label: "Upload a folder", icon: IconFolderUp },
  { id: "private", label: "Upload privately", icon: IconLock, hint: "you choose who" },
  { id: "fonts", label: "Import a Google font", icon: IconTypography },
  { id: "icons", label: "Import icons", icon: IconIcons, hint: "open source" },
  { id: "link", label: "Add a link", icon: IconLink, hint: "Figma, Google" },
  { id: "request", label: "Request uploads by link", icon: IconMailForward, hint: "no account" },
];

/**
 * Make something, Drive's way: one New, the same wherever it is opened (the
 * sidebar, Explore's header). Files first, then the things made here, then
 * imports and asking others for files; only what this person may do.
 */
export function NewMenuContent({ side, align = "start" }: { side?: "right" | "bottom"; align?: "start" | "end" }) {
  const can = useCan();
  const navigate = useNavigate();
  const { add, openCollection } = useShell();
  const addItem = (id: AddId) => {
    const allowed = add ? !!add[id] : id === "request" ? can("share.collect_project") : can("project.upload");
    const def = ADD.find((d) => d.id === id)!;
    return allowed && { ...def, run: () => (add?.[id] ? add[id]!() : navigate(`/?browse&add=${id}`)) };
  };
  const groups = [
    [addItem("files"), addItem("folder"), addItem("private")],
    [
      can("brand.create") && { label: "Brand", icon: IconPalette, run: () => navigate("/brands?new=brand") },
      can("collection.create") && { label: "Collection", icon: IconFolders, run: () => openCollection("new") },
      can("portal.manage") && { label: "Portal", icon: IconWorld, run: () => navigate("/portals?new=portal") },
      can("organization.manage") && { label: "Project", icon: IconLayoutGrid, run: () => navigate("/settings/organization/projects") },
    ],
    [addItem("fonts"), addItem("icons"), addItem("link")],
    [addItem("request")],
  ].map((g) => g.filter(Boolean) as { label: string; icon: typeof IconPlus; hint?: string; run: () => void }[]).filter((g) => g.length);
  return (
    <DropdownMenuContent side={side} align={align} className="w-72">
      {groups.map((g, i) => (
        <DropdownMenuGroup key={i}>
          {i > 0 && <DropdownMenuSeparator />}
          {g.map((item) => (
            <DropdownMenuItem key={item.label} onSelect={item.run}>
              <item.icon /> {item.label}
              {item.hint && <span className="text-muted-foreground ms-auto ps-3 text-xs whitespace-nowrap">{item.hint}</span>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      ))}
    </DropdownMenuContent>
  );
}

/** The server's assistant (ASSISTANT_URL), a row under Jump to: its panel opens beside the page. Nothing without one. */
function AskRow() {
  const a = useAssistant();
  if (!a) return null;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton onClick={() => a.setOpen(!a.open)} isActive={a.open} tooltip="Ask" className="text-muted-foreground hover:text-foreground">
        <IconSparkles /> <span>Ask</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** The sidebar's New, under Jump to. */
function NewMenu({ me }: { me: Me }) {
  if (!me.user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* A row like the places under it, after Jump to. */}
        <SidebarMenuButton tooltip="New">
          <IconCirclePlus /> <span>New</span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <NewMenuContent side="right" />
    </DropdownMenu>
  );
}

const PIN_ICON = { brand: IconPalette, collection: IconFolders, asset: IconPhoto, portal: IconWorld, rule: IconListCheck, page: IconFileText } as const;

/** What this person starred, from the catalog or a brand's page: the one list the sidebar keeps, because they chose it. */
function Pinned({ current }: { current: string }) {
  const { pins, unpin } = usePins();
  if (!pins.length) return null;
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Pinned</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {pins.map((p) => {
            const Icon = PIN_ICON[p.type];
            return (
              <SidebarMenuItem key={p.id}>
                <SidebarMenuButton asChild isActive={current === p.href} tooltip={p.label}>
                  <NavLink href={p.href}>
                    <Icon /> <span>{p.label}</span>
                  </NavLink>
                </SidebarMenuButton>
                <SidebarMenuAction showOnHover onClick={() => unpin(p.id)}>
                  <IconPinnedOff /> <span className="sr-only">Unpin {p.label}</span>
                </SidebarMenuAction>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
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
