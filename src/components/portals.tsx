"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import {
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconLock,
  IconPencil,
  IconPlus,
  IconTrash,
  IconUserQuestion,
  IconUsers,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/brand";
import { copy } from "@/components/brand-values";
import { send } from "@/components/collections";
import { IconButton } from "@/components/icon-button";
import { PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_PRESETS, PORTAL_PRESETS, PRESET_IDS, type PortalAccess, type PortalPreset } from "@/lib/portal";
import type { SidebarData } from "@/lib/sidebar";

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
  domain: { host: string; verified: boolean; record: { type: "TXT"; name: string; value: string } } | null;
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
};

const ACCESS: Record<PortalAccess, { label: string; hint: string }> = {
  public: { label: "Anyone with the address", hint: "Open to all; search engines are asked to stay out" },
  password: { label: "Whoever has the password", hint: "Anyone else can ask for access" },
  members: { label: "People in this workspace", hint: "Signed in; anyone else can ask for access" },
};

const slugOf = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

/**
 * Brand portals: a front door for people outside the team onto chosen
 * collections, themed, with downloads made for a purpose. Each from
 * /api/v1/portals like any client's; `?open={id}` opens one's requests.
 */
export function Portals({ sidebar, portals }: { sidebar: SidebarData; portals: Portal[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [editing, setEditing] = useState<Portal | "new" | null>(null);
  const [requests, setRequests] = useState<Portal | null>(null);
  const opened = params.get("open");
  useEffect(() => {
    const p = opened && portals.find((x) => x.id === opened);
    // Arriving from a request's email: its requests, open.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (p) setRequests(p);
  }, [opened, portals]);

  return (
    <SidebarProvider>
      <AppSidebar me={sidebar.me} collections={sidebar.collections} brands={sidebar.brands} searches={sidebar.searches} reviewCount={sidebar.reviewCount} />
      <SidebarInset className="min-w-0">
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <span className="text-sm font-semibold">Portals</span>
          <ThemeToggle className="ml-auto" />
        </header>
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-6 pb-16 md:px-6">
          <PageHeader
            icon={<IconWorld />}
            title="Portals"
            description="A front door for press, partners and retailers onto the collections you pick: your look, only approved assets, and downloads sized for the job."
          >
            <Button size="sm" onClick={() => setEditing("new")} disabled={!sidebar.collections.length}>
              <IconPlus /> New portal
            </Button>
          </PageHeader>
          {portals.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconWorld />
                </EmptyMedia>
                <EmptyTitle>No portals yet</EmptyTitle>
                <EmptyDescription>
                  {sidebar.collections.length
                    ? "Pick a few collections, a logo and a color: a press kit or a partner hub, at an address of its own. Expired, archived and unapproved assets never show."
                    : "A portal shows collections: make one first."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="divide-y rounded-lg border">
              {portals.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-3 text-sm">
                  <span
                    className="size-8 shrink-0 rounded-md border"
                    style={{ background: p.theme.background ?? p.theme.accent ?? "var(--muted)" }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-medium">
                      {p.name}
                      {p.access === "password" && <IconLock className="text-muted-foreground size-3.5" aria-label="Password" />}
                      {p.access === "members" && <IconUsers className="text-muted-foreground size-3.5" aria-label="Members" />}
                      {p.expired && <Badge variant="outline">Closed</Badge>}
                      {p.domain && !p.domain.verified && <Badge variant="outline">Domain not verified</Badge>}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {p.url.replace(/^https?:\/\//, "")} · {p.collections.map((c) => c.name).join(", ")}
                    </p>
                  </div>
                  {p.access !== "public" && (
                    <Button variant={p.pending ? "default" : "ghost"} size="sm" onClick={() => setRequests(p)}>
                      <IconUserQuestion /> {p.pending ? `${p.pending} waiting` : "Requests"}
                    </Button>
                  )}
                  <IconButton variant="ghost" label="Copy the address" onClick={() => copy(p.url, "the address")}>
                    <IconCopy />
                  </IconButton>
                  <IconButton variant="ghost" label="Open it" asChild>
                    <a href={p.url} target="_blank" rel="noreferrer">
                      <IconExternalLink />
                    </a>
                  </IconButton>
                  <IconButton variant="ghost" label={`Edit ${p.name}`} onClick={() => setEditing(p)}>
                    <IconPencil />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SidebarInset>
      {editing && (
        <PortalDialog
          portal={editing === "new" ? null : editing}
          collections={sidebar.collections}
          onClose={() => setEditing(null)}
          onSaved={() => router.refresh()}
        />
      )}
      {requests && <RequestsDialog portal={requests} onClose={() => (setRequests(null), router.refresh())} />}
    </SidebarProvider>
  );
}

const asAssetId = (raw: string) => raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? null;

function ColorField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input id={id} type="color" value={value ?? "#6d4aff"} onChange={(e) => onChange(e.target.value)} className="h-9 w-14 p-1" />
        <span className="text-muted-foreground font-mono text-xs">{value ?? "The app's own"}</span>
        {value && (
          <IconButton variant="ghost" label={`Reset ${label.toLowerCase()}`} onClick={() => onChange(null)}>
            <IconX />
          </IconButton>
        )}
      </div>
    </div>
  );
}

/** Make or change a portal: what it shows, how it looks, who gets in, where it lives. */
function PortalDialog({
  portal,
  collections,
  onClose,
  onSaved,
}: {
  portal: Portal | null;
  collections: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(portal?.name ?? "");
  const [slug, setSlug] = useState(portal?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!portal);
  const [picked, setPicked] = useState<string[]>(portal?.collections.map((c) => c.id) ?? []);
  const [access, setAccess] = useState<PortalAccess>(portal?.access ?? "public");
  const [password, setPassword] = useState("");
  const [expires, setExpires] = useState(portal?.expiresAt?.slice(0, 10) ?? "");
  const [presets, setPresets] = useState<PortalPreset[]>(portal?.presets ?? DEFAULT_PRESETS);
  const [intro, setIntro] = useState(portal?.intro ?? "");
  const [logo, setLogo] = useState(portal?.theme.logo ?? "");
  const [accent, setAccent] = useState(portal?.theme.accent ?? null);
  const [background, setBackground] = useState(portal?.theme.background ?? null);
  const [domain, setDomain] = useState(portal?.domain?.host ?? "");
  const [current, setCurrent] = useState(portal);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const logoId = logo.trim() ? asAssetId(logo) : null;
    if (logo.trim() && !logoId) return toast.error("The logo is an asset: paste its link from the library, or its id");
    const payload = {
      name: name.trim(),
      slug,
      intro: intro.trim() || null,
      access,
      ...(password && { password }),
      expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
      presets,
      theme: { logo: logoId, accent, background },
      collections: picked,
      domain: domain.trim() || null,
    };
    setBusy(true);
    const saved = await send(current ? "PATCH" : "POST", current ? `/api/v1/portals/${current.id}` : "/api/v1/portals", payload);
    setBusy(false);
    if (!saved) return;
    toast.success(current ? "Saved" : `${saved.name} is open at ${saved.url.replace(/^https?:\/\//, "")}`);
    onSaved();
    // A new domain shows what to add to DNS: stay open for it.
    if (saved.domain && !saved.domain.verified) return setCurrent(saved);
    onClose();
  }

  async function verify() {
    if (!current) return;
    setBusy(true);
    const p = await send("POST", `/api/v1/portals/${current.id}/domain`);
    setBusy(false);
    if (!p) return;
    setCurrent(p);
    toast.success(`${p.domain.host} is verified: the portal answers there`);
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{current ? `Edit ${current.name}` : "New portal"}</DialogTitle>
          <DialogDescription>Only approved, unexpired assets of these collections show, and they leave the portal the moment that changes.</DialogDescription>
        </DialogHeader>
        <form id={id} onSubmit={save} className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input
              id={`${id}-name`}
              value={name}
              required
              maxLength={120}
              placeholder="Press kit"
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugOf(e.target.value));
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-slug`}>Address</Label>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground text-sm">/p/</span>
              <Input
                id={`${id}-slug`}
                value={slug}
                required
                pattern="[a-z0-9](?:[a-z0-9\-]{0,46}[a-z0-9])?"
                title="Lowercase letters, digits and dashes"
                onChange={(e) => (setSlugTouched(true), setSlug(e.target.value.toLowerCase()))}
              />
            </div>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Collections, in this order</legend>
            <div className="grid max-h-48 gap-1.5 overflow-y-auto rounded-md border p-2">
              {collections.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    aria-label={c.name}
                    checked={picked.includes(c.id)}
                    onCheckedChange={(on) => setPicked((xs) => (on ? [...xs, c.id] : xs.filter((x) => x !== c.id)))}
                  />
                  {c.name}
                  {picked.includes(c.id) && <span className="text-muted-foreground ml-auto text-xs">{picked.indexOf(c.id) + 1}</span>}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-2">
            <Label>Who gets in</Label>
            <Select value={access} onValueChange={(v) => setAccess(v as PortalAccess)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ACCESS) as PortalAccess[]).map((a) => (
                  <SelectItem key={a} value={a}>
                    {ACCESS[a].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">{ACCESS[access].hint}</p>
          </div>
          {access === "password" && (
            <div className="grid gap-2">
              <Label htmlFor={`${id}-pw`}>Password</Label>
              <Input
                id={`${id}-pw`}
                type="password"
                minLength={4}
                maxLength={200}
                required={!current?.password}
                placeholder={current?.password ? "Unchanged" : ""}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor={`${id}-until`}>Open until</Label>
            <Input id={`${id}-until`} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className="w-44" />
            <p className="text-muted-foreground text-xs">Empty: until you close it.</p>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Images download as</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {PRESET_IDS.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm">
                  <Checkbox aria-label={PORTAL_PRESETS[p].label} checked={presets.includes(p)} onCheckedChange={(on) => setPresets((xs) => (on ? PRESET_IDS.filter((x) => x === p || xs.includes(x)) : xs.filter((x) => x !== p)))} />
                  {PORTAL_PRESETS[p].label}
                  <span className="text-muted-foreground text-xs">{PORTAL_PRESETS[p].hint}</span>
                </label>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">Anything that isn&apos;t an image (a PDF, a video, a font) downloads as itself.</p>
          </fieldset>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-intro`}>Introduction</Label>
            <Textarea
              id={`${id}-intro`}
              rows={3}
              maxLength={4000}
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              placeholder="Logos, product shots and executive portraits for press. Questions: press@example.com"
            />
          </div>
          <div className="grid gap-4 rounded-md border p-3">
            <p className="text-sm font-medium">Look</p>
            <div className="grid gap-2">
              <Label htmlFor={`${id}-logo`}>Logo</Label>
              <Input id={`${id}-logo`} value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="An approved image's link from the library, or its id" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorField label="Accent" value={accent} onChange={setAccent} />
              <ColorField label="Header background" value={background} onChange={setBackground} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-domain`}>Domain of its own</Label>
            <Input id={`${id}-domain`} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="press.example.com" />
            {current?.domain && current.domain.host === domain.trim().toLowerCase() && (
              current.domain.verified ? (
                <p className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <IconCheck className="size-3.5" /> Verified: the portal answers at {current.domain.host}
                </p>
              ) : (
                <div className="bg-muted/50 grid gap-2 rounded-md p-3 text-xs">
                  <p>
                    At your DNS host, point <span className="font-mono">{current.domain.host}</span> at this server, and add a TXT record to prove it is yours:
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="font-mono break-all">{current.domain.record.name}</span>
                    <IconButton variant="ghost" label="Copy the name" onClick={() => copy(current.domain!.record.name, "the name")}>
                      <IconCopy />
                    </IconButton>
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="font-mono break-all">{current.domain.record.value}</span>
                    <IconButton variant="ghost" label="Copy the value" onClick={() => copy(current.domain!.record.value, "the value")}>
                      <IconCopy />
                    </IconButton>
                  </p>
                  <Button type="button" size="sm" variant="outline" className="justify-self-start" onClick={verify} disabled={busy}>
                    Check now
                  </Button>
                </div>
              )
            )}
          </div>
        </form>
        <DialogFooter className="sm:justify-between">
          {current ? (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={async () => {
                if (!confirm(`Delete ${current.name}? Its address stops working at once.`)) return;
                if (!(await send("DELETE", `/api/v1/portals/${current.id}`))) return;
                toast.success(`${current.name} is gone`);
                onSaved();
                onClose();
              }}
            >
              <IconTrash /> Delete
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" form={id} disabled={busy || !picked.length || !name.trim()}>
            {current ? "Save" : "Make it"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Who asked in, and a yes or a no for each. */
function RequestsDialog({ portal, onClose }: { portal: Portal; onClose: () => void }) {
  const [rows, setRows] = useState<Request[] | null>(null);
  const load = () =>
    fetch(`/api/v1/portals/${portal.id}/requests`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => setRows(b.data ?? []));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portal.id]);

  async function decide(r: Request, status: "approved" | "denied") {
    const res = await fetch(`/api/v1/portals/${portal.id}/requests/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(body.error?.message ?? "That didn't go through");
    if (status === "approved") {
      if (body.emailed) toast.success(`${r.email} has access, and a link by email`);
      else toast.success(`${r.email} has access. Email is off: copy their link and send it`);
    } else toast.success("Denied");
    void load();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Access requests · {portal.name}</DialogTitle>
          <DialogDescription>A yes gives them a link of their own, good for 90 days or until the portal closes. Remove it to take it back.</DialogDescription>
        </DialogHeader>
        {!rows ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nobody has asked yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {rows.map((r) => (
              <li key={r.id} className="grid gap-1.5 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{r.name ? `${r.name} · ${r.email}` : r.email}</span>
                  {r.status === "pending" ? (
                    <>
                      <Button size="sm" onClick={() => decide(r, "approved")}>
                        <IconCheck /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => decide(r, "denied")}>
                        Deny
                      </Button>
                    </>
                  ) : (
                    <Badge variant="outline">{r.status === "approved" ? `Approved${r.expiresAt ? ` until ${new Date(r.expiresAt).toLocaleDateString()}` : ""}` : "Denied"}</Badge>
                  )}
                  {r.url && (
                    <IconButton variant="ghost" label="Copy their link" onClick={() => copy(r.url!, "their link")}>
                      <IconCopy />
                    </IconButton>
                  )}
                  <IconButton
                    variant="ghost"
                    label="Remove"
                    onClick={async () => {
                      if (await send("DELETE", `/api/v1/portals/${portal.id}/requests/${r.id}`)) void load();
                    }}
                  >
                    <IconTrash />
                  </IconButton>
                </div>
                {r.note && <p className="text-muted-foreground">{r.note}</p>}
                <p className="text-muted-foreground text-xs">{new Date(r.createdAt).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
