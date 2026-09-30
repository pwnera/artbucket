"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconDots,
  IconExternalLink,
  IconLock,
  IconPencil,
  IconPhoto,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconTrash,
  IconUserQuestion,
  IconUsers,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { LibraryPicker } from "@/components/asset-picker";
import { copy } from "@/components/brand-values";
import { ColorField } from "@/components/color-field";
import { send } from "@/components/collections";
import { Confirm } from "@/components/confirm";
import { Fold } from "@/components/fold";
import { CopyButton } from "@/components/copy-button";
import { IconButton } from "@/components/icon-button";
import { AppHeader, PageHeader } from "@/components/page";
import { useShell } from "@/components/shell";
import { Thumb } from "@/components/thumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { builderPath } from "@/lib/site";
import { DEFAULT_PRESETS, PORTAL_PRESETS, PORTAL_SLUG, PRESET_IDS, subdomainRefusal, type PortalAccess, type PortalPreset, type PortalSite } from "@/lib/portal";
import { ago, exact } from "@/lib/time";

export type Portal = {
  id: string;
  slug: string;
  name: string;
  intro: string | null;
  access: PortalAccess;
  password: boolean;
  expiresAt: string | null;
  expired: boolean;
  presets: PortalPreset[];
  theme: { logo: string | null; accent: string | null; background: string | null };
  collections: { id: string; name: string }[];
  /** `publishedAt` null: never published, so visitors see nothing of it. */
  brands: { slug: string; name: string; publishedAt: string | null }[];
  site: PortalSite;
  domain: {
    host: string;
    verified: boolean;
    record: { type: "TXT"; name: string; value: string };
    cname: { type: "CNAME"; name: string; value: string } | null;
  } | null;
  url: string;
  pending: number;
  createdBy: string;
};

type Request = {
  id: string;
  email: string;
  name: string | null;
  note: string | null;
  status: "pending" | "approved" | "denied";
  expiresAt: string | null;
  createdAt: string;
  url: string | null;
  /** access asks in at the door; the rest come from a request section on a page. */
  kind: "access" | "asset" | "review" | "question";
  page: string | null;
  section: string | null;
};

/** What a request section asked for, as its row says it. */
const ASKED: Record<Exclude<Request["kind"], "access">, string> = { asset: "Asset", review: "Review", question: "Question" };

const ACCESS: Record<PortalAccess, { label: string; hint: string; icon: typeof IconWorld }> = {
  public: { label: "Anyone with the address", hint: "Open to all; search engines stay out unless you list it", icon: IconWorld },
  password: { label: "Whoever has the password", hint: "Anyone else can ask for access", icon: IconLock },
  members: { label: "People in this workspace", hint: "Signed in; anyone else can ask for access", icon: IconUsers },
};

/** The Select's value for "no domain": /p/{slug} only. */
const NO_DOMAIN = "none";

const slugOf = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    // Cut first, then trim: a long name must not end its address in a dash.
    .slice(0, 48)
    .replace(/^-+|-+$/g, "");

/** An address as it is typed: spaces become dashes, anything else not allowed drops, a dash may trail until the next letter. */
const typedSlug = (raw: string) =>
  raw
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .slice(0, 48);

/** A date as the date input holds it, in the owner's own day, not UTC's. */
const localDay = (d: Date | string) => new Date(d).toLocaleDateString("en-CA");

/** Newest names in their place: the list is alphabetical, as the API sends it. */
const upsert = (rows: Portal[], p: Portal) =>
  (rows.some((r) => r.id === p.id) ? rows.map((r) => (r.id === p.id ? p : r)) : [...rows, p]).sort((a, b) => a.name.localeCompare(b.name));

/**
 * Brand portals: a front door for people outside the team onto chosen
 * collections and brand guidelines, themed, with downloads made for a
 * purpose. Each from /api/v1/portals like any client's; `?open={id}` opens
 * one's requests. `portalDomain`: the server's PORTAL_DOMAIN, where each
 * portal answers at {slug}.{portalDomain} too.
 */
