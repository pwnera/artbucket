"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { IconUpload } from "@/components/icons";
import type { Portal } from "@/components/portals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { slugOf } from "@/lib/catalog";
import { formatSize } from "@/lib/limits";
import { send } from "@/lib/send";
import { BUILD_KINDS, SITE_KIND_LABEL, type BuildKind } from "@/lib/sites";
import { ago } from "@/lib/time";
import { cn } from "@/lib/utils";

type Deployment = { id: string; path: string; kind: BuildKind; state: "checking" | "live" | "failed" | "replaced"; files: number; bytes: number; error: string | null; createdBy: string; createdAt: string };

const STATE: Record<Deployment["state"], "success" | "secondary" | "destructive" | "outline"> = { live: "success", checking: "secondary", failed: "destructive", replaced: "outline" };

/**
 * A built site (PRD part 2): made with a name, an address and a kind, then
 * deployed by dropping a zip of its build here (or `artbucket site push`).
 * For a brand portal, the same panel mounts a build beside its pages, at a
 * path. Its deployments list below, newest first, the live one marked.
 */
export function BuildSiteDialog({
  open,
  site,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null: a new built site. */
  site: Portal | null;
  onClose: () => void;
  onSaved: (site: Portal) => void;
}) {
  const [made, setMade] = useState<Portal | null>(site);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<BuildKind>("docs");
  const [busy, setBusy] = useState(false);
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
                : `A ${SITE_KIND_LABEL[shown.kind].toLowerCase()} site: drop a zip of its build to deploy it.`
              : "A site of static files you build anywhere (Claude, Lovable, your own code), deployed as a zip."}
          </DialogDescription>
        </DialogHeader>
        {shown ? (
          <Deployments site={shown} />
        ) : (
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const saved: Portal | null = await send("POST", "/api/v1/sites", { name, slug: slugOf(name), kind });
              setBusy(false);
              if (!saved) return;
              setMade(saved);
              onSaved(saved);
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="site-name">Name</Label>
              <Input id="site-name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme docs" />
              {name && <p className="text-muted-foreground text-xs">Its address: {slugOf(name)}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label>Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as BuildKind)}>
                <SelectTrigger className="w-full" aria-label="Kind">
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
            <DialogFooter>
              <Button type="submit" disabled={!name.trim() || busy}>
                {busy && <Spinner />} Make the site
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
  const [list, setList] = useState<Deployment[] | null>(null);
  const [path, setPath] = useState(portal ? "/docs" : "/");
  const [kind, setKind] = useState<BuildKind>(portal ? "docs" : (site.kind as BuildKind));
  const [sending, setSending] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const load = () =>
    fetch(`/api/v1/sites/${site.id}/deployments`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((b: { data: Deployment[] }) => setList(b.data));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.id]);

  const deploy = async (file: File | undefined) => {
    if (!file) return;
    setSending(true);
    const q = new URLSearchParams({ path, kind });
    const res = await fetch(`/api/v1/sites/${site.id}/deployments?${q}`, { method: "POST", headers: { "Content-Type": "application/zip" }, body: file });
    const body = await res.json().catch(() => null);
    setSending(false);
    await load();
    if (!res.ok) return toast.error(body?.error?.message ?? "It couldn't be deployed");
    toast.success(`Live at ${site.url}${path === "/" ? "" : path}`, { description: `${body.data.files} files` });
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="mount">Path</Label>
          <Input id="mount" value={path} onChange={(e) => setPath(e.target.value)} disabled={!portal} />
        </div>
        {portal && (
          <div className="grid gap-1.5">
            <Label>Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as BuildKind)}>
              <SelectTrigger className="w-full" aria-label="Kind">
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
      <input ref={input} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => void deploy(e.target.files?.[0])} />
      <section aria-label="Deployments" className="grid gap-2">
        <h3 className="text-sm font-medium">Deployments</h3>
        {list === null ? (
          <p className="text-muted-foreground text-sm">Loading</p>
        ) : list.length ? (
          <ul className="divide-y rounded-lg border">
            {list.map((d) => (
              <li key={d.id} className="grid gap-0.5 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <Badge variant={STATE[d.state]} className="capitalize">
                    {d.state}
                  </Badge>
                  <code className="text-xs">{d.path}</code>
                  <span className="text-muted-foreground text-xs">
                    {SITE_KIND_LABEL[d.kind]} · {d.files} files · {formatSize(d.bytes)}
                  </span>
                  <span className="text-muted-foreground ms-auto text-xs" suppressHydrationWarning>
                    {d.createdBy}, {ago(d.createdAt)}
                  </span>
                </span>
                {d.error && <span className="text-destructive text-xs">{d.error}</span>}
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
