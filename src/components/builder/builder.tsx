"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { History } from "@/components/brand-history";
import { Canvas } from "@/components/builder/canvas";
import { PublishDialog } from "@/components/builder/publish-dialog";
import { RulesSheet } from "@/components/builder/rules-sheet";
import { TopBar } from "@/components/builder/top-bar";
import { type Panel, type Transport, useBuilder } from "@/components/builder/use-builder";
import { behavior, TYPING } from "@/components/site/anchors";
import { SiteView } from "@/components/site/site-view";
import { ThemePanel } from "@/components/theme-panel";
import { TokensDialog } from "@/components/tokens-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Init } from "@/lib/builder-ops";
import { hiddenSlugs, type Section } from "@/lib/pages";
import { sendResult } from "@/lib/send";
import { firstBinding, legacyAnchor, neighbors, tree } from "@/lib/site";

/**
 * The brand builder (build spec 3.5, W6.7): canvas first, the page as readers
 * see it, in the brand's theme. /brand renders it keyed by brand slug, and
 * /design/builder on fixtures. It lays out TopBar over Canvas and draws the
 * panel b.panel names; it owns the keys (SHORTCUTS in components/shortcuts.tsx)
 * and the address: the page on show is `?page=`, and a v1 link
 * (#rule-{key}, #section-{name}) lands where lib/site.ts legacyAnchor says.
 * A phone gets the reader, with "Edit on a larger screen".
 *
 * Props:
 * - brand: the brand's slug, which the API paths name.
 * - init: what the route loaded (GET .../pages as NavEntry[] without the
 *   section count, GET .../view?page=&edit=1, GET /brand/rules as ViewRule[],
 *   the theme settings); lib/builder-ops.ts initState takes it. A new one
 *   (the route rendered again: a link, ⌘K, Back) says which page to show.
 * - transport: left out, fetch; the dev page records writes in memory.
 * - header: the host's bar over the reader on a phone (the app's AppHeader).
 */
export type BuilderProps = {
  brand: string;
  init: Init;
  transport?: Transport;
  header?: React.ReactNode;
};

export function Builder(props: BuilderProps) {
  // A brand from before pages has nothing to edit until they are laid out.
  return props.init.nav.length ? <Editor {...props} /> : <NoPages {...props} />;
}

/** A field's own undo comes first (as lib/undo.ts has it). */
const FIELD = "input, textarea, select, [contenteditable]:not([contenteditable=false])";

