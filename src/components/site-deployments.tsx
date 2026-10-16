"use client";

import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { IconUpload } from "@/components/icons";
import type { Portal } from "@/components/portals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { slugOf } from "@/lib/catalog";
import { formatSize } from "@/lib/limits";
import { ACCESS_WORDS, PORTAL_ACCESS, type PortalAccess } from "@/lib/portal";
import { send } from "@/lib/send";
import { BUILD_KINDS, SITE_KIND_LABEL, type BuildKind, type DeploymentKind } from "@/lib/sites";
import { ago } from "@/lib/time";
import { cn } from "@/lib/utils";

export type Deployment = { id: string; path: string; kind: DeploymentKind; state: "checking" | "live" | "failed" | "replaced" | "held" | "preview"; preview: string | null; url?: string | null; files: number; bytes: number; error: string | null; uses: { asset: string }[]; componentUses: string[]; problems: string[]; flags: string[]; createdBy: string; createdAt: string };

/** "uses 3 assets, 2 components", from what the check found in its files: the library it reaches. */
const usesLine = (d: Deployment) => {
  const n = new Set(d.uses.map((u) => u.asset)).size;
  const c = d.componentUses?.length ?? 0;
  const said = [n && `${n} asset${n === 1 ? "" : "s"}`, c && `${c} component${c === 1 ? "" : "s"}`].filter(Boolean);
  return said.length ? ` · uses ${said.join(", ")}` : "";
};

const STATE: Record<Deployment["state"], "success" | "secondary" | "destructive" | "outline"> = { live: "success", checking: "secondary", failed: "destructive", replaced: "outline", held: "secondary", preview: "secondary" };

/**
 * A built site (PRD part 2): made with a name, an address and a kind, then
 * deployed by dropping a zip of its build here (or `artbucket site push`).
 * For a brand portal, the same panel mounts a build beside its pages, at a
 * path. Its deployments list below, newest first, the live one marked.
 */
