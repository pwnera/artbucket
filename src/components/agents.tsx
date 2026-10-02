"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { IconAlertTriangle, IconCircleCheck, IconKey, IconPlus, IconRobot, IconSearch, IconTrash, IconX } from "@tabler/icons-react";
import { toast } from "sonner";
import { Initials } from "@/components/activity";
import { SetupPart, Snippet } from "@/components/agent-access";
import { AGENTS, GROUPS, type Agent } from "@/components/agent-catalog";
import { useCan } from "@/components/can";
import { Confirm } from "@/components/confirm";
import { scopeLabel, SCOPE_LABELS } from "@/components/consent";
import { Field } from "@/components/fields";
import { IconButton } from "@/components/icon-button";
import { InfoTip } from "@/components/info-tip";
import { AppHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { REASON } from "@/lib/insights";
import { contextLabel } from "@/lib/rules";
import type { Scope } from "@/lib/scopes";
import { send } from "@/lib/send";
import { ago, exact } from "@/lib/time";
import { cn } from "@/lib/utils";
import { collapse } from "@/lib/motion";
import { Waiting } from "@/components/waiting";

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

/** GET /api/v1/insights/connections, as lib/schemas.ts Connections has it. */
export type Asked = {
  days: number;
  clients: {
    client: string;
    events: number;
    tools: { name: string; calls: number; failed: number }[];
    contexts: { context: string; count: number }[];
    refusals: { total: number; reasons: { code: string; count: number }[] };
    fetches: number;
    searches: number;
  }[];
};

/** What to ask first, once connected: something only the brand can answer. */
const TRY = [
  "What's our primary color on dark backgrounds, and how should it be used?",
  "Find our logo and give me a 512px PNG link.",
  "Add this photo to the library and suggest tags for it.",
];

/** The access levels an agent is given, in the prototype's words; Admin is for keys only and not offered to agents. */
const LEVELS: { scope: Scope; says: string }[] = [
  { scope: "read", says: "Search, rules, use checks." },
  { scope: "propose", says: "Changes wait for a person, in Review." },
  { scope: "write", says: "Writes go live." },
];

/** Where a search that finds nothing points: every MCP client connects the same way. */
const ANY = AGENTS.find((a) => a.name === "Any MCP client");

/**
 * Connect an agent: find it or pick it from its group's tab, follow its two
 * lines, and watch for its first call. Below, every agent connected, when it
 * last called, and what it left waiting in Review; then, for whoever reads
 * Insights (`asked`), what each asked for.
 */
export function Agents({
  keys: initialKeys,
  origin,
  anonymous,
  asked,
}: {
  keys: Key[];
  origin: string;
  anonymous: Scope | null;
  asked: Asked | null;
}) {
  const [keys, setKeys] = useState(initialKeys);
  const [open, setOpen] = useState(false);
  // The agent last opened stays, so the dialog keeps its content while it animates closed.
  const [shown, setShown] = useState<{ agent: Agent; round: number } | null>(null);
  // A shown-once key is on screen: closing asks first, unless it is Done.
  const [holding, setHolding] = useState(false);
  const [asking, setAsking] = useState(false);
  const [q, setQ] = useState("");
  const can = useCan();
  const mcp = `${origin}/api/v1/mcp`;
  const needle = q.trim().toLowerCase();
  const found = needle ? AGENTS.filter((a) => `${a.name} ${a.blurb}`.toLowerCase().includes(needle)) : [];

  const pick = (agent: Agent) => {
    setShown((s) => ({ agent, round: (s?.round ?? 0) + 1 }));
    setHolding(false);
    setOpen(true);
  };
  const grid = (list: Agent[]) => (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {list.map((a) => (
        <button
          key={a.name}
          type="button"
          onClick={() => pick(a)}
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
  );

  return (
    <>
      <AppHeader trail={[{ label: "Connections" }]} />

      <div className="mx-auto w-full max-w-4xl space-y-12 px-4 pt-10 pb-24 sm:px-8">
        <div className="space-y-3">
          <p className="text-primary-ink flex items-center gap-2 text-sm font-medium">
            <IconRobot className="size-4" /> Any agent you already use
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Give an agent the brand</h1>
          <p className="text-muted-foreground text-lg text-pretty">
            It searches the library and follows the brand rules. What it adds waits in Review.
          </p>
          <div className="max-w-xl space-y-1 pt-2">
            <p className="text-muted-foreground text-xs">One URL for all. Most sign in on their own, no key.</p>
            <Snippet text={mcp} what="the URL" />
          </div>
          {/* The access an agent can be given, as the prototype lays them out: picked when it signs in, or on its key. */}
          <ul aria-label="Access an agent can have" className="grid max-w-xl gap-2 pt-2 sm:grid-cols-3">
            {LEVELS.map((l) => (
              <li key={l.scope} className="grid gap-0.5 rounded-lg border p-3">
                <span className="text-sm font-medium">
                  {scopeLabel(l.scope)}
                  {l.scope === "propose" && <span className="text-muted-foreground font-normal"> (recommended)</span>}
                </span>
                <span className="text-muted-foreground text-xs">{l.says}</span>
              </li>
            ))}
          </ul>
        </div>

        {(anonymous === "write" || anonymous === "admin") && (
          <div className="border-warning/40 bg-warning/10 flex gap-3 rounded-lg border p-4 text-sm">
            <IconAlertTriangle className="text-warning size-5 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium">Without a key, anyone can {anonymous === "admin" ? "do anything" : "change everything"}</p>
              <p className="text-muted-foreground">
                <code className="font-mono text-xs">ANONYMOUS_SCOPE</code> is set to {anonymous}. Unless the library is meant to be public, remove it or set it to <code className="font-mono text-xs">read</code>.
              </p>
            </div>
          </div>
        )}

        <section className="space-y-3" aria-label="Agents to connect">
          <div className="relative max-w-sm">
            <IconSearch className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find your agent" aria-label="Find your agent" className="pl-8" />
          </div>
          {needle ? (
            found.length ? (
              grid(found)
            ) : (
              <Empty size="sm" className="border">
                <EmptyHeader>
                  <EmptyTitle>No agent called &ldquo;{q.trim()}&rdquo; here</EmptyTitle>
                  <EmptyDescription>Any MCP client connects with the URL above.</EmptyDescription>
                </EmptyHeader>
                {ANY && (
                  <Button variant="outline" size="sm" onClick={() => pick(ANY)}>
                    Set up any MCP client
                  </Button>
                )}
              </Empty>
            )
          ) : (
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
                  {grid(AGENTS.filter((a) => a.group === group))}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </section>

        {asked && <AskedFor asked={asked} keys={keys} />}

        <Connected keys={keys.filter((k) => k.owner)} onRevoked={(id) => setKeys((ks) => ks.filter((k) => k.id !== id))} />

        {can("key.manage") && (
          <ApiKeys
            keys={keys.filter((k) => !k.owner)}
            onMade={(k) => setKeys((ks) => [...ks, k])}
            onRevoked={(id) => setKeys((ks) => ks.filter((k) => k.id !== id))}
          />
        )}

        <section className="space-y-3">
          <div className="flex items-center gap-1.5">
            <h2 className="font-display text-lg font-semibold">Try it</h2>
            <InfoTip>Every page here has a For agents button with the exact call for what it shows.</InfoTip>
          </div>
          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
            <li>&ldquo;{TRY[0]}&rdquo;</li>
            <li>&ldquo;{TRY[1]}&rdquo;</li>
            <li>&ldquo;{TRY[2]}&rdquo; (then look in Review)</li>
          </ul>
        </section>
      </div>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : holding ? setAsking(true) : setOpen(false))}>
        <DialogContent className="sm:max-w-xl">
          {shown && (
            <Setup
              // A fresh one per opening: its key, its snapshot and its watch start over.
              key={shown.round}
              agent={shown.agent}
              active={open}
              keys={keys}
              origin={origin}
              mcp={mcp}
              onKeys={setKeys}
              onMade={(k) => {
                setKeys((ks) => [...ks, k]);
                setHolding(true);
              }}
              onDone={() => setOpen(false)}
            />
          )}
          <Confirm
            open={asking}
            onOpenChange={setAsking}
            title="Close without copying the key?"
            says="It is shown only once. To get another, revoke it and make a new one."
            action="Close"
            run={() => {
              setOpen(false);
              return true;
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * One agent's setup, and whether it has called yet: the keys list is polled
 * while this is open. The first call is from a key that wasn't there when it
 * opened (or the key made here), so another agent's traffic isn't mistaken
 * for this one's.
 */
function Setup({
  agent,
  active,
  keys,
  origin,
  mcp,
  onKeys,
  onMade,
  onDone,
}: {
  agent: Agent;
  active: boolean;
  keys: Key[];
  origin: string;
  mcp: string;
  onKeys: (k: Key[]) => void;
  onMade: (k: Key) => void;
  onDone: () => void;
}) {
  const can = useCan();
  const [secret, setSecret] = useState<{ id: string; secret: string } | null>(null);
  const [first, setFirst] = useState<Key | null>(null);
  // The keys there were when it opened: none of them is this agent's first call.
  const [known] = useState(() => new Set(keys.map((k) => k.id)));
  const watch = (agent.auth === "oauth" || agent.auth === "key" || agent.auth === "skill") && active && !first;
  const made = secret?.id;

  useEffect(() => {
    if (!watch) return;
    const poll = setInterval(async () => {
      const res = await fetch("/api/v1/keys").catch(() => null);
      if (!res?.ok) return;
      const { data } = (await res.json()) as { data: Key[] };
      onKeys(data);
      const called = data.find((k) => k.lastUsedAt && (made ? k.id === made : !known.has(k.id)));
      if (called) setFirst(called);
    }, 3000);
    return () => clearInterval(poll);
  }, [watch, made, known, onKeys]);

  const parts = agent.snippet({ origin, mcp, key: secret?.secret ?? "<key>" });
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
              Key filled in below. Copy it now: it is shown only once.
            </p>
          ) : (
            <NewKey
              name={agent.name}
              onMade={({ secret, ...k }) => {
                setSecret({ id: k.id, secret });
                onMade(k);
              }}
            />
          )
        ) : (
          <p className="text-muted-foreground text-sm">
            Needs a key: ask an admin for one with the Suggest scope.
          </p>
        ))}

      <div className="min-w-0 space-y-3">
        {parts.map((p, i) => (
          <SetupPart key={i} part={p} />
        ))}
      </div>

      {first ? (
        <div className="animate-in fade-in-0 zoom-in-95 space-y-3 border-t pt-4 duration-200">
          <p className="flex items-center gap-2 text-sm">
            <IconCircleCheck className="text-success size-4" />
            <span>
              <span className="font-medium">{first.name}</span> is connected.
            </span>
          </p>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Try it: ask it this</p>
            <Snippet text={TRY[0]!} what="the prompt" prose />
          </div>
          <div className="flex justify-end">
            <Button onClick={onDone}>Done</Button>
          </div>
        </div>
      ) : (
        (agent.auth === "oauth" || agent.auth === "key" || agent.auth === "skill") && (
          <div className="flex items-center gap-2 border-t pt-4 text-sm">
            <Waiting what="Waiting for its first call" className="text-sm" />
            {secret && (
              <Button variant="outline" size="sm" className="ml-auto" onClick={onDone}>
                Done
              </Button>
            )}
          </div>
        )
      )}
    </>
  );
}

/** Agents people connected (OAuth, `artbucket login`): the workspace's for an admin, yours for anyone else. */
function Connected({ keys, onRevoked }: { keys: Key[]; onRevoked: (id: string) => void }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-semibold">Connected agents</h2>
      {!keys.length ? <p className="text-muted-foreground text-sm">None yet. Pick one above.</p> : <KeyList keys={keys} onRevoked={onRevoked} />}
    </section>
  );
}

const count = (n: number, what: string) => `${n.toLocaleString()} ${what}${n === 1 ? "" : "s"}`;

const th = "px-3 py-2 font-medium";
const td = "px-3 py-2";

/**
 * What each agent asked for (PRD: Connections), from Insights' events, as the
 * prototype's table has it: the client, where it runs and what it may do (its
 * key's owner and scope), its calls, the tool it asks for most (hover for
 * all of them and the contexts), and what it was refused. An agent is its
 * key's name, so two keys named alike read as one.
 */
function AskedFor({ asked, keys }: { asked: Asked; keys: Key[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1.5">
        <h2 className="font-display text-lg font-semibold">What they asked for</h2>
        <InfoTip>The last {asked.days} days, by agent. Tools keep their name, never what was passed to them.</InfoTip>
        <Link href="/insights/checks" className="text-muted-foreground hover:text-foreground ms-auto text-xs underline underline-offset-2">
          Use checks
        </Link>
      </div>
      {!asked.clients.length ? (
        <p className="text-muted-foreground text-sm">Nothing yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground bg-muted/40 text-left text-xs">
              <tr>
                <th className={th}>Client</th>
                <th className={th}>Where</th>
                <th className={th}>Access</th>
                <th className={cn(th, "text-right")}>Calls, {asked.days} days</th>
                <th className={th}>Asks for most</th>
                <th className={cn(th, "text-right")}>Refused</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {asked.clients.map((c) => {
                const key = keys.find((k) => k.name === c.client);
                const top = c.tools[0];
                const all = [
                  ...c.tools.map((t) => `${t.name} ${t.calls.toLocaleString()}${t.failed ? ` (${t.failed.toLocaleString()} failed)` : ""}`),
                  ...c.contexts.map((x) => `${contextLabel(x.context)} ${x.count.toLocaleString()}`),
                ].join(", ");
                return (
                  <tr key={c.client}>
                    <td className={cn(td, "font-medium")}>{c.client}</td>
                    <td className={cn(td, "text-muted-foreground")}>{key ? (key.owner ?? "API key") : "Revoked"}</td>
                    <td className={td}>{key && <Badge variant="secondary">{scopeLabel(key.scope)}</Badge>}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{c.events.toLocaleString()}</td>
                    <td className={td} title={all || undefined}>
                      {top ? (
                        <code className="font-mono text-xs">
                          {top.name}
                          {c.contexts[0] && `(${c.contexts[0].context})`}
                        </code>
                      ) : (
                        <span className="text-muted-foreground text-xs">{[c.fetches && count(c.fetches, "file"), c.searches && `${c.searches.toLocaleString()} search${c.searches === 1 ? "" : "es"}`].filter(Boolean).join(", ")}</span>
                      )}
                    </td>
                    <td
                      className={cn(td, "text-right tabular-nums")}
                      title={c.refusals.reasons.map((r) => `${REASON[r.code] ?? r.code} ${r.count.toLocaleString()}`).join(", ") || undefined}
                    >
                      {c.refusals.total === 0 ? (
                        <span className="text-muted-foreground">0</span>
                      ) : (
                        <span className="text-warning">
                          {c.refusals.total.toLocaleString()}
                          {c.refusals.reasons[0] && `, ${(REASON[c.refusals.reasons[0].code] ?? c.refusals.reasons[0].code).toLowerCase()}`}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Keys an admin makes, for what can't sign in on its own: automations,
 * scripts, CI. They answer to nobody, so they're the workspace's to manage.
 */
function ApiKeys({ keys, onMade, onRevoked }: { keys: Key[]; onMade: (k: Key) => void; onRevoked: (id: string) => void }) {
  // The key just made: its secret, shown once, until dismissed.
  const [made, setMade] = useState<{ id: string; name: string; secret: string } | null>(null);
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-1.5">
        <h2 className="font-display text-lg font-semibold">API keys</h2>
        <InfoTip>For what can&apos;t sign in on its own: n8n, scripts, CI. One per use, so you can revoke one without the others.</InfoTip>
      </div>
      <NewKey
        name=""
        onMade={({ secret, ...k }) => {
          setMade({ id: k.id, name: k.name, secret });
          onMade(k);
        }}
      />
      {made && (
        <div key={made.id} className="border-primary/40 bg-primary/5 animate-in fade-in-0 space-y-2 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <p className="flex-1 text-sm font-medium">Copy {made.name} now: it is shown this once</p>
            <IconButton variant="ghost" size="icon-xs" label="Done, I copied it" onClick={() => setMade(null)}>
              <IconX />
            </IconButton>
          </div>
          <Snippet text={made.secret} what="the key" />
        </div>
      )}
      {keys.length > 0 && <KeyList keys={keys} onRevoked={onRevoked} showPrefix fresh={made?.id} />}
    </section>
  );
}

function KeyList({ keys, onRevoked, showPrefix, fresh }: { keys: Key[]; onRevoked: (id: string) => void; showPrefix?: boolean; fresh?: string }) {
  return (
    <ul className="divide-y rounded-lg border">
      {keys.map((k) => {
        const whose = k.owner ? `${k.owner}'s ${k.name}` : k.name;
        return (
          // The key just made stays where the API lists it, last, and flashes so it is found.
          <li key={k.id} data-api-key={k.id} data-flash={k.id === fresh || undefined} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
            {k.owner ? <Initials name={k.owner} className="size-5 text-[9px]" /> : <IconKey className="text-muted-foreground size-4 shrink-0" />}
            <span className="min-w-0 truncate font-medium">{k.name}</span>
            {k.owner && <span className="text-muted-foreground min-w-0 truncate text-xs">{k.owner}</span>}
            <Badge variant="secondary">{scopeLabel(k.scope)}</Badge>
            {showPrefix && <code className="text-muted-foreground hidden font-mono text-xs sm:inline">{k.prefix}…</code>}
            {k.waiting > 0 && (
              <Link href="/?review" className="text-primary-ink text-xs hover:underline">
                {k.waiting} waiting in Review
              </Link>
            )}
            <span className="text-muted-foreground ml-auto text-xs" title={k.lastUsedAt ? exact(k.lastUsedAt) : undefined} suppressHydrationWarning>
              {k.lastUsedAt ? `${ago(k.lastUsedAt)}, ${k.calls.toLocaleString()} call${k.calls === 1 ? "" : "s"}` : "Never called"}
            </span>
            <Confirm
              title={`Revoke ${whose}?`}
              says="Anything using it stops working at once, with a 401. What it already suggested stays in Review."
              action="Revoke"
              run={async () => {
                const ok = await send("DELETE", `/api/v1/keys/${k.id}`);
                if (!ok) return null;
                collapse(document.querySelector(`[data-api-key="${CSS.escape(k.id)}"]`), () => onRevoked(k.id));
                toast.success(`Revoked ${whose}`);
                return ok;
              }}
            >
              <IconButton variant="ghost" label={`Revoke ${whose}`} className="text-muted-foreground hover:text-destructive">
                <IconTrash />
              </IconButton>
            </Confirm>
          </li>
        );
      })}
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
      <Button type="submit" pending={busy} disabled={!name.trim()}>
        <IconPlus /> Make key
      </Button>
    </form>
  );
}
