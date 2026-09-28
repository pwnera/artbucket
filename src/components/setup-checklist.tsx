"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { IconCircle, IconCircleCheckFilled, IconX } from "@tabler/icons-react";
import { useBrand } from "@/components/brand";
import { useCan, useMe } from "@/components/can";
import { IconButton } from "@/components/icon-button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const KEY = "artbucket:setup";
type Stored = { hidden?: boolean; visited?: string[] };

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

/**
 * A new admin's first five minutes: the few things that make the library
 * theirs, each checked off from what the page already knows, the rest by
 * going there. Gone once every step is done, or when hidden.
 */
export function SetupChecklist({ uploaded, onUpload }: { uploaded: boolean; onUpload?: () => void }) {
  const can = useCan();
  const me = useMe();
  const brand = useBrand();
  // null on the server and while hydrating: say nothing until storage answers, so a hidden list never flashes.
  const raw = useSyncExternalStore(never, read, () => null);
  const [local, setLocal] = useState<Stored | null>(null);
  let stored: Stored = {};
  try {
    stored = local ?? (raw ? (JSON.parse(raw) as Stored) : {});
  } catch {}
  const save = (s: Stored) => {
    setLocal(s);
    write(s);
  };
  if (raw === null || !me || !can("organization.manage")) return null;

  const visited = new Set(stored.visited);
  const steps: { id: string; label: string; why: string; done: boolean; href?: string; run?: () => void }[] = [
    {
      id: "name",
      label: "Name your organization",
      why: "It heads every page, email and share link.",
      done: me.workspace.organization.name !== "Default",
      href: "/settings/organization/general",
    },
    { id: "brand", label: "Put your logo on the app", why: "The app, emails and portals wear it and your color.", done: brand.custom, href: "/settings/organization/branding" },
    { id: "email", label: "Turn on email", why: "Invites and password resets need it.", done: me.email, href: "/settings/organization/email" },
    { id: "upload", label: "Upload your first assets", why: "Logos, photos, fonts: anything the brand uses.", done: uploaded, run: onUpload },
    { id: "guidelines", label: "Set up your brand", why: "Colors, type, logo and voice, as pages people and agents read.", done: visited.has("guidelines"), href: "/brand" },
    { id: "team", label: "Invite your team", why: "Decide who can see, add and approve.", done: visited.has("team"), href: "/team" },
    { id: "agent", label: "Connect an agent", why: "It searches, checks and suggests through the same API.", done: visited.has("agent"), href: "/agents" },
  ];
  const done = steps.filter((s) => s.done).length;
  if (stored.hidden || done === steps.length) return null;
  const visit = (id: string) => !visited.has(id) && save({ ...stored, visited: [...visited, id] });

  return (
    <section aria-labelledby="setup-title" className="bg-card rounded-xl border p-4">
      <div className="flex items-center gap-3">
        <div className="grid flex-1 gap-1.5">
          <h2 id="setup-title" className="text-sm font-medium">
            Set up your library
          </h2>
          <div className="flex items-center gap-2">
            <Progress value={(done / steps.length) * 100} aria-label="Setup progress" className="h-1.5 max-w-48" />
            <span className="text-muted-foreground text-xs tabular-nums">
              {done} of {steps.length}
            </span>
          </div>
        </div>
        <IconButton variant="ghost" label="Hide setup" onClick={() => save({ ...stored, hidden: true })}>
          <IconX />
        </IconButton>
      </div>
      <ul className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s) => {
          const body = (
            <>
              {s.done ? (
                // Keyed on done, so a step checked while the page is open pops in.
                <IconCircleCheckFilled key="done" className="text-primary-ink animate-in fade-in-0 zoom-in-50 mt-0.5 size-4 shrink-0 duration-200" />
              ) : (
                <IconCircle key="todo" className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              )}
              <span className="grid min-w-0 gap-0.5 text-left">
                <span className={cn("text-sm", s.done && "text-muted-foreground line-through decoration-muted-foreground/50")}>{s.label}</span>
                <span className="text-muted-foreground text-xs">{s.why}</span>
              </span>
            </>
          );
          const row = "hover:bg-accent flex w-full items-start gap-2.5 rounded-md p-2 transition-colors";
          return (
            <li key={s.id}>
              {s.href ? (
                <Link href={s.href} onClick={() => visit(s.id)} className={row}>
                  {body}
                </Link>
              ) : s.run && !s.done ? (
                <button type="button" onClick={s.run} className={row}>
                  {body}
                </button>
              ) : (
                <div className={row}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