export function BuildSiteDialog({
  open,
  site,
  buildUrl,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null: a new built site. */
  site: Portal | null;
  /** The server's build integration (SITE_BUILD_URL), {site} standing for the address. */
  buildUrl?: string;
  onClose: () => void;
  onSaved: (site: Portal) => void;
}) {
  const [made, setMade] = useState<Portal | null>(site);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<BuildKind | "external">("docs");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();
  const shown = made ?? site;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{shown ? shown.name : "New built site"}</DialogTitle>
          <DialogDescription>
            {shown
              ? shown.kind === "portal"
                ? "Mount a build beside this brand portal's pages, at a path such as /docs."
                : shown.kind === "external"
                  ? "Hosted elsewhere: its CI records what it uses, so it shows in lineage and Fixes."
                  : `A ${SITE_KIND_LABEL[shown.kind].toLowerCase()} site: drop a zip of its build to deploy it.`
              : "A site of static files you build anywhere (Claude, Lovable, your own code), deployed as a zip."}
          </DialogDescription>
        </DialogHeader>
        {shown ? (
          <>
            <Deployments site={shown} />
            {buildUrl && <BuildFromGit site={shown} template={buildUrl} />}
            {shown.kind !== "portal" && (
              <WhoGetsIn
                site={shown}
                onSaved={(saved) => {
                  setMade(saved);
                  onSaved(saved);
                }}
              />
            )}
            <RebuildHook site={shown} />
          </>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const saved: Portal | null = await send("POST", "/api/v1/sites", { name, slug: slugOf(name), kind, ...(kind === "external" && url && { url }) });
              setBusy(false);
              if (!saved) return;
              setMade(saved);
              onSaved(saved);
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-name`}>Name</Label>
              <Input id={`${id}-name`} required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme docs" />
              {name && <p className="text-muted-foreground text-xs">Its address: {slugOf(name)}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-kind`}>Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as BuildKind | "external")}>
                <SelectTrigger id={`${id}-kind`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...BUILD_KINDS, "external" as const].map((k) => (
                    <SelectItem key={k} value={k}>
                      {SITE_KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {kind === "external" && (
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-url`}>Where it lives</Label>
                <Input id={`${id}-url`} type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://app.acme.com" />
              </div>
            )}
            <DialogFooter>
              <Button type="submit" disabled={!name.trim()} pending={busy}>
                Make the site
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Deployments({ site }: { site: Portal }) {
  const portal = site.kind === "portal";
  const external = site.kind === "external";
  const [list, setList] = useState<Deployment[] | null>(null);
  const [path, setPath] = useState(portal ? "/docs" : "/");
  const [kind, setKind] = useState<BuildKind>(portal ? "docs" : (site.kind as BuildKind));
  const [sending, setSending] = useState(false);
  const [over, setOver] = useState(false);
  /** The deployment being restored, so a double click can't send two. */
  const [restoring, setRestoring] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const load = () =>
    fetch(`/api/v1/sites/${site.id}/deployments`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((b: { data: Deployment[] }) => setList(b.data));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.id]);

  const restore = async (d: Deployment) => {
    setRestoring(d.id);
    const res = await fetch(`/api/v1/sites/${site.id}/deployments/${d.id}/restore`, { method: "POST" }).finally(() => setRestoring(null));
    await load();
    if (!res.ok) return toast.error((await res.json().catch(() => null))?.error?.message ?? "It couldn't be restored");
    toast.success(`Restored at ${d.path}`);
  };

  const deploy = async (file: File | undefined) => {
    if (!file) return;
    setSending(true);
    const q = new URLSearchParams({ path, kind });
    const res = await fetch(`/api/v1/sites/${site.id}/deployments?${q}`, { method: "POST", headers: { "Content-Type": "application/zip" }, body: file });
    const body = await res.json().catch(() => null);
    setSending(false);
    await load();
    if (!res.ok || !body?.data) return toast.error(body?.error?.message ?? "It couldn't be deployed");
    if (body.data.state === "held") return toast.warning("Held for review", { description: body.data.error });
    toast.success(`Live at ${site.url}${path === "/" ? "" : path}`, { description: `${body.data.files} files` });
  };

  return (
    <div className="grid gap-4">
      {external ? (
        <div className="bg-muted/40 grid gap-1 rounded-xl border px-4 py-3 text-sm">
          <span className="font-medium">Recorded from its CI</span>
          <span className="text-muted-foreground text-xs">
            At the repository&apos;s root: <code>artbucket site scan src --site {site.slug}</code>. It finds the components its code imports and the assets it links or
            copies; nothing is stored but what it uses.
          </span>
        </div>
      ) : (
        <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-path`}>Path</Label>
          <Input id={`${id}-path`} value={path} onChange={(e) => setPath(e.target.value)} disabled={!portal} />
        </div>
        {portal && (
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-kind`}>Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as BuildKind)}>
              <SelectTrigger id={`${id}-kind`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUILD_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {SITE_KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {/* eslint-disable-next-line no-restricted-syntax -- Raw: the drop zone is the hit target, for a click or a dropped zip. */}
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void deploy(e.dataTransfer.files[0]);
        }}
        disabled={sending}
        className={cn(
          "text-muted-foreground hover:border-primary/50 flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-sm transition-colors",
          over && "border-primary bg-primary/5",
        )}
      >
        {sending ? <Spinner className="size-5" /> : <IconUpload className="size-5" />}
        <span className="text-foreground font-medium">{sending ? "Deploying" : "Drop a zip of the build, or choose one"}</span>
        <span className="text-xs">index.html at its root. From a terminal: artbucket site push dist --site {site.slug}</span>
      </button>
      {/* Raw: a file input, opened by the drop zone. */}
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        aria-label="A zip of the build"
        className="hidden"
        onChange={(e) => {
          void deploy(e.target.files?.[0]);
          // The same zip again (a fix, then a retry) is a change too.
          e.target.value = "";
        }}
      />
        </>
      )}
      <section aria-label="Deployments" className="grid gap-2">
        <h3 className="text-sm font-medium">{external ? "Scans" : "Deployments"}</h3>
        {list === null ? (
          <ul aria-busy aria-label="Loading the deployments" className="divide-y rounded-lg border">
            {[0, 1].map((i) => (
              <li key={i} className="grid gap-2 px-3 py-2.5">
                <Skeleton className="h-4 w-2/3" />
              </li>
            ))}
          </ul>
        ) : list.length ? (
          <ul className="divide-y rounded-lg border">
            {list.map((d) => (
              <li key={d.id} className="grid gap-0.5 px-3 py-2 text-sm">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge variant={STATE[d.state]} className="capitalize">
                    {d.state}
                  </Badge>
                  <code className="text-xs">{d.path}</code>
                  {d.preview &&
                    (d.url ? (
                      <a href={d.url} target="_blank" rel="noreferrer" className="text-xs underline underline-offset-2">
                        {d.preview}
                      </a>
                    ) : (
                      <span className="text-xs">{d.preview}</span>
                    ))}
                  <span className="text-muted-foreground text-xs">
                    {d.kind === "external" ? `${d.files} files scanned` : `${SITE_KIND_LABEL[d.kind]} · ${d.files} files · ${formatSize(d.bytes)}`}
                    {usesLine(d)}
                  </span>
                  <span className="text-muted-foreground ms-auto text-xs" suppressHydrationWarning>
                    {d.createdBy}, {ago(d.createdAt)}
                  </span>
                  {d.state === "replaced" && (
                    <Button variant="ghost" size="sm" className="-my-1 h-7" pending={restoring === d.id} disabled={!!restoring} onClick={() => void restore(d)}>
                      Restore
                    </Button>
                  )}
                </span>
                {d.error && <span className={cn("text-xs", d.state === "held" ? "text-warning" : "text-destructive")}>{d.error}</span>}
                {d.state === "live" &&
                  [...d.flags, ...d.problems].map((p) => (
                    <span key={p} className="text-warning text-xs">
                      {p}
                    </span>
                  ))}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">Nothing deployed yet.</p>
        )}
      </section>
    </div>
  );
}

/**
 * The server's build integration (SITE_BUILD_URL): it builds the site from a
 * repository on each push and previews pull requests, deploying here as
 * `site push` does. Its own pages say what is connected; this only leads there.
 */
function BuildFromGit({ site, template }: { site: Portal; template: string }) {
  return (
    <section aria-label="Build from GitHub" className="grid gap-2 border-t pt-4">
      <h3 className="text-sm font-medium">Build from GitHub</h3>
      <p className="text-muted-foreground text-sm">Built here on each push, a preview for each pull request, and again when the brand is released.</p>
      <Button asChild variant="outline" size="sm" className="justify-self-start">
        <a href={template.replaceAll("{site}", encodeURIComponent(site.slug))}>{site.rebuild?.host && template.includes(site.rebuild.host) ? "Builds and settings" : "Connect a repository"}</a>
      </Button>
    </section>
  );
}


/**
 * Who may open a built site, as for a portal (a brand portal's own dialog
 * sets it there). Members open its builds on its own address once signed in
 * here (lib/core/sites.ts enterSite); a password lasts a week on a browser.
 */
function WhoGetsIn({ site, onSaved }: { site: Portal; onSaved: (site: Portal) => void }) {
  const [access, setAccess] = useState<PortalAccess>(site.access);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const fresh = access === "password" && site.access !== "password";
  const dirty = access !== site.access || (access === "password" && !!password);
  return (
    <section aria-label="Who gets in" className="grid gap-2 border-t pt-4">
      <h3 className="text-sm font-medium">Who gets in</h3>
      <form
        className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const saved: Portal | null = await send("PATCH", `/api/v1/sites/${site.id}`, { access, ...(access === "password" && password && { password }) });
          setBusy(false);
          if (!saved) return;
          setPassword("");
          onSaved(saved);
          toast.success(`${ACCESS_WORDS[saved.access].label} can open it`);
        }}
      >
        <Select value={access} onValueChange={(v) => setAccess(v as PortalAccess)}>
          <SelectTrigger className={cn("w-full", access !== "password" && "sm:col-span-2")} aria-label="Who gets in">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PORTAL_ACCESS.map((a) => (
              <SelectItem key={a} value={a}>
                {ACCESS_WORDS[a].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {access === "password" && (
          <Input
            type="password"
            required={fresh}
            minLength={4}
            maxLength={200}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={fresh ? "Password" : "A new password"}
            aria-label="Password"
          />
        )}
        <Button type="submit" variant="outline" disabled={!dirty} pending={busy}>
          Save
        </Button>
      </form>
      {site.access === "members" && <p className="text-muted-foreground text-xs">Members sign in here, then read it at its own address. Anyone else is asked to sign in.</p>}
    </section>
  );
}

/**
 * A deploy hook called when a brand is released (SITE-14), so a site built
 * from it, here or on Vercel, Netlify or Cloudflare Pages, is built again.
 * The URL is a key: once saved it is never shown, only its host.
 */
function RebuildHook({ site }: { site: Portal }) {
  const [rebuild, setRebuild] = useState(site.rebuild);
  const [brands, setBrands] = useState<{ slug: string; name: string; default: boolean }[]>([]);
  const [url, setUrl] = useState("");
  const [brand, setBrand] = useState(site.rebuild?.brand ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetch("/api/v1/brands", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((b: { data: { slug: string; name: string; default: boolean }[] }) => setBrands(b.data));
  }, []);
  // Unpicked, the default brand. Derived, not set with the list: a Select whose value and items arrive in the same
  // render reads its value back as empty (Radix's native select has no such option yet) and clears it.
  const picked = brand || (brands.find((x) => x.default) ?? brands[0])?.slug || "";
  const save = async (next: { url: string; brand: string } | null) => {
    setBusy(true);
    const saved: Portal | null = await send("PATCH", `/api/v1/sites/${site.id}`, { rebuild: next });
    setBusy(false);
    if (!saved) return;
    setRebuild(saved.rebuild);
    setUrl("");
    toast.success(next ? `It builds again when ${next.brand} is released` : "No longer built again on release");
  };
  return (
    <section aria-label="Rebuild on release" className="grid gap-2 border-t pt-4">
      <h3 className="text-sm font-medium">Rebuild on release</h3>
      {rebuild ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            Calls <code className="text-xs">{rebuild.host}</code> when {rebuild.brand ?? "a brand since deleted"} is released.
          </span>
          {rebuild.lastAt && (
            <span className="text-muted-foreground text-xs" suppressHydrationWarning>
              Last: {rebuild.lastStatus}, {ago(rebuild.lastAt)}
            </span>
          )}
          <Button variant="ghost" size="sm" className="ms-auto h-7" pending={busy} onClick={() => void save(null)}>
            Remove
          </Button>
        </div>
      ) : (
        <form
          className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void save({ url, brand: picked });
          }}
        >
          <Input type="url" required pattern="https://.*" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.vercel.com/v1/integrations/deploy/..." aria-label="Deploy hook URL" />
          <Select value={picked} onValueChange={setBrand}>
            <SelectTrigger className="w-full" aria-label="Brand">
              <SelectValue placeholder="Brand" />
            </SelectTrigger>
            <SelectContent>
              {brands.map((b) => (
                <SelectItem key={b.slug} value={b.slug}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" disabled={!url || !picked} pending={busy}>
            Save
          </Button>
          <p className="text-muted-foreground text-xs sm:col-span-3">
            A deploy hook from Vercel, Netlify, Cloudflare Pages or your CI. Each release of the brand calls it, so text baked into the build follows; assets on /c/ already do.
          </p>
        </form>
      )}
    </section>
  );
}
