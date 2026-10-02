"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { IconBrandGithub, IconCircle, IconCircleCheckFilled, IconTrophy, IconX } from "@tabler/icons-react";
import { useBrand } from "@/components/brand";
import { useCan, useMe } from "@/components/can";
import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { gitLink } from "@/lib/git";
import { isPath, onboardingSteps, PATHS, type Facts, type OnboardingStep, type PathId } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { collapse } from "@/lib/motion";

const KEY = "artbucket:setup";
/** `welcomed`: the full-page first run was seen, whether finished, skipped or left. */
type Stored = { hidden?: boolean; path?: PathId; welcomed?: boolean };

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

type Status = {
  steps: { id: string; done: boolean | null }[];
  publish: "never" | "behind" | "current";
  portals: unknown[] | null;
  hub: { visibility: "private" | "public" } | null;
};

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
    const brandy = path !== "clients";
    void (async () => {
      const list = brandy ? await json<{ data: { slug: string; default: boolean; rules?: number; createdAt: string }[] }>("/api/v1/brands") : null;
      // The brand being built is the one furthest along: of the newest few with rules (New brand, a template) and the
      // default, which every workspace starts with, empty, the one with the most steps done, released and public counting too.
      const made = (list?.data ?? []).filter((x) => (x.rules ?? 0) > 0).sort((x, y) => y.createdAt.localeCompare(x.createdAt));
      const fallback = list?.data.find((x) => x.default) ?? list?.data[0];
      const candidates = [...new Set([...made.slice(0, 3), ...(fallback ? [fallback] : [])])];
      const statuses = await Promise.all(candidates.map((c) => json<{ data: Status }>(`/api/v1/brands/${encodeURIComponent(c.slug)}/status`)));
      const progress = (st: { data: Status } | null) =>
        !st ? -1 : st.data.steps.filter((x) => x.done).length + (st.data.publish !== "never" ? 1 : 0) + (st.data.hub?.visibility === "public" ? 1 : 0);
      const best = statuses.reduce((at, st, i) => (progress(st) > progress(statuses[at]) ? i : at), 0);
      const b = candidates[best];
      const [status, source, members, keys, asked] = await Promise.all([
        statuses[best] ?? null,
        b && path === "product" ? json<{ data: { source: unknown } }>(`/api/v1/brands/${encodeURIComponent(b.slug)}/source`) : null,
        path === "company" ? json<{ data: unknown[]; invitations: unknown[] }>("/api/v1/members") : null,
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
                public: status?.data.hub?.visibility === "public",
                portal: !!status?.data.portals?.length,
              }
            : null,
          hub: !!status?.data.hub || !!me.hub,
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
 * in this browser like the list being hidden. The first time, it is the
 * whole page (the prototype's /welcome); skipped or left unfinished, it is
 * this card at the top of the library. Gone once every step is done, or
 * when hidden.
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
  // Finished while it was on screen: it says so for a moment, then folds away, rather than vanishing on the last tick.
  const complete = !!path && !!facts && onboardingSteps(path, facts).every((s) => s.done);
  const [watched, setWatched] = useState(false);
  if (path && facts && !complete && !watched) setWatched(true);
  const [over, setOver] = useState(false);
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!complete || !watched) return;
    const t = setTimeout(() => collapse(card.current, () => setOver(true)), 2600);
    return () => clearTimeout(t);
  }, [complete, watched]);
  if (raw === null || !me || !can("organization.manage") || stored.hidden) return null;
  if (!stored.welcomed) return <FirstRun stored={stored} save={save} facts={facts} onUpload={onUpload} org={me.workspace.organization.name} />;

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
            What do you want to do?
          </h2>
          {hide}
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
  const chosen = PATHS.find((p) => p.id === path)!;
  // A path just picked keeps its card while its steps load: the library below doesn't jump up and back.
  if (!facts) {
    return (
      <section aria-labelledby="setup-title" aria-busy className="bg-card rounded-xl border p-4">
        {/* The loaded card's rows at their heights: the title over its progress, then steps of a label and a line. */}
        <div className="grid gap-1.5">
          <h2 id="setup-title" className="text-sm font-medium">
            {chosen.label}: on to {chosen.win}
          </h2>
          <Skeleton className="my-[5px] h-1.5 max-w-48" />
        </div>
        <div className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[3.375rem]" />
          ))}
        </div>
      </section>
    );
  }

  const steps = onboardingSteps(path, facts);
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) {
    if (!watched || over) return null;
    return (
      <section ref={card} role="status" className="bg-card animate-in fade-in-0 flex items-center gap-3 rounded-xl border p-4">
        <span className="bg-primary/10 text-primary-ink animate-in zoom-in-50 spin-in-[-20deg] grid size-9 shrink-0 place-items-center rounded-full duration-500">
          <IconTrophy className="size-5" />
        </span>
        <div className="grid gap-0.5">
          <p className="text-sm font-medium">Done: {chosen.win}</p>
          <p className="text-muted-foreground text-xs">Every step checked off.</p>
        </div>
      </section>
    );
  }

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
      <StepList steps={steps} onUpload={onUpload} className="mt-3 sm:grid-cols-2 lg:grid-cols-3" />
      <BringIn path={path} git={facts.git} />
    </section>
  );
}

