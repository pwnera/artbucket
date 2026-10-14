"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconBolt, IconChevronDown, IconChevronRight, IconPencil, IconPlus, IconSend, IconTrash } from "@/components/icons";
import { useCan } from "@/components/can";
import { Confirm } from "@/components/confirm";
import { CopyButton } from "@/components/copy-button";
import { IconButton } from "@/components/icon-button";
import { AppHeader, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { send, sendResult } from "@/lib/send";
import { ago, exact } from "@/lib/time";

/**
 * The project's automations (GET /api/v1/automations), a page of their own:
 * when a brand is released or a license is about to end, an email or a
 * signed webhook. Each is made and changed in one dialog, sends a test on
 * demand (POST /api/v1/automations/{id}/test), and opens on its run log,
 * read when opened. A webhook's secret is shown once, as it is made.
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
type Run = {
  id: string;
  status: Status;
  payload: Record<string, unknown>;
  attempts: { at: string; ok: boolean; code: number | null; error: string | null }[];
  nextAt: string | null;
  createdAt: string;
  test?: boolean;
};
type Brand = { id: string; slug: string; name: string; private?: boolean };
type Made = AutomationRow & { secret?: string };

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

export function Automations({ automations, brands }: { automations: AutomationRow[]; brands: Brand[] }) {
  const [editing, setEditing] = useState<{ of: AutomationRow | null; n: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState<{ name: string; secret: string } | null>(null);
  const edit = (of: AutomationRow | null) => {
    setEditing((e) => ({ of, n: (e?.n ?? 0) + 1 }));
    setOpen(true);
  };
  return (
    <>
      <AppHeader trail={[{ label: "Automations" }]} />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-6 pb-16 md:px-6">
        <PageHeader icon={<IconBolt />} title="Automations" description="Let people, or your other tools, know when a brand is released or a license is about to end.">
          {automations.length > 0 && (
            <Button size="sm" onClick={() => edit(null)}>
              <IconPlus /> New automation
            </Button>
          )}
        </PageHeader>
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
        {automations.length ? (
          <ul className="divide-y rounded-lg border">
            {automations.map((a) => (
              <AutomationItem key={a.id} a={a} brands={brands} onEdit={() => edit(a)} />
            ))}
          </ul>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconBolt />
              </EmptyMedia>
              <EmptyTitle>Nothing automated yet</EmptyTitle>
              <EmptyDescription>Email your team when a brand is released, warn legal before a license runs out, or post a webhook that rebuilds your site.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => edit(null)}>
                <IconPlus /> New automation
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </div>
      {editing && (
        <AutomationDialog
          key={editing.n}
          open={open}
          automation={editing.of}
          brands={brands}
          onClose={() => setOpen(false)}
          onSaved={(a) => {
            setOpen(false);
            if (a.secret) setSecret({ name: a.name, secret: a.secret });
          }}
        />
      )}
    </>
  );
}

/** Make an automation, or change one (`automation`): its webhook URL is never shown again, so left empty it stays. */
function AutomationDialog({
  open,
  automation: a,
  brands,
  onClose,
  onSaved,
}: {
  open: boolean;
  automation: AutomationRow | null;
  brands: Brand[];
  onClose: () => void;
  onSaved: (a: Made) => void;
}) {
  const id = useId();
  const router = useRouter();
  const can = useCan();
  // An editor of a brand makes its release automations; license dates and any brand reach what only admins see.
  const all = can("automation.manage_all");
  const mine = all ? brands : brands.filter((b) => can("automation.manage", b));
  const [trigger, setTrigger] = useState<AutomationRow["trigger"]>(a?.trigger ?? "brand.released");
  const [action, setAction] = useState<AutomationRow["action"]>(a?.action ?? "email");
  const [brand, setBrand] = useState(a?.brand ?? (all ? ANY : (mine[0]?.slug ?? ANY)));
  const [busy, setBusy] = useState(false);
  // A webhook made before keeps its URL unless a new one is given.
  const keeps = a?.action === "webhook" && action === "webhook";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{a ? `Change ${a.name}` : "New automation"}</DialogTitle>
          <DialogDescription>When something happens in this project, tell someone.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const text = (k: string) => String(f.get(k) ?? "").trim();
            setBusy(true);
            const body = {
              name: text("name"),
              trigger,
              ...(trigger === "brand.released" ? { brand: brand === ANY ? null : brand } : { days: Number(text("days")) }),
              action,
              ...(action === "email" ? { emails: text("emails").split(/[\s,;]+/).filter(Boolean) } : text("url") ? { url: text("url") } : {}),
            };
            const made: Made | null = await send(a ? "PATCH" : "POST", a ? `/api/v1/automations/${a.id}` : "/api/v1/automations", body);
            setBusy(false);
            if (!made) return;
            toast.success(a ? `Saved ${made.name}` : `Made ${made.name}`);
            onSaved(made);
            router.refresh();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor={`${id}-name`}>Name</Label>
              <Input id={`${id}-name`} name="name" required maxLength={80} defaultValue={a?.name} placeholder="Tell the brand team" />
            </div>
            <div className="grid gap-1.5">
              <Label>When</Label>
              <Select value={trigger} onValueChange={(v) => setTrigger(v as AutomationRow["trigger"])}>
                <SelectTrigger className="w-full" aria-label="When">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="brand.released">A brand is released</SelectItem>
                  {all && <SelectItem value="asset.expiring">A license is about to end</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            {trigger === "brand.released" ? (
              <div className="grid gap-1.5">
                <Label>Brand</Label>
                <Select value={brand} onValueChange={setBrand}>
                  <SelectTrigger className="w-full" aria-label="Brand">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {all && <SelectItem value={ANY}>Any brand</SelectItem>}
                    {mine.map((b) => (
                      <SelectItem key={b.slug} value={b.slug}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-days`}>Days before its last day</Label>
                <Input id={`${id}-days`} name="days" type="number" required min={0} max={365} defaultValue={a?.days ?? 30} />
              </div>
            )}
            <div className="grid gap-1.5 sm:col-span-2">
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
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor={`${id}-emails`}>To</Label>
                <Input id={`${id}-emails`} name="emails" required defaultValue={a?.emails.join(", ")} placeholder="brand@example.com, legal@example.com" />
              </div>
            ) : (
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor={`${id}-url`}>URL</Label>
                <Input
                  id={`${id}-url`}
                  name="url"
                  type="url"
                  required={!keeps}
                  pattern="https://.*"
                  placeholder={keeps ? `Keep the one on ${a.host}` : "https://example.com/hooks/artbucket"}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" pending={busy}>
              {a ? "Save" : "Make it"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AutomationItem({ a, brands, onEdit }: { a: AutomationRow; brands: Brand[]; onEdit: () => void }) {
  const router = useRouter();
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const load = async () => setRuns(await send("GET", `/api/v1/automations/${a.id}/runs`));
  const toggle = async () => {
    setOpen(!open);
    if (!open) await load();
  };
  // Now, with a sample event, on or off: the run lands in the log, opened to show it.
  const test = async () => {
    setTesting(true);
    const r = await sendResult("POST", `/api/v1/automations/${a.id}/test`);
    setTesting(false);
    if (!r.ok) return;
    const run = r.data as Run;
    if (run.status === "delivered") toast.success(a.action === "email" ? `Test sent to ${a.emails.join(", ")}` : `Test delivered to ${a.host}`);
    else toast.error(`The test didn't go through: ${run.attempts.at(-1)?.error ?? "it failed"}`);
    setOpen(true);
    await load();
    router.refresh();
  };
  return (
    <li className="space-y-3 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
          <IconButton variant="ghost" size="icon-xs" label={open ? `Hide the runs of ${a.name}` : `Show the runs of ${a.name}`} onClick={toggle}>
            {open ? <IconChevronDown /> : <IconChevronRight />}
          </IconButton>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{a.name}</p>
            <p className="text-muted-foreground truncate text-xs">
              {when(a, brands)}, {then(a)}
            </p>
          </div>
        </div>
        <div className="ms-auto flex items-center gap-2">
          {a.last && (
            <Badge variant={STATUS[a.last.status].variant} title={exact(a.last.at)}>
              {STATUS[a.last.status].label} {ago(a.last.at)}
            </Badge>
          )}
          <Button size="xs" variant="outline" pending={testing} onClick={test} title="Send it now with a sample, without releasing anything">
            <IconSend /> Send a test
          </Button>
          <Switch
            checked={a.enabled}
            aria-label={`${a.name} on`}
            onCheckedChange={async (enabled) => (await send("PATCH", `/api/v1/automations/${a.id}`, { enabled })) && router.refresh()}
          />
          <IconButton variant="ghost" size="icon-sm" label={`Change ${a.name}`} className="text-muted-foreground" onClick={onEdit}>
            <IconPencil />
          </IconButton>
          <Confirm
            title={`Delete ${a.name}?`}
            says="It stops at once, and its run log goes with it."
            action="Delete"
            run={async () => {
              const done = await send("DELETE", `/api/v1/automations/${a.id}`);
              if (done) router.refresh();
              return done;
            }}
          >
            <IconButton variant="ghost" size="icon-sm" label={`Delete ${a.name}`} className="text-muted-foreground hover:text-destructive">
              <IconTrash />
            </IconButton>
          </Confirm>
        </div>
      </div>
      {open && (
        <div className="ms-9">
          {!runs ? null : !runs.length ? (
            <p className="text-muted-foreground">It hasn&apos;t run yet. Send a test to see what it sends.</p>
          ) : (
            <ul className="space-y-2">
              {runs.map((r) => (
                <li key={r.id} className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                    {r.test && <Badge variant="outline">Test</Badge>}
                    <span className="min-w-0">{subject(r.payload)}</span>
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
