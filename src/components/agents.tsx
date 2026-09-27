"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { IconAlertTriangle, IconCircleCheck, IconExternalLink, IconKey, IconLoader2, IconPlus, IconRobot, IconTrash } from "@tabler/icons-react";
import { useCan } from "@/components/can";
import { toast } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/brand";
import { Snippet } from "@/components/agent-access";
import { AGENTS, GROUPS, type Agent, type Part } from "@/components/agent-catalog";
import { send } from "@/components/collections";
import { scopeLabel, SCOPE_LABELS } from "@/components/consent";
import { Field } from "@/components/fields";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SidebarData } from "@/lib/sidebar";
import type { Scope } from "@/lib/scopes";
import { ago, exact } from "@/lib/time";

export type Key = {
  id: string;
  name: string;
  prefix: string;
  scope: Scope;
  createdAt: string;
  lastUsedAt: string | null;
  calls: number;
  owner: string | null;
  waiting: number;
};

/**
 * Connect an agent: pick it from its group's tab, follow its two lines, and watch
 * for its first call. Below, every agent connected, when it last called, and
 * what it left waiting in Review.
 */
export function Agents({
  keys: initialKeys,
  sidebar,
  origin,
  anonymous,
}: {
  keys: Key[];
  sidebar: SidebarData;
  origin: string;
  anonymous: Scope | null;
}) {
  const [keys, setKeys] = useState(initialKeys);
  const [open, setOpen] = useState<Agent | null>(null);
  const can = useCan();
  const mcp = `${origin}/api/v1/mcp`;

  return (
    <SidebarProvider>
      <AppSidebar
        me={sidebar.me}
        collections={sidebar.collections}
        brands={sidebar.brands}
        searches={sidebar.searches}
        reviewCount={sidebar.reviewCount}
      />
      <SidebarInset className="min-w-0">
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <span className="truncate text-sm font-semibold">Agents</span>
          <ThemeToggle className="ml-auto" />
        </header>

        <main className="mx-auto w-full max-w-4xl space-y-12 px-4 pt-10 pb-24 sm:px-8">
          <div className="space-y-3">
            <p className="text-primary flex items-center gap-2 text-sm font-medium">
              <IconRobot className="size-4" /> Any agent you already use
            </p>
            <h2 className="text-3xl font-semibold tracking-tight">Give an agent the brand</h2>
            <p className="text-muted-foreground text-lg text-pretty">
              A connected agent searches the library, reads the brand rules before it makes anything, and hands out
              assets at the right size. What it adds is only a suggestion: it waits in Review until you approve it.
            </p>
            <div className="max-w-xl space-y-1 pt-2">
              <p className="text-muted-foreground text-xs">One URL for all of them. Most sign you in on their own; no key to paste.</p>
              <Snippet text={mcp} what="the URL" />
            </div>
          </div>

          {(anonymous === "write" || anonymous === "admin") && (
            <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              <IconAlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="space-y-1">
                <p className="font-medium">Without a key, anyone can {anonymous === "admin" ? "do anything" : "change everything"}</p>
                <p className="text-muted-foreground">
                  <code className="font-mono text-xs">ANONYMOUS_SCOPE</code> is set to {anonymous}. Unless the library is meant to be public, remove it or set it to <code className="font-mono text-xs">read</code>.
                </p>
              </div>
            </div>
          )}

          <Tabs defaultValue={GROUPS[0]}>
            {/* Seven groups don't fit a phone: the tabs scroll sideways instead of wrapping. */}
            <div className="-mx-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0">
              <TabsList variant="line">
                {GROUPS.map((group) => (
                  <TabsTrigger key={group} value={group}>
                    {group}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {GROUPS.map((group) => (
              <TabsContent key={group} value={group} className="pt-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {AGENTS.filter((a) => a.group === group).map((a) => (
                    <button
                      key={a.name}
                      type="button"
                      onClick={() => setOpen(a)}
                      className="hover:bg-muted/60 hover:border-primary/40 flex min-w-0 items-start gap-3 rounded-lg border p-3 text-left transition-colors"
                    >
                      <a.icon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
                      <span className="grid min-w-0 gap-0.5">
                        <span className="truncate text-sm font-medium">{a.name}</span>
                        <span className="text-muted-foreground line-clamp-2 text-xs">{a.blurb}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>

          <Connected keys={keys.filter((k) => k.owner)} onRevoked={(id) => setKeys((ks) => ks.filter((k) => k.id !== id))} />

          {can("key.manage") && (
            <ApiKeys
              keys={keys.filter((k) => !k.owner)}
              onMade={(k) => setKeys((ks) => [...ks, k])}
              onRevoked={(id) => setKeys((ks) => ks.filter((k) => k.id !== id))}
            />
          )}

          <section className="space-y-3">
            <h3 className="text-lg font-semibold">Try it</h3>
            <p className="text-muted-foreground text-sm">
              Ask something only the brand can answer. Every page here has a For agents button with the exact call for what it shows.
            </p>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
              <li>&ldquo;What&apos;s our primary color on dark backgrounds, and how should it be used?&rdquo;</li>
              <li>&ldquo;Find our logo and give me a 512px PNG link.&rdquo;</li>
              <li>&ldquo;Add this photo to the library and suggest tags for it.&rdquo; (then look in Review)</li>
            </ul>
          </section>
        </main>
      </SidebarInset>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-xl">
          {open && <Setup agent={open} origin={origin} mcp={mcp} onKeys={setKeys} onMade={(k) => setKeys((ks) => [...ks, k])} />}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}

/**
 * One agent's setup, and whether it has called yet: the keys list is polled
 * while this is open, and the first key used since it opened is the one.
 */
function Setup({
  agent,
  origin,
  mcp,
  onKeys,
  onMade,
}: {
  agent: Agent;
  origin: string;
  mcp: string;
  onKeys: (k: Key[]) => void;
  onMade: (k: Key) => void;
}) {
  const can = useCan();
  const [secret, setSecret] = useState<string | null>(null);
  const [first, setFirst] = useState<Key | null>(null);
  const watch = agent.auth === "oauth" || agent.auth === "key" || agent.auth === "skill";

  useEffect(() => {
    if (!watch) return;
    const since = Date.now();
    const poll = setInterval(async () => {
      const res = await fetch("/api/v1/keys").catch(() => null);
      if (!res?.ok) return;
      const { data } = (await res.json()) as { data: Key[] };
      onKeys(data);
      const called = data.find((k) => k.lastUsedAt && new Date(k.lastUsedAt).getTime() >= since);
      if (called) {
        setFirst(called);
        clearInterval(poll);
      }
    }, 3000);
    return () => clearInterval(poll);
  }, [watch, onKeys]);

  const parts = agent.snippet({ origin, mcp, key: secret ?? "<key>" });
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <agent.icon className="text-muted-foreground size-5" /> {agent.name}
        </DialogTitle>
        <DialogDescription>{agent.blurb}</DialogDescription>
      </DialogHeader>

      {agent.auth === "key" &&
        (can("key.manage") ? (
          secret ? (
            <p className="border-primary/40 bg-primary/5 rounded-lg border p-3 text-sm">
              Key made. Copy it now: it is shown this once, and it&apos;s filled in below.
            </p>
          ) : (
            <NewKey
              name={agent.name}
              onMade={({ secret, ...k }) => {
                setSecret(secret);
                onMade(k);
              }}
            />
          )
        ) : (
          <p className="text-muted-foreground text-sm">This one needs a key, and making keys needs an admin. Ask one for a key with Suggest.</p>
        ))}

      <div className="min-w-0 space-y-3">
        {parts.map((p, i) => (
          <SetupPart key={i} part={p} />
        ))}
      </div>

      {watch && (
        <div className="flex items-center gap-2 border-t pt-4 text-sm">
          {first ? (
            <>
              <IconCircleCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
              <span>
                <span className="font-medium">{first.name}</span> made its first call.
              </span>
            </>
          ) : (
            <>
              <IconLoader2 className="text-muted-foreground size-4 animate-spin" />
              <span className="text-muted-foreground">Waiting for its first call…</span>
            </>
          )}
        </div>
      )}
    </>
  );
}

function SetupPart({ part }: { part: Part }) {
  if (typeof part === "string") return <p className="text-muted-foreground text-sm">{part}</p>;
  if ("href" in part) {
    return (
      <Button asChild>
        <a href={part.href}>
          <IconExternalLink /> {part.label}
        </a>
      </Button>
    );
  }
  return <Snippet text={part.copy} what={part.what} multiline={part.multiline} prose={part.prose} />;
}

/** Agents people connected (OAuth, `artbucket login`): the workspace's for an admin, yours for anyone else. */
function Connected({ keys, onRevoked }: { keys: Key[]; onRevoked: (id: string) => void }) {
  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold">Connected agents</h3>
      {!keys.length ? <p className="text-muted-foreground text-sm">None yet. Pick one above.</p> : <KeyList keys={keys} onRevoked={onRevoked} />}
    </section>
  );
}

/**
 * Keys an admin makes, for what can't sign in on its own: automations,
 * scripts, CI. They answer to nobody, so they're the workspace's to manage.
 */
function ApiKeys({ keys, onMade, onRevoked }: { keys: Key[]; onMade: (k: Key) => void; onRevoked: (id: string) => void }) {
  // The secret of the key just made: shown once.
  const [secret, setSecret] = useState<string | null>(null);
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">API keys</h3>
        <p className="text-muted-foreground text-sm">
          For what can&apos;t sign in on its own: n8n, scripts, CI. One per use, so you can revoke one without the others.
        </p>
      </div>
      <NewKey
        name=""
        onMade={({ secret, ...k }) => {
          setSecret(secret);
          onMade(k);
        }}
      />
      {secret && (
        <div className="border-primary/40 bg-primary/5 space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">Copy it now: it is shown this once</p>
          <Snippet text={secret} what="the key" />
        </div>
      )}
      {keys.length > 0 && <KeyList keys={keys} onRevoked={onRevoked} showPrefix />}
    </section>
  );
}

function KeyList({ keys, onRevoked, showPrefix }: { keys: Key[]; onRevoked: (id: string) => void; showPrefix?: boolean }) {
  return (
    <ul className="divide-y rounded-lg border">
      {keys.map((k) => (
        <li key={k.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
          <IconKey className="text-muted-foreground size-4 shrink-0" />
          <span className="min-w-0 truncate font-medium">{k.name}</span>
          <Badge variant="secondary">{scopeLabel(k.scope)}</Badge>
          {showPrefix && <code className="text-muted-foreground hidden font-mono text-xs sm:inline">{k.prefix}…</code>}
          {k.waiting > 0 && (
            <Link href="/?review" className="text-primary text-xs hover:underline">
              {k.waiting} waiting in Review
            </Link>
          )}
          <span className="text-muted-foreground ml-auto text-xs" title={k.lastUsedAt ? exact(k.lastUsedAt) : undefined} suppressHydrationWarning>
            {k.lastUsedAt ? `${ago(k.lastUsedAt)}, ${k.calls.toLocaleString()} call${k.calls === 1 ? "" : "s"}` : "Never called"}
          </span>
          <Revoke
            name={k.name}
            onRevoke={async () => {
              if (!(await send("DELETE", `/api/v1/keys/${k.id}`))) return;
              onRevoked(k.id);
              toast.success(`Revoked ${k.name}`);
            }}
          />
        </li>
      ))}
    </ul>
  );
}

function NewKey({ name: initial, onMade }: { name: string; onMade: (k: Key & { secret: string }) => void }) {
  const id = useId();
  const [name, setName] = useState(initial);
  const [scope, setScope] = useState<Scope>("propose");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const k = await send("POST", "/api/v1/keys", { name, scope });
        setBusy(false);
        if (!k) return;
        onMade(k);
        setName(initial);
      }}
    >
      <Field label="Name" htmlFor={`${id}-name`}>
        <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="n8n, nightly export…" maxLength={120} required />
      </Field>
      <Field label="It may" htmlFor={`${id}-scope`}>
        <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
          <SelectTrigger id={`${id}-scope`} className="w-full">
            <SelectValue>
              {scopeLabel(scope)}
              {scope === "propose" && <span className="text-muted-foreground"> (recommended)</span>}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SCOPE_LABELS.map((s) => (
              <SelectItem key={s.scope} value={s.scope}>
                <div className="grid">
                  <span>
                    {s.label}
                    {s.scope === "propose" && <span className="text-muted-foreground"> (recommended)</span>}
                  </span>
                  <span className="text-muted-foreground text-xs">{s.hint}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Button type="submit" disabled={busy || !name.trim()}>
        <IconPlus /> Make key
      </Button>
    </form>
  );
}

function Revoke({ name, onRevoke }: { name: string; onRevoke: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Revoke ${name}`} className="text-muted-foreground hover:text-destructive">
          <IconTrash />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Anything using it stops working at once, with a 401. What it already suggested stays in Review.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onRevoke}>
            Revoke
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