/** A path's steps, each a link to where it is done, checked off from what the app knows. */
function StepList({ steps, onUpload, onGo, className }: { steps: OnboardingStep[]; onUpload?: () => void; onGo?: () => void; className?: string }) {
  return (
    <ul className={cn("grid gap-1", className)}>
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
              {/* The strike is a line drawn across, so a step checked while the page is open is crossed out as you watch. */}
              <span className={cn("text-sm transition-colors duration-500", s.win && "font-medium", s.done && "text-muted-foreground")}>
                <span
                  className={cn(
                    "bg-[linear-gradient(currentColor,currentColor)] bg-[position:0_55%] bg-no-repeat transition-[background-size] duration-500 [box-decoration-break:clone]",
                    s.done ? "bg-[length:100%_1px]" : "bg-[length:0%_1px]",
                  )}
                >
                  {s.label}
                </span>
              </span>
              <span className="text-muted-foreground text-xs">{s.why}</span>
            </span>
          </>
        );
        const row = "hover:bg-accent flex w-full items-start gap-2.5 rounded-md p-2 transition-colors";
        return (
          <li key={s.id}>
            {s.upload ? (
              onUpload && !s.done ? (
                <button type="button" onClick={() => (onGo?.(), onUpload())} className={row}>
                  {body}
                </button>
              ) : (
                <div className={row}>{body}</div>
              )
            ) : s.id === "git" ? (
              // The Git integration is the server's (GIT_CONNECT_URL), not a page of the app.
              <a href={s.href} className={row} onClick={onGo}>
                {body}
              </a>
            ) : (
              <Link href={s.href!} className={row} onClick={onGo}>
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The product path's other way in, where the server has a Git integration:
 * a brand that already lives in a repository comes in from its brand.yaml
 * (the integration's link with no brand), instead of being set up here.
 */
function BringIn({ path, git, onGo }: { path: PathId; git: string | null; onGo?: () => void }) {
  if (path !== "product" || !git) return null;
  return (
    <a href={gitLink(git)} onClick={onGo} className="hover:bg-accent mt-2 flex items-start gap-2.5 rounded-md border border-dashed p-2 transition-colors">
      <IconBrandGithub aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <span className="grid min-w-0 gap-0.5">
        <span className="text-sm">My brand is already in a repository</span>
        <span className="text-muted-foreground text-xs">Bring it in from its brand.yaml.</span>
      </span>
    </a>
  );
}

/**
 * The first run, over the whole page: who you are, then that path's steps.
 * Anything that leaves it (continuing, skipping, Escape, a step's link) marks
 * it seen, and the library's card carries on from there.
 */
function FirstRun({ stored, save, facts, onUpload, org }: { stored: Stored; save: (s: Stored) => void; facts: Facts | null; onUpload?: () => void; org: string }) {
  const path = isPath(stored.path) ? stored.path : undefined;
  const leave = () => save({ ...stored, welcomed: true });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && save({ ...stored, welcomed: true });
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [stored, save]);
  const steps = path && facts ? onboardingSteps(path, facts) : null;
  const done = steps?.filter((s) => s.done).length ?? 0;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="welcome-title" className="bg-background fixed inset-0 z-50 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-12 sm:py-20">
        <div className="grid gap-2">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Welcome to Artbucket</p>
          <h1 id="welcome-title" className="text-3xl font-semibold tracking-tight">
            What do you want to do?
          </h1>
          <p className="text-muted-foreground">We set that up first. The rest can wait.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="What do you want to do">
          {PATHS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={path === p.id}
              onClick={() => save({ ...stored, path: p.id })}
              className="hover:border-primary/40 aria-checked:border-primary aria-checked:ring-primary/30 grid content-start gap-1 rounded-xl border p-4 text-left transition-colors aria-checked:ring-2"
            >
              <span className="font-medium">{p.label}</span>
              <span className="text-muted-foreground text-sm">{p.blurb}</span>
              <span className="text-primary-ink mt-2 text-xs font-medium">First win: {p.win}</span>
            </button>
          ))}
        </div>
        {path && (
          <section aria-labelledby="welcome-steps" className="bg-card rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <h2 id="welcome-steps" className="flex-1 font-medium">
                Set up {org}
              </h2>
              {steps && (
                <span className="text-muted-foreground text-sm tabular-nums">
                  {done} of {steps.length} done
                </span>
              )}
            </div>
            {steps ? <StepList steps={steps} onUpload={onUpload} onGo={leave} className="mt-3" /> : <p className="text-muted-foreground mt-3 text-sm">Looking at what is there…</p>}
            <BringIn path={path} git={facts?.git ?? null} onGo={leave} />
          </section>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={leave}>
            Skip for now
          </Button>
          <Button onClick={leave} disabled={!path}>
            Continue to the library
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