function Editor({ brand, init, transport, header }: BuilderProps) {
  const b = useBuilder(brand, init, transport);
  const mobile = useIsMobile();
  const root = useRef<HTMLDivElement>(null);
  // What keys, links and answers read after a render: always the latest.
  const live = useRef(b);
  useEffect(() => {
    live.current = b;
  });

  /** A section into view. The canvas prefixes ids (SiteProvider idPrefix), so the id is matched at the end. */
  const show = useCallback((id: string) => {
    root.current?.querySelector(`section[data-template][id$="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: behavior() });
  }, []);

  // A v1 link, waiting for its page to load before its section is picked.
  const landing = useRef<{ page: string; key: string | null } | null>(null);
  /** Lands a v1 link: false when the hash isn't one, or lands nowhere. */
  const land = useCallback((hash: string) => {
    if (!/^#(rule|section)-./.test(hash)) return false;
    const b = live.current;
    const { nav, pages } = b.state;
    // A page not loaded yet stands in by the keys its row lists; its section is found once it loads.
    const at = legacyAnchor(
      b.view.nav,
      nav.map((p) => ({ slug: p.slug, sections: pages.get(p.slug) ?? [{ keys: p.keys } as Section] })),
      hash,
    );
    let key: string | null = null;
    if (hash.startsWith("#rule-")) {
      key = hash.slice("#rule-".length);
      try {
        key = decodeURIComponent(key);
      } catch {
        // A stray % in a pasted link: read it as written.
      }
    }
    if (at) {
      b.open(at.page);
      landing.current = { page: at.page, key };
      return true;
    }
    // A rule no page shows: the list view has it.
    if (key && b.state.rules.some((r) => r.key === key)) {
      b.select({ rule: key });
      b.setPanel("rules");
      return true;
    }
    return false;
  }, []);

  // Arriving, and each time the route renders again (a link, ⌘K, Back): a v1 link lands, else the page the address asks for shows.
  useEffect(() => {
    if (land(location.hash)) return;
    const page = init.view.page?.slug;
    if (page && page !== live.current.state.selection.page) live.current.open(page);
  }, [init, land]);

  // A link on the page itself (#rule-{key}), or one ⌘K moved to.
  useEffect(() => {
    const onHash = () => land(location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [land]);

  // Once the landing page is at hand: its section binding the key, picked and in view.
  useEffect(() => {
    const l = landing.current;
    const sections = l && b.state.pages.get(l.page);
    if (!l || !sections) return;
    landing.current = null;
    const section = (l.key && firstBinding(sections, l.key)) || null;
    b.select({ section, rule: l.key });
    if (section) show(section);
  });

  // The address names the page on show, so a reload or a copied link opens it; switching pages adds no history.
  const slug = b.state.selection.page;
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (!slug || q.get("page") === slug) return;
    q.set("page", slug);
    window.history.replaceState(null, "", `?${q}`);
  }, [slug]);

  // The keys (components/shortcuts.tsx lists them). Never while typing or in a dialog; ⌘Z not in a field.
  const afterG = useRef(0);
  useEffect(() => {
    if (mobile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const b = live.current;
      const t = e.target instanceof Element ? e.target : null;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const id = b.state.selection.section;
      const editing = !b.state.preview;
      if (mod && !e.altKey && key === "z") {
        if (t?.closest(FIELD)) return;
        // Prevented, so an undo toast's own ⌘Z (lib/undo.ts) doesn't undo it twice.
        e.preventDefault();
        if (e.shiftKey) b.redo();
        else b.undo();
        return;
      }
      if (e.repeat || t?.closest(TYPING)) return;
      // G then a letter goes somewhere (components/shortcuts.tsx): G T is Team, not Tokens.
      if (!mod && !e.altKey && key === "g") return void (afterG.current = Date.now());
      if (Date.now() - afterG.current < 1000) return;
      if (mod) {
        if (e.altKey || e.shiftKey || key !== "d" || !id || !editing) return;
        e.preventDefault();
        b.duplicate(id);
        return;
      }
      if (e.altKey) {
        if ((e.key !== "ArrowUp" && e.key !== "ArrowDown") || !id || !editing) return;
        e.preventDefault();
        b.nudge(id, e.key === "ArrowUp" ? -1 : 1);
        // Where it moved to, once drawn there.
        requestAnimationFrame(() => show(id));
        return;
      }
      if (e.key === "Escape") {
        if (b.state.preview) b.setPreview(false);
        else if (id || b.state.selection.rule) b.select({ section: null, rule: null });
        else return;
      } else if (e.key === "Backspace") {
        if (!id || !editing) return;
        b.removeSection(id);
      } else if (key === "p") {
        b.setPreview(!b.state.preview);
      } else if (key === "h" || key === "t") {
        b.setPanel(key === "h" ? "history" : "tokens");
      } else if (key === "j" || key === "k") {
        // In the preview, the sections readers get.
        const list = (b.view.page?.sections ?? []).filter((s) => editing || !s.hidden);
        const at = list.findIndex((s) => s.id === id);
        const to = list[key === "j" ? at + 1 : Math.max(at - 1, 0)]?.id;
        if (!to) return;
        b.select({ section: to, rule: null });
        show(to);
      } else if (e.key === "[" || e.key === "]") {
        const to = neighbors(tree(b.view.nav, false), b.state.selection.page)[e.key === "[" ? "prev" : "next"];
        if (!to) return;
        b.open(to.slug);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobile, show]);

  // A phone reads: what readers get, hidden pages and sections left out.
  const readable = useMemo(() => {
    const gone = hiddenSlugs(b.state.nav);
    const page = b.view.page;
    return { ...b.view, nav: b.view.nav.filter((p) => !gone.has(p.slug)), page: page && { ...page, sections: page.sections.filter((s) => !s.hidden) } };
  }, [b.view, b.state.nav]);
  const href = useCallback(
    (page: string, section?: string) => `/brand?${new URLSearchParams({ brand, view: "read", page })}${section ? `#${section}` : ""}`,
    [brand],
  );
  const navigate = useCallback((to: string) => {
    const u = new URL(to, location.href);
    const page = u.pathname === "/brand" && u.searchParams.get("page");
    if (page) live.current.open(page);
    else location.assign(to);
  }, []);

  const panel = (p: Panel) => ({ open: b.panel === p, onOpenChange: (open: boolean) => b.setPanel(open ? p : null) });

  if (mobile)
    return (
      <div ref={root} className="flex min-w-0 flex-1 flex-col">
        {header}
        <p role="note" className="bg-muted text-muted-foreground border-b px-4 py-2 text-sm">
          Edit on a larger screen. Here, the pages show as readers see them.
        </p>
        <SiteView view={readable} href={href} top={header ? "top-14" : "top-0"} onNavigate={navigate} />
      </div>
    );

  return (
    <div ref={root} className="flex min-w-0 flex-1 flex-col">
      <TopBar b={b} />
      <Canvas b={b} />
      <ThemePanel
        slug={brand}
        theme={b.view.theme}
        {...panel("theme")}
        onPatch={(set) => b.apply({ kind: "theme", set })}
        rules={b.state.rules}
      />
      <RulesSheet b={b} {...panel("rules")} />
      {/* The sheet is modal: nothing is edited while it's open, so it keeps up by fetching on open. */}
      <History brand={b.view.brand} {...panel("history")} edits={0} onRestored={() => location.reload()} />
      <TokensDialog brand={b.view.brand} context={b.state.context ?? undefined} {...panel("tokens")} />
      <PublishDialog b={b} {...panel("publish")} />
    </div>
  );
}

/** Starter topics for a template: generate_pages `set`, six pages on one topic. ponytail: four fixed topics, a gallery of real templates later. */
const TOPICS = ["Logo", "Color", "Typography", "Voice"];

type Start = "blank" | "guided" | "template";
const STARTS: { id: Start; title: string; text: string }[] = [
  { id: "blank", title: "Blank", text: "One empty page to build on, section by section." },
  { id: "guided", title: "From your rules", text: "An overview, then a page per group of rules, each in the templates it fits." },
  { id: "template", title: "Template", text: "Six pages on one topic: ours, using it, in product, in marketing, best practices, showcase." },
];

/** A brand with no pages yet: a dialog to start blank, from its rules, or from a template; then the builder opens on them. */
function NoPages({ brand, transport = sendResult, header }: BuilderProps) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [start, setStart] = useState<Start>("guided");
  const [topic, setTopic] = useState(TOPICS[0]);
  const [busy, setBusy] = useState(false);
  const pages = `/api/v1/brands/${encodeURIComponent(brand)}/pages`;
  const create = async () => {
    setBusy(true);
    const res =
      start === "blank"
        ? await transport("PUT", `${pages}/overview`, { title: "Overview", sections: [] })
        : await transport("POST", pages, start === "template" ? { set: { topic } } : undefined);
    setBusy(false);
    if (res.ok) router.refresh();
  };
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {header}
      <div className="mx-auto grid max-w-md gap-3 px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">No pages yet</h1>
        <p className="text-muted-foreground">Start the brand&apos;s pages: blank, from its rules, or from a template.</p>
        <Button className="justify-self-center" onClick={() => setOpen(true)}>
          Create pages
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create the brand&apos;s pages</DialogTitle>
            <DialogDescription>Pick a start. Everything stays editable, and nothing shows to readers until you publish.</DialogDescription>
          </DialogHeader>
          <div role="radiogroup" aria-label="Start" className="grid gap-2">
            {STARTS.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={start === o.id}
                onClick={() => setStart(o.id)}
                className="hover:bg-accent aria-checked:border-primary aria-checked:bg-primary/5 focus-visible:ring-ring/50 grid gap-0.5 rounded-lg border p-3 text-start outline-none focus-visible:ring-3"
              >
                <span className="text-sm font-medium">{o.title}</span>
                <span className="text-muted-foreground text-sm">{o.text}</span>
              </button>
            ))}
          </div>
          {start === "template" && (
            <Select value={topic} onValueChange={setTopic}>
              <SelectTrigger aria-label="Topic" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TOPICS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={create} pending={busy}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
