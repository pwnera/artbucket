"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconBolt, IconChevronDown, IconChevronRight, IconPlus, IconTrash } from "@/components/icons";
import { CopyButton } from "@/components/copy-button";
import { IconButton } from "@/components/icon-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { send } from "@/lib/send";
import { ago, exact } from "@/lib/time";

/**
 * The project's automations (GET /api/v1/automations): when a brand is
 * released or a license is about to end, an email or a signed webhook. Each
 * opens on its run log, read when opened. A webhook's secret is shown once,
 * as it is made.
 */

type Status = "pending" | "delivered" | "failed";
export type AutomationRow = {
  id: string;
  name: string;
  trigger: "brand.released" | "asset.expiring";
  brand: string | null;
  days: number | null;
  action: "email" | "webhook";
  emails: string[];
  host: string | null;
  enabled: boolean;
  last: { status: Status; at: string } | null;
};
type Run = { id: string; status: Status; payload: Record<string, unknown>; attempts: { at: string; ok: boolean; code: number | null; error: string | null }[]; nextAt: string | null; createdAt: string };
type Brand = { slug: string; name: string };

const ANY = "*";
const STATUS: Record<Status, { label: string; variant: "success" | "warning" | "destructive" }> = {
  delivered: { label: "Delivered", variant: "success" },
  pending: { label: "Retrying", variant: "warning" },
  failed: { label: "Failed", variant: "destructive" },
};

const when = (a: AutomationRow, brands: Brand[]) =>
  a.trigger === "brand.released"
    ? `When ${a.brand ? (brands.find((b) => b.slug === a.brand)?.name ?? a.brand) : "any brand"} is released`
    : `${a.days === 0 ? "On" : `${a.days} days before`} an asset's last day of use`;
const then = (a: AutomationRow) => (a.action === "email" ? `email ${a.emails.join(", ")}` : `post to ${a.host}`);

export function AutomationsPanel({ automations, brands }: { automations: AutomationRow[]; brands: Brand[] }) {
  const [secret, setSecret] = useState<{ name: string; secret: string } | null>(null);
  return (
    <div className="space-y-6">
      <NewAutomation brands={brands} made={(a) => a.secret && setSecret({ name: a.name, secret: a.secret })} />
      {secret && (
        <div className="space-y-2 rounded-lg border p-4 text-sm">
          <p>
            Each POST of <span className="font-medium">{secret.name}</span> is signed with this secret, in <code>Artbucket-Signature</code>. Copy it now: it isn&apos;t shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="bg-muted min-w-0 flex-1 truncate rounded px-2 py-1">{secret.secret}</code>
            <CopyButton text={secret.secret} label="Copy the secret" what="the secret" size="icon-sm" />
            <Button size="sm" variant="ghost" onClick={() => setSecret(null)}>
              Done
            </Button>
          </div>
        </div>
      )}
      {!automations.length && <p className="text-muted-foreground text-sm">No automations yet. Tell your team, or your site, when a brand is released or a license is about to end.</p>}
      <ul className="divide-y rounded-lg border empty:hidden">
        {automations.map((a) => (
          <AutomationItem key={a.id} a={a} brands={brands} />
        ))}
      </ul>
    </div>
  );
}

