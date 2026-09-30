"use client";

import Link from "next/link";
import { IconAlertTriangle, IconCheck, IconExternalLink, IconRobot, IconX } from "@tabler/icons-react";
import { nextFixes, ScoreRing } from "@/components/brand-overview";
import type { Status } from "@/components/builder/use-status";
import { useCan } from "@/components/can";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { builderPath } from "@/lib/site";
import { cn } from "@/lib/utils";

/** Where a step is taken in the app. */
const whereTo = (slug: string, id: Status["steps"][number]["id"]) =>
  id === "portal" ? `/portals?${new URLSearchParams({ new: slug })}` : id === "publish" ? `/brands/${encodeURIComponent(slug)}/releases/new` : builderPath(slug);

/** A prompt for an agent connected over MCP: the fixes worth the most, each as the agent takes it (the step's `agent`). */
function prompt(name: string, slug: string, fixes: Status["steps"]) {
  return [
    `Raise the Brand Agent Score of the brand "${name}" (slug ${slug}) in Artbucket. Start with brand_status, then:`,
    ...fixes.map((s, i) => `${i + 1}. ${s.title}: ${s.detail} ${s.agent ?? ""}`.trim()),
    "Suggest each change and wait for my yes before writing; publish only when I ask.",
  ].join("\n");
}

/**
 * The Brand Agent Score screen (lib/readiness.ts; the prototype's "Brand
 * Agent Score"): the score as a ring, what the two fixes worth the most would
 * make it, and every step with what it gives: done, to do, or not known to
 * this person. Fix with an agent hands an agent connected over MCP a prompt
 * for those fixes; Share public score links BrandHub's public score for the
 * domain the organization proved.
 */
export function BrandScore({ name, slug, status }: { name: string; slug: string; status: Status }) {
  const can = useCan();
  const { fixes, to } = nextFixes(status);
  const hub = status.hub;
  // BrandHub's public score takes a domain: the one the organization proved, when it proved one.
  const domain = hub?.verified && !hub.verified.startsWith("github.com/") ? hub.verified : null;
  const base = hub && hub.url.endsWith(`/${hub.ref}`) ? hub.url.slice(0, -hub.ref.length - 1) : null;
  const text = prompt(name, slug, fixes);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <ScoreRing score={status.score} size={110} />
          <div className="grid gap-1">
            <h2 className="font-display text-2xl font-semibold">{status.score} out of 100</h2>
            <p className="text-muted-foreground text-sm">
              {fixes.length
                ? `Agents can find and use ${status.score >= 50 ? "most" : "some"} of ${name}. ${fixes.length === 1 ? "One fix" : `${fixes.length === 2 ? "Two" : fixes.length} fixes`} would get you to ${to}.`
                : `Agents can find and use all of ${name}.`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {domain && base && hub?.visibility === "public" && (
            <Button variant="outline" size="sm" asChild>
              <a href={`${base}/score?${new URLSearchParams({ domain })}`} target="_blank" rel="noreferrer">
                Share public score <IconExternalLink aria-hidden />
              </a>
            </Button>
          )}
          {fixes.length > 0 && can("brand.edit") && (
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm">
                  <IconRobot aria-hidden /> Fix with an agent
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="grid w-[min(28rem,calc(100vw-2rem))] gap-2 p-3">
                <p className="text-sm">Paste this to an agent connected over MCP. It suggests each change before making it.</p>
                <div className="bg-muted/60 flex items-start gap-1 rounded-md border ps-2.5">
                  <pre className="max-h-48 min-w-0 flex-1 overflow-auto py-2 text-xs whitespace-pre-wrap">{text}</pre>
                  <CopyButton text={text} label="Copy the prompt" what="the prompt" />
                </div>
                <p className="text-muted-foreground text-xs">
                  No agent yet?{" "}
                  <Link href="/connections" className="text-foreground underline underline-offset-2">
                    Connect one
                  </Link>
                  .
                </p>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      <ul className="bg-card divide-y rounded-xl border">
        {status.steps.map((s) => (
          <li key={s.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-3 p-4">
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full [&_svg]:size-3.5",
                s.done === true ? "bg-success/15 text-success" : s.done === false ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning",
              )}
            >
              {s.done === true ? <IconCheck aria-label="done" /> : s.done === false ? <IconX aria-label="to do" /> : <IconAlertTriangle aria-label="not known" />}
            </span>
            <span className="grid gap-0.5">
              {s.done === false ? (
                <Link href={whereTo(slug, s.id)} className="font-medium hover:underline">
                  {s.title}
                </Link>
              ) : (
                <b className="font-medium">{s.title}</b>
              )}
              <span className="text-muted-foreground text-sm">{s.detail}</span>
            </span>
            <span className="text-muted-foreground text-sm tabular-nums">{s.done === null ? "" : `${s.done ? s.points : 0}/${s.points}`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
