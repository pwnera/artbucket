"use client";

import Link from "next/link";
import { useState } from "react";
import { IconCircleCheck } from "@tabler/icons-react";
import { useGo } from "@/components/account";
import { useBrand } from "@/components/brand";
import { Card, FormError, UNREACHABLE } from "@/components/sign-in";
import { Field } from "@/components/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cappedScope, type Grantable } from "@/lib/oauth";
import type { Scope } from "@/lib/scopes";

/**
 * Connecting an agent as yourself: the consent screen a chat app sends you to
 * (/oauth/authorize) and the page `artbucket login` sends you to (/device).
 * What you pick is the agent's scope; it never gets more than you have.
 */

/** Read to admin, as the ladder goes; each names the team role it matches (lib/scopes.ts ROLES). */
export const SCOPE_LABELS: { scope: Scope; label: string; hint: string }[] = [
  { scope: "read", label: "Read only", hint: "Search and read the brand; changes nothing. Like a Viewer." },
  { scope: "propose", label: "Suggest", hint: "Also suggest assets and tags, which wait for you to review. Like a Contributor." },
  { scope: "write", label: "Edit", hint: "Also change and delete assets, collections and fields directly, no review, and edit brand rules, pages and theme. Like an Editor." },
  { scope: "admin", label: "Admin", hint: "Everything, including making and revoking keys. Like an Admin." },
];
export const scopeLabel = (s: Scope) => SCOPE_LABELS.find((x) => x.scope === s)?.label ?? s;

/** A workspace a person can give an agent, with the most they may give there. */
export type Givable = { id: string; name: string; organization: string; max: Grantable };
export type Options = {
  client: { name: string };
  scope: Grantable;
  workspace: string | null;
  workspaces: Givable[];
};
/** GET's body as the page read it on the server (lib/sidebar.ts getBody), or null when the API didn't answer. */
export type Loaded = { data?: Options; error?: { message?: string } } | null;
type Decision = { allow: true; workspaces: string[]; scope: Grantable } | { allow: false };

async function call<T>(method: string, url: string, payload?: unknown): Promise<{ data: T } | { error: string }> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: payload ? JSON.stringify(payload) : undefined });
    const json = await res.json().catch(() => null);
    return res.ok ? { data: json?.data } : { error: json?.error?.message ?? "Something went wrong. Try again." };
  } catch {
    return { error: UNREACHABLE };
  }
}

const RANK: Scope[] = ["read", "propose", "write", "admin"];

/** The most an agent may be given across `picked`: what the scope list offers. */
export const mostOf = (workspaces: Givable[], picked: string[]): Grantable =>
  workspaces.filter((w) => picked.includes(w.id)).reduce<Grantable>((m, w) => (RANK.indexOf(w.max) > RANK.indexOf(m) ? w.max : m), "read");

/**
 * Which workspaces an agent works in: one is just named, several are boxes to
 * tick. A workspace where you may give less than `scope` says what it gets.
 */
