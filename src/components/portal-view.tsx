"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { IconDownload, IconLock, IconPhoto, IconSearch, IconSend } from "@tabler/icons-react";
import { ThemeToggle, useAccent } from "@/components/brand";
import { Guidelines } from "@/components/brand-editor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { inkOn } from "@/lib/color";
import { formatBytes } from "@/lib/filename";
import type { Rule } from "@/lib/rules";
import { cn } from "@/lib/utils";

type Theme = { logo: string | null; accent: string | null; background: string | null; icon?: string | null; product?: string };
type Download = { preset: string; label: string; hint: string; url: string; filename: string };
type Item = {
  id: string;
  filename: string;
  title: string | null;
  description: string | null;
  creator: string | null;
  copyright: string | null;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  thumbnail: string | null;
  preview: string | null;
  downloads: Download[];
};
type View = {
  portal: {
    slug: string;
    name: string;
    intro: string | null;
    organization: string;
    access: "public" | "password" | "members";
    expiresAt: string | null;
    theme: Theme;
    collections: { id: string; name: string; count: number }[];
    brands: { slug: string; name: string }[];
  };
  data: Item[];
  total: number;
};

type State =
  | { at: "loading" }
  | { at: "error"; title: string; message: string }
  | { at: "gate"; name: string; access: "password" | "members"; theme: Theme; wrong: boolean }
  | { at: "open"; view: View };

const PAGE = 60;

/**
 * /p/{slug}, or a portal's own domain: a brand portal, for visitors outside
 * the team. Everything comes from GET /api/v1/portal/{slug}, like any
 * client's. A password, or the key from an approved request's link, stays in
 * this tab.
 */
