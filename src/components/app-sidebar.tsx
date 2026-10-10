"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  IconBook,
  IconBookmark,
  IconChartBar,
  IconCompass,
  IconFolder,
  IconInbox,
  IconLayoutSidebarLeftExpand,
  IconPhoto,
  IconRobot,
  IconSearch,
  IconSettings,
  IconSitemap,
} from "@tabler/icons-react";
import { AccountMenu, ProjectSwitcher, type Me } from "@/components/account";
import { ExternalLink } from "@/components/external-link";
import { useCan } from "@/components/can";
import type { Recent } from "@/components/sidebar-prefs";
import { Kbd } from "@/components/ui/kbd";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
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
    review: inLibrary && view.review,
    // A collection or saved search is its own item, so none of these is lit for one.
    library: (inLibrary && !view.review && !view.collection && !onSearch) || pathname === "/activity",
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <ProjectSwitcher me={me} />
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
              {/* The places: find it, govern it, what waits on you, how it is used. The catalog holds every object. */}
              <Place href="/" label="Explore" icon={<IconSearch />} active={at.library} />
              <Place href="/catalog" label="Catalog" icon={<IconSitemap />} active={at.catalog} />
              <Place
                href="/?review"
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