export function WorkspacePicker({ workspaces, picked, onChange, scope }: { workspaces: Givable[]; picked: string[]; onChange: (ids: string[]) => void; scope: Grantable }) {
  if (workspaces.length === 1) {
    return (
      <Field label="Workspace">
        <p className="text-sm">
          {workspaces[0].name} <span className="text-muted-foreground">{workspaces[0].organization}</span>
        </p>
      </Field>
    );
  }
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">Workspaces</legend>
      <div className="divide-y rounded-lg border">
        {workspaces.map((w) => {
          const on = picked.includes(w.id);
          const less = on && cappedScope(scope, w.max) !== scope;
          return (
            <label key={w.id} className="hover:bg-accent/50 has-[:focus-visible]:ring-ring/50 flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm has-[:focus-visible]:ring-[3px]">
              <input
                type="checkbox"
                checked={on}
                onChange={() => onChange(on ? picked.filter((id) => id !== w.id) : [...picked, w.id])}
                className="accent-primary focus-visible:outline-none"
              />
              <span className="min-w-0 flex-1 truncate">
                {w.name} <span className="text-muted-foreground">{w.organization}</span>
              </span>
              {less && <span className="text-muted-foreground shrink-0 text-xs">{scopeLabel(w.max)} here</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** The scopes as radio cards, up to `max`. */
export function ScopePicker({ max, value, onChange, recommended = "propose" }: { max: Grantable; value: Grantable; onChange: (s: Grantable) => void; recommended?: Grantable }) {
  const offered = SCOPE_LABELS.filter((s) => s.scope !== "admin" && RANK.indexOf(s.scope) <= RANK.indexOf(max));
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">It may</legend>
      {offered.map((s) => (
        <label
          key={s.scope}
          className="hover:bg-accent/50 has-[:focus-visible]:ring-ring/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5 flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors has-[:focus-visible]:ring-[3px]"
        >
          <input
            type="radio"
            name="scope"
            value={s.scope}
            checked={value === s.scope}
            onChange={() => onChange(s.scope as Grantable)}
            // The card shows focus; the radio's own outline would be a second ring.
            className="accent-primary mt-0.5 focus-visible:outline-none"
          />
          <span className="grid gap-0.5">
            <span className="font-medium">
              {s.label}
              {s.scope === recommended && <span className="text-muted-foreground font-normal"> (recommended)</span>}
            </span>
            <span className="text-muted-foreground text-xs">{s.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/**
 * Who is granting, where, and what: the signed-in account (and a way to
 * switch), the workspace, the scope, and where you'll be sent back. A client
 * names itself when it registers, so the rest is what tells a real request
 * from a spoofed one. `onDecide` resolves true when the page is leaving.
 */
function Choose({
  options,
  onDecide,
  email,
  back,
  code,
  redirect,
  error,
  recommended = "propose",
}: {
  options: Options;
  onDecide: (d: Decision) => Promise<boolean>;
  email: string;
  /** This page's own address, to come back to after switching accounts. */
  back: string;
  /** The CLI's code, to check against the terminal. */
  code?: string;
  /** Where the chat app gets its answer. */
  redirect?: string | null;
  error?: string | null;
  /** The option marked recommended: Suggest for an agent, what the CLI asks for on /device. */
  recommended?: Grantable;
}) {
  const brand = useBrand();
  const go = useGo();
  const first = options.workspace ?? options.workspaces[0]?.id;
  const [workspaces, setWorkspaces] = useState<string[]>(first ? [first] : []);
  const [scope, setScope] = useState<Grantable>(options.scope);
  const [busy, setBusy] = useState<"allow" | "deny" | "switch" | null>(null);
  // Unticking the workspaces where you have more brings the pick down with you.
  const picked = cappedScope(scope, mostOf(options.workspaces, workspaces));
  const decide = async (d: Decision) => {
    setBusy(d.allow ? "allow" : "deny");
    let leaving = false;
    try {
      leaving = await onDecide(d);
    } finally {
      // Leaving: busy until the next page paints.
      if (!leaving) setBusy(null);
    }
  };
  const switchAccount = async () => {
    setBusy("switch");
    await call("POST", "/api/auth/sign-out", {});
    go(`/login?next=${encodeURIComponent(back)}`);
  };

  const who = (
    <p className="text-muted-foreground text-sm">
      Signed in as <span className="text-foreground font-medium">{email}</span>.{" "}
      <button
        type="button"
        className="text-foreground inline-flex min-h-6 items-center underline underline-offset-2"
        disabled={!!busy}
        onClick={() => void switchAccount()}
      >
        {busy === "switch" ? "Switching…" : "Switch"}
      </button>
    </p>
  );

  if (!options.workspaces.length) {
    return (
      <Card title={`Connect ${options.client.name}`} lead="You have no workspace to give it yet. Ask an admin for an invitation.">
        {who}
        <Button variant="outline" className="w-full" pending={busy === "deny"} onClick={() => void decide({ allow: false })}>
          Cancel
        </Button>
      </Card>
    );
  }
  return (
    <Card title={`Connect ${options.client.name}`} lead={`It works in ${brand.name} as you, doing at most what you pick. Change or disconnect it any time from Connections.`}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void decide({ allow: true, workspaces, scope: picked });
        }}
      >
        {who}
        {code && (
          <div className="grid gap-1">
            <p className="font-mono text-lg font-medium tracking-widest">{code}</p>
            <p className="text-muted-foreground text-xs">Check it matches your terminal.</p>
          </div>
        )}
        <WorkspacePicker workspaces={options.workspaces} picked={workspaces} onChange={setWorkspaces} scope={picked} />
        <ScopePicker max={mostOf(options.workspaces, workspaces)} value={picked} onChange={setScope} recommended={recommended} />
        {redirect && <p className="text-muted-foreground text-xs">Afterwards you&apos;ll go back to {redirect}.</p>}
        {error && <FormError>{error}</FormError>}
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" pending={busy === "deny"} disabled={!!busy} onClick={() => void decide({ allow: false })}>
            Cancel
          </Button>
          <Button type="submit" pending={busy === "allow"} disabled={!!busy || !workspaces.length}>
            Allow
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** A request that can't go on: why, a way home, and a way back to the choice when there was one. */
function Problem({ title, message, retry }: { title: string; message: string; retry?: () => void }) {
  const brand = useBrand();
  return (
    <Card title={title} lead={message}>
      <div className="grid gap-2">
        {retry && <Button onClick={retry}>Try again</Button>}
        <Button variant={retry ? "ghost" : "outline"} asChild>
          <Link href="/">Go to {brand.name}</Link>
        </Button>
      </div>
    </Card>
  );
}

const fromLoaded = (r: Loaded) => (r?.data ? { options: r.data } : { error: r?.error?.message ?? UNREACHABLE });

/** /oauth/authorize: a chat app sent you here with its request in the query, read on the server as `initial`. */
export function Authorize({ query, initial, email }: { query: string; initial: Loaded; email: string }) {
  const [state, setState] = useState<{ options: Options; failed?: string } | { error: string }>(() => fromLoaded(initial));
  if ("error" in state) return <Problem title="This link doesn't work" message={state.error} />;
  const { options, failed } = state;
  if (failed) return <Problem title={`Couldn't connect ${options.client.name}`} message={failed} retry={() => setState({ options })} />;
  const request = Object.fromEntries(new URLSearchParams(query));
  // A native app's custom scheme can have no host: then the scheme is what there is to show.
  const redirect = (() => {
    try {
      const u = new URL(request.redirect_uri);
      return u.host || u.protocol;
    } catch {
      return null;
    }
  })();
  return (
    <Choose
      options={options}
      email={email}
      back={`/oauth/authorize?${query}`}
      redirect={redirect}
      onDecide={async (d) => {
        const r = await call<{ redirect: string }>("POST", "/api/v1/oauth/authorize", { request, ...d });
        if ("error" in r) {
          setState({ options, failed: r.error });
          return false;
        }
        window.location.href = r.data.redirect;
        return true;
      }}
    />
  );
}

/** "wdjbm" as "WDJB-M": capitals, letters only, the dash after four, as `artbucket login` prints it. */
const formatCode = (typed: string) => {
  const c = typed
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 8);
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
};
const letters = (code: string) => code.replace(/-/g, "").length;

/**
 * /device: type (or follow a link with) the code `artbucket login` printed,
 * then approve it. With a code in the link, the page looked it up on the
 * server as `initial`.
 */
export function Device({ code: given, initial, email }: { code?: string; initial?: Loaded; email: string }) {
  const [code, setCode] = useState(formatCode(given ?? ""));
  const [options, setOptions] = useState<Options | null>(initial?.data ?? null);
  const [error, setError] = useState<string | null>(
    // A code in the link was looked up: null is the API not answering, which still needs saying.
    initial !== undefined && !initial?.data ? (initial?.error?.message ?? UNREACHABLE) : null,
  );
  const [looking, setLooking] = useState(false);
  const [done, setDone] = useState<{ allowed: boolean; scope?: Grantable; workspaces?: string[] } | null>(null);

  const look = async (c: string) => {
    setLooking(true);
    setError(null);
    const r = await call<Options>("GET", `/api/v1/oauth/device/${encodeURIComponent(c)}`);
    setLooking(false);
    if ("error" in r) setError(r.error);
    else setOptions(r.data);
  };
  const again = () => {
    setDone(null);
    setOptions(null);
    setCode("");
    setError(null);
  };

  if (done) {
    const client = options?.client.name ?? "The CLI";
    const where = options?.workspaces
      .filter((w) => done.workspaces?.includes(w.id))
      .map((w) => w.name)
      .join(", ");
    return (
      <Card
        title={
          done.allowed ? (
            <span className="inline-flex items-center gap-2">
              <IconCircleCheck className="text-success animate-in zoom-in-50 fade-in-0 size-6 duration-300" /> Connected
            </span>
          ) : (
            "Turned down"
          )
        }
        lead={
          done.allowed
            ? `${client} can now work${where ? ` in ${where}` : ""} with ${scopeLabel(done.scope ?? "read")} access. Go back to your terminal: it has its key.`
            : "Nothing was connected. You can close this page."
        }
      >
        <div className="grid gap-2">
          {!done.allowed && <Button onClick={again}>Enter another code</Button>}
          <Button variant="outline" asChild>
            <Link href="/connections">Manage agents</Link>
          </Button>
        </div>
      </Card>
    );
  }
  if (options) {
    return (
      <Choose
        options={options}
        email={email}
        code={code}
        back={`/device?code=${encodeURIComponent(code)}`}
        recommended={options.scope}
        error={error}
        onDecide={async (d) => {
          setError(null);
          const r = await call<{ allowed: boolean }>("POST", `/api/v1/oauth/device/${encodeURIComponent(code)}`, d);
          // A failure stays on the choice, with what was picked.
          if ("error" in r) setError(r.error);
          else setDone({ allowed: r.data.allowed, ...(d.allow && { scope: d.scope, workspaces: d.workspaces }) });
          return false;
        }}
      />
    );
  }
  const ready = letters(code) === 8;
  return (
    <Card title="Connect the CLI" lead="Type the code your terminal shows.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !looking) void look(code);
        }}
      >
        <Field label="Code" htmlFor="device-code">
          <Input
            id="device-code"
            value={code}
            onChange={(e) => {
              const next = formatCode(e.target.value);
              setCode(next);
              setError(null);
              // The eighth letter looks it up, with the value in hand rather than state that hasn't landed.
              if (letters(next) === 8 && letters(code) !== 8 && !looking) void look(next);
            }}
            placeholder="WDJB-MJHT"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={9}
            // Held while it's checked: a letter changed mid-lookup would get the old code's answer.
            readOnly={looking}
            autoFocus
            aria-invalid={!!error || undefined}
            aria-describedby={error ? "device-code-error" : undefined}
            className="font-mono tracking-widest uppercase"
          />
        </Field>
        {error && <FormError id="device-code-error">{error}</FormError>}
        <Button type="submit" className="w-full" pending={looking} disabled={!ready}>
          Continue
        </Button>
      </form>
    </Card>
  );
}
