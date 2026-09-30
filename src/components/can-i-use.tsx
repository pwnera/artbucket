"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconCircleCheck, IconCircleX, IconLoader2 } from "@tabler/icons-react";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CHANNELS } from "@/lib/rights";

/** What a check answers (lib/core/check.ts), as far as a person reads it. */
type Verdict = {
  allowed: boolean;
  reasons: { code: string; message: string; blocking: boolean }[];
  suggest: { id: string; title: string; why: string }[];
};
export type Use = { channel?: string; territory?: string; date?: string; context?: string };

const label = "text-muted-foreground grid gap-1 text-xs font-medium";

/**
 * "Can I use this?" for people (PRD P1): what a file is for, the country and
 * the day it runs, and the check's verdict with its reasons and what to use
 * instead. `ask` posts the use to the check this surface may call: POST
 * /api/v1/check in the app, the portal's own on a portal. `context` offers
 * the brand's context too (the app's check weighs it); `onOpen` opens a
 * replacement, and offers a link to it. Enter asks, and never reaches a form
 * around it. Once asked, the verdict follows the use as it changes, as the
 * prototype's does; not before, since every check is logged (Insights, Use
 * checks) and opening an asset is not asking.
 */
export function CanIUse({ ask, context = false, onOpen }: { ask: (use: Use) => Promise<Response>; context?: boolean; onOpen?: (id: string) => void }) {
  const id = useId();
  const [use, setUse] = useState<Use>({});
  const [got, setGot] = useState<{ busy?: boolean; verdict?: Verdict; error?: string }>({});
  // After the first check, a changed use asks again once typing settles; a half-typed country waits.
  const asked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Only the latest check's answer shows: an earlier one may come back after it.
  const seq = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const change = (k: keyof Use, value: string) => {
    const next = { ...use, [k]: value };
    setUse(next);
    clearTimeout(timer.current);
    if (!asked.current) return setGot({});
    if (!next.territory || next.territory.trim().length === 2) timer.current = setTimeout(() => void run(next), 500);
  };
  const run = async (u: Use = use) => {
    asked.current = true;
    clearTimeout(timer.current);
    const n = ++seq.current;
    setGot((g) => ({ ...g, busy: true }));
    const said: Use = {
      channel: u.channel?.trim().toLowerCase() || undefined,
      territory: u.territory?.trim().toUpperCase() || undefined,
      date: u.date || undefined,
      context: u.context?.trim().toLowerCase() || undefined,
    };
    const show = (g: typeof got) => n === seq.current && setGot(g);
    try {
      const res = await ask(said);
      const body = await res.json().catch(() => null);
      if (res.ok) return show({ verdict: body });
      // A bad field names itself in detail.properties; its message says what it wants.
      const props = body?.error?.detail?.properties as Record<string, { errors?: string[] }> | undefined;
      const field = props && Object.values(props).flatMap((p) => p.errors ?? [])[0];
      show({ error: field ?? body?.error?.message ?? "The check didn't answer. Try again." });
    } catch {
      show({ error: "The check didn't answer: are you online?" });
    }
  };
  const v = got.verdict;
  return (
    <div
      className="grid gap-3"
      onKeyDown={(e) => {
        if (e.key !== "Enter" || !(e.target instanceof HTMLInputElement)) return;
        e.preventDefault();
        e.stopPropagation();
        void run();
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className={label}>
          Where
          <Input value={use.channel ?? ""} onChange={(e) => change("channel", e.target.value)} list={`${id}-channels`} placeholder="e.g. paid-social" />
          <datalist id={`${id}-channels`}>
            {CHANNELS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className={label}>
          Territory
          <Input value={use.territory ?? ""} onChange={(e) => change("territory", e.target.value)} maxLength={2} autoCapitalize="characters" placeholder="e.g. DE" />
        </label>
        <label className={label}>
          <span>
            When <span className="font-normal">(empty: today)</span>
          </span>
          <Input type="date" value={use.date ?? ""} onChange={(e) => change("date", e.target.value)} />
        </label>
        {context && (
          <label className={label}>
            Context
            <Input value={use.context ?? ""} onChange={(e) => change("context", e.target.value)} placeholder="e.g. dark-background" />
          </label>
        )}
      </div>
      <Button type="button" variant="outline" size="sm" className="justify-self-start" disabled={got.busy} onClick={() => void run()}>
        {got.busy && <IconLoader2 className="animate-spin" />} Check
      </Button>
      <div aria-live="polite" className="grid gap-1.5 text-sm">
        {got.error && <p className="text-destructive">{got.error}</p>}
        {v && (
          <>
            <p className="flex items-center gap-1.5 font-medium">
              {v.allowed ? <IconCircleCheck aria-hidden className="text-success size-4 shrink-0" /> : <IconCircleX aria-hidden className="text-destructive size-4 shrink-0" />}
              {v.allowed ? "Yes, you can use it" : "Not for this use"}
            </p>
            {v.reasons.length > 0 && (
              <ul className="grid gap-0.5 ps-5.5">
                {v.reasons.map((r) => (
                  <li key={r.code + r.message} className={r.blocking ? undefined : "text-muted-foreground"}>
                    {r.message}
                  </li>
                ))}
              </ul>
            )}
            {v.suggest.length > 0 && (
              <div className="grid gap-0.5 ps-5.5">
                <p className="text-muted-foreground text-xs font-medium">Use instead</p>
                <ul className="grid gap-0.5">
                  {v.suggest.map((s) => (
                    <li key={s.id} className="flex items-center gap-1">
                      <span className="min-w-0">
                      {onOpen ? (
                        <button type="button" onClick={() => onOpen(s.id)} className="hover:underline">
                          {s.title}
                        </button>
                      ) : (
                        s.title
                      )}
                      <span className="text-muted-foreground"> · {s.why}</span>
                      </span>
                      {/* In the app: a link that follows the replacement to its current version (/c/). */}
                      {onOpen && <CopyButton label={`Copy a link to ${s.title}`} what="the link" text={async () => new URL(`/c/${s.id}`, location.origin).href} />}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
