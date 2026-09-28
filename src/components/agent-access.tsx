"use client";

import Link from "next/link";
import { useState } from "react";
import { IconPlugConnected, IconRobot } from "@tabler/icons-react";
import { IconButton } from "@/components/icon-button";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * Agents, one way everywhere: every page has a "For agents" button that says
 * how an agent reads what the page shows (the MCP call and the REST request,
 * with this page's filters, asset or brand filled in), and the one URL every
 * agent connects to. The Agents page is where they get connected.
 */

/** A line an agent (or its person) copies: an MCP call, a request, a command. */
export type Read = { label: string; text: string };

/** `multiline` keeps lines as they are (config, commands); `prose` wraps at words, for a prompt to paste into a chat. */
export function Snippet({ text, what, multiline, prose }: { text: string; what: string; multiline?: boolean; prose?: boolean }) {
  return (
    <div className="bg-muted flex items-start gap-2 rounded-md py-1.5 pr-1 pl-3">
      <code
        className={cn(
          "min-w-0 flex-1 font-mono text-xs",
          prose ? "font-sans break-words whitespace-pre-wrap" : multiline ? "overflow-x-auto whitespace-pre" : "break-all",
        )}
      >
        {text}
      </code>
      <CopyButton text={text} what={what} label={`Copy ${what}`} />
    </div>
  );
}

/** An MCP tool call as a person reads it: `search_assets({"q":"logo"})`. */
export const call = (tool: string, args: Record<string, unknown> = {}) => {
  const clean = Object.fromEntries(
    Object.entries(args).filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length)),
  );
  return `${tool}(${Object.keys(clean).length ? JSON.stringify(clean) : ""})`;
};

/** A REST request with the key where it goes. */
export const curl = (url: string, headers: string[] = []) =>
  `curl ${[...headers, "Authorization: Bearer <key>"].map((h) => `-H '${h}' `).join("")}'${url}'`;

/**
 * The page's "For agents" button. `reads` is what this page is, to an agent;
 * `about` says it in a sentence.
 */
export function ForAgents({
  subject = "This page",
  about,
  reads,
  className,
}: {
  /** What the panel is about: "This page", "This asset". */
  subject?: string;
  about: string;
  /** Built on open, so it can read the page's origin. */
  reads: (origin: string) => Read[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton variant="ghost" label="For agents" className={className}>
          <IconRobot />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(30rem,calc(100vw-2rem))] space-y-4">
        {open && <Panel subject={subject} about={about} reads={reads(window.location.origin)} origin={window.location.origin} />}
      </PopoverContent>
    </Popover>
  );
}

function Panel({ subject, about, reads, origin }: { subject: string; about: string; reads: Read[]; origin: string }) {
  return (
    <>
      <div className="space-y-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          <IconRobot className="text-primary-ink size-4" /> {subject}, for an agent
        </p>
        <p className="text-muted-foreground text-xs">{about}</p>
      </div>
      <div className="space-y-3">
        {reads.map((r) => (
          <div key={r.label} className="space-y-1">
            <p className="text-muted-foreground text-xs">{r.label}</p>
            <Snippet text={r.text} what={r.label.toLowerCase()} />
          </div>
        ))}
      </div>
      <Separator />
      <div className="space-y-2">
        <p className="text-sm font-medium">Connect an agent</p>
        <Snippet text={`${origin}/api/v1/mcp`} what="the URL" />
      </div>
      <Button variant="outline" size="sm" className="w-full" asChild>
        <Link href="/agents">
          <IconPlugConnected /> Set up Claude, ChatGPT, Cursor and more
        </Link>
      </Button>
    </>
  );
}
