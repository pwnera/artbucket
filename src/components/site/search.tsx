"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { IconFileText, IconHash, IconLoader2, IconPalette, IconPhoto, IconSearch } from "@tabler/icons-react";
import { TYPING } from "@/components/site/anchors";
import { useSite } from "@/components/site/site-context";
import type { SitePortal } from "@/components/site/site-view";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { depthFirst, type Hit, type Media, searchSite, tree } from "@/lib/site";

type Found = Hit & { to: string; brand?: string };
type Answer = { q: string; hits: Found[]; assets: Media[] };

const ICON = { page: IconFileText, section: IconHash, rule: IconPalette };

/**
 * Search the site, opened from "/" anywhere outside a field. On a portal it
 * asks GET /portal/{slug}/search, which looks through every brand the portal
 * shows at the visitor's level and its collections' assets; results link to
 * `base` + the hit's path + #section. Elsewhere (the in-app reader, the dev
 * page) it looks through what the view carries: every page's title and lede,
 * this page's sections and the rules it shows. The keyboard moves through
 * results (cmdk), Enter opens one, Esc closes.
 */
export function SiteSearch({
  open,
  onOpenChange,
  go,
  portal,
  base = "",
  headers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  go: (href: string) => void;
  portal?: SitePortal;
  base?: string;
  headers?: () => HeadersInit;
}) {
  const { view, href } = useSite();
  const [q, setQ] = useState("");
  const term = q.trim();
  const [answer, setAnswer] = useState<Answer>({ q: "", hits: [], assets: [] });
  // Chosen: focus goes where the result leads, not back to the button.
  const chosen = useRef(false);

  // "/" opens it, ahead of the app's own "/" (which would open its palette): capture, then preventDefault.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof Element && e.target.closest(TYPING)) return;
      e.preventDefault();
      onOpenChange(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onOpenChange]);

  // Off a portal: the view's own pages, readable ones only, with the sections of the one at hand.
  const pages = useMemo(
    () =>
      depthFirst(tree(view.nav, false))
        .filter((n) => !n.locked)
        .map((n) => ({
          slug: n.slug,
          title: n.title,
          eyebrow: n.eyebrow ?? undefined,
          lede: n.lede ?? undefined,
          sections: n.slug === view.page?.slug ? view.page.sections : [],
        })),
    [view.nav, view.page],
  );
  const local = useMemo<Answer | null>(
    () => (portal ? null : { q: term, hits: searchSite(pages, view.rules, term).map((h) => ({ ...h, to: href(h.page, h.section) })), assets: [] }),
    [portal, pages, view.rules, term, href],
  );

  // On a portal, as the reader types, settled for a beat. A failure still answers the query, with nothing, so it never spins.
  const slug = portal?.slug;
  const lang = view.lang;
  useEffect(() => {
    if (!open || !slug || !term) return;
    const ac = new AbortController();
    const t = setTimeout(async () => {
      let got: Omit<Answer, "q"> = { hits: [], assets: [] };
      try {
        const u = new URLSearchParams({ q: term, ...(lang && { lang }) });
        const res = await fetch(`/api/v1/portal/${slug}/search?${u}`, { headers: headers?.(), cache: "no-store", signal: ac.signal });
        if (res.ok) {
          const { data } = (await res.json()) as { data: { hits: (Hit & { brand: string; path: string })[]; assets: Media[] } };
          got = { hits: data.hits.map((h) => ({ ...h, to: `${base}${h.path}${h.section ? `#${h.section}` : ""}` })), assets: data.assets };
        }
      } catch {
        if (ac.signal.aborted) return;
      }
      setAnswer({ q: term, ...got });
    }, 150);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [open, slug, term, lang, base, headers]);

  const shown = local ?? answer;
  const ready = !!term && shown.q === term;
  const several = (portal?.brands.length ?? 0) > 1;
  const brandName = (b?: string) => portal?.brands.find((x) => x.slug === b)?.name;
  const pick = (to: string) => {
    chosen.current = true;
    onOpenChange(false);
    setQ("");
    go(to);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setQ("");
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="top-[max(1rem,12vh)] translate-y-0 gap-0 overflow-hidden p-0"
        onCloseAutoFocus={(e) => {
          if (chosen.current) e.preventDefault();
          chosen.current = false;
        }}
      >
        <DialogTitle className="sr-only">Search {portal ? "this portal" : view.brand.name}</DialogTitle>
        <DialogDescription className="sr-only">Pages, sections and rules{portal ? ", and assets" : ""}. Arrows move through the results; Enter opens one.</DialogDescription>
        <Command shouldFilter={false} loop>
          <div className="flex items-center gap-2 border-b px-3">
            {term && !ready ? (
              <IconLoader2 aria-hidden className="size-4 shrink-0 animate-spin opacity-50" />
            ) : (
              <IconSearch aria-hidden className="size-4 shrink-0 opacity-50" />
            )}
            <CommandPrimitive.Input
              value={q}
              onValueChange={setQ}
              aria-label="Search"
              placeholder={portal ? "Search pages, rules and assets" : "Search pages, sections and rules"}
              className="placeholder:text-muted-foreground flex h-12 w-full bg-transparent py-3 text-base outline-hidden"
            />
          </div>
          <CommandList className="max-h-[min(60svh,28rem)]">
            {ready && <CommandEmpty>Nothing found for &ldquo;{term}&rdquo;.</CommandEmpty>}
            {!term && <p className="text-muted-foreground px-4 py-6 text-center text-sm">Type a word or two: every one must match.</p>}
            {ready && shown.hits.length > 0 && (
              <CommandGroup heading="Pages">
                {shown.hits.map((h, i) => {
                  const Icon = ICON[h.kind];
                  // Two rules can land on one section: the rank tells them apart.
                  return (
                    <CommandItem key={i} value={`hit ${i}`} onSelect={() => pick(h.to)} className="items-start">
                      <Icon aria-hidden className="mt-0.5" />
                      <div className="min-w-0">
                        <p className="truncate">
                          {h.title}
                          {several && <span className="text-muted-foreground"> &middot; {brandName(h.brand)}</span>}
                        </p>
                        {h.snippet && <p className="text-muted-foreground line-clamp-2 text-xs">{h.snippet}</p>}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            {ready && shown.assets.length > 0 && (
              <CommandGroup heading="Assets">
                {shown.assets.map((a) => (
                  <CommandItem key={a.id} value={`asset ${a.id}`} onSelect={() => pick(`${base || "/"}?view=assets&asset=${a.id}`)}>
                    <span className="bg-muted relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded border">
                      {a.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.thumbnail} alt="" className="size-full object-contain" />
                      ) : (
                        <IconPhoto aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0 truncate">{a.title || a.filename}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
