"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconBolt, IconChevronDown, IconChevronRight, IconPencil, IconPlus, IconSend, IconTrash } from "@/components/icons";
import { useCan, useMe } from "@/components/can";
import { Confirm } from "@/components/confirm";
import { CopyButton } from "@/components/copy-button";
import { IconButton } from "@/components/icon-button";
import { AppHeader, PageHeader } from "@/components/page";
import { PlanGate } from "@/components/plan-gate";
import { has } from "@/components/settings/sections";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RECIPES, summaryOf, type AutomationTrigger, type FixKind, type Recipe, type WebhookFormat } from "@/lib/automations";
import { send, sendResult } from "@/lib/send";
import { ago, exact } from "@/lib/time";

/**
 * The project's automations (GET /api/v1/automations), a page of their own:
 * when a brand is released, a license is about to end, governance changes,
 * the use check keeps refusing an asset, Fixes finds something or a proposal
 * waits, an email or a webhook (signed JSON, Slack or Teams). Each is made and changed in one dialog, sends a test on
 * demand (POST /api/v1/automations/{id}/test), and opens on its run log,
 * read when opened. A webhook's secret is shown once, as it is made.
 */

type Status = "pending" | "delivered" | "failed";
export type AutomationRow = {
  id: string;
  name: string;
  trigger: AutomationTrigger;
  brand: string | null;
  days: number | null;
  actions: string[];
  times: number | null;
  kind: FixKind | null;
  action: "email" | "webhook";
  emails: string[];
  host: string | null;
  format: WebhookFormat;
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

/** The picker's triggers, grouped as a person looks for them. */
const TRIGGERS: { group: string; items: { value: AutomationTrigger; label: string }[] }[] = [
  { group: "Brand", items: [{ value: "brand.released", label: "A brand is released" }] },
  {
    group: "Library",
    items: [
      { value: "asset.expiring", label: "A license is about to end" },
      { value: "check.refused", label: "The use check keeps refusing an asset" },
      { value: "review.waiting", label: "A proposal waits for review" },
    ],
  },
  { group: "Fixes", items: [{ value: "fix.opened", label: "Something new to fix" }] },
  { group: "Governance", items: [{ value: "governance", label: "Access, sharing or a decision changes" }] },
];
const FORMAT: Record<WebhookFormat, string> = { json: "a signed webhook", slack: "Slack", teams: "Teams" };
const KIND: Record<FixKind, string> = { stale: "A place loads a replaced version", gap: "A search found nothing" };
const times = (n: number | null, one: string) => `${n ?? 0} ${one}${n === 1 ? "" : "s"}`;

function when(a: AutomationRow, brands: Brand[]) {
  switch (a.trigger) {
    case "brand.released":
      return `When ${a.brand ? (brands.find((b) => b.slug === a.brand)?.name ?? a.brand) : "any brand"} is released`;
    case "asset.expiring":
      return `${a.days === 0 ? "On" : `${a.days} days before`} an asset's last day of use`;
    case "governance":
      return a.actions.length ? `On ${a.actions.join(", ")}` : "On any governance change";
    case "check.refused":
      return `When an asset is refused ${times(a.times, "time")} in ${times(a.days, "day")}`;
    case "fix.opened":
      return a.kind ? `When Fixes finds: ${KIND[a.kind].toLowerCase()}` : "When Fixes finds something new";
    case "review.waiting":
      return `When a proposal waits ${times(a.days, "day")}`;
  }
}
/** A recipe as the dialog starts from it: everything but who it tells. */
const seedOf = (r: Recipe): Partial<AutomationRow> => ({
  name: r.name,
  trigger: r.trigger,
  days: r.days ?? null,
  times: r.times ?? null,
  actions: r.actions ?? [],
  kind: r.kind ?? null,
  action: r.action,
  format: r.format ?? "json",
});

const then = (a: AutomationRow) => (a.action === "email" ? `email ${a.emails.join(", ")}` : `post ${a.format === "json" ? "" : `to ${FORMAT[a.format]} `}on ${a.host}`);

export function Automations({ automations, brands }: { automations: AutomationRow[]; brands: Brand[] }) {
  const [editing, setEditing] = useState<{ of: AutomationRow | null; seed?: Partial<AutomationRow>; n: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState<{ name: string; secret: string } | null>(null);
  const can = useCan();
  const me = useMe();
  // Without the plan's automations (lib/limits.ts) they are kept and listed, never fired: nothing to make, change or test.
  const planned = !me || has(me, "automations");
  // An editor starts only from what they may make: a brand's releases.
  const recipes = can("automation.manage_all") ? RECIPES : RECIPES.filter((r) => r.trigger === "brand.released");
  const edit = (of: AutomationRow | null, recipe?: Recipe) => {
    setEditing((e) => ({ of, seed: recipe && seedOf(recipe), n: (e?.n ?? 0) + 1 }));
    setOpen(true);
  };
  return (
    <>
      <AppHeader trail={[{ label: "Automations" }]} />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-6 pb-16 md:px-6">
        <PageHeader
          icon={<IconBolt />}
          title="Automations"
          description="Let people, Slack, Teams or your other tools know when a brand is released, a license is about to end, or who may do what changes."
        >
          {planned && automations.length > 0 && (
            <div className="flex items-center gap-2">
              {recipes.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    From a recipe <IconChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  {recipes.map((r) => (
                    <DropdownMenuItem key={r.id} onSelect={() => edit(null, r)} className="grid gap-0.5">
                      <span>{r.name}</span>
                      <span className="text-muted-foreground text-xs text-pretty">{r.says}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              )}
              <Button size="sm" onClick={() => edit(null)}>
                <IconPlus /> New automation
              </Button>
            </div>
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
        {!planned && (
          <PlanGate
            icon={<IconBolt />}
            title={automations.length ? "Your automations are paused" : "Automations aren't in your plan"}
            description={
              automations.length
                ? "They are kept, with their run logs, but none fires, and none can be made, changed or tested on this organization's plan."
                : "Email your team when a brand is released, warn legal before a license runs out, or post a webhook to Slack, Teams or your own tools."
            }
          />
        )}
        {automations.length ? (
          <ul className="divide-y rounded-lg border">
            {automations.map((a) => (
              <AutomationItem key={a.id} a={a} brands={brands} planned={planned} onEdit={() => edit(a)} />
            ))}
          </ul>
        ) : (
          planned && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconBolt />
              </EmptyMedia>
              <EmptyTitle>Nothing automated yet</EmptyTitle>
              <EmptyDescription>
                Email your team when a brand is released, warn legal before a license runs out, tell Slack when something is shared publicly, or post a webhook that rebuilds your site.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => edit(null)}>
                <IconPlus /> New automation
              </Button>
            </EmptyContent>
            {recipes.length > 0 && (
            <div className="grid w-full max-w-3xl gap-2 pt-4 text-start sm:grid-cols-2">
              <p className="text-muted-foreground text-xs sm:col-span-2">Or start from a recipe:</p>
              {recipes.map((r) => (
                <button key={r.id} type="button" onClick={() => edit(null, r)} className="hover:bg-muted/60 grid gap-0.5 rounded-lg border p-3 text-start transition-colors">
                  <span className="text-sm font-medium">{r.name}</span>
                  <span className="text-muted-foreground text-xs text-pretty">{r.says}</span>
                </button>
              ))}
            </div>
            )}
          </Empty>
          )
        )}
      </div>
      {editing && (
        <AutomationDialog
          key={editing.n}
          open={open}
          automation={editing.of}
          seed={editing.seed}
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
  seed,
  brands,
  onClose,
  onSaved,
}: {
  open: boolean;
  automation: AutomationRow | null;
  /** A recipe's settings to start a new one from. */
  seed?: Partial<AutomationRow>;
  brands: Brand[];
  onClose: () => void;
  onSaved: (a: Made) => void;
}) {
  const id = useId();
  const router = useRouter();
  const can = useCan();
  // An editor of a brand makes its release automations; every other trigger, and any brand, reach what only admins see.
  const all = can("automation.manage_all");
  const mine = all ? brands : brands.filter((b) => can("automation.manage", b));
  // What the fields start from: the automation being changed, else a recipe.
  const from: Partial<AutomationRow> | null = a ?? seed ?? null;
  const [trigger, setTrigger] = useState<AutomationRow["trigger"]>(from?.trigger ?? "brand.released");
  const [action, setAction] = useState<AutomationRow["action"]>(from?.action ?? "email");
  const [format, setFormat] = useState<WebhookFormat>(from?.format ?? "json");
  const [brand, setBrand] = useState(from?.brand ?? (all ? ANY : (mine[0]?.slug ?? ANY)));
  const [kind, setKind] = useState<string>(from?.kind ?? ANY);
  // What each trigger was saved with shows again only for that trigger.
  const was = from?.trigger === trigger ? from : null;
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
            const list = (k: string) => text(k).split(/[\s,;]+/).filter(Boolean);
            const body = {
              name: text("name"),
              trigger,
              ...(trigger === "brand.released" && { brand: brand === ANY ? null : brand }),
              ...(["asset.expiring", "check.refused", "review.waiting"].includes(trigger) && { days: Number(text("days")) }),
              ...(trigger === "check.refused" && { times: Number(text("times")) }),
              ...(trigger === "governance" && { actions: list("actions") }),
              ...(trigger === "fix.opened" && { kind: kind === ANY ? null : kind }),
              action,
              ...(action === "email" ? { emails: list("emails") } : { format, ...(text("url") && { url: text("url") }) }),
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
              <Input id={`${id}-name`} name="name" required maxLength={80} defaultValue={from?.name} placeholder="Tell the brand team" />
            </div>
            <div className="grid gap-1.5">
              <Label>When</Label>
              <Select value={trigger} onValueChange={(v) => setTrigger(v as AutomationRow["trigger"])}>
                <SelectTrigger className="w-full" aria-label="When">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGERS.map((g) => ({ ...g, items: g.items.filter((t) => all || t.value === "brand.released") })).filter((g) => g.items.length).map((g) => (
                    <SelectGroup key={g.group}>
                      <SelectLabel>{g.group}</SelectLabel>
                      {g.items.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {trigger === "brand.released" && (
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
            )}
            {trigger === "asset.expiring" && (
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-days`}>Days before its last day</Label>
                <Input id={`${id}-days`} name="days" type="number" required min={0} max={365} defaultValue={was?.days ?? 30} />
              </div>
            )}
            {trigger === "review.waiting" && (
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-days`}>Days in review</Label>
                <Input id={`${id}-days`} name="days" type="number" required min={0} max={365} defaultValue={was?.days ?? 3} />
              </div>
            )}
            {trigger === "fix.opened" && (
              <div className="grid gap-1.5">
                <Label>What</Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger className="w-full" aria-label="What">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>Anything new</SelectItem>
                    {(Object.keys(KIND) as FixKind[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {KIND[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {trigger === "check.refused" && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${id}-times`}>Refused this many times</Label>
                  <Input id={`${id}-times`} name="times" type="number" required min={1} max={1000} defaultValue={was?.times ?? 3} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${id}-days`}>Within days</Label>
                  <Input id={`${id}-days`} name="days" type="number" required min={1} max={365} defaultValue={was?.days ?? 7} />
                </div>
              </>
            )}
            {trigger === "governance" && (
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor={`${id}-actions`}>Changes</Label>
                <Input id={`${id}-actions`} name="actions" defaultValue={was?.actions?.join(", ")} placeholder="share.*, grant.set, key.created, asset.approved" />
                <p className="text-muted-foreground text-xs">Actions of the audit log, or an asset decision, by name or ending in .* for a family. Empty: every change.</p>
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
                  <SelectItem value="webhook">Post a webhook</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {action === "webhook" && (
              <div className="grid gap-1.5 sm:col-span-2">
                <Label>As</Label>
                <Select value={format} onValueChange={(v) => setFormat(v as WebhookFormat)}>
                  <SelectTrigger className="w-full" aria-label="As">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="json">Signed JSON, for your own tools</SelectItem>
                    <SelectItem value="slack">A Slack message (incoming webhook)</SelectItem>
                    <SelectItem value="teams">A Teams message (workflow webhook)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
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
                  placeholder={
                    keeps ? `Keep the one on ${a.host}` : format === "slack" ? "https://hooks.slack.com/services/..." : format === "teams" ? "https://...logic.azure.com/workflows/..." : "https://example.com/hooks/artbucket"
                  }
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

function AutomationItem({ a, brands, planned, onEdit }: { a: AutomationRow; brands: Brand[]; planned: boolean; onEdit: () => void }) {
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
          {planned && (
            <>
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
            </>
          )}
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
            <p className="text-muted-foreground">It hasn&apos;t run yet.{planned && " Send a test to see what it sends."}</p>
          ) : (
            <ul className="space-y-2">
              {runs.map((r) => (
                <li key={r.id} className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                    {r.test && <Badge variant="outline">Test</Badge>}
                    <span className="min-w-0">{summaryOf({ ...r.payload, test: false })}</span>
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

