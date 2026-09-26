"use client";

import { IconCheck, IconCirclePlus } from "@tabler/icons-react";
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
import { cn } from "@/lib/utils";

export type Count = { value: string; count: number };

/**
 * One facet as a dashed button that opens a searchable, multi-select list with
 * counts. A selected value stays listed even when its count drops to zero, or
 * it could never be cleared.
 */
export function FacetFilter({
  label,
  counts,
  selected,
  onChange,
  format = (v) => v,
}: {
  label: string;
  counts: Count[];
  selected: string[];
  onChange: (values: string[]) => void;
  format?: (value: string) => string;
}) {
  const rows = [
    ...selected.filter((v) => !counts.some((c) => c.value === v)).map((value) => ({ value, count: 0 })),
    ...counts,
  ];
  if (!rows.length) return null;
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <Popover>
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
          {rows.length > 7 && <CommandInput placeholder={label} />}
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
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
                    <span className="text-muted-foreground ml-auto font-mono text-xs">{count}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
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
        </Command>
      </PopoverContent>
    </Popover>
  );
}
