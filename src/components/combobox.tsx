"use client";

import { useState } from "react";
import { defaultFilter } from "cmdk";
import { IconCheck, IconPlus, IconSelector, IconX } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type Option = { value: string; label?: string; hint?: string | number };

const labelOf = (options: Option[], v: string) => options.find((o) => o.value === v)?.label ?? v;

/**
 * One value, picked by typing. With `name` it submits in a <form> like any
 * input; the hidden twin carries `required` so the browser still enforces it.
 */
export function Combobox({
  id,
  name,
  options,
  value,
  defaultValue = "",
  onChange,
  placeholder = "Select",
  required,
  className,
}: {
  id?: string;
  name?: string;
  options: Option[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const [inner, setInner] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const current = value ?? inner;
  const pick = (v: string) => {
    setInner(v);
    onChange?.(v);
    setOpen(false);
  };

  return (
    <div className={cn("relative", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between px-3 font-normal"
          >
            <span className={cn("truncate", !current && "text-muted-foreground")}>
              {current ? labelOf(options, current) : placeholder}
            </span>
            <IconSelector className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-48 p-0" align="start">
          <Command>
            {options.length > 6 && <CommandInput placeholder="Search" />}
            <CommandList>
              <CommandEmpty>No match.</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem key={o.value} value={o.value} keywords={[o.label ?? ""]} onSelect={() => pick(o.value)}>
                    <IconCheck className={cn(current === o.value ? "opacity-100" : "opacity-0")} />
                    {o.label ?? o.value}
                    {o.hint !== undefined && <span className="text-muted-foreground ml-auto text-xs">{o.hint}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
              {current && !required && (
                <CommandGroup>
                  <CommandItem value="__clear" onSelect={() => pick("")} className="text-muted-foreground">
                    <IconX /> Clear
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {name && (
        <input
          name={name}
          value={current}
          required={required}
          onChange={() => {}}
          tabIndex={-1}
          aria-hidden
          className="sr-only bottom-0 left-4"
        />
      )}
    </div>
  );
}

/**
 * Many values as chips, with autocomplete. `creatable` lets free text in, for
 * tags; without it only listed options can be picked. Backspace in an empty
 * search removes the last chip.
 */
export function MultiCombobox({
  id,
  name,
  options,
  value,
  defaultValue = [],
  onChange,
  placeholder = "Select",
  creatable,
  className,
}: {
  id?: string;
  name?: string;
  options: Option[];
  value?: string[];
  defaultValue?: string[];
  onChange?: (value: string[]) => void;
  placeholder?: string;
  creatable?: boolean;
  className?: string;
}) {
  const [inner, setInner] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = value ?? inner;
  const set = (next: string[]) => {
    setInner(next);
    onChange?.(next);
  };
  const toggle = (v: string) => {
    set(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
    setSearch("");
  };
  const q = search.trim();
  const canCreate =
    creatable && q !== "" && !selected.includes(q) && !options.some((o) => o.value.toLowerCase() === q.toLowerCase());

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch("");
      }}
    >
      <PopoverAnchor asChild>
        <div
          className={cn(
            "border-input dark:bg-input/30 flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border bg-transparent px-1.5 py-1 shadow-xs",
            "has-[button[aria-expanded=true]]:border-ring has-[button[aria-expanded=true]]:ring-ring/50 has-[button[aria-expanded=true]]:ring-[3px]",
            className,
          )}
        >
          {selected.map((v) => (
            <Badge key={v} variant="secondary" className="gap-0.5 pr-0.5">
              {labelOf(options, v)}
              <button
                type="button"
                onClick={() => toggle(v)}
                aria-label={`Remove ${labelOf(options, v)}`}
                className="hover:bg-muted-foreground/20 rounded-full p-0.5"
              >
                <IconX className="size-3" />
              </button>
              {name && <input type="hidden" name={name} value={v} />}
            </Badge>
          ))}
          <PopoverTrigger asChild>
            <button
              id={id}
              type="button"
              className="text-muted-foreground h-6 min-w-16 flex-1 px-1.5 text-left text-sm outline-none"
            >
              {selected.length ? "" : placeholder}
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-56 p-0" align="start">
        {/* "Add" ranks last, so Enter picks an existing tag when one matches. */}
        <Command filter={(v, s, k) => (v.startsWith("__create ") ? 0.0001 : defaultFilter(v, s, k))}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={creatable ? "Search or add" : "Search"}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !search && selected.length) set(selected.slice(0, -1));
              // A comma finishes a tag, as in the old comma separated field.
              if (e.key === "," && canCreate) {
                e.preventDefault();
                toggle(q);
              }
            }}
          />
          <CommandList>
            {!canCreate && <CommandEmpty>{creatable ? "Type to add one." : "No match."}</CommandEmpty>}
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.value} value={o.value} keywords={[o.label ?? ""]} onSelect={() => toggle(o.value)}>
                  <IconCheck className={cn(selected.includes(o.value) ? "opacity-100" : "opacity-0")} />
                  {o.label ?? o.value}
                  {o.hint !== undefined && <span className="text-muted-foreground ml-auto text-xs">{o.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
            {canCreate && (
              <CommandGroup>
                <CommandItem value={`__create ${q}`} onSelect={() => toggle(q)}>
                  <IconPlus /> Add &ldquo;{q}&rdquo;
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
