"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  IconActivity,
  IconAdjustments,
  IconBook,
  IconBookmark,
  IconFolderPlus,
  IconInbox,
  IconPhoto,
  IconRobot,
  IconSunMoon,
  IconUpload,
  IconMailPlus,
  IconSettings,
  IconShare,
  IconUsers,
  IconWorld,
} from "@tabler/icons-react";
import { useTheme } from "next-themes";
import type { SavedSearch } from "@/components/app-sidebar";
import { brandHref, type BrandInfo } from "@/components/brand-switcher";
import { useCan } from "@/components/can";
import { CollectionIcon, type Collection } from "@/components/collections";
import type { Asset } from "@/components/gallery";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { canonical } from "@/lib/view";
import { contextLabel, ruleLabel, type Rule } from "@/lib/rules";
import { hasPreview } from "@/lib/preview";

/**
 * ⌘K: find anything (assets, brand rules, collections, saved searches,
 * brands), go anywhere, or do the common things, from any page. Assets come
 * from the same search the library runs; rules are fetched once per opening.
 */
export function CommandPalette({
  open,
  onOpenChange,
  collections,
  brands,
  searches,
  onUpload,
  onNewCollection,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collections: Collection[];
  brands: BrandInfo[];
  searches: SavedSearch[];
  onUpload?: () => void;
  onNewCollection?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const can = useCan();
  const { resolvedTheme, setTheme } = useTheme();
  const [q, setQ] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [rules, setRules] = useState<(Rule & { brandInfo: BrandInfo })[]>([]);

  // Assets as you type, settled for a beat.
  useEffect(() => {
    if (!open || !q.trim()) return;
    let live = true;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/v1/assets?limit=8&q=${encodeURIComponent(q.trim())}`);
      if (live && res.ok) setAssets((await res.json()).data);
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, open]);

  // Every brand's rules, once per opening: there are dozens, not thousands.
  useEffect(() => {
    if (!open) return;
    let live = true;
    Promise.all(
      brands.map(async (b) => {
        const res = await fetch(`/api/v1/brand/rules?brand=${encodeURIComponent(b.slug)}`);
        const list: Rule[] = res.ok ? (await res.json()).data : [];
        return list.map((r) => ({ ...r, brandInfo: b }));
      }),
    ).then((all) => live && setRules(all.flat()));
    return () => {
      live = false;
    };
  }, [open, brands]);

  /** Library views move within the page when you are in it; anything else navigates. */
  const go = (href: string) => {
    onOpenChange(false);
    setQ("");
    if (pathname === "/" && (href === "/" || href.startsWith("/?"))) window.history.pushState(null, "", href);
    else router.push(href);
  };
  const run = (fn: () => void) => () => {
    onOpenChange(false);
    setQ("");
    fn();
  };
  const several = brands.length > 1;

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setQ("");
      }}
      title="Search or jump to"
      description="Find assets, brand rules, collections and saved searches, or go anywhere."
      className="sm:max-w-xl"
    >
      <CommandInput value={q} onValueChange={setQ} placeholder="Search assets, rules, collections, or type a command" />
      <CommandList className="max-h-[min(60vh,28rem)]">
        <CommandEmpty>Nothing like that. Try fewer words.</CommandEmpty>

        {q.trim() && assets.length > 0 && (
          <CommandGroup heading="Assets">
            {assets.map((a) => (
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

        {q.trim() && rules.length > 0 && (
          <CommandGroup heading="Brand rules">
            {rules.map((r) => (
              <CommandItem
                key={r.id}
                value={`rule ${r.id} ${ruleLabel(r.key)} ${r.key} ${r.context ?? ""} ${several ? r.brandInfo.name : ""}`}
                keywords={[String(r.value), r.usage ?? ""]}
                onSelect={() => go(`${brandHref(r.brandInfo, r.context ?? undefined)}#rule-${r.key}`)}
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
          <CommandItem value="Connect an agent key mcp claude cursor" onSelect={() => go("/agents")}>
            <IconRobot /> Agents: connect one, manage keys
          </CommandItem>
          <CommandItem
            value="Switch theme dark light mode"
            onSelect={run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}
          >
            <IconSunMoon /> Switch to {resolvedTheme === "dark" ? "light" : "dark"} theme
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Go to">
          <CommandItem value="Assets library all" onSelect={() => go("/")}>
            <IconPhoto /> Assets
          </CommandItem>
          <CommandItem value="Guidelines brand rules" onSelect={() => go("/brand")}>
            <IconBook /> Guidelines
          </CommandItem>
          <CommandItem value="Review suggested approve" onSelect={() => go("/?review")}>
            <IconInbox /> Review
          </CommandItem>
          <CommandItem value="Activity history" onSelect={() => go("/activity")}>
            <IconActivity /> Activity
          </CommandItem>
          {can("member.manage") && (
            <>
              <CommandItem value="Team people members organization" onSelect={() => go("/team")}>
                <IconUsers /> Team
              </CommandItem>
              <CommandItem value="Invite people someone add member email" onSelect={() => go("/team?invite")}>
                <IconMailPlus /> Invite people
              </CommandItem>
            </>
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
          <CommandItem value="Settings share links audit log email workspace organization fields" onSelect={() => go("/settings")}>
            <IconSettings /> Settings
          </CommandItem>
          <CommandItem value="Custom fields schema" onSelect={() => go("/settings/workspace/fields")}>
            <IconAdjustments /> Custom fields
          </CommandItem>
        </CommandGroup>

        {collections.length > 0 && (
          <CommandGroup heading="Collections">
            {collections.map((c) => (
              <CommandItem key={c.id} value={`collection ${c.id} ${c.name}`} onSelect={() => go(`/?collection=${c.id}`)}>
                <CollectionIcon icon={c.icon} /> {c.name}
                <CommandShortcut className="tracking-normal">{c.count}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {searches.length > 0 && (
          <CommandGroup heading="Saved searches">
            {searches.map((s) => (
              <CommandItem key={s.id} value={`search ${s.id} ${s.name}`} onSelect={() => go(`/?${canonical(s.query)}`)}>
                <IconBookmark /> {s.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {several && (
          <CommandGroup heading="Brands">
            {brands.map((b) => (
              <CommandItem key={b.slug} value={`brand ${b.slug} ${b.name}`} onSelect={() => go(brandHref(b))}>
                <IconBook /> {b.name}
                <CommandShortcut className="tracking-normal">{b.rules} rules</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
