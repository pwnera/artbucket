"use client";

import { useEffect, useRef, useState } from "react";
import { IconChevronDown, IconRobot, IconSearch } from "@tabler/icons-react";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * The BrandHub's interactive bits: its search, which `/` focuses from
 * anywhere as on GitHub, and the Use this brand menu, GitHub's Code button
 * for brands: the addresses an agent or a build reads it from.
 */

export function HubSearch({ action, defaultValue = "", className, big }: { action: string; defaultValue?: string; className?: string; big?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || t?.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form role="search" action={action} className={cn("relative", className)}>
      <IconSearch aria-hidden className={cn("text-muted-foreground absolute start-3 top-1/2 -translate-y-1/2", big ? "size-5" : "size-4")} />
      <Input
        ref={ref}
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="Search brands and owners"
        aria-label="Search brands and owners"
        className={cn("bg-background pe-9", big ? "h-12 ps-10 text-base" : "h-8 ps-9")}
      />
      <kbd aria-hidden className="text-muted-foreground bg-muted absolute end-2.5 top-1/2 -translate-y-1/2 rounded border px-1.5 font-mono text-[11px]">
        /
      </kbd>
    </form>
  );
}

const FORMATS = [
  ["css", "CSS"],
  ["tailwind", "Tailwind 4"],
  ["scss", "Sass"],
  ["json", "W3C tokens"],
  ["shadcn", "shadcn/ui"],
  ["ts", "TypeScript"],
] as const;

type Tab = "agent" | "json" | "tokens";

/** The addresses a listing answers at, one to copy at a time. */
export function UseBrand({ url, name }: { url: string; name: string }) {
  const [tab, setTab] = useState<Tab>("agent");
  const [format, setFormat] = useState<(typeof FORMATS)[number][0]>("css");
  const shown = tab === "agent" ? `${url}/llms.txt` : tab === "json" ? `${url}/brand.json` : `${url}/tokens?format=${format}`;
  const hint = {
    agent: `Point any agent at it: ${name}'s rules, logos and type, in words.`,
    json: "Every rule and its files, for a build or a script.",
    tokens: "Design tokens, with @font-face for its fonts.",
  }[tab];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button>
          <IconRobot aria-hidden /> Use this brand <IconChevronDown aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(26rem,calc(100vw-2rem))] p-0">
        <div role="tablist" aria-label="How to use it" className="flex border-b px-2">
          {(
            [
              ["agent", "Agents"],
              ["json", "JSON"],
              ["tokens", "Tokens"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className="text-muted-foreground aria-selected:border-primary aria-selected:text-foreground -mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 p-3">
          <p className="text-muted-foreground text-xs">{hint}</p>
          {tab === "tokens" && (
            <div className="flex flex-wrap gap-1">
              {FORMATS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={format === id}
                  onClick={() => setFormat(id)}
                  className="aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:border-primary rounded-full border px-2.5 py-0.5 text-xs"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="bg-muted/60 flex items-center gap-1 rounded-md border ps-2.5">
            <code className="min-w-0 flex-1 truncate py-1.5 text-xs">{shown}</code>
            <CopyButton text={shown} label="Copy the address" what="the address" />
          </div>
          <p className="text-muted-foreground text-xs">Public, no key. Add @ and a release number after the name to pin one.</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
