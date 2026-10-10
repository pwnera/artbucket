"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  IconAlertTriangle,
  IconBrandGithub,
  IconCircleCheck,
  IconKey,
  IconPlugConnected,
  IconPlus,
  IconSearch,
  IconSettings,
  IconStack2,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { Initials } from "@/components/activity";
import { SetupPart, Snippet } from "@/components/agent-access";
import type { BrandInfo } from "@/components/brand-switcher";
import type { Source } from "@/components/builder/use-status";
import { AGENTS, GROUPS, type Agent, type Group } from "@/components/agent-catalog";
import { useCan } from "@/components/can";
import { Confirm } from "@/components/confirm";
import { mostOf, scopeLabel, ScopePicker, SCOPE_LABELS, ProjectPicker, type Givable } from "@/components/consent";
import { Field } from "@/components/fields";
import { IconButton } from "@/components/icon-button";
import { InfoTip } from "@/components/info-tip";
import { AppHeader, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ago as since } from "@/lib/hub";
import { REASON } from "@/lib/insights";
import { cappedScope, type Grantable } from "@/lib/oauth";
import { brandPath } from "@/lib/site";
import { contextLabel } from "@/lib/rules";
import { SCOPES, type Scope } from "@/lib/scopes";
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
  /** For an agent you connected: every project it works in. */
  projects?: string[] | null;
};

/** A brand kept in a Git repository too: GET /api/v1/brands/{slug}/source, beside the brand. */
export type Kept = { brand: BrandInfo; source: NonNullable<Source["source"]>; connect: string | null };

/** GET /api/v1/keys/{id}: an agent you connected, where it works and where it could. */
type Connection = {
  id: string;
  name: string;
  projects: { id: string; name: string; organization: string; scope: Scope }[];
  givable: Givable[];
};

/** A scope as a person may grant it: an agent's never goes past Edit. */
const grantable = (s: Scope): Grantable => (s === "admin" ? "write" : s);

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
const TRY = "What's our primary color on dark backgrounds, and how should it be used?";

/** Where a search that finds nothing points: every MCP client connects the same way. */
const ANY = AGENTS.find((a) => a.name === "Any MCP client");

const LABEL: Record<string, string> = { apps: "Apps", connected: "Connected", keys: "API keys", repositories: "Repositories" };

/** How each kind of agent gets in, on its card. */
const HOW: Record<Agent["auth"], string> = { oauth: "Signs in with your account", key: "Uses an API key", via: "Through Claude or ChatGPT", skill: "Through the CLI skill" };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
/**
 * The catalog agent a key is: its name before "(person)", as OAuth names it
 * after the client, or as the setup names a key it makes.
 * ponytail: matched by the name a client registers; one that names itself
 * oddly isn't marked on its card, and is still listed under Connected.
 */
const agentOf = (k: Key) => norm(k.name.replace(/\s*\([^)]*\)$/, ""));

/** An agent as a card: what it is, how it gets in, its logo, and whether it is connected here. */
function AppCard({ agent, connected, onOpen }: { agent: Agent; connected: number; onOpen: () => void }) {
  return (
    <li className="bg-card flex flex-col overflow-hidden rounded-xl border">
      <div className="flex flex-1 gap-3 p-4">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate font-medium">{agent.name}</p>
          <p className="text-muted-foreground text-xs">{HOW[agent.auth]}</p>
          <p className="text-muted-foreground pt-2 text-sm text-pretty">{agent.blurb}</p>
        </div>
        {/* Logos keep their brand colors, on white in both themes. */}
        <span className="grid size-10 shrink-0 place-items-center rounded-lg border bg-white">
          {agent.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- a small static SVG, nothing to optimize
            <img src={agent.logo} alt="" className="size-6" />
          ) : (
            <agent.icon className="size-5 text-neutral-600" />
          )}
        </span>
      </div>
      <div className="flex items-center gap-2 border-t px-4 py-3">
        <Button variant="outline" size="sm" onClick={onOpen} aria-label={`${connected ? "Setup for" : "Connect"} ${agent.name}`}>
          {connected ? "Setup" : "Connect"}
        </Button>
        {connected > 0 && (
          <span className="text-muted-foreground ms-auto flex items-center gap-1.5 text-xs">
            <span aria-hidden className="bg-success size-1.5 rounded-full" />
            {connected === 1 ? "Connected" : `${connected} connected`}
          </span>
        )}
      </div>
    </li>
  );
}

