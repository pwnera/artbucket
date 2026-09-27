"use client";

import { useState } from "react";
import { IconAlertTriangle, IconKey, IconPlus, IconRobot, IconTrash } from "@tabler/icons-react";
import { useCan } from "@/components/can";
import { toast } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/brand";
import { ConnectTabs, Snippet } from "@/components/agent-access";
import { send } from "@/components/collections";
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import type { SidebarData } from "@/lib/sidebar";
import type { Scope } from "@/lib/scopes";

export type Key = { id: string; name: string; prefix: string; scope: Scope; createdAt: string };

const SCOPES: { scope: Scope; label: string; hint: string }[] = [
  { scope: "propose", label: "Suggest", hint: "Search, read the brand, and suggest assets and tags for you to review" },
  { scope: "read", label: "Read only", hint: "Search and read the brand; changes nothing" },
  { scope: "write", label: "Edit", hint: "Change and delete assets, collections and fields directly, no review" },
  { scope: "admin", label: "Admin", hint: "Everything, including making and revoking keys" },
];
const scopeLabel = (s: Scope) => SCOPES.find((x) => x.scope === s)?.label ?? s;

/**
 * Connect an agent, in three steps: make a key, run the command with the key
 * already in it, try a first prompt. Then the keys that exist, to revoke.
 */
export function Agents({
  keys: initialKeys,
  sidebar,
  origin,
  anonymous,
}: {
  /** null: this page may not list keys (no admin scope). */
  keys: Key[] | null;
  sidebar: SidebarData;
  origin: string;
  anonymous: Scope | null;
}) {
  const [keys, setKeys] = useState(initialKeys);
  const can = useCan();
  // The secret of the key just made: shown once, and filled into the commands.
  const [secret, setSecret] = useState<string | null>(null);

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

        <main className="mx-auto w-full max-w-3xl space-y-12 px-4 pt-10 pb-24 sm:px-8">
          <div className="space-y-3">
            <p className="text-primary flex items-center gap-2 text-sm font-medium">
              <IconRobot className="size-4" /> Claude, Cursor, or anything that speaks MCP
            </p>
            <h2 className="text-3xl font-semibold tracking-tight">Give an agent the brand</h2>
            <p className="text-muted-foreground text-lg text-pretty">
              A connected agent searches the library, reads the brand rules before it makes anything, and hands out
              assets at the right size. What it adds is only a suggestion: it waits in Review until you approve it.
            </p>
          </div>

          {(anonymous === "write" || anonymous === "admin") && (
            <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              <IconAlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="space-y-1">
                <p className="font-medium">Without a key, anyone can {anonymous === "admin" ? "do anything" : "change everything"}</p>
                <p className="text-muted-foreground">
                  {sidebar.me.auth.signUp &&
                    "Nobody has an account yet, so the library is open. Make the first account (Sign in, at the bottom of the sidebar): from then on, only people signed in and keys get in. "}
                  Or set <code className="font-mono text-xs">ANONYMOUS_SCOPE=read</code> (or <code className="font-mono text-xs">none</code>) to decide it yourself.
                </p>
              </div>
            </div>
          )}

          <Step n={1} title="Make a key" blurb="One per agent, so you can tell them apart in Review and revoke one without the others.">
            {!can("key.manage") ? (
              <p className="text-muted-foreground text-sm">
                Making keys needs the admin scope. Use an admin key with the CLI:{" "}
                <code className="font-mono text-xs">pnpm artbucket keys create claude --scope propose</code>
              </p>
            ) : (
              <NewKey
                onMade={(k) => {
                  setSecret(k.secret);
                  setKeys((ks) => [...(ks ?? []), k]);
                }}
              />
            )}
            {secret && (
              <div className="border-primary/40 bg-primary/5 space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">Copy it now: it is shown this once</p>
                <Snippet text={secret} what="the key" />
                <p className="text-muted-foreground text-xs">It is already filled into the commands below.</p>
              </div>
            )}
          </Step>

          <Step n={2} title="Connect" blurb="Run this where the agent lives.">
            <ConnectTabs origin={origin} secret={secret} />
          </Step>

          <Step
            n={3}
            title="Try it"
            blurb="Ask the agent something only the brand can answer. Every page here has a For agents button with the exact call for what it shows."
          >
            <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
              <li>&ldquo;What&apos;s our primary color on dark backgrounds, and how should it be used?&rdquo;</li>
              <li>&ldquo;Find our logo and give me a 512px PNG link.&rdquo;</li>
              <li>&ldquo;Add this photo to the library and suggest tags for it.&rdquo; (then look in Review)</li>
            </ul>
          </Step>

          {keys && keys.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-lg font-semibold">Keys</h3>
              <ul className="divide-y rounded-lg border">
                {keys.map((k) => (
                  <li key={k.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <IconKey className="text-muted-foreground size-4 shrink-0" />
                    <span className="min-w-0 truncate font-medium">{k.name}</span>
                    <Badge variant="secondary">{scopeLabel(k.scope)}</Badge>
                    <code className="text-muted-foreground hidden font-mono text-xs sm:inline">{k.prefix}…</code>
                    <span className="text-muted-foreground ml-auto hidden text-xs sm:inline" suppressHydrationWarning>
                      {new Date(k.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    <Revoke
                      name={k.name}
                      onRevoke={async () => {
                        if (!(await send("DELETE", `/api/v1/keys/${k.id}`))) return;
                        setKeys((ks) => ks?.filter((x) => x.id !== k.id) ?? null);
                        toast.success(`Revoked ${k.name}`);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function Step({ n, title, blurb, children }: { n: number; title: string; blurb: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 sm:grid-cols-[2rem_1fr]">
      <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-full text-sm font-semibold">
        {n}
      </span>
      <div className="min-w-0 space-y-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-muted-foreground text-sm">{blurb}</p>
        </div>
        {children}
      </div>
    </section>
  );
}

function NewKey({ onMade }: { onMade: (k: Key & { secret: string }) => void }) {
  const [name, setName] = useState("claude");
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
        if (k) onMade(k);
      }}
    >
      <Field label="Name" htmlFor="key-name">
        <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
      </Field>
      <Field label="It may" htmlFor="key-scope">
        <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
          <SelectTrigger id="key-scope" className="w-full">
            <SelectValue>
              {scopeLabel(scope)}
              {scope === "propose" && <span className="text-muted-foreground"> (recommended)</span>}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SCOPES.map((s) => (
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
      <p className="text-muted-foreground text-xs sm:col-span-3">{SCOPES.find((s) => s.scope === scope)?.hint}.</p>
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
