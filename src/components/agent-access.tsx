"use client";

import Link from "next/link";
import { useState } from "react";
import { IconKey, IconRobot } from "@tabler/icons-react";
import { copy, CopyButton } from "@/components/brand-values";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Agents, one way everywhere: every page has a "For agents" button that says
 * how an agent reads what the page shows (the MCP call and the REST request,
 * with this page's filters, asset or brand filled in), and the same Connect
 * tabs the Agents page has. The Agents page is where keys are made.
 */

/** A line an agent (or its person) copies: an MCP call, a request, a command. */
export type Read = { label: string; text: string };

export function Snippet({ text, what, multiline }: { text: string; what: string; multiline?: boolean }) {
  return (
    <div className="bg-muted flex items-start gap-2 rounded-md py-1.5 pr-1 pl-3">
      <code
        className={cn(
          "min-w-0 flex-1 font-mono text-xs",
          multiline ? "overflow-x-auto whitespace-pre" : "break-all",
        )}
      >
        {text}
      </code>
      <CopyButton onClick={() => copy(text, what)} label={`Copy ${what}`} />
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

/** How to connect, per client. `secret` fills the key in when one was just made. */
export function ConnectTabs({ origin, secret, compact }: { origin: string; secret?: string | null; compact?: boolean }) {
  const key = secret ?? "<key>";
  const small = compact ? "text-xs" : undefined;
  return (
    <Tabs defaultValue="claude">
      <TabsList className={compact ? "h-8" : undefined}>
        <TabsTrigger value="claude" className={small}>
          Claude Code
        </TabsTrigger>
        <TabsTrigger value="cursor" className={small}>
          Cursor
        </TabsTrigger>
        <TabsTrigger value="other" className={small}>
          {compact ? "Other" : "Other MCP clients"}
        </TabsTrigger>
        <TabsTrigger value="rest" className={small}>
          {compact ? "REST" : "REST and CLI"}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="claude" className="space-y-2 pt-2">
        <Snippet
          what="the command"
          text={`claude mcp add --transport http artbucket ${origin}/api/v1/mcp --header "Authorization: Bearer ${key}"`}
        />
      </TabsContent>
      <TabsContent value="cursor" className="space-y-2 pt-2">
        <p className="text-muted-foreground text-xs">
          In <code className="font-mono">.cursor/mcp.json</code>:
        </p>
        <Snippet
          what="the config"
          multiline
          text={JSON.stringify(
            { mcpServers: { artbucket: { url: `${origin}/api/v1/mcp`, headers: { Authorization: `Bearer ${key}` } } } },
            null,
            2,
          )}
        />
      </TabsContent>
      <TabsContent value="other" className="space-y-2 pt-2">
        <p className="text-muted-foreground text-xs">Streamable HTTP, with the key as a bearer token:</p>
        <Snippet what="the URL" text={`${origin}/api/v1/mcp`} />
        <Snippet what="the header" text={`Authorization: Bearer ${key}`} />
      </TabsContent>
      <TabsContent value="rest" className="space-y-2 pt-2">
        <Snippet what="the command" text={`curl -H 'Authorization: Bearer ${key}' '${origin}/api/v1/assets?q=logo'`} />
        <Snippet what="the command" text={`ARTBUCKET_URL=${origin} ARTBUCKET_KEY=${key} pnpm artbucket search logo`} />
        <p className="text-muted-foreground text-xs">
          Every endpoint is in{" "}
          <a className="underline" href="/api/v1/openapi.json">
            the OpenAPI spec
          </a>
          .
        </p>
      </TabsContent>
    </Tabs>
  );
}

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
        <Button variant="ghost" size="icon-sm" className={className} aria-label="For agents" title="For agents">
          <IconRobot />
        </Button>
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
          <IconRobot className="text-primary size-4" /> {subject}, for an agent
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
        <ConnectTabs origin={origin} compact />
      </div>
      <Button variant="outline" size="sm" className="w-full" asChild>
        <Link href="/agents">
          <IconKey /> Make a key on the Agents page
        </Link>
      </Button>
    </>
  );
}