/**
 * Connections, a tab each, in the URL (`?tab=`): Apps, every agent the
 * catalog knows as a card, by group or found by name, each saying whether it
 * is connected; Connected, the agents people connected and, for whoever reads
 * Insights (`asked`), what each asked for; API keys, for an admin; and
 * Repositories, the brands kept in Git. Custom connection sets up any MCP
 * client.
 */
export function Agents({
  tab = "apps",
  keys: initialKeys,
  origin,
  anonymous,
  asked,
  kept = [],
  connect = null,
}: {
  /** The tab asked for on the server (`?tab=`): apps, connected, keys or repositories. */
  tab?: string;
  keys: Key[];
  origin: string;
  anonymous: Scope | null;
  asked: Asked | null;
  /** Brands kept in a Git repository too. */
  kept?: Kept[];
  /** Where a brand gets brought in from a repository (GIT_CONNECT_URL), for an admin on a server with one. */
  connect?: string | null;
}) {
  const [keys, setKeys] = useState(initialKeys);
  const [open, setOpen] = useState(false);
  // The agent last opened stays, so the dialog keeps its content while it animates closed.
  const [shown, setShown] = useState<{ agent: Agent; round: number } | null>(null);
  // A shown-once key is on screen: closing asks first, unless it is Done.
  const [holding, setHolding] = useState(false);
  const [asking, setAsking] = useState(false);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<Group | "All">("All");
  const params = useSearchParams();
  const can = useCan();
  const mcp = `${origin}/api/v1/mcp`;
  const needle = q.trim().toLowerCase();

  const pick = (agent: Agent) => {
    setShown((s) => ({ agent, round: (s?.round ?? 0) + 1 }));
    setHolding(false);
    setOpen(true);
  };
  const tabs = ["apps", "connected", can("key.manage") && "keys", (kept.length > 0 || connect) && "repositories"].filter(Boolean) as string[];
  const wanted = params.get("tab") ?? tab;
  const current = tabs.includes(wanted) ? wanted : "apps";
  const go = (t: string) => {
    const q = new URLSearchParams(params);
    q.set("tab", t);
    // Next keeps useSearchParams in step with the native history: the tab switches now, and the URL stays shareable.
    window.history.replaceState(null, "", `/connections?${q}`);
  };
  // A search looks through every group; otherwise the group picked.
  const list = AGENTS.filter((a) => (needle ? `${a.name} ${a.blurb}`.toLowerCase().includes(needle) : group === "All" || a.group === group));
  const connected = keys.filter((k) => k.owner);
  const made = keys.filter((k) => !k.owner);
  const tally = (n: number) => <span className="text-muted-foreground font-normal tabular-nums">{n}</span>;

  return (
    <>
      <AppHeader trail={[{ label: "Connections", href: "/connections" }, { label: LABEL[current]! }]} />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-6 pb-16 md:px-6">
        <PageHeader icon={<IconPlugConnected />} title="Connections" description="Agents, apps and code that work with the brand, and the repositories it lives in.">
          {ANY && (
            <Button variant="outline" size="sm" onClick={() => pick(ANY)}>
              <IconPlus /> Custom connection
            </Button>
          )}
        </PageHeader>

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

        <Tabs value={current} onValueChange={go}>
          {/* Four tabs and their counts don't fit a phone: they scroll sideways instead. */}
          <div className="-mx-4 overflow-x-auto border-b px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
            <TabsList variant="line">
              <TabsTrigger value="apps">Apps</TabsTrigger>
              <TabsTrigger value="connected">Connected {tally(connected.length)}</TabsTrigger>
              {tabs.includes("keys") && <TabsTrigger value="keys">API keys {tally(made.length)}</TabsTrigger>}
              {tabs.includes("repositories") && <TabsTrigger value="repositories">Repositories {tally(kept.length)}</TabsTrigger>}
            </TabsList>
          </div>

          <TabsContent value="apps" className="space-y-4 pt-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">One URL for every agent; most sign in on their own.</span>
              <Snippet text={mcp} what="the URL" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* Eight groups don't fit a phone: they scroll sideways instead of wrapping. */}
              <div className="-mx-4 min-w-0 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
                <Tabs value={needle ? "" : group} onValueChange={(g) => (setGroup(g as Group | "All"), setQ(""))}>
                  <TabsList>
                    {(["All", ...GROUPS] as const).map((g) => (
                      <TabsTrigger key={g} value={g}>
                        {g === "All" ? "All apps" : g}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
              <div className="relative w-full sm:ms-auto sm:w-56">
                <IconSearch className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Find your agent" className="pl-8" />
              </div>
            </div>
            {list.length ? (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((a) => (
                  <AppCard key={a.name} agent={a} connected={keys.filter((k) => agentOf(k) === norm(a.name)).length} onOpen={() => pick(a)} />
                ))}
              </ul>
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
            )}
          </TabsContent>

          <TabsContent value="connected" className="space-y-10 pt-4">
            <Connected
              keys={connected}
              onRevoked={(id) => setKeys((ks) => ks.filter((k) => k.id !== id))}
              onChanged={async () => {
                const res = await fetch("/api/v1/keys").catch(() => null);
                if (res?.ok) setKeys(((await res.json()) as { data: Key[] }).data);
              }}
              onBrowse={() => go("apps")}
            />
            {asked && <AskedFor asked={asked} keys={keys} />}
          </TabsContent>

          {tabs.includes("keys") && (
            <TabsContent value="keys" className="pt-4">
              <ApiKeys keys={made} onMade={(k) => setKeys((ks) => [...ks, k])} onRevoked={(id) => setKeys((ks) => ks.filter((k) => k.id !== id))} />
            </TabsContent>
          )}

          {tabs.includes("repositories") && (
            <TabsContent value="repositories" className="pt-4">
              <Repositories kept={kept} connect={connect} />
            </TabsContent>
          )}
        </Tabs>
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

      {(agent.auth === "key" || agent.key) &&
        (can("key.manage") ? (
          secret ? (
            <p className="border-primary/40 bg-primary/5 rounded-lg border p-3 text-sm">
              Key filled in below. Copy it now: it is shown only once.
            </p>
          ) : (
            <div className="space-y-2">
              {agent.key && <p className="text-muted-foreground text-sm">No OAuth? Make it a key:</p>}
              <NewKey
                name={agent.name}
                onMade={({ secret, ...k }) => {
                  setSecret({ id: k.id, secret });
                  onMade(k);
                }}
              />
            </div>
          )
        ) : (
          <p className="text-muted-foreground text-sm">
            {agent.key ? "Without OAuth it needs a key" : "Needs a key"}: ask an admin for one with the Suggest scope.
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
            <Snippet text={TRY} what="the prompt" prose />
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

/**
 * Agents people connected (OAuth, `artbucket login`): the project's for an
 * admin, yours for anyone else. Yours say every project they work in, and
 * Projects changes where, and with what, without signing in again.
 */
function Connected({ keys, onRevoked, onChanged, onBrowse }: { keys: Key[]; onRevoked: (id: string) => void; onChanged: () => void; onBrowse: () => void }) {
  const [editing, setEditing] = useState<Key | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1.5">
        <h2 className="font-display text-lg font-semibold">Connected agents</h2>
        <InfoTip>One agent can work in several projects: pick them when it signs in, or change them here.</InfoTip>
      </div>
      {!keys.length ? (
        <Empty size="sm" className="border">
          <EmptyHeader>
            <EmptyTitle>No agent connected yet</EmptyTitle>
            <EmptyDescription>Pick yours in Apps: most sign in on their own.</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" size="sm" onClick={onBrowse}>
            Browse apps
          </Button>
        </Empty>
      ) : (
        <KeyList
          keys={keys}
          onRevoked={onRevoked}
          onEdit={(k) => {
            setEditing(k);
            setOpen(true);
          }}
        />
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          {editing && (
            <Reach
              key={editing.id}
              agent={editing}
              onDone={() => {
                setOpen(false);
                onChanged();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** Where an agent you connected works, and what it may do: the consent screen's choice again, its key kept. */
function Reach({ agent, onDone }: { agent: Key; onDone: () => void }) {
  const [conn, setConn] = useState<Connection | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [scope, setScope] = useState<Grantable>("propose");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/v1/keys/${agent.id}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ data: Connection }>) : Promise.reject(r)))
      .then(({ data }) => {
        if (!live) return;
        setConn(data);
        setPicked(data.projects.map((w) => w.id));
        // What it has now, at its most, is where the choice starts.
        setScope(data.projects.map((w) => grantable(w.scope)).reduce((m, s) => (SCOPES.indexOf(s) > SCOPES.indexOf(m) ? s : m), "read"));
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [agent.id]);

  // Projects it works in that you may no longer give stay offered, at what it has there: saving doesn't drop them unasked.
  const givable: Givable[] = conn
    ? [
        ...conn.givable,
        ...conn.projects.filter((w) => !conn.givable.some((g) => g.id === w.id)).map((w) => ({ id: w.id, name: w.name, organization: w.organization, max: grantable(w.scope) })),
      ]
    : [];
  const value = cappedScope(scope, mostOf(givable, picked));

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <IconStack2 className="text-muted-foreground size-5" /> {agent.name}
        </DialogTitle>
        <DialogDescription>Where it works and what it may do. It keeps its key, so nothing to sign in again.</DialogDescription>
      </DialogHeader>
      {failed ? (
        <p className="text-muted-foreground text-sm">Couldn&apos;t load it. Close this and try again.</p>
      ) : !conn ? (
        <Waiting what="Loading" className="text-sm" />
      ) : (
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const ok = await send("PATCH", `/api/v1/keys/${agent.id}`, { projects: picked, scope: value });
            setBusy(false);
            if (!ok) return;
            toast.success(`${agent.name} works in ${count(picked.length, "project")}`);
            onDone();
          }}
        >
          <ProjectPicker projects={givable} picked={picked} onChange={setPicked} scope={value} />
          <ScopePicker max={mostOf(givable, picked)} value={value} onChange={setScope} />
          <div className="flex justify-end">
            <Button type="submit" pending={busy} disabled={!picked.length}>
              Save
            </Button>
          </div>
        </form>
      )}
    </>
  );
}

/**
 * Brands kept in a Git repository too (brand as code): where, and how fresh.
 * Manage opens the integration's page for the brand (GIT_CONNECT_URL), where
 * its branch, folder, releases and disconnecting live; Bring a brand in
 * starts one from a repository, from any account the integration reaches.
 */
function Repositories({ kept, connect }: { kept: Kept[]; connect: string | null }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1.5">
        <h2 className="font-display text-lg font-semibold">Repositories</h2>
        <InfoTip>Brands kept in Git too, synced both ways. Each brand can live in its own repository.</InfoTip>
        {connect && (
          <Button variant="outline" size="sm" className="ms-auto" asChild>
            <a href={connect}>
              <IconBrandGithub aria-hidden /> Bring a brand in
            </a>
          </Button>
        )}
      </div>
      {!kept.length ? (
        <p className="text-muted-foreground text-sm">None yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {kept.map(({ brand, source, connect: manage }) => (
            <li key={brand.slug} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
              <IconBrandGithub aria-hidden className="text-muted-foreground size-4 shrink-0" />
              <Link href={brandPath(brand.slug)} className="font-medium hover:underline">
                {brand.name}
              </Link>
              <a href={source.remote} className="text-muted-foreground min-w-0 truncate text-xs hover:underline">
                {source.remote.replace(/^https:\/\/(www\.)?github\.com\//, "")}
              </a>
              <span className="text-muted-foreground text-xs">
                {source.branch}, {source.path ? `${source.path}/` : "the root"}
              </span>
              {source.pending && <Badge variant="secondary">Changes to bring in</Badge>}
              <span className="text-muted-foreground ms-auto text-xs" suppressHydrationWarning>
                {source.syncedAt ? `Synced ${since(source.syncedAt)}` : "Not synced yet"}
              </span>
              {manage && (
                <Button variant="ghost" size="sm" asChild>
                  <a href={manage}>
                    <IconSettings aria-hidden /> Manage
                  </a>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
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
 * scripts, CI. They answer to nobody, so they're the project's to manage.
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

function KeyList({
  keys,
  onRevoked,
  onEdit,
  showPrefix,
  fresh,
}: {
  keys: Key[];
  onRevoked: (id: string) => void;
  /** For an agent you connected: change where it works. */
  onEdit?: (k: Key) => void;
  showPrefix?: boolean;
  fresh?: string;
}) {
  return (
    <ul className="divide-y rounded-lg border">
      {keys.map((k) => {
        const whose = k.owner ? `${k.owner}'s ${k.name}` : k.name;
        const several = !!k.projects && k.projects.length > 1;
        return (
          // The key just made stays where the API lists it, last, and flashes so it is found.
          <li key={k.id} data-api-key={k.id} data-flash={k.id === fresh || undefined} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
            {k.owner ? <Initials name={k.owner} className="size-5 text-[9px]" /> : <IconKey className="text-muted-foreground size-4 shrink-0" />}
            <span className="min-w-0 truncate font-medium">{k.name}</span>
            {k.owner && <span className="text-muted-foreground min-w-0 truncate text-xs">{k.owner}</span>}
            <Badge variant="secondary">{scopeLabel(k.scope)}</Badge>
            {showPrefix && <code className="text-muted-foreground hidden font-mono text-xs sm:inline">{k.prefix}…</code>}
            {several && (
              <span className="text-muted-foreground min-w-0 truncate text-xs" title={k.projects!.join(", ")}>
                {count(k.projects!.length, "project")}
              </span>
            )}
            {k.waiting > 0 && (
              <Link href="/review" className="text-primary-ink text-xs hover:underline">
                {k.waiting} waiting in Review
              </Link>
            )}
            <span className="text-muted-foreground ml-auto text-xs" title={k.lastUsedAt ? exact(k.lastUsedAt) : undefined} suppressHydrationWarning>
              {k.lastUsedAt ? `${ago(k.lastUsedAt)}, ${k.calls.toLocaleString()} call${k.calls === 1 ? "" : "s"}` : "Never called"}
            </span>
            {k.projects && onEdit && (
              <IconButton variant="ghost" label={`Projects ${k.name} works in`} className="text-muted-foreground" onClick={() => onEdit(k)}>
                <IconStack2 />
              </IconButton>
            )}
            <Confirm
              title={`Revoke ${whose}${several ? " here" : ""}?`}
              says={
                several
                  ? "It stops working in this project at once and keeps the others. What it suggested stays in Review."
                  : "Anything using it stops working at once, with a 401. What it already suggested stays in Review."
              }
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
