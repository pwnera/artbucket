"use client";

import { useEffect, useId, useState } from "react";
import { IconSend } from "@/components/icons";
import { Body } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { useSite } from "@/components/site/site-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RequestKind } from "@/lib/pages";

/**
 * Request: on a portal, a form that asks the brand team (props.kind: an
 * asset, a review or a question; question when left out) under props.prompt,
 * posted to POST /api/v1/portal/{slug}/requests with kind, page and section,
 * through the door the visitor came in by. In the app (the reader, the
 * builder's canvas) the same form, shut: readers can ask here, nobody else.
 */

type Ask = Exclude<RequestKind, "access">;

/** What the message box asks, when the section doesn't say. */
const PROMPT: Record<Ask, string> = { asset: "What do you need?", review: "What should the team look at?", question: "Your question" };

export function RequestSection({ section: s }: SectionProps) {
  const { view, portal } = useSite();
  const id = useId();
  const kind = (s.props.kind as Ask | undefined) ?? "question";
  const [at, setAt] = useState<"open" | "busy" | "sent">("open");
  const [error, setError] = useState<string | null>(null);
  /** Signed in: the team answers them there, so no email is asked. On a portal's own domain the session never arrives. */
  const [who, setWho] = useState<string | null>(null);
  const slug = portal?.slug;
  useEffect(() => {
    if (!slug) return;
    const ac = new AbortController();
    fetch("/api/v1/me", { cache: "no-store", signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => setWho(b?.data?.user?.email ?? null))
      .catch(() => {});
    return () => ac.abort();
  }, [slug]);

  if (at === "sent")
    return (
      <div className="space-y-6">
        <Body />
        <p role="status">Sent: the team will answer by email.</p>
      </div>
    );
  return (
    <div className="space-y-6">
      <Body />
      <form
        className="max-w-lg"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!portal || at === "busy") return;
          const f = new FormData(e.currentTarget);
          setAt("busy");
          setError(null);
          try {
            const headers = new Headers(portal.headers?.());
            headers.set("Content-Type", "application/json");
            const res = await fetch(`/api/v1/portal/${portal.slug}/requests`, {
              method: "POST",
              headers,
              body: JSON.stringify({ email: who ?? f.get("email"), note: f.get("note"), kind, page: view.page?.slug, section: s.id }),
            });
            if (res.ok) return setAt("sent");
            setError((await res.json().catch(() => null))?.error?.message ?? "That didn't go through. Try again.");
          } catch {
            setError("Couldn't reach the server. Check the connection and try again.");
          }
          setAt("open");
        }}
      >
        {/* Off a portal there is no one to send it to: the form shows what readers get, shut. */}
        <fieldset disabled={!portal} className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor={`${id}-note`}>{(s.props.prompt as string | undefined) || PROMPT[kind]}</Label>
            <Textarea
              id={`${id}-note`}
              name="note"
              required
              maxLength={2000}
              rows={4}
              aria-invalid={!!error || undefined}
              aria-describedby={error ? `${id}-err` : undefined}
            />
          </div>
          {!who && (
            <div className="grid gap-2">
              <Label htmlFor={`${id}-email`}>Your email, for the answer</Label>
              <Input id={`${id}-email`} name="email" type="email" required maxLength={320} autoComplete="email" />
            </div>
          )}
          {error && (
            <p id={`${id}-err`} role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button type="submit" pending={at === "busy"}>
              <IconSend aria-hidden /> Send
            </Button>
            {portal ? (
              who && <span className="text-muted-foreground text-sm">The answer goes to {who}.</span>
            ) : (
              <span className="text-muted-foreground text-sm">Readers can ask here.</span>
            )}
          </div>
        </fieldset>
      </form>
    </div>
  );
}
