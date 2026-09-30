"use client";

import { useEffect, useState } from "react";
import {
  IconActivity,
  IconBook,
  IconBookmark,
  IconDeviceDesktop,
  IconFileSearch,
  IconFileText,
  IconFolderPlus,
  IconHistory,
  IconInbox,
  IconKeyboard,
  IconLoader2,
  IconMailPlus,
  IconMoon,
  IconPhoto,
  IconRobot,
  IconSearch,
  IconSettings,
  IconShare,
  IconSun,
  IconUpload,
  IconUsers,
  IconWorld,
} from "@tabler/icons-react";
import { Command as CommandPrimitive, defaultFilter } from "cmdk";
import { useTheme } from "next-themes";
import { RECENT_ICON, useNavigate, type SavedSearch } from "@/components/app-sidebar";
import { brandHref, type BrandInfo } from "@/components/brand-switcher";
import { useCan, useMe } from "@/components/can";
import { CollectionIcon, type Collection } from "@/components/collections";
import type { Asset } from "@/components/gallery";
import { allowedFor, hrefFor } from "@/components/settings/sections";
import { liveRecents, useRecents } from "@/components/sidebar-prefs";
import { GoKeys } from "@/components/shortcuts";
import {
  CommandDialog,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandLoading,
  CommandShortcut,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { useSidebar } from "@/components/ui/sidebar";
import { canonical } from "@/lib/view";
import { contextLabel, ruleLabel, type Rule } from "@/lib/rules";
import { builderPath, guidelinesPath } from "@/lib/site";
import { hasPreview } from "@/lib/preview";

type RuleHit = Rule & { brandInfo: BrandInfo };
/** A brand page as GET /brands/{slug}/pages lists it. */
type PageHit = { slug: string; title: string; hidden: boolean; parent: string | null; brandInfo: BrandInfo };

/**
 * Something of every brand's (its rules, its pages), kept for a minute
 * across openings: there are dozens, not thousands, and ⌘K opens often. One
 * promise per workspace and brand list, so two quick openings share a fetch;
 * a brand that fails is left out.
 */
const perBrandCache = new Map<string, { key: string; at: number; data: Promise<unknown[]> }>();
function perBrand<T>(what: string, url: (slug: string) => string, workspace: string, brands: BrandInfo[]): Promise<(T & { brandInfo: BrandInfo })[]> {
  const key = `${workspace} ${brands.map((b) => b.slug).join(" ")}`;
  let hit = perBrandCache.get(what);
  if (!hit || hit.key !== key || Date.now() - hit.at > 60_000) {
    const data = Promise.all(
      brands.map((b) =>
        fetch(url(encodeURIComponent(b.slug)))
          .then((res) => (res.ok ? res.json() : { data: [] }))
          .then((body: { data: T[] }) => body.data.map((x) => ({ ...x, brandInfo: b })))
          .catch(() => []),
      ),
    ).then((all) => all.flat());
    hit = { key, at: Date.now(), data };
    perBrandCache.set(what, hit);
  }
  return hit.data as Promise<(T & { brandInfo: BrandInfo })[]>;
}
const allRules = (workspace: string, brands: BrandInfo[]) => perBrand<Rule>("rules", (b) => `/api/v1/brand/rules?brand=${b}`, workspace, brands);
const allPages = (workspace: string, brands: BrandInfo[]) => perBrand<Omit<PageHit, "brandInfo">>("pages", (b) => `/api/v1/brands/${b}/pages`, workspace, brands);

/** Hidden, or under a hidden page: only editors open it (lib/pages.ts hiddenSlugs, kept out of every page's bundle). */
function hidden(p: PageHit, all: PageHit[]): boolean {
  for (let at: PageHit | undefined = p, n = 0; at && n < 50; n++) {
    if (at.hidden) return true;
    const parent: string | null = at.parent;
    at = all.find((x) => x.brandInfo === p.brandInfo && x.slug === parent);
  }
  return false;
}

/** A brand page in the app: the reader, in focus mode from focus mode, and the builder from the builder. */
function pageHref(p: PageHit) {
  if (location.pathname.endsWith("/guidelines/edit")) return builderPath(p.brandInfo.slug, { page: p.slug });
  const focus = location.pathname.endsWith("/guidelines") && new URLSearchParams(location.search).get("focus") === "1";
  return guidelinesPath(p.brandInfo.slug, { page: p.slug, focus: focus ? "1" : null });
}

// Values carry ids so each stays unique to cmdk, but hex ids would fuzzy-match
// short queries ("face", "bad"); they are taken out before scoring.
const UUID = /[0-9a-f]{8}-[0-9a-f-]{27}/gi;
// The library fallback always matches, and always last: a positive score
// below any real match's.
const LIBRARY = "search the library";
const filter = (value: string, search: string, keywords?: string[]) =>
  value === LIBRARY ? Number.MIN_VALUE : defaultFilter(value.replace(UUID, ""), search, keywords);

const CONTEXT = { workspace: "Workspace", organization: "Organization", account: "Account", development: "Development" };
const THEMES = [
  { value: "light", label: "Light", icon: IconSun },
  { value: "dark", label: "Dark", icon: IconMoon },
  { value: "system", label: "System", icon: IconDeviceDesktop },
];

/**
 * What the page on show adds to ⌘K (the builder: its section's actions,
 * blocks to insert, where to go on the page), first in the list. With
 * nothing typed only those marked `top` show, so the list stays short.
 */
export type PageCommand = {
  id: string;
  label: string;
  group: string;
  icon?: React.ReactNode;
  shortcut?: string[];
  keywords?: string[];
  top?: boolean;
  run(): void;
};

/**
 * ⌘K: find anything (assets, brand pages and rules, collections, saved searches,
 * brands, settings), go anywhere, or do the common things, from any page.
 * Empty, it opens on what you had lately; everything else waits for a query,
 * so the list stays short. Assets come from the same search the library runs.
 */
export function CommandPalette({
  open,
  onOpenChange,
  collections,
  brands,
  searches,
  onUpload,
  onNewCollection,
  onShortcuts,
  commands,
}: {
  /** The page's own commands, asked for as it opens. */
  commands?: () => PageCommand[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collections: Collection[];
  brands: BrandInfo[];
  searches: SavedSearch[];
  onUpload?: () => void;
  onNewCollection?: () => void;
  onShortcuts: () => void;
}) {
  const navigate = useNavigate();
  const can = useCan();
  const me = useMe();
  const workspace = me?.workspace.id ?? "";
  const { setOpenMobile } = useSidebar();
  const { theme, setTheme } = useTheme();
  const [stored] = useRecents();
  const recents = liveRecents(stored, collections, searches).slice(0, 5);
  const [q, setQ] = useState("");
  const term = q.trim();
  // Which query these answer: results for an older one are never shown as this one's.
  const [assets, setAssets] = useState<{ q: string; data: Asset[] }>({ q: "", data: [] });
  const pending = !!term && assets.q !== term;
  const [rules, setRules] = useState<RuleHit[]>([]);
  const [pages, setPages] = useState<PageHit[]>([]);

  // However it opens (⌘K, a button in the phone's sheet), it opens over the page, not over the sheet.
  useEffect(() => {
    if (open) setOpenMobile(false);
  }, [open, setOpenMobile]);

  // Assets as you type, settled for a beat. A failure still answers the query, with nothing, so it never spins forever.
  useEffect(() => {
    if (!open || !term) return;
    let live = true;
    const t = setTimeout(async () => {
      let data: Asset[] = [];
      try {
        const res = await fetch(`/api/v1/assets?limit=8&q=${encodeURIComponent(term)}`);
        if (res.ok) data = (await res.json()).data;
      } catch {}
      if (live) setAssets({ q: term, data });
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [term, open]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    void allRules(workspace, brands).then((r) => live && setRules(r));
    void allPages(workspace, brands).then((p) => live && setPages(p));
    return () => {
      live = false;
    };
  }, [open, workspace, brands]);

  const close = () => {
    onOpenChange(false);
    setOpenMobile(false);
    setQ("");
  };
  const go = (href: string) => {
    close();
    navigate(href);
  };
  // Already at that address: only the anchor moves, and the page there hears it (hashchange), as its own links do.
  const jump = (href: string) => {
    const u = new URL(href, location.href);
    if (u.pathname !== location.pathname || u.search !== location.search) return go(href);
    close();
    location.assign(u.hash);
  };
  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  const several = brands.length > 1;
  const team = can("member.manage") || can("share.manage");
  const sections = me ? allowedFor(me) : [];
  const readable = can("brand.edit") ? pages : pages.filter((p) => !hidden(p, pages));
  // Asked for as it opens and on each key: they read the page as it is now.
  const own = open && commands ? commands().filter((c) => term || c.top) : [];
  const ownGroups = [...new Set(own.map((c) => c.group))];

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setQ("");
      }}
      title="Jump to"
      description="Find assets, brand pages and rules, collections, saved searches and settings, or go anywhere."
      className="sm:max-w-xl"
      filter={filter}
      loop
    >
      {/* CommandInput's row, with a spinner in place of the glass while assets load. */}
      <div data-slot="command-input-wrapper" className="flex items-center gap-2 border-b px-3">
        {pending ? (
          <IconLoader2 className="size-4 shrink-0 animate-spin opacity-50" aria-hidden />
        ) : (
          <IconSearch className="size-4 shrink-0 opacity-50" aria-hidden />
        )}
        <CommandPrimitive.Input
          value={q}
          onValueChange={setQ}
          placeholder="Search assets, pages, rules, collections, or type a command"
          className="placeholder:text-muted-foreground flex h-10 w-full bg-transparent py-3 text-base outline-hidden md:text-sm"
        />
      </div>
      <CommandList className="max-h-[min(60vh,28rem)]">
        {ownGroups.map((g) => (
          <CommandGroup key={g} heading={g}>
            {own
              .filter((c) => c.group === g)
              .map((c) => (
                <CommandItem key={c.id} value={`${g} ${c.label} ${c.id}`} keywords={c.keywords} onSelect={run(c.run)}>
                  {c.icon} <span className="truncate">{c.label}</span>
                  {c.shortcut && (
                    <CommandShortcut className="tracking-normal">
                      <Kbd keys={c.shortcut} />
                    </CommandShortcut>
                  )}
                </CommandItem>
              ))}
          </CommandGroup>
        ))}
        {pending && (
          <CommandLoading label="Searching assets">
            <div className="grid gap-1 p-2" aria-hidden>
              {[60, 45, 70].map((w) => (
                <div key={w} className="flex h-10 items-center gap-2 px-2">
                  <Skeleton className="size-8 shrink-0 rounded" />
                  <Skeleton className="h-4" style={{ width: `${w}%` }} />
                </div>
              ))}
            </div>
          </CommandLoading>
        )}

        {term && assets.q === term && assets.data.length > 0 && (
          <CommandGroup heading="Assets">
            {assets.data.map((a) => (
              <CommandItem
                key={a.id}
                // The server already matched it (captions, fields); the query keeps it past cmdk's own filter.
                value={`asset ${a.id} ${a.metadata?.title ?? ""} ${a.filename}`}
                keywords={[q, ...a.tags]}
                onSelect={() => go(`/?asset=${a.id}`)}
              >
                <span className="bg-muted relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded border">
                  {hasPreview(a) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/a/${a.id}/w_64,f_webp`} alt="" className="size-full object-contain" />
                  ) : (
                    <IconPhoto />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate">{a.metadata?.title || a.filename}</p>
                  {a.metadata?.title && <p className="text-muted-foreground truncate text-xs">{a.filename}</p>}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {term && readable.length > 0 && (
          <CommandGroup heading="Brand pages">
            {readable.map((p) => (
              <CommandItem
                key={`${p.brandInfo.slug}/${p.slug}`}
                value={`page ${p.brandInfo.slug} ${p.slug} ${p.title} ${several ? p.brandInfo.name : ""}`}
                onSelect={() => go(pageHref(p))}
              >
                <IconFileText /> <span className="truncate">{p.title}</span>
                {several && <CommandShortcut className="tracking-normal">{p.brandInfo.name}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {term && rules.length > 0 && (
          <CommandGroup heading="Brand rules">
            {rules.map((r) => (
              <CommandItem
                key={r.id}
                value={`rule ${r.id} ${ruleLabel(r.key)} ${r.key} ${r.context ?? ""} ${several ? r.brandInfo.name : ""}`}
                keywords={[String(r.value), r.usage ?? ""]}
                onSelect={() => jump(`${builderPath(r.brandInfo.slug, { context: r.context })}#rule-${r.key}`)}
              >
                {r.type === "color" ? (
                  <span className="size-4 shrink-0 rounded-sm border" style={{ background: String(r.value).slice(0, 7) }} />
                ) : (
                  <IconBook />
                )}
                <span className="truncate">{ruleLabel(r.key)}</span>
                {r.context && <span className="text-muted-foreground truncate text-xs">{contextLabel(r.context)}</span>}
                <CommandShortcut className="tracking-normal">{several ? r.brandInfo.name : r.key}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!term && recents.length > 0 && (
          <CommandGroup heading="Recent">
            {recents.map((r) => (
              <CommandItem key={`${r.kind}-${r.id}`} value={`recent ${r.kind} ${r.id} ${r.label}`} onSelect={() => go(r.href)}>
                {RECENT_ICON[r.kind]} <span className="truncate">{r.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Actions">
          {onUpload && (
            <CommandItem value="Upload files add" onSelect={run(onUpload)}>
              <IconUpload /> Upload files
            </CommandItem>
          )}
          {onNewCollection && (
            <CommandItem value="New collection create" onSelect={run(onNewCollection)}>
              <IconFolderPlus /> New collection
            </CommandItem>
          )}
          <CommandItem value="Connect an agent key mcp claude cursor" onSelect={() => go("/connections")}>
            <IconRobot /> Agents: connect one, manage keys
          </CommandItem>
          <CommandItem value="Keyboard shortcuts keys help" onSelect={run(onShortcuts)}>
            <IconKeyboard /> Keyboard shortcuts
            <CommandShortcut className="tracking-normal">
              <Kbd keys={["?"]} />
            </CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Go to">
          <CommandItem value="Assets library all" onSelect={() => go("/")}>
            <IconPhoto /> Assets
            <CommandShortcut className="tracking-normal">
              <GoKeys to="/" />
            </CommandShortcut>
          </CommandItem>
          <CommandItem value="Guidelines brand rules" onSelect={() => go("/brand")}>
            <IconBook /> Guidelines
            <CommandShortcut className="tracking-normal">
              <GoKeys to="/brand" />
            </CommandShortcut>
          </CommandItem>
          <CommandItem value="Review suggested approve" onSelect={() => go("/?review")}>
            <IconInbox /> Review
            <CommandShortcut className="tracking-normal">
              <GoKeys to="/?review" />
            </CommandShortcut>
          </CommandItem>
          <CommandItem value="Activity history" onSelect={() => go("/activity")}>
            <IconActivity /> Activity
            <CommandShortcut className="tracking-normal">
              <GoKeys to="/activity" />
            </CommandShortcut>
          </CommandItem>
          {team && (
            <CommandItem value="Team people members organization" onSelect={() => go("/team")}>
              <IconUsers /> Team
              <CommandShortcut className="tracking-normal">
                <GoKeys to="/team" />
              </CommandShortcut>
            </CommandItem>
          )}
          {can("member.manage") && (
            <CommandItem value="Invite people someone add member email" onSelect={() => go("/team?invite")}>
              <IconMailPlus /> Invite people
            </CommandItem>
          )}
          {can("portal.manage") && (
            <CommandItem value="Portals brand portal press kit partner hub retailer" onSelect={() => go("/portals")}>
              <IconWorld /> Portals
            </CommandItem>
          )}
          {can("share.manage") && (
            <CommandItem value="Share and upload links request uploads collect guest photographer agency" onSelect={() => go("/team?tab=sharing")}>
              <IconShare /> Share and upload links
            </CommandItem>
          )}
          {can("audit.read") && (
            <CommandItem value="Audit log who changed access sign-ins keys" onSelect={() => go("/team?tab=audit")}>
              <IconHistory /> Audit log
            </CommandItem>
          )}
          <CommandItem value="Settings workspace organization members fields domains branding email usage profile" onSelect={() => go("/settings")}>
            <IconSettings /> Settings
            <CommandShortcut className="tracking-normal">
              <GoKeys to="/settings" />
            </CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {term && sections.length > 0 && (
          <CommandGroup heading="Settings">
            {sections.map((s) => (
              <CommandItem key={`${s.context}/${s.id}`} value={`settings ${s.context} ${s.label} ${s.description}`} onSelect={() => go(hrefFor(me!, s))}>
                <s.icon /> {s.label}
                <CommandShortcut className="tracking-normal">{CONTEXT[s.context]}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {term && collections.length > 0 && (
          <CommandGroup heading="Collections">
            {collections.map((c) => (
              <CommandItem key={c.id} value={`collection ${c.id} ${c.name}`} onSelect={() => go(`/?collection=${c.id}`)}>
                <CollectionIcon icon={c.icon} /> {c.name}
                <CommandShortcut className="tracking-normal">{c.count}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {term && searches.length > 0 && (
          <CommandGroup heading="Saved searches">
            {searches.map((s) => (
              <CommandItem key={s.id} value={`search ${s.id} ${s.name}`} onSelect={() => go(`/?${canonical(s.query)}`)}>
                <IconBookmark /> {s.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {term && several && (
          <CommandGroup heading="Brands">
            {brands.map((b) => (
              <CommandItem key={b.slug} value={`brand ${b.slug} ${b.name}`} onSelect={() => go(brandHref(b))}>
                <IconBook /> {b.name}
                <CommandShortcut className="tracking-normal">{b.rules} rules</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {term && (
          <CommandGroup heading="Theme">
            {THEMES.map((t) => (
              <CommandItem key={t.value} value={`theme ${t.label} mode appearance`} onSelect={run(() => setTheme(t.value))}>
                <t.icon /> {t.label} theme
                {theme === t.value && <CommandShortcut className="tracking-normal">Current</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Always there, always last: the library's full search, when a quick match isn't enough. It is also the empty state. */}
        {term && (
          <CommandGroup>
            <CommandItem value={LIBRARY} onSelect={() => go(`/?q=${encodeURIComponent(term)}`)}>
              <IconFileSearch /> <span className="truncate">Search the library for &ldquo;{term}&rdquo;</span>
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
      <div className="text-muted-foreground flex items-center gap-4 border-t px-3 py-2 text-xs max-sm:hidden" aria-hidden>
        <span className="flex items-center gap-1">
          <Kbd keys={["↑"]} />
          <Kbd keys={["↓"]} /> to move
        </span>
        <span className="flex items-center gap-1">
          <Kbd keys={["↵"]} /> to open
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Kbd keys={["esc"]} /> to close
        </span>
      </div>
    </CommandDialog>
  );
}