function NewAutomation({ brands, made }: { brands: Brand[]; made: (a: AutomationRow & { secret?: string }) => void }) {
  const router = useRouter();
  const [trigger, setTrigger] = useState<AutomationRow["trigger"]>("brand.released");
  const [action, setAction] = useState<AutomationRow["action"]>("email");
  const [brand, setBrand] = useState(ANY);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3 rounded-lg border p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        const text = (k: string) => String(f.get(k) ?? "").trim();
        setBusy(true);
        const a = await send("POST", "/api/v1/automations", {
          name: text("name"),
          trigger,
          ...(trigger === "brand.released" ? { brand: brand === ANY ? null : brand } : { days: Number(text("days")) }),
          action,
          ...(action === "email" ? { emails: text("emails").split(/[\s,;]+/).filter(Boolean) } : { url: text("url") }),
        });
        setBusy(false);
        if (!a) return;
        made(a);
        form.reset();
        router.refresh();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="automation-name">Name</Label>
          <Input id="automation-name" name="name" required maxLength={80} placeholder="Tell the brand team" />
        </div>
        <div className="space-y-1.5">
          <Label>When</Label>
          <Select value={trigger} onValueChange={(v) => setTrigger(v as AutomationRow["trigger"])}>
            <SelectTrigger className="w-full" aria-label="When">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="brand.released">A brand is released</SelectItem>
              <SelectItem value="asset.expiring">An asset&apos;s license is about to end</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {trigger === "brand.released" ? (
          <div className="space-y-1.5">
            <Label>Brand</Label>
            <Select value={brand} onValueChange={setBrand}>
              <SelectTrigger className="w-full" aria-label="Brand">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any brand</SelectItem>
                {brands.map((b) => (
                  <SelectItem key={b.slug} value={b.slug}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="automation-days">Days before its last day of use</Label>
            <Input id="automation-days" name="days" type="number" required min={0} max={365} defaultValue={30} />
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Then</Label>
          <Select value={action} onValueChange={(v) => setAction(v as AutomationRow["action"])}>
            <SelectTrigger className="w-full" aria-label="Then">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Send an email</SelectItem>
              <SelectItem value="webhook">Post a signed webhook</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {action === "email" ? (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="automation-emails">To</Label>
            <Input id="automation-emails" name="emails" required placeholder="brand@example.com, legal@example.com" />
          </div>
        ) : (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="automation-url">URL</Label>
            <Input id="automation-url" name="url" type="url" required pattern="https://.*" placeholder="https://example.com/hooks/artbucket" />
          </div>
        )}
      </div>
      <Button type="submit" variant="outline" pending={busy}>
        <IconPlus /> New automation
      </Button>
    </form>
  );
}

function AutomationItem({ a, brands }: { a: AutomationRow; brands: Brand[] }) {
  const router = useRouter();
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [open, setOpen] = useState(false);
  const toggle = async () => {
    setOpen(!open);
    if (!open) setRuns(await send("GET", `/api/v1/automations/${a.id}/runs`));
  };
  return (
    <li className="space-y-3 px-4 py-3 text-sm">
      <div className="flex items-center gap-3">
        <IconButton variant="ghost" size="icon-xs" label={open ? `Hide the runs of ${a.name}` : `Show the runs of ${a.name}`} onClick={toggle}>
          {open ? <IconChevronDown /> : <IconChevronRight />}
        </IconButton>
        <IconBolt aria-hidden className="text-muted-foreground size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{a.name}</p>
          <p className="text-muted-foreground truncate text-xs">
            {when(a, brands)}, {then(a)}
          </p>
        </div>
        {a.last && (
          <Badge variant={STATUS[a.last.status].variant} title={exact(a.last.at)}>
            {STATUS[a.last.status].label} {ago(a.last.at)}
          </Badge>
        )}
        <Switch
          checked={a.enabled}
          aria-label={`${a.name} on`}
          onCheckedChange={async (enabled) => (await send("PATCH", `/api/v1/automations/${a.id}`, { enabled })) && router.refresh()}
        />
        <IconButton
          variant="ghost"
          size="icon-sm"
          label={`Delete ${a.name}`}
          className="text-muted-foreground hover:text-destructive"
          onClick={async () => (await send("DELETE", `/api/v1/automations/${a.id}`)) && router.refresh()}
        >
          <IconTrash />
        </IconButton>
      </div>
      {open && (
        <div className="ms-9">
          {!runs ? null : !runs.length ? (
            <p className="text-muted-foreground">It hasn&apos;t fired yet.</p>
          ) : (
            <ul className="space-y-2">
              {runs.map((r) => (
                <li key={r.id} className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                    <span>{subject(r.payload)}</span>
                    <span className="text-muted-foreground ms-auto text-xs" title={exact(r.createdAt)}>
                      {ago(r.createdAt)}
                    </span>
                  </div>
                  {r.attempts.map((t, i) => (
                    <p key={i} className="text-muted-foreground text-xs">
                      Attempt {i + 1}, {ago(t.at)}: {t.ok ? `delivered${t.code ? ` (${t.code})` : ""}` : (t.error ?? "failed")}
                    </p>
                  ))}
                  {r.status === "pending" && r.nextAt && <p className="text-muted-foreground text-xs">Tried again {exact(r.nextAt)}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/** What a run was about, in a few words. */
function subject(p: Record<string, unknown>) {
  if (p.event === "brand.released") return `${(p.brand as { name: string }).name} release ${p.release}`;
  const asset = p.asset as { filename: string; title: string | null };
  return `${asset.title ?? asset.filename}, last day ${p.expires}`;
}