export function Portals({ portals, portalDomain }: { portals: Portal[]; portalDomain?: string }) {
  const { collections, brands, openCollection } = useShell();
  const router = useRouter();
  const params = useSearchParams();
  // Rows follow the server's list, and take a save at once rather than after a refresh.
  const [rows, setRows] = useState(portals);
  const [seen, setSeen] = useState(portals);
  if (portals !== seen) {
    setSeen(portals);
    setRows(portals);
  }
  // Arriving from a brand (publish, the launch checklist): a new portal showing it, named for it, open at once.
  const fresh = params.get("new");
  const freshBrand = fresh ? brands.find((b) => b.slug === fresh) : undefined;
  const [editing, setEditing] = useState<Portal | "new" | null>(() => (freshBrand ? "new" : null));
  // Arriving from a request's email: its requests, open, once.
  const opened = params.get("open");
  const [requests, setRequests] = useState<Portal | null>(() => (opened && portals.find((x) => x.id === opened)) || null);
  const any = collections.length > 0 || brands.length > 0;
  // Arriving from a brand's Sharing tab: only the portals showing it.
  const only = brands.find((b) => b.slug === params.get("brand"));
  const shown = only ? rows.filter((p) => p.brands.some((b) => b.slug === only.slug)) : rows;

  return (
    <>
      <AppHeader trail={[{ label: "Portals" }]} />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-6 pb-16 md:px-6">
        <PageHeader
          icon={<IconWorld />}
          title="Portals"
          description="A front door for press, partners and retailers onto the collections and brand guidelines you pick: your look, only approved assets, and downloads sized for the job."
        >
          <Button size="sm" onClick={() => setEditing("new")} disabled={!any}>
            <IconPlus /> New portal
          </Button>
        </PageHeader>
        {only && (
          <p className="text-muted-foreground -mt-2 text-sm">
            The portals showing {only.name}.{" "}
            <Link href="/portals" className="text-foreground underline underline-offset-2">
              Show all
            </Link>
          </p>
        )}
        {rows.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconWorld />
              </EmptyMedia>
              <EmptyTitle>No portals yet</EmptyTitle>
              <EmptyDescription>
                {any
                  ? "Pick a few collections and brands, a logo and a color: a press kit or a partner hub, at an address of its own. Expired, archived and unapproved assets never show."
                  : "A portal shows collections and brand guidelines: make a collection or a brand first."}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {any ? (
                <Button onClick={() => setEditing("new")}>
                  <IconPlus /> New portal
                </Button>
              ) : (
                <Button onClick={() => openCollection("new")}>
                  <IconPlus /> New collection
                </Button>
              )}
            </EmptyContent>
          </Empty>
        ) : (
          <ul className="divide-y rounded-lg border">
            {!shown.length && only && <li className="text-muted-foreground p-6 text-center text-sm">No portal shows {only.name} yet.</li>}
            {shown.map((p) => (
              <li key={p.id} className="hover:bg-muted/50 relative flex flex-wrap items-center gap-3 px-3 py-3 text-sm transition-colors">
                <span
                  className="size-8 shrink-0 rounded-md border"
                  style={{ background: p.theme.background ?? p.theme.accent ?? "var(--muted)" }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-medium">
                    {/* The whole row opens it: this button's box stretches over the row, under its actions. */}
                    <button type="button" onClick={() => setEditing(p)} className="truncate text-left after:absolute after:inset-0">
                      {p.name}
                    </button>
                    {p.access === "password" && <IconLock className="text-muted-foreground size-3.5 shrink-0" aria-label="Password" />}
                    {p.access === "members" && <IconUsers className="text-muted-foreground size-3.5 shrink-0" aria-label="Members" />}
                    {p.expired && <Badge variant="outline">Offline</Badge>}
                    {p.domain && !p.domain.verified && <Badge variant="warning">Domain not verified</Badge>}
                    <Unpublished brands={p.brands} />
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {p.url.replace(/^https?:\/\//, "")} · {[...p.collections, ...p.brands].map((c) => c.name).join(", ")}
                  </p>
                </div>
                <div className="relative flex items-center gap-1">
                  {/* A public portal needs no access asks, but its pages' request sections still ask. */}
                  {(p.access !== "public" || p.brands.length > 0) && (
                    <Button variant={p.pending ? "default" : "ghost"} size="sm" onClick={() => setRequests(p)}>
                      <IconUserQuestion /> {p.pending ? `${p.pending} waiting` : "Requests"}
                    </Button>
                  )}
                  <CopyButton text={p.url} label="Copy the address" what="the address" size="icon-sm" />
                  <IconButton variant="ghost" label="Open it in a new tab" asChild>
                    <a href={p.url} target="_blank" rel="noreferrer">
                      <IconExternalLink />
                    </a>
                  </IconButton>
                  <RowMenu
                    portal={p}
                    onEdit={() => setEditing(p)}
                    onChanged={(saved) => setRows((rs) => upsert(rs, saved))}
                    onDeleted={() => setRows((rs) => rs.filter((r) => r.id !== p.id))}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editing && (
        <PortalDialog
          portal={editing === "new" ? null : editing}
          collections={collections}
          brands={brands}
          showing={editing === "new" && freshBrand ? freshBrand : undefined}
          portalDomain={portalDomain}
          onClose={() => {
            setEditing(null);
            // Off the address, or a reload would open it again.
            if (fresh) router.replace("/portals", { scroll: false });
          }}
          onSaved={(saved, said) => {
            setRows((rs) => upsert(rs, saved));
            if (said) {
              toast.success(said === "made" ? `${saved.name} is live` : `Saved ${saved.name}`, {
                action: { label: "Open", onClick: () => window.open(saved.url, "_blank", "noopener") },
                cancel: { label: "Copy link", onClick: () => void copy(saved.url, "the address") },
              });
            }
          }}
          onDeleted={(gone) => setRows((rs) => rs.filter((r) => r.id !== gone))}
        />
      )}
      {requests && (
        <RequestsDialog
          portal={requests}
          onClose={(changed) => {
            setRequests(null);
            // Off the address, or the next render would open it again.
            if (opened) router.replace("/portals", { scroll: false });
            if (changed) router.refresh();
          }}
        />
      )}
    </>
  );
}

/**
 * A portal's own menu, beside its row: edit it, take it offline now or bring
 * it back (POST .../close, PATCH expiresAt: null), or delete it. Offline, its
 * address says it is closed, and everything about it stays for its return.
 */
function RowMenu({ portal: p, onEdit, onChanged, onDeleted }: { portal: Portal; onEdit: () => void; onChanged: (p: Portal) => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const toggle = async () => {
    const saved: Portal | null = p.expired
      ? await send("PATCH", `/api/v1/portals/${p.id}`, { expiresAt: null })
      : await send("POST", `/api/v1/portals/${p.id}/close`);
    if (!saved) return;
    onChanged(saved);
    toast.success(saved.expired ? `${saved.name} is offline` : `${saved.name} is back online`, {
      description: saved.expired ? "Its address says it is closed. Nothing about it is lost." : undefined,
    });
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton variant="ghost" label={`More for the ${p.name} portal`}>
            <IconDots />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={onEdit}>
            <IconPencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void toggle()}>
            {p.expired ? <IconPlayerPlay /> : <IconPlayerPause />} {p.expired ? "Bring back online" : "Take offline"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            <IconTrash /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Confirm
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${p.name}?`}
        says="Its address stops working at once, for everyone who has it. To pause it instead, take it offline."
        action="Delete"
        run={async () => {
          const r = await send("DELETE", `/api/v1/portals/${p.id}`);
          if (!r) return null;
          toast.success(`${p.name} is gone`);
          onDeleted();
          return r;
        }}
      />
    </>
  );
}

function Color({ label, unset, value, onChange }: { label: string; unset: string; value: string | null; onChange: (v: string | null) => void }) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <ColorField id={id} label={label} value={value ?? "#6d4aff"} onChange={onChange} />
        {value ? (
          <IconButton variant="ghost" label={`Reset ${label.toLowerCase()}`} onClick={() => onChange(null)}>
            <IconX />
          </IconButton>
        ) : (
          <span className="text-muted-foreground text-xs">{unset}</span>
        )}
      </div>
    </div>
  );
}

type Pickable = { id: string; name: string; count?: number; private?: boolean };

/** Checkboxes, and the picked ones in the order the portal shows them, to move up or down. */
function Picks({
  legend,
  items,
  picked,
  onChange,
  children,
}: {
  legend: string;
  items: Pickable[];
  picked: string[];
  onChange: (next: string[]) => void;
  /** Below the list: a hint, or more about the picked ones. */
  children?: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const shown = q.trim() ? items.filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase())) : items;
  const move = (at: number, by: number) => {
    const next = [...picked];
    [next[at], next[at + by]] = [next[at + by], next[at]];
    onChange(next);
  };
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      {items.length > 8 && <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter" aria-label={`Filter ${legend.toLowerCase()}`} className="h-8" />}
      <div className="grid max-h-48 gap-1.5 overflow-y-auto rounded-md border p-2">
        {shown.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              aria-label={c.name}
              checked={picked.includes(c.id)}
              onCheckedChange={(on) => onChange(on ? [...picked, c.id] : picked.filter((x) => x !== c.id))}
            />
            <span className="min-w-0 truncate">{c.name}</span>
            {c.private && (
              <IconLock
                className="text-muted-foreground size-3.5 shrink-0"
                aria-label="Private in the library: its approved assets still show in the portal"
              />
            )}
            {/* The library's count: the portal shows only the approved, unexpired ones among them. */}
            {c.count !== undefined && <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">{c.count} in the library</span>}
          </label>
        ))}
        {!shown.length && <p className="text-muted-foreground p-1 text-sm">Nothing matches.</p>}
      </div>
      {picked.length > 1 && (
        <ol aria-label="Shown in this order" className="grid gap-1">
          {picked.map((pid, i) => {
            const it = items.find((x) => x.id === pid);
            return (
              it && (
                <li key={pid} className="bg-muted/50 flex items-center gap-2 rounded-md py-0.5 pr-0.5 pl-2 text-sm">
                  <span className="text-muted-foreground w-4 text-xs tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{it.name}</span>
                  <IconButton variant="ghost" size="icon-xs" label={`Move ${it.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <IconArrowUp />
                  </IconButton>
                  <IconButton variant="ghost" size="icon-xs" label={`Move ${it.name} down`} disabled={i === picked.length - 1} onClick={() => move(i, 1)}>
                    <IconArrowDown />
                  </IconButton>
                </li>
              )
            );
          })}
        </ol>
      )}
      {children}
    </fieldset>
  );
}

type Form = {
  name: string;
  slug: string;
  picked: string[];
  pickedBrands: string[];
  access: PortalAccess;
  password: string;
  expires: string;
  presets: PortalPreset[];
  intro: string;
  logo: string | null;
  accent: string | null;
  background: string | null;
  domain: string;
  site: PortalSite;
};

const formOf = (p: Portal | null): Form => ({
  name: p?.name ?? "",
  slug: p?.slug ?? "",
  picked: p?.collections.map((c) => c.id) ?? [],
  pickedBrands: p?.brands.map((b) => b.slug) ?? [],
  access: p?.access ?? "public",
  password: "",
  // The owner's day, not UTC's: west of UTC, slicing the ISO string moved it a day on every save.
  expires: p?.expiresAt ? localDay(p.expiresAt) : "",
  presets: p?.presets ?? DEFAULT_PRESETS,
  intro: p?.intro ?? "",
  logo: p?.theme.logo ?? null,
  accent: p?.theme.accent ?? null,
  background: p?.theme.background ?? null,
  domain: p?.domain?.host ?? NO_DOMAIN,
  site: p?.site ?? {},
});

/** What surrounds the pages, in a few words: which of header links, footer and terms are set. */
function siteSummary(site: PortalSite) {
  const quick = site.quick?.length ?? 0;
  const footer = site.footer && (site.footer.text || site.footer.links?.length || site.footer.credit || site.footer.feedback);
  const parts = [quick && `${quick} header ${quick === 1 ? "link" : "links"}`, footer && "a footer", site.terms && "terms"].filter(Boolean);
  return parts.length ? parts.join(", ") : "None";
}

/** Make or change a portal: what it shows, how it looks, who gets in, where it lives. */
function PortalDialog({
  portal,
  collections,
  brands,
  showing,
  portalDomain,
  onClose,
  onSaved,
  onDeleted,
}: {
  portal: Portal | null;
  collections: Pickable[];
  brands: { slug: string; name: string }[];
  /** A new portal for this brand: it starts picked, and the portal named for it. */
  showing?: { slug: string; name: string };
  portalDomain?: string;
  onClose: () => void;
  /** `said`: made or saved here, to toast; without, it changed elsewhere (a domain verified). */
  onSaved: (saved: Portal, said?: "made" | "saved") => void;
  onDeleted: (id: string) => void;
}) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [start] = useState(() => {
    const f = formOf(portal);
    return showing ? { ...f, name: showing.name, slug: slugOf(showing.name), pickedBrands: [showing.slug] } : f;
  });
  const [f, setF] = useState(start);
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));
  const [slugTouched, setSlugTouched] = useState(!!portal);
  const [hosts, setHosts] = useState<{ host: string; portal: string | null }[] | null>(null);
  const [current, setCurrent] = useState(portal);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  /** The library picker, open for the logo or for a quick grab entry. */
  const [picking, setPicking] = useState<"logo" | number | null>(null);
  useEffect(() => {
    fetch("/api/v1/portals/domains")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((b) => setHosts(b.data), () => setHosts([]));
  }, []);
  const dirty = JSON.stringify(f) !== JSON.stringify(start);
  const expiryChanged = f.expires !== start.expires;
  const ready = !!f.name.trim() && (f.picked.length > 0 || f.pickedBrands.length > 0);
  // With no domain of its own: {slug}.{portalDomain}, but for a members portal (sessions stay on the app's) or an old address refused there.
  const sub = portalDomain && f.access !== "members" && !(f.slug === current?.slug && subdomainRefusal(f.slug)) ? portalDomain : null;
  const here = typeof window === "undefined" ? null : window.location;
  const address =
    f.domain !== NO_DOMAIN
      ? `https://${f.domain}`
      : sub
        ? `${here?.protocol ?? "https:"}//${f.slug}.${sub}${here?.port ? `:${here.port}` : ""}`
        : `${here?.origin ?? ""}/p/${f.slug}`;
  const byDefault = sub ? `${f.slug || "its-address"}.${sub}` : `/p/${f.slug || "its-address"}`;
  // Whether a new address is free, asked as it is typed; the portal's own is.
  const [check, setCheck] = useState<{ slug: string; reason: string | null } | null>(null);
  useEffect(() => {
    if (!PORTAL_SLUG.test(f.slug) || f.slug === current?.slug) return;
    const ask = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/v1/portals/address?${new URLSearchParams({ slug: f.slug, ...(current && { portal: current.id }) })}`, { signal: ask.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((b) => b && setCheck({ slug: b.data.slug, reason: b.data.reason }), () => {});
    }, 300);
    return () => {
      clearTimeout(t);
      ask.abort();
    };
  }, [f.slug, current]);
  const verdict = check && check.slug === f.slug && f.slug !== current?.slug ? check : null;

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    const payload = {
      name: f.name.trim(),
      slug: f.slug,
      intro: f.intro.trim() || null,
      access: f.access,
      ...(f.password && { password: f.password }),
      // Only when it changed: a closed portal re-sending its past date could never be renamed.
      ...((!current || expiryChanged) && { expiresAt: f.expires ? new Date(`${f.expires}T23:59:59`).toISOString() : null }),
      presets: f.presets,
      theme: { logo: f.logo, accent: f.accent, background: f.background },
      collections: f.picked,
      brands: f.pickedBrands,
      domain: f.domain === NO_DOMAIN ? null : f.domain,
      site: siteOut(f.site, f.access),
    };
    setBusy(true);
    const saved: Portal | null = await send(current ? "PATCH" : "POST", current ? `/api/v1/portals/${current.id}` : "/api/v1/portals", payload);
    setBusy(false);
    if (!saved) return;
    onSaved(saved, current ? "saved" : "made");
    onClose();
  }

  async function verify() {
    if (!current) return;
    setChecking(true);
    const p: Portal | null = await send("POST", `/api/v1/portals/${current.id}/domain`);
    setChecking(false);
    if (!p || !p.domain) return;
    setCurrent(p);
    toast.success(`${p.domain.host} is verified: the portal answers there`);
    onSaved(p);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="pb-0 sm:max-w-xl"
        guard={{ dirty, onDiscard: onClose, ...(ready && { onSave: () => formRef.current?.requestSubmit() }) }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && ready && !busy) {
            e.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="pr-6 leading-snug break-words">{current ? `Edit ${current.name}` : "New portal"}</DialogTitle>
          <DialogDescription>
            Only approved, unexpired assets show, in the collections and on the brands&apos; guidelines alike, and they leave the portal the moment that changes.
          </DialogDescription>
        </DialogHeader>
        <form
          ref={formRef}
          id={id}
          onSubmit={save}
          // A field the browser refuses may sit in a folded section: unfold it, so it can be shown.
          onInvalidCapture={(e) => (e.target as Element).closest("details")?.setAttribute("open", "")}
          className="grid gap-5"
        >
          <div className="grid gap-2">
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input
              id={`${id}-name`}
              value={f.name}
              required
              maxLength={120}
              placeholder="Press kit"
              onChange={(e) => set({ name: e.target.value, ...(!slugTouched && { slug: slugOf(e.target.value) }) })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-slug`}>Address</Label>
            <div className="flex items-center gap-1">
              {!sub && <span className="text-muted-foreground text-sm">/p/</span>}
              <Input
                id={`${id}-slug`}
                value={f.slug}
                required
                pattern="[a-z0-9](?:[a-z0-9\-]{0,46}[a-z0-9])?"
                title="Lowercase letters, digits and dashes, not ending in a dash"
                aria-describedby={`${id}-slug-hint ${id}-slug-check`}
                aria-invalid={!!verdict?.reason || undefined}
                onChange={(e) => (setSlugTouched(true), set({ slug: typedSlug(e.target.value) }))}
              />
              {sub && <span className="text-muted-foreground shrink-0 text-sm">.{sub}</span>}
            </div>
            <p id={`${id}-slug-check`} aria-live="polite" className="text-xs empty:hidden">
              {verdict &&
                (verdict.reason ? (
                  <span className="text-destructive">{verdict.reason}</span>
                ) : (
                  <span className="text-success flex items-center gap-1.5">
                    <IconCheck className="size-3.5" /> Available{current && `: ${current.slug} will keep leading here`}
                  </span>
                ))}
            </p>
            <div id={`${id}-slug-hint`} className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
              {f.slug ? (
                <>
                  <span className="truncate font-mono">{address}</span>
                  <CopyButton text={address} label="Copy the address" what="the address" />
                </>
              ) : (
                "Letters, digits and dashes, e.g. press-kit"
              )}
            </div>
          </div>
          {brands.length > 0 && (
            <Picks
              legend="Brands whose pages it shows"
              items={brands.map((b) => ({ id: b.slug, name: b.name }))}
              picked={f.pickedBrands}
              onChange={(pickedBrands) => set({ pickedBrands })}
            >
              {f.pickedBrands.length > 0 && (
                <div className="grid gap-1.5">
                  <p className="text-muted-foreground text-xs">Visitors read each brand as last released, never the draft.</p>
                  <ul aria-label="What visitors read" className="grid gap-1">
                    {f.pickedBrands.map((slug) => (
                      <PublishState key={slug} brand={brands.find((b) => b.slug === slug) ?? { slug, name: slug }} />
                    ))}
                  </ul>
                </div>
              )}
            </Picks>
          )}
          {collections.length > 0 && (
            <Picks legend="Collections, in its Assets view" items={collections} picked={f.picked} onChange={(picked) => set({ picked })}>
              {brands.length > 0 && <p className="text-muted-foreground text-xs">Or add a Collection section to a brand page.</p>}
            </Picks>
          )}
          {current && current.brands.length > 0 && (
            <p className="text-muted-foreground text-xs">
              How often its pages are read is in{" "}
              <Link href="/insights" className="text-foreground underline-offset-2 hover:underline">
                Insights
              </Link>
              .
            </p>
          )}
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Who gets in</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(ACCESS) as PortalAccess[]).map((a) => {
                const A = ACCESS[a];
                return (
                  <label
                    key={a}
                    className="has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:outline-ring flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
                  >
                    <input type="radio" name="access" value={a} checked={f.access === a} onChange={() => set({ access: a })} className="sr-only" />
                    <A.icon className="text-muted-foreground size-4" />
                    <span className="font-medium">{A.label}</span>
                    <span className="text-muted-foreground text-xs">{A.hint}</span>
                  </label>
                );
              })}
            </div>
            {f.access === "members" && f.domain !== NO_DOMAIN && (
              <p className="text-muted-foreground text-xs">
                On its own domain, only people you approve get in; members sign in at /p/{f.slug || "its-address"}.
              </p>
            )}
          </fieldset>
          {f.access === "password" && (
            <div className="grid gap-2">
              <Label htmlFor={`${id}-pw`}>Password</Label>
              <Input
                id={`${id}-pw`}
                type="password"
                minLength={4}
                maxLength={200}
                autoComplete="new-password"
                required={!current?.password}
                placeholder={current?.password ? "Unchanged" : ""}
                value={f.password}
                onChange={(e) => set({ password: e.target.value })}
              />
            </div>
          )}
          <div className="grid gap-2">
            <p className="text-sm font-medium">More options</p>
            <Fold title="Look" summary={f.logo || f.accent || f.background ? "Its own" : "The organization's logo and color"}>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <span className="text-sm leading-none font-medium">Logo</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPicking("logo")}
                  aria-label={f.logo ? "Change the logo" : "Choose a logo"}
                  className="bg-checker text-muted-foreground relative flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border"
                >
                  {f.logo ? <Thumb key={f.logo} src={`/a/${f.logo}/w_160,f_webp`} alt="" /> : <IconPhoto className="size-5" />}
                </button>
                <Button type="button" variant="outline" size="sm" onClick={() => setPicking("logo")}>
                  {f.logo ? "Change" : "Choose from the library"}
                </Button>
                {f.logo && (
                  <IconButton variant="ghost" label="Remove the logo" onClick={() => set({ logo: null })}>
                    <IconX />
                  </IconButton>
                )}
              </div>
              <p className="text-muted-foreground text-xs">An approved image. Without one, the organization&apos;s own.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Color label="Accent" unset="The organization's" value={f.accent} onChange={(accent) => set({ accent })} />
              <Color label="Header background" unset="None" value={f.background} onChange={(background) => set({ background })} />
            </div>
          </div>
            </Fold>
            <Fold title="Downloads" summary={f.presets.map((p) => PORTAL_PRESETS[p].label).join(", ") || "None picked"}>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Images download as</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {PRESET_IDS.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    aria-label={PORTAL_PRESETS[p].label}
                    checked={f.presets.includes(p)}
                    onCheckedChange={(on) => set({ presets: on ? PRESET_IDS.filter((x) => x === p || f.presets.includes(x)) : f.presets.filter((x) => x !== p) })}
                  />
                  {PORTAL_PRESETS[p].label}
                  <span className="text-muted-foreground text-xs">{PORTAL_PRESETS[p].hint}</span>
                </label>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">Anything that isn&apos;t an image (a PDF, a video, a font) downloads as itself.</p>
          </fieldset>
            </Fold>
            <Fold title="Welcome text" summary={f.intro.trim() ? "Written" : "None"}>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-intro`}>Introduction</Label>
            <Textarea
              id={`${id}-intro`}
              rows={3}
              maxLength={4000}
              value={f.intro}
              onChange={(e) => set({ intro: e.target.value })}
              placeholder="Logos, product shots and executive portraits for press. Questions: press@example.com"
              aria-describedby={`${id}-intro-hint`}
            />
            <p id={`${id}-intro-hint`} className="text-muted-foreground text-xs">
              Markdown works: **bold**, [links](https://example.com), lists.
            </p>
          </div>
            </Fold>
            <Fold title="Header links, footer and terms" summary={siteSummary(f.site)}>
          <SiteFields
            site={f.site}
            onChange={(site) => set({ site })}
            access={f.access}
            brands={f.pickedBrands.map((slug) => brands.find((b) => b.slug === slug) ?? { slug, name: slug })}
            onPickAsset={setPicking}
          />
            </Fold>
            <Fold title="Open until" summary={f.expires ? `Until ${new Date(`${f.expires}T12:00:00`).toLocaleDateString()}` : "Until you close it"} open={!!current?.expired}>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-until`}>Open until</Label>
            <div className="flex items-center gap-2">
              {/* A min only once changed: a closed portal's past date would otherwise block every save. */}
              <Input
                id={`${id}-until`}
                type="date"
                value={f.expires}
                min={expiryChanged ? localDay(new Date()) : undefined}
                onChange={(e) => set({ expires: e.target.value })}
                className="w-44"
              />
              {current?.expired && !expiryChanged && (
                <Button type="button" variant="ghost" size="sm" onClick={() => set({ expires: "" })}>
                  Reopen
                </Button>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              {current?.expired && !expiryChanged
                ? `Closed on ${new Date(current.expiresAt!).toLocaleDateString()}. Pick a new date or clear it to reopen.`
                : "Empty: until you close it."}
            </p>
          </div>
            </Fold>
            <Fold
              title="Domain"
              summary={f.domain === NO_DOMAIN ? byDefault : f.domain}
              open={!!current?.domain && !current.domain.verified}
            >
          <div className="grid gap-2">
            <Label htmlFor={`${id}-domain`}>Domain of its own</Label>
            <Select value={f.domain} onValueChange={(domain) => set({ domain })}>
              <SelectTrigger id={`${id}-domain`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_DOMAIN}>None: {byDefault}</SelectItem>
                {current?.domain && !current.domain.verified && <SelectItem value={current.domain.host}>{current.domain.host} (not verified)</SelectItem>}
                {hosts?.map((h) => (
                  <SelectItem key={h.host} value={h.host} disabled={!!h.portal && h.portal !== current?.slug}>
                    {h.host}
                    {h.portal && h.portal !== current?.slug && <span className="text-muted-foreground">: /p/{h.portal}</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              The organization&apos;s verified domains, but its default. Add and verify one in Settings, Domains.
            </p>
            {current?.domain && current.domain.host === f.domain && (
              current.domain.verified ? (
                <p className="text-success flex items-center gap-1.5 text-xs">
                  <IconCheck className="size-3.5" /> Verified: the portal answers at {current.domain.host}
                </p>
              ) : (
                <div className="bg-muted/50 grid gap-2 rounded-md p-3 text-xs">
                  {current.domain.cname ? (
                    <>
                      <p>At your DNS host, point it here with a CNAME record:</p>
                      <p className="flex items-center gap-2">
                        <span className="font-mono break-all">
                          {current.domain.cname.name} → {current.domain.cname.value}
                        </span>
                        <CopyButton text={current.domain.cname.value} label="Copy the target" what="the target" />
                      </p>
                      <p>And add a TXT record to prove it is yours:</p>
                    </>
                  ) : (
                    <p>
                      At your DNS host, point <span className="font-mono">{current.domain.host}</span> at this server, and add a TXT record to prove it is yours:
                    </p>
                  )}
                  <p className="flex items-center gap-2">
                    <span className="font-mono break-all">{current.domain.record.name}</span>
                    <CopyButton text={current.domain.record.name} label="Copy the name" what="the name" />
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="font-mono break-all">{current.domain.record.value}</span>
                    <CopyButton text={current.domain.record.value} label="Copy the value" what="the value" />
                  </p>
                  <Button type="button" size="sm" variant="outline" className="justify-self-start" onClick={verify} pending={checking}>
                    Check now
                  </Button>
                </div>
              )
            )}
          </div>
            </Fold>
          </div>
        </form>
        {/* Stuck to the bottom: Save is never below the fold, however long the form. */}
        <DialogFooter className="bg-popover/95 sticky bottom-0 -mx-6 flex-row items-center border-t px-6 py-3 backdrop-blur">
          {current && (
            <Confirm
              title={`Delete ${current.name}?`}
              says="Its address stops working at once, for everyone who has it."
              action="Delete"
              run={async () => {
                const r = await send("DELETE", `/api/v1/portals/${current.id}`);
                if (!r) return null;
                toast.success(`${current.name} is gone`);
                onDeleted(current.id);
                onClose();
                return r;
              }}
            >
              <Button variant="ghost" className="text-destructive mr-auto">
                <IconTrash /> Delete
              </Button>
            </Confirm>
          )}
          <Button type="button" variant="outline" className="ml-auto" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={id} pending={busy} disabled={!ready}>
            {current ? "Save" : "Make it"}
            <Kbd keys={["mod", "Enter"]} className="bg-primary-foreground/15 text-primary-foreground hidden border-transparent sm:inline-flex" />
          </Button>
        </DialogFooter>
      </DialogContent>
      {picking === "logo" && (
        <LibraryPicker
          title="Pick the logo"
          description="An approved image from the library: it shows at the top of the portal and at its door."
          filter={(a) => a.mime.startsWith("image/") && a.state === "active"}
          onClose={() => setPicking(null)}
          onPick={(a) => {
            set({ logo: a.id });
            setPicking(null);
          }}
        />
      )}
      {typeof picking === "number" && (
        <LibraryPicker
          title="Pick the file"
          description="An approved asset from the library: visitors download it from the header, signed for them."
          filter={(a) => a.state === "active"}
          onClose={() => setPicking(null)}
          onPick={(a) => {
            setF((x) => ({ ...x, site: { ...x.site, quick: x.site.quick?.map((q, i) => (i === picking ? { label: q.label, asset: a.id } : q)) } }));
            setPicking(null);
          }}
        />
      )}
    </Dialog>
  );
}

/** A row's warning: a brand it carries was never published, so visitors see nothing of it. */
function Unpublished({ brands }: { brands: Portal["brands"] }) {
  const none = brands.filter((b) => !b.publishedAt);
  if (!none.length) return null;
  return (
    <Badge variant="warning" title={`Visitors see nothing of ${none.map((b) => b.name).join(", ")} until it is released`}>
      {none.length === 1 ? `${none[0].name} not released` : `${none.length} brands not released`}
    </Badge>
  );
}

/** Where a carried brand's publish stands: its latest (GET /brands/{slug}/updates), which visitors read, or none. */
function PublishState({ brand }: { brand: { slug: string; name: string } }) {
  // undefined while it loads, or when it couldn't: nothing is said rather than something wrong.
  const [last, setLast] = useState<{ version: number; publishedAt: string } | null>();
  useEffect(() => {
    let live = true;
    fetch(`/api/v1/brands/${encodeURIComponent(brand.slug)}/updates`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((b: { data: { version: number; publishedAt: string }[] }) => live && setLast(b.data[0] ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [brand.slug]);
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="min-w-0 truncate font-medium">{brand.name}</span>
      {last === null && (
        <>
          <Badge variant="warning">Not released: visitors see nothing</Badge>
          <Link href={builderPath(brand.slug)} className="text-foreground underline underline-offset-2">
            Open it to release
          </Link>
        </>
      )}
      {last && (
        <span className="text-muted-foreground" title={exact(last.publishedAt)}>
          Release @{last.version}, {new Date(last.publishedAt).toLocaleDateString()}
        </span>
      )}
    </li>
  );
}

/** Where a portal's own links may go, as the API checks them (lib/portal.ts): the web, mail, or a path on the portal. */
const HREF = "(https?://|mailto:|/(?!/)).*";

type Quick = NonNullable<PortalSite["quick"]>[number];
type Footer = NonNullable<PortalSite["footer"]>;
type FooterLink = NonNullable<Footer["links"]>[number];

const QUICK_KINDS = { page: "A page", asset: "A file", href: "An address" } as const;
type QuickKind = keyof typeof QUICK_KINDS;
const kindOf = (q: Quick): QuickKind => (q.asset !== undefined ? "asset" : q.href !== undefined ? "href" : "page");
const quickOf = (label: string, kind: QuickKind): Quick => (kind === "page" ? { label, page: "" } : kind === "asset" ? { label, asset: "" } : { label, href: "" });

/** `list` with its `i`th replaced, or dropped for null. */
const at = <T,>(list: T[], i: number, next: T | null) => (next ? list.map((x, j) => (j === i ? next : x)) : list.filter((_, j) => j !== i));

/** The site as the API takes it: empty fields left out, a file entry not yet picked dropped, and listed only on a public portal (else it is refused). */
function siteOut({ footer = {}, quick = [], terms, listed }: PortalSite, access: PortalAccess): PortalSite {
  const text = footer.text?.trim();
  const credit = footer.credit?.trim();
  const feedback = footer.feedback?.trim();
  const f: Footer = { ...(text && { text }), ...(footer.links?.length && { links: footer.links }), ...(credit && { credit }), ...(feedback && { feedback }) };
  const q = quick.filter((x) => x.page || x.asset || x.href);
  return {
    ...(Object.keys(f).length > 0 && { footer: f }),
    ...(q.length > 0 && { quick: q }),
    ...(terms?.trim() && { terms: terms.trim() }),
    ...(listed && access === "public" && { listed }),
  };
}

/** The site around a portal's pages (lib/portal.ts PortalSite): quick grab in the header, the footer, terms, and whether search engines may list it. */
function SiteFields({
  site,
  onChange,
  access,
  brands,
  onPickAsset,
}: {
  site: PortalSite;
  onChange: (next: PortalSite) => void;
  access: PortalAccess;
  /** The brands it carries, in order: a quick grab page is one of theirs. */
  brands: { slug: string; name: string }[];
  onPickAsset: (i: number) => void;
}) {
  const id = useId();
  const footer = site.footer ?? {};
  const quick = site.quick ?? [];
  const links = footer.links ?? [];
  const setQuick = (i: number, q: Quick | null) => onChange({ ...site, quick: at(quick, i, q) });
  const setFooter = (patch: Partial<Footer>) => onChange({ ...site, footer: { ...footer, ...patch } });
  const setLink = (i: number, l: FooterLink | null) => setFooter({ links: at(links, i, l) });
  return (
    <div className="grid gap-4">
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm leading-none font-medium">Quick grab</legend>
        {quick.map((q, i) => {
          const kind = kindOf(q);
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Label"
                value={q.label}
                required
                maxLength={40}
                placeholder="Logo pack"
                onChange={(e) => setQuick(i, { ...q, label: e.target.value })}
                className="h-8 w-32"
              />
              <Select value={kind} onValueChange={(k) => setQuick(i, quickOf(q.label, k as QuickKind))}>
                <SelectTrigger size="sm" aria-label="What it opens" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(QUICK_KINDS) as QuickKind[]).map((k) => (
                    <SelectItem key={k} value={k} disabled={k === "page" && !brands.length}>
                      {QUICK_KINDS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {kind === "page" && brands.length > 1 && (
                <Select value={q.brand ?? brands[0].slug} onValueChange={(brand) => setQuick(i, { ...q, brand })}>
                  <SelectTrigger size="sm" aria-label="Of the brand" className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((b) => (
                      <SelectItem key={b.slug} value={b.slug}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {/* ponytail: the page's slug typed; a picker of the brand's pages when admins mistype them. */}
              {kind === "page" && (
                <Input
                  aria-label="The page's slug"
                  value={q.page ?? ""}
                  required
                  maxLength={60}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  title="The page's slug, as in its address: logo, voice-and-tone"
                  placeholder="logo"
                  onChange={(e) => setQuick(i, { ...q, page: e.target.value.trim().toLowerCase() })}
                  className="h-8 min-w-24 flex-1"
                />
              )}
              {kind === "asset" && (
                <span className="flex flex-1 items-center gap-2">
                  {q.asset && (
                    <span className="bg-checker relative size-8 shrink-0 overflow-hidden rounded border">
                      <Thumb key={q.asset} src={`/a/${q.asset}/w_64,f_webp`} alt="" />
                    </span>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={() => onPickAsset(i)}>
                    {q.asset ? "Change the file" : "Choose a file"}
                  </Button>
                </span>
              )}
              {kind === "href" && (
                <Input
                  aria-label="Address"
                  value={q.href ?? ""}
                  required
                  maxLength={2000}
                  pattern={HREF}
                  title="https://, mailto: or a /path"
                  placeholder="https://example.com/press"
                  onChange={(e) => setQuick(i, { ...q, href: e.target.value })}
                  className="h-8 min-w-24 flex-1"
                />
              )}
              <IconButton variant="ghost" label={`Remove ${q.label || "this link"}`} onClick={() => setQuick(i, null)}>
                <IconX />
              </IconButton>
            </div>
          );
        })}
        {quick.length < 6 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() => onChange({ ...site, quick: [...quick, quickOf("", brands.length ? "page" : "href")] })}
          >
            <IconPlus /> Add a link
          </Button>
        )}
        <p className="text-muted-foreground text-xs">Up to six, pinned in the header: a page, a file to download, or an address.</p>
      </fieldset>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm leading-none font-medium">Footer</legend>
        <Textarea
          aria-label="Footer text"
          aria-describedby={`${id}-footer-hint`}
          rows={2}
          maxLength={2000}
          value={footer.text ?? ""}
          onChange={(e) => setFooter({ text: e.target.value })}
          placeholder="Questions about the brand: brand@example.com"
        />
        <p id={`${id}-footer-hint`} className="text-muted-foreground text-xs">
          Markdown works.
        </p>
        {links.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input aria-label="Link label" value={l.label} required maxLength={60} placeholder="Press" onChange={(e) => setLink(i, { ...l, label: e.target.value })} className="h-8 w-32" />
            <Input
              aria-label="Link address"
              value={l.href}
              required
              maxLength={2000}
              pattern={HREF}
              title="https://, mailto: or a /path"
              placeholder="https://example.com/press"
              onChange={(e) => setLink(i, { ...l, href: e.target.value })}
              className="h-8 min-w-0 flex-1"
            />
            <IconButton variant="ghost" label={`Remove ${l.label || "this link"}`} onClick={() => setLink(i, null)}>
              <IconX />
            </IconButton>
          </div>
        ))}
        {links.length < 8 && (
          <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setFooter({ links: [...links, { label: "", href: "" }] })}>
            <IconPlus /> Add a footer link
          </Button>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${id}-credit`}>Credit</Label>
            <Input id={`${id}-credit`} value={footer.credit ?? ""} maxLength={120} placeholder="Design by Studio North" onChange={(e) => setFooter({ credit: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-feedback`}>Feedback goes to</Label>
            <Input
              id={`${id}-feedback`}
              value={footer.feedback ?? ""}
              maxLength={2000}
              pattern={HREF}
              title="https://, mailto: or a /path"
              placeholder="mailto:brand@example.com"
              onChange={(e) => setFooter({ feedback: e.target.value })}
            />
          </div>
        </div>
      </fieldset>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-terms`}>Terms of use</Label>
        <Textarea
          id={`${id}-terms`}
          rows={3}
          maxLength={10000}
          value={site.terms ?? ""}
          onChange={(e) => onChange({ ...site, terms: e.target.value })}
          placeholder="For editorial use about Example only. Don't alter the logos."
          aria-describedby={`${id}-terms-hint`}
        />
        <p id={`${id}-terms-hint`} className="text-muted-foreground text-xs">
          Markdown. Visitors accept them once, before their first download. Empty: no terms.
        </p>
      </div>
      {access === "public" && (
        <div className="flex items-start gap-3">
          <Switch id={`${id}-listed`} checked={!!site.listed} onCheckedChange={(listed) => onChange({ ...site, listed })} aria-describedby={`${id}-listed-hint`} />
          <div className="grid gap-1">
            <Label htmlFor={`${id}-listed`}>Let search engines list it</Label>
            <p id={`${id}-listed-hint`} className="text-muted-foreground text-xs">
              Off, they are asked to stay out. Only a public portal can be listed.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Who asked in, and a yes or a no for each; a decision can be changed. */
function RequestsDialog({ portal, onClose }: { portal: Portal; onClose: (changed: boolean) => void }) {
  const [rows, setRows] = useState<Request[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  /** The request and the answer being sent, so a double click can't send two. */
  const [busy, setBusy] = useState<string | null>(null);
  const changed = useRef(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/v1/portals/${portal.id}/requests`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const b = await r.json();
        if (live) setRows(b.data ?? []);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [portal.id, attempt]);

  async function decide(r: Request, status: "approved" | "denied") {
    setBusy(`${r.id}:${status}`);
    try {
      const res = await fetch(`/api/v1/portals/${portal.id}/requests/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error?.message ?? "That didn't go through");
        return false;
      }
      changed.current = true;
      const next: Request = body.data;
      setRows((rs) => rs?.map((x) => (x.id === r.id ? next : x)) ?? null);
      if (r.kind !== "access") toast.success(status === "approved" ? "Marked done" : "Dismissed");
      else if (status === "denied") toast.success(r.status === "approved" ? `${r.email} no longer has access` : "Denied");
      else if (body.emailed) toast.success(`${r.email} has access, and a link by email`);
      else {
        // An action, not a copy after the await: Safari refuses a clipboard write that late.
        toast.success(`${r.email} has access`, {
          description: "Email is off: copy their link and send it.",
          ...(next.url && { action: { label: "Copy link", onClick: () => void copy(next.url!, "their link") } }),
        });
      }
      return true;
    } catch {
      toast.error("Couldn't reach the server. Check the connection and try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function remove(r: Request) {
    if (busy) return;
    setBusy(`${r.id}:delete`);
    const ok = await send("DELETE", `/api/v1/portals/${portal.id}/requests/${r.id}`);
    setBusy(null);
    if (!ok) return;
    changed.current = true;
    setRows((rs) => rs?.filter((x) => x.id !== r.id) ?? null);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose(changed.current)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="pr-6 leading-snug break-words">Requests · {portal.name}</DialogTitle>
          <DialogDescription>
            A yes to access gives them a link of their own, good for 90 days or until the portal closes; revoke it to take it back. Asks from a page&apos;s request section
            are marked done or dismissed.
          </DialogDescription>
        </DialogHeader>
        {failed ? (
          <Empty size="sm">
            <EmptyHeader>
              <EmptyTitle>Couldn&apos;t load the requests</EmptyTitle>
              <EmptyDescription>Check the connection and try again.</EmptyDescription>
            </EmptyHeader>
            <Button variant="outline" size="sm" onClick={() => (setFailed(false), setRows(null), setAttempt((n) => n + 1))}>
              Retry
            </Button>
          </Empty>
        ) : !rows ? (
          <ul aria-busy className="divide-y rounded-md border">
            {[0, 1].map((i) => (
              <li key={i} className="grid gap-2 p-3">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/4" />
              </li>
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <Empty size="sm">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconUserQuestion />
              </EmptyMedia>
              <EmptyTitle>Nobody has asked yet</EmptyTitle>
              <EmptyDescription>
                Requests from the portal&apos;s door and its pages&apos; request sections show here, and admins hear about each one by email.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y rounded-md border">
            {rows.map((r) => (
              <li key={r.id} className="grid gap-1.5 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{r.name ? `${r.name} · ${r.email}` : r.email}</span>
                  {r.kind !== "access" && <Badge variant="outline">{ASKED[r.kind]}</Badge>}
                  {r.kind !== "access" && r.status === "pending" && (
                    <>
                      <Button size="sm" pending={busy === `${r.id}:approved`} disabled={!!busy} onClick={() => decide(r, "approved")}>
                        <IconCheck /> Done
                      </Button>
                      <Button size="sm" variant="outline" pending={busy === `${r.id}:denied`} disabled={!!busy} onClick={() => decide(r, "denied")}>
                        Dismiss
                      </Button>
                    </>
                  )}
                  {r.kind !== "access" && r.status !== "pending" && <Badge variant={r.status === "approved" ? "success" : "outline"}>{r.status === "approved" ? "Done" : "Dismissed"}</Badge>}
                  {r.kind === "access" && r.status === "pending" && (
                    <>
                      <Button size="sm" pending={busy === `${r.id}:approved`} disabled={!!busy} onClick={() => decide(r, "approved")}>
                        <IconCheck /> Approve
                      </Button>
                      <Button size="sm" variant="outline" pending={busy === `${r.id}:denied`} disabled={!!busy} onClick={() => decide(r, "denied")}>
                        Deny
                      </Button>
                    </>
                  )}
                  {r.kind === "access" && r.status === "approved" && (
                    <>
                      <Badge variant="success">Approved{r.expiresAt ? ` until ${new Date(r.expiresAt).toLocaleDateString()}` : ""}</Badge>
                      {r.url && <CopyButton text={r.url} label="Copy their link" what="their link" size="icon-sm" />}
                      <Confirm
                        title={`Revoke ${r.email}'s access?`}
                        says="Their link stops working at once. They can ask again."
                        action="Revoke"
                        run={() => decide(r, "denied")}
                      >
                        <Button size="sm" variant="ghost" disabled={!!busy}>
                          Revoke
                        </Button>
                      </Confirm>
                    </>
                  )}
                  {r.kind === "access" && r.status === "denied" && (
                    <>
                      <Badge variant="outline">Denied</Badge>
                      <Button size="sm" variant="outline" pending={busy === `${r.id}:approved`} disabled={!!busy} onClick={() => decide(r, "approved")}>
                        Approve instead
                      </Button>
                    </>
                  )}
                  {(r.status !== "approved" || r.kind !== "access") && (
                    <IconButton
                      variant="ghost"
                      label="Forget this request"
                      pending={busy === `${r.id}:delete`}
                      disabled={!!busy}
                      onClick={() => remove(r)}
                    >
                      <IconTrash />
                    </IconButton>
                  )}
                </div>
                {r.note && <p className="text-muted-foreground">{r.note}</p>}
                {r.page && (
                  <p className="text-muted-foreground text-xs">
                    From {r.page}
                    {r.section && `#${r.section}`}
                  </p>
                )}
                <p className="text-muted-foreground text-xs" title={exact(r.createdAt)}>
                  Asked {ago(r.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
