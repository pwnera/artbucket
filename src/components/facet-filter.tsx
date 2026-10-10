"use client";

import { useState } from "react";
import { IconCheck, IconCirclePlus, IconPlus } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { normalizeTags } from "@/lib/search";
import { cn } from "@/lib/utils";

export type Count = { value: string; count: number };

/**
 * One facet as a dashed button that opens a searchable, multi-select list with
 * counts. A selected value stays listed even when its count drops to zero, or
 * it could never be cleared. The heading says how values combine: tags must
 * all match (`mode="all"`), every other facet matches any. While open, rows
 * keep the order they opened in, selected first, so ticking one doesn't move
 * the next out from under the pointer.
 */
export function FacetFilter({
  label,
  counts,
  selected,
  onChange,
  format = (v) => v,
  mode = "any",
  creatable = false,
}: {
  label: string;
  counts: Count[];
  selected: string[];
  onChange: (values: string[]) => void;
  format?: (value: string) => string;
  mode?: "all" | "any";
  /** Offer what was typed as a value, for facets the API lists only the top of (tags). */
  creatable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const all = [
    ...selected.filter((v) => !counts.some((c) => c.value === v)).map((value) => ({ value, count: 0 })),
    ...counts,
  ];
  if (!all.length && !creatable) return null;
  // Unknown to the snapshot (arrived while open): after the rest.
  const rank = (v: string) => (order.includes(v) ? order.indexOf(v) : order.length);
  const rows = open ? [...all].sort((a, b) => rank(a.value) - rank(b.value)) : all;
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const typed = q.trim();
  const offer = creatable && typed !== "" && !all.some((r) => r.value.toLowerCase() === typed.toLowerCase());

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setQ("");
        if (o) setOrder([...selected, ...all.map((r) => r.value).filter((v) => !selected.includes(v))]);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          <IconCirclePlus />
          {label}
          {selected.length > 0 && (
            <>
              <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
              {selected.length > 2 ? (
                <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                  {selected.length} selected
                </Badge>
              ) : (
                selected.map((v) => (
                  <Badge key={v} variant="secondary" className="rounded-sm px-1 font-normal">
                    {format(v)}
                  </Badge>
                ))
              )}
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <Command>
          {/* Always there: without a field, focus lands where cmdk's keys can't reach. */}
          <CommandInput placeholder={label} value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            {offer && (
              <CommandGroup forceMount>
                <CommandItem
                  forceMount
                  // Not a tag value, so cmdk never matches it against a row.
                  value={`\u0000${typed}`}
                  onSelect={() => {
                    onChange([...new Set([...selected, ...normalizeTags([typed])])]);
                    setQ("");
                  }}
                >
                  <IconPlus />
                  <span className="truncate">Filter by tag &ldquo;{typed}&rdquo;</span>
                </CommandItem>
              </CommandGroup>
            )}
            {rows.length > 0 && (
              <CommandGroup heading={mode === "all" ? "Has all of" : "Any of"}>
                {rows.map(({ value, count }) => {
                  const on = selected.includes(value);
                  return (
                    <CommandItem key={value} value={value} keywords={[format(value)]} onSelect={() => toggle(value)}>
                      <span
                        className={cn(
                          "border-primary flex size-4 items-center justify-center rounded-sm border",
                          on ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible",
                        )}
                      >
                        <IconCheck className="text-primary-foreground size-3" />
                      </span>
                      <span className="truncate">{format(value)}</span>
                      <span className="text-muted-foreground ml-auto font-mono text-xs">{count.toLocaleString()}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            {selected.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onChange([])} className="justify-center text-center">
                    Clear filter
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
          {/* The API lists the 50 most used; a rarer one is a search away. */}
          {creatable && counts.length === 50 && (
            <p className="text-muted-foreground border-t px-3 py-2 text-xs">50 most used. Type to filter by any other.</p>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
