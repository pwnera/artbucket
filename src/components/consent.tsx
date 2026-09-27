"use client";

import { useEffect, useState } from "react";
import { IconCircleCheck } from "@tabler/icons-react";
import { useBrand } from "@/components/brand";
import { Card } from "@/components/sign-in";
import { Field } from "@/components/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Grantable } from "@/lib/oauth";
import type { Scope } from "@/lib/scopes";
import { cn } from "@/lib/utils";

/**
 * Connecting an agent as yourself: the consent screen a chat app sends you to
 * (/oauth/authorize) and the page `artbucket login` sends you to (/device).
 * What you pick is the agent's scope; it never gets more than you have.
 */

export const SCOPE_LABELS: { scope: Scope; label: string; hint: string }[] = [
  { scope: "propose", label: "Suggest", hint: "Search, read the brand, and suggest assets and tags for you to review" },
  { scope: "read", label: "Read only", hint: "Search and read the brand; changes nothing" },
  { scope: "write", label: "Edit", hint: "Change and delete assets, collections and fields directly, no review" },
  { scope: "admin", label: "Admin", hint: "Everything, including making and revoking keys" },
];
export const scopeLabel = (s: Scope) => SCOPE_LABELS.find((x) => x.scope === s)?.label ?? s;

type Options = {
  client: { name: string };
  scope: Grantable;
  workspace: string | null;
  workspaces: { id: string; name: string; organization: string; max: Grantable }[];
};
type Decision = { allow: true; workspace: string; scope: Grantable } | { allow: false };

async function call<T>(method: string, url: string, payload?: unknown): Promise<{ data: T } | { error: string }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: payload ? JSON.stringify(payload) : undefined });
  const json = await res.json().catch(() => null);
  return res.ok ? { data: json.data } : { error: json?.error?.message ?? "Something went wrong" };
}

const RANK: Scope[] = ["read", "propose", "write", "admin"];

function Choose({ options, onDecide }: { options: Options; onDecide: (d: Decision) => Promise<void> }) {
  const brand = useBrand();
  const [workspace, setWorkspace] = useState(options.workspace ?? "");
  const [scope, setScope] = useState<Grantable>(options.scope);
  const [busy, setBusy] = useState(false);
  const max = options.workspaces.find((w) => w.id === workspace)?.max ?? "read";
  const offered = SCOPE_LABELS.filter((s) => s.scope !== "admin" && RANK.indexOf(s.scope) <= RANK.indexOf(max));
  // Moving to a workspace where you have less brings the pick down with you.
  const picked = offered.some((s) => s.scope === scope) ? scope : "read";
  const decide = async (d: Decision) => {
    setBusy(true);
    await onDecide(d);
    setBusy(false);
  };

  if (!options.workspaces.length) {
    return (
      <Card title={`Connect ${options.client.name}`} lead="You don't have access to any workspace yet, so there is nothing to give it. Ask an admin for an invitation.">
        <Button variant="outline" className="w-full" onClick={() => decide({ allow: false })}>
          Cancel
        </Button>
      </Card>
    );
  }
  return (
    <Card
      title={`Connect ${options.client.name}`}
      lead={`It will work in ${brand.name} as you, doing at most what you pick here. You can disconnect it any time from Agents.`}
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void decide({ allow: true, workspace, scope: picked });
        }}
      >
        {options.workspaces.length > 1 && (
          <Field label="Workspace" htmlFor="consent-workspace">
            <Select value={workspace} onValueChange={setWorkspace}>
              <SelectTrigger id="consent-workspace" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.workspaces.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name} <span className="text-muted-foreground">{w.organization}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">It may</legend>
          {offered.map((s) => (
            <label
              key={s.scope}
              className={cn(
                "flex cursor-pointer gap-3 rounded-lg border p-3 text-sm",
                picked === s.scope && "border-primary bg-primary/5",
              )}
            >
              <input
                type="radio"
                name="scope"
                value={s.scope}
                checked={picked === s.scope}
                onChange={() => setScope(s.scope as Grantable)}
                className="accent-primary mt-0.5"
              />
              <span className="grid gap-0.5">
                <span className="font-medium">
                  {s.label}
                  {s.scope === "propose" && <span className="text-muted-foreground font-normal"> (recommended)</span>}
                </span>
                <span className="text-muted-foreground text-xs">{s.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => decide({ allow: false })}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !workspace}>
            Allow
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Problem({ message }: { message: string }) {
  return <Card title="This link doesn't work" lead={message}>{null}</Card>;
}

/** /oauth/authorize: a chat app sent you here with its request in the query. */
export function Authorize({ query }: { query: string }) {
  const [state, setState] = useState<{ options: Options } | { error: string } | null>(null);
  useEffect(() => {
    void call<Options>("GET", `/api/v1/oauth/authorize?${query}`).then((r) => setState("data" in r ? { options: r.data } : r));
  }, [query]);
  if (!state) return null;
  if ("error" in state) return <Problem message={state.error} />;
  const request = Object.fromEntries(new URLSearchParams(query));
  return (
    <Choose
      options={state.options}
      onDecide={async (d) => {
        const r = await call<{ redirect: string }>("POST", "/api/v1/oauth/authorize", { request, ...d });
        if ("error" in r) setState(r);
        else window.location.href = r.data.redirect;
      }}
    />
  );
}

/** /device: type (or follow a link with) the code `artbucket login` printed, then approve it. */
export function Device({ code: given }: { code?: string }) {
  const [code, setCode] = useState(given ?? "");
  const [options, setOptions] = useState<Options | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<boolean | null>(null);

  const look = (c: string) =>
    call<Options>("GET", `/api/v1/oauth/device/${encodeURIComponent(c)}`).then((r) => ("error" in r ? setError(r.error) : setOptions(r.data)));
  useEffect(() => {
    if (given) void look(given);
  }, [given]);

  if (done !== null) {
    return (
      <Card title={done ? "Connected" : "Turned down"} lead={done ? "Go back to your terminal: it has its key." : "Nothing was connected. You can close this page."}>
        {done && <IconCircleCheck className="size-8 text-emerald-600 dark:text-emerald-400" />}
      </Card>
    );
  }
  if (options) {
    return (
      <Choose
        options={options}
        onDecide={async (d) => {
          const r = await call<{ allowed: boolean }>("POST", `/api/v1/oauth/device/${encodeURIComponent(code)}`, d);
          if ("error" in r) setError(r.error);
          else setDone(r.data.allowed);
          setOptions(null);
        }}
      />
    );
  }
  return (
    <Card title="Connect the CLI" lead="Type the code your terminal shows.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          void look(code);
        }}
      >
        <Field label="Code" htmlFor="device-code">
          <Input
            id="device-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="WDJB-MJHT"
            autoComplete="off"
            autoFocus
            className="font-mono tracking-widest uppercase"
          />
        </Field>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" className="w-full" disabled={!code.trim()}>
          Continue
        </Button>
      </form>
    </Card>
  );
}
