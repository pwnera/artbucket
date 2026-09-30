"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { IconCircle, IconCircleCheckFilled, IconTrophy, IconX } from "@tabler/icons-react";
import { useBrand } from "@/components/brand";
import { useCan, useMe } from "@/components/can";
import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { isPath, onboardingSteps, PATHS, type Facts, type PathId } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

const KEY = "artbucket:setup";
type Stored = { hidden?: boolean; path?: PathId };

// Per viewer and per browser: a convenience, so storage that may refuse.
function read(): string | null {
  try {
    return localStorage.getItem(KEY) ?? "{}";
  } catch {
    return "{}";
  }
}
function write(s: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}
const never = () => () => {};

const json = <T,>(url: string): Promise<T | null> =>
  fetch(url)
    .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
    .catch(() => null);

type Status = { steps: { id: string; done: boolean | null }[]; publish: "never" | "behind" | "current" };

/**
 * What a path's steps read (lib/onboarding.ts Facts) that the page doesn't
 * know already, from the API: the default brand's status and repository,
 * the team, the keys, and whether an agent called a tool. Only what `path`
 * needs is asked. Null while it loads.
 */
function useFacts(path: PathId | undefined, uploaded: boolean): Facts | null {
  const me = useMe();
  const brand = useBrand();
  const [got, setGot] = useState<{ path: PathId; facts: Omit<Facts, "uploaded"> } | null>(null);
  useEffect(() => {
    if (!path || !me) return;
    let live = true;
    const brandy = path !== "agency";
    void (async () => {
      const list = brandy ? await json<{ data: { slug: string; default: boolean }[] }>("/api/v1/brands") : null;
      const b = list?.data.find((x) => x.default) ?? list?.data[0];
      const [status, source, members, keys, asked] = await Promise.all([
        b ? json<{ data: Status }>(`/api/v1/brands/${encodeURIComponent(b.slug)}/status`) : null,
        b && path === "system" ? json<{ data: { source: unknown } }>(`/api/v1/brands/${encodeURIComponent(b.slug)}/source`) : null,
        path === "brand" ? json<{ data: unknown[]; invitations: unknown[] }>("/api/v1/members") : null,
        path === "ai" ? json<{ data: unknown[] }>("/api/v1/keys") : null,
        path === "ai" ? json<{ data: { clients: { tools: unknown[] }[] } }>("/api/v1/insights/connections") : null,
      ]);
      const done = (ids: string[]) => ids.every((id) => status?.data.steps.find((s) => s.id === id)?.done);
      if (!live) return;
      setGot({
        path,
        facts: {
          named: me.workspace.organization.name !== "Default",
          branded: brand.custom,
          noEmail: !me.auth.serverEmail && !me.email,
          brand: b
            ? {
                slug: b.slug,
                basics: done(["colors", "type", "logo", "voice"]),
                tokens: done(["colors", "type"]),
                published: !!status && status.data.publish !== "never",
                git: !!source?.data.source,
              }
            : null,
          team: !!members && members.data.length + members.invitations.length > 1,
          workspaces: me.workspaces.length,
          agent: !!keys?.data.length,
          mcp: !!asked?.data.clients.some((c) => c.tools.length > 0),
          git: me.git,
        },
      });
    })();
    return () => {
      live = false;
    };
  }, [path, me, brand.custom]);
  return got && got.path === path ? { ...got.facts, uploaded } : null;
}

/**
 * A new admin's first minutes, by path (PRD: onboarding by path): first who
 * they are, a brand manager, a design system's keeper, an agency or someone
 * building with AI, then that path's few steps, each checked off from what
 * the app knows, ending in its first win. The path is this viewer's, kept
 * in this browser like the list being hidden. Gone once every step is done,
 * or when hidden.
 */
export function SetupChecklist({ uploaded, onUpload }: { uploaded: boolean; onUpload?: () => void }) {
  const can = useCan();
  const me = useMe();
  // null on the server and while hydrating: say nothing until storage answers, so a hidden list never flashes.
  const raw = useSyncExternalStore(never, read, () => null);
  const [local, setLocal] = useState<Stored | null>(null);
  let stored: Stored = {};
  try {
    stored = local ?? (raw ? (JSON.parse(raw) as Stored) : {});
  } catch {}
  const path = isPath(stored.path) ? stored.path : undefined;
  const facts = useFacts(path, uploaded);
  const save = (s: Stored) => {
    setLocal(s);
    write(s);
  };
  if (raw === null || !me || !can("organization.manage") || stored.hidden) return null;

  const hide = (
    <IconButton variant="ghost" label="Hide setup" onClick={() => save({ ...stored, hidden: true })}>
      <IconX />
    </IconButton>
  );
  if (!path) {
    return (
      <section aria-labelledby="setup-title" className="bg-card rounded-xl border p-4">
        <div className="flex items-center gap-3">
          <h2 id="setup-title" className="flex-1 text-sm font-medium">
            What brings you here?
          </h2>
          {hide}
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {PATHS.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => save({ ...stored, path: p.id })}
                className="hover:bg-accent hover:border-primary/40 grid w-full gap-0.5 rounded-lg border p-3 text-left transition-colors"
              >
                <span className="text-sm font-medium">{p.label}</span>
                <span className="text-muted-foreground text-xs">First win: {p.win}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  if (!facts) return null;

  const steps = onboardingSteps(path, facts);
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const chosen = PATHS.find((p) => p.id === path)!;

  return (
    <section aria-labelledby="setup-title" className="bg-card rounded-xl border p-4">
      <div className="flex items-center gap-3">
        <div className="grid flex-1 gap-1.5">
          <h2 id="setup-title" className="text-sm font-medium">
            {chosen.label}: on to {chosen.win}
          </h2>
          <div className="flex items-center gap-2">
            <Progress value={(done / steps.length) * 100} aria-label="Setup progress" className="h-1.5 max-w-48" />
            <span className="text-muted-foreground text-xs tabular-nums">
              {done} of {steps.length}
            </span>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => save({ ...stored, path: undefined })}>
          Change
        </Button>
        {hide}
      </div>
      <ul className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s) => {
          const body = (
            <>
              {s.done ? (
                // Keyed on done, so a step checked while the page is open pops in.
                <IconCircleCheckFilled key="done" className="text-primary-ink animate-in fade-in-0 zoom-in-50 mt-0.5 size-4 shrink-0 duration-200" />
              ) : s.win ? (
                <IconTrophy key="win" className="text-primary-ink mt-0.5 size-4 shrink-0" />
              ) : (
                <IconCircle key="todo" className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              )}
              <span className="grid min-w-0 gap-0.5 text-left">
                <span className={cn("text-sm", s.win && "font-medium", s.done && "text-muted-foreground line-through decoration-muted-foreground/50")}>{s.label}</span>
                <span className="text-muted-foreground text-xs">{s.why}</span>
              </span>
            </>
          );
          const row = "hover:bg-accent flex w-full items-start gap-2.5 rounded-md p-2 transition-colors";
          return (
            <li key={s.id}>
              {s.upload ? (
                onUpload && !s.done ? (
                  <button type="button" onClick={onUpload} className={row}>
                    {body}
                  </button>
                ) : (
                  <div className={row}>{body}</div>
                )
              ) : s.id === "git" ? (
                // The Git integration is the server's (GIT_CONNECT_URL), not a page of the app.
                <a href={s.href} className={row}>
                  {body}
                </a>
              ) : (
                <Link href={s.href!} className={row}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