export function PortalView({ slug }: { slug: string }) {
  const [state, setState] = useState<State>({ at: "loading" });
  const [q, setQ] = useState("");
  const [collection, setCollection] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  /** A brand's slug, or null for the assets. In the address as ?brand=, so a tab can be linked to. */
  // Read once in the browser; the server renders "Opening…" either way, so nothing differs on hydration.
  const [brand, setBrand] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("brand")));
  const pass = useRef<{ password?: string; key?: string }>({});
  const store = `portal:${slug}`;

  const headers = useCallback((): HeadersInit => {
    const h: Record<string, string> = {};
    if (pass.current.password) h["X-Portal-Password"] = pass.current.password;
    if (pass.current.key) h["X-Portal-Key"] = pass.current.key;
    return h;
  }, []);

  const fetchPage = useCallback(
    async (offset: number) => {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (q.trim()) params.set("q", q.trim());
      if (collection) params.set("collection", collection);
      const res = await fetch(`/api/v1/portal/${slug}?${params}`, { headers: headers(), cache: "no-store" });
      return { res, body: await res.json().catch(() => ({})) };
    },
    [slug, q, collection, headers],
  );

  const load = useCallback(async () => {
    const { res, body } = await fetchPage(0);
    if (res.ok) return setState({ at: "open", view: body });
    const e = body.error ?? {};
    if (e.code === "password") {
      return setState({ at: "gate", name: e.detail?.name ?? "Portal", access: e.detail?.access ?? "password", theme: e.detail?.theme ?? {}, wrong: !!pass.current.password });
    }
    setState({
      at: "error",
      title: e.code === "gone" ? "This portal has closed" : e.code === "not_found" ? "There is no portal here" : "Something went wrong",
      message: e.code === "gone" ? "Ask whoever sent you here for another way in." : (e.message ?? "Try again in a moment."),
    });
  }, [fetchPage]);

  useEffect(() => {
    // A key arrives in the link (?key=), is kept for this tab, and leaves the address bar.
    try {
      const url = new URL(window.location.href);
      const key = url.searchParams.get("key");
      if (key) {
        sessionStorage.setItem(`${store}:key`, key);
        url.searchParams.delete("key");
        history.replaceState(null, "", url);
      }
      pass.current = { key: sessionStorage.getItem(`${store}:key`) ?? undefined, password: sessionStorage.getItem(`${store}:password`) ?? undefined };
    } catch {
      // Storage refused (a private window): the key in the link still works this once.
      pass.current = { key: new URLSearchParams(window.location.search).get("key") ?? undefined };
    }
  }, [store]);

  useEffect(() => {
    // Search waits for typing to pause; the first load and a new collection go at once.
    const t = setTimeout(() => void load(), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const shown = state.at === "open" ? state.view.portal : null;
  useEffect(() => {
    if (shown) document.title = `${shown.name} - ${shown.theme.product ?? shown.organization}`;
  }, [shown]);

  if (state.at === "loading") return <Shell theme={null}><p className="text-muted-foreground py-24 text-center text-sm">Opening…</p></Shell>;
  if (state.at === "error") {
    return (
      <Shell theme={null}>
        <div className="mx-auto max-w-md py-24 text-center">
          <h1 className="text-xl font-semibold">{state.title}</h1>
          <p className="text-muted-foreground mt-2 text-sm">{state.message}</p>
        </div>
      </Shell>
    );
  }
  if (state.at === "gate") {
    return (
      <Gate
        slug={slug}
        state={state}
        onPassword={(p) => {
          pass.current.password = p;
          try {
            sessionStorage.setItem(`${store}:password`, p);
          } catch {}
          void load();
        }}
      />
    );
  }

  const { portal, data, total } = state.view;
  // Assets when it has collections; a portal of guidelines alone opens on its first brand.
  const tabs = [...(portal.collections.length ? [{ id: "", name: "Assets" }] : []), ...portal.brands.map((b) => ({ id: b.slug, name: b.name }))];
  const at = tabs.find((t) => t.id === (brand ?? ""))?.id ?? tabs[0]?.id ?? "";
  const pick = (id: string) => {
    setBrand(id || null);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("brand", id);
    else url.searchParams.delete("brand");
    history.replaceState(null, "", url);
  };
  return (
    <Shell theme={portal.theme}>
      <Hero name={portal.name} intro={portal.intro} theme={portal.theme} organization={portal.organization} />
      {tabs.length > 1 && (
        <Tabs value={at} onValueChange={pick} className="border-b">
          <div className="mx-auto w-full max-w-6xl overflow-x-auto px-4 sm:px-8">
            <TabsList variant="line" aria-label="What this portal shows">
              {tabs.map((t) => (
                <TabsTrigger key={t.id || "assets"} value={t.id}>
                  {t.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
      )}
      {at ? (
        <BrandTab key={at} slug={slug} brand={at} headers={headers} />
      ) : (
        <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <IconSearch className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input type="search" placeholder={`Search ${portal.name}`} value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" aria-label="Search" />
            </div>
          </div>
          {portal.collections.length > 1 && (
            <nav className="flex flex-wrap gap-2" aria-label="Collections">
              <Chip active={!collection} onClick={() => setCollection(null)}>
                All
              </Chip>
              {portal.collections.map((c) => (
                <Chip key={c.id} active={collection === c.id} onClick={() => setCollection(c.id)}>
                  {c.name} <span className="opacity-60">{c.count}</span>
                </Chip>
              ))}
            </nav>
          )}
          <Grid items={data} total={total} />
          {data.length < total && (
            <div className="text-center">
              <Button
                variant="outline"
                disabled={more}
                onClick={async () => {
                  setMore(true);
                  const { res, body } = await fetchPage(data.length);
                  setMore(false);
                  if (res.ok) setState({ at: "open", view: { ...body, data: [...data, ...body.data] } });
                }}
              >
                Show more
              </Button>
            </div>
          )}
        </main>
      )}
      <footer className="text-muted-foreground border-t py-6 text-center text-xs">
        {portal.organization}
        {portal.expiresAt && ` · open until ${new Date(portal.expiresAt).toLocaleDateString()}`}
      </footer>
    </Shell>
  );
}

/** One of the portal's brands: its guidelines, read-only, from GET /api/v1/portal/{slug}/brands/{brand}. */
function BrandTab({ slug, brand, headers }: { slug: string; brand: string; headers: () => HeadersInit }) {
  const [got, setGot] = useState<{ brand: { name: string }; data: Rule[] } | { error: string } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/v1/portal/${slug}/brands/${encodeURIComponent(brand)}`, { headers: headers(), cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (live) setGot(res.ok ? body : { error: body.error?.message ?? "These guidelines didn't load. Try again in a moment." });
      })
      .catch(() => live && setGot({ error: "These guidelines didn't load. Try again in a moment." }));
    return () => {
      live = false;
    };
  }, [slug, brand, headers]);
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-8">
      {!got ? (
        <p className="text-muted-foreground py-16 text-center text-sm">Opening…</p>
      ) : "error" in got ? (
        <p className="text-muted-foreground py-16 text-center text-sm">{got.error}</p>
      ) : (
        <Guidelines name={got.brand.name} rules={got.data} />
      )}
    </main>
  );
}

function Shell({ theme, children }: { theme: Theme | null; children: React.ReactNode }) {
  useAccent(theme?.accent);
  return <div className="min-h-svh">{children}</div>;
}

function Hero({ name, intro, theme, organization }: { name: string; intro: string | null; theme: Theme; organization: string }) {
  const ink = theme.background ? inkOn(theme.background) : undefined;
  return (
    <header className={cn("border-b", !theme.background && "bg-muted/40")} style={theme.background ? { background: theme.background, color: ink } : undefined}>
      <div className="mx-auto flex w-full max-w-6xl items-start gap-4 px-4 pt-6 pb-10 sm:px-8">
        <div className="min-w-0 flex-1 space-y-4">
          {theme.logo ? (
            // A rendition already sized for this: next/image would only resize it again.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={theme.logo} alt={organization} className="h-10 w-auto max-w-[240px] object-contain object-left" />
          ) : (
            <p className="text-sm font-semibold opacity-80">{organization}</p>
          )}
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{name}</h1>
          {intro && <p className="max-w-2xl text-base whitespace-pre-line opacity-80">{intro}</p>}
        </div>
        <ThemeToggle className={cn(ink && "hover:bg-black/10")} />
      </div>
    </header>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors",
        active ? "bg-primary text-primary-foreground border-transparent" : "hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function meta(a: Item) {
  return [a.width && a.height ? `${a.width}×${a.height}` : null, formatBytes(a.size), a.creator && `© ${a.creator}`].filter(Boolean).join(" · ");
}

function Downloads({ item, variant = "ghost" }: { item: Item; variant?: "ghost" | "default" }) {
  if (item.downloads.length === 1) {
    const d = item.downloads[0];
    return (
      <Button variant={variant} size={variant === "ghost" ? "icon-sm" : "default"} asChild>
        <a href={d.url} download={d.filename} aria-label={`Download ${item.filename}`} title={d.hint}>
          <IconDownload />
          {variant !== "ghost" && "Download"}
        </a>
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={variant === "ghost" ? "icon-sm" : "default"} aria-label={`Download ${item.filename}`}>
          <IconDownload />
          {variant !== "ghost" && "Download"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Download as</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {item.downloads.map((d) => (
          <DropdownMenuItem key={d.preset} asChild>
            <a href={d.url} download={d.filename}>
              <span className="font-medium">{d.label}</span>
              <span className="text-muted-foreground ml-auto pl-4 text-xs">{d.hint}</span>
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Grid({ items, total }: { items: Item[]; total: number }) {
  const [open, setOpen] = useState<Item | null>(null);
  if (!items.length) return <p className="text-muted-foreground py-24 text-center">Nothing here matches.</p>;
  return (
    <>
      <p className="text-muted-foreground text-sm">
        {total} {total === 1 ? "file" : "files"}
      </p>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((a) => (
          <li key={a.id} className="overflow-hidden rounded-lg border">
            <button type="button" onClick={() => setOpen(a)} className="bg-muted flex aspect-square w-full items-center justify-center" aria-label={`Look at ${a.title ?? a.filename}`}>
              {a.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.thumbnail} alt={a.title ?? a.filename} className="size-full object-contain" loading="lazy" />
              ) : (
                <IconPhoto className="text-muted-foreground size-8" />
              )}
            </button>
            <div className="flex items-center gap-2 p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={a.title ?? a.filename}>
                  {a.title ?? a.filename}
                </p>
                <p className="text-muted-foreground truncate text-xs">{meta(a)}</p>
              </div>
              <Downloads item={a} />
            </div>
          </li>
        ))}
      </ul>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        {open && (
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{open.title ?? open.filename}</DialogTitle>
              <DialogDescription>{[meta(open), open.copyright].filter(Boolean).join(" · ")}</DialogDescription>
            </DialogHeader>
            {open.preview && (
              <div className="bg-muted flex max-h-[60vh] items-center justify-center overflow-hidden rounded-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={open.preview} alt={open.title ?? open.filename} className="max-h-[60vh] w-auto object-contain" />
              </div>
            )}
            {open.description && <p className="text-sm">{open.description}</p>}
            <div className="flex justify-end">
              <Downloads item={open} variant="default" />
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

/** Not in yet: a password, a sign-in, and for either, a way to ask. */
function Gate({ slug, state, onPassword }: { slug: string; state: Extract<State, { at: "gate" }>; onPassword: (p: string) => void }) {
  useAccent(state.theme.accent);
  const id = useId();
  const [asking, setAsking] = useState(false);
  const [asked, setAsked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="bg-muted/40 flex min-h-svh items-center justify-center p-4">
      <div className="bg-background w-full max-w-sm space-y-6 rounded-xl border p-6 shadow-sm sm:p-8">
        <div className="space-y-3">
          {state.theme.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={state.theme.logo} alt="" className="h-8 w-auto max-w-[200px] object-contain object-left" />
          )}
          <h1 className="text-xl font-semibold tracking-tight">{state.name}</h1>
          <p className="text-muted-foreground text-sm text-pretty">
            {asked
              ? "Thanks: you'll hear back by email. Nothing more to do here for now."
              : state.access === "password"
                ? "This portal asks for a password. No password? Ask for access."
                : "This portal is for the team behind it. Sign in if you are one of them, or ask for access."}
          </p>
        </div>
        {!asked && !asking && state.access === "password" && (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              onPassword(String(new FormData(e.currentTarget).get("password") ?? ""));
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor={id}>Password</Label>
              <Input id={id} name="password" type="password" required autoFocus aria-invalid={state.wrong || undefined} />
              {state.wrong && <p className="text-destructive text-sm">That password isn&apos;t right.</p>}
            </div>
            <Button type="submit">
              <IconLock /> Open
            </Button>
          </form>
        )}
        {!asked && !asking && state.access === "members" && (
          <Button asChild className="w-full">
            <a href={`/login?next=${encodeURIComponent(`/p/${slug}`)}`}>Sign in</a>
          </Button>
        )}
        {!asked && !asking && (
          <Button variant="outline" className="w-full" onClick={() => setAsking(true)}>
            Ask for access
          </Button>
        )}
        {asking && !asked && (
          <form
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const res = await fetch(`/api/v1/portal/${slug}/requests`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: f.get("email"), name: f.get("name") || undefined, note: f.get("note") || undefined }),
              });
              if (res.ok) return setAsked(true);
              setError((await res.json().catch(() => null))?.error?.message ?? "That didn't go through");
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor={`${id}-email`}>Email</Label>
              <Input id={`${id}-email`} name="email" type="email" required autoFocus />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${id}-name`}>Name</Label>
              <Input id={`${id}-name`} name="name" maxLength={120} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${id}-note`}>Who you are, and what it&apos;s for</Label>
              <Textarea id={`${id}-note`} name="note" maxLength={2000} rows={3} />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button type="submit">
              <IconSend /> Send
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
