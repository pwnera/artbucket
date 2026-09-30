"use client";

import { useId, useState } from "react";
import { IconCircleCheck, IconCircleX, IconLoader2 } from "@tabler/icons-react";
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
 * replacement. Enter asks, and never reaches a form around it.
 */
export function CanIUse({ ask, context = false, onOpen }: { ask: (use: Use) => Promise<Response>; context?: boolean; onOpen?: (id: string) => void }) {
  const id = useId();
  const [use, setUse] = useState<Use>({});
  const [got, setGot] = useState<{ busy?: boolean; verdict?: Verdict; error?: string }>({});
  const set = (k: keyof Use) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setUse({ ...use, [k]: e.target.value });
    setGot({});
  };
  const run = async () => {
    setGot({ busy: true });
    const said: Use = {
      channel: use.channel?.trim().toLowerCase() || undefined,
      territory: use.territory?.trim().toUpperCase() || undefined,
      date: use.date || undefined,
      context: use.context?.trim().toLowerCase() || undefined,
    };
    try {
      const res = await ask(said);
      const body = await res.json().catch(() => null);
      if (res.ok) return setGot({ verdict: body });
      // A bad field names itself in detail.properties; its message says what it wants.
      const props = body?.error?.detail?.properties as Record<string, { errors?: string[] }> | undefined;
      const field = props && Object.values(props).flatMap((p) => p.errors ?? [])[0];
      setGot({ error: field ?? body?.error?.message ?? "The check didn't answer. Try again." });
    } catch {
      setGot({ error: "The check didn't answer: are you online?" });
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
          Used for
          <Input value={use.channel ?? ""} onChange={set("channel")} list={`${id}-channels`} placeholder="e.g. paid-social" />
          <datalist id={`${id}-channels`}>
            {CHANNELS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className={label}>
          Country
          <Input value={use.territory ?? ""} onChange={set("territory")} maxLength={2} autoCapitalize="characters" placeholder="e.g. DE" />
        </label>
        <label className={label}>
          <span>
            On <span className="font-normal">(empty: today)</span>
          </span>
          <Input type="date" value={use.date ?? ""} onChange={set("date")} />
        </label>
        {context && (
          <label className={label}>
            Context
            <Input value={use.context ?? ""} onChange={set("context")} placeholder="e.g. dark-background" />
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
              {v.allowed ? "Yes, you can use it" : "No, not for this use"}
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
                    <li key={s.id}>
                      {onOpen ? (
                        <button type="button" onClick={() => onOpen(s.id)} className="hover:underline">
                          {s.title}
                        </button>
                      ) : (
                        s.title
                      )}
                      <span className="text-muted-foreground"> · {s.why}</span>
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
