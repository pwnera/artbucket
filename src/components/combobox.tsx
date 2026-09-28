"use client";

import { useEffect, useRef, useState } from "react";
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

/** `locked`: shown as a chip that can't be removed, and never offered (a collection the person can't change). */
export type Option = { value: string; label?: string; hint?: string | number; locked?: boolean };

/** The ✓ and × inside chips: a 20px target with a ring you can see from the keyboard. */
const chipButton = "grid size-5 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * Inside a property row (fields.tsx) a control reads as text until it is
 * hovered or focused; the ring still shows where the keyboard is.
 */
const ghost =
  "in-data-[slot=property]:border-transparent in-data-[slot=property]:bg-transparent in-data-[slot=property]:shadow-none in-data-[slot=property]:hover:bg-muted/60 in-data-[slot=property]:dark:bg-transparent";

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
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
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
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
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
            aria-describedby={describedBy}
            aria-invalid={ariaInvalid}
            className={cn("w-full justify-between px-3 font-normal", ghost)}
          >
            <span className={cn("truncate", !current && "text-muted-foreground")}>
              {current ? labelOf(options, current) : placeholder}
            </span>
            <IconSelector className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-48 p-0" align="start">
          <Command>
            {/* Always there: without it nothing in the popover takes focus, and the arrows go nowhere. */}
            <CommandInput placeholder="Search" className="text-base md:text-sm" />
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
 * search removes the last chip; a pasted list ("logo, dark; print") adds
 * every piece. `validate` normalizes what is typed ("de" to "DE"), or returns
 * null to refuse it with `invalid` as the hint. `onSearch` hears the search,
 * 150ms after typing stops, for options the list doesn't have yet.
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
  validate,
  invalid = "Not a valid value.",
  onSearch,
  readOnly,
  className,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
}: {
  id?: string;
  name?: string;
  options: Option[];
  value?: string[];
  defaultValue?: string[];
  onChange?: (value: string[]) => void;
  placeholder?: string;
  creatable?: boolean;
  validate?: (v: string) => string | null;
  invalid?: string;
  onSearch?: (q: string) => void;
  /** Chips only, with nothing to remove or add. */
  readOnly?: boolean;
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const [inner, setInner] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = value ?? inner;
  const locked = new Set(options.filter((o) => o.locked).map((o) => o.value));
  const set = (next: string[]) => {
    setInner(next);
    onChange?.(next);
  };
  const toggle = (v: string) => {
    if (locked.has(v)) return;
    set(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
    setSearch("");
  };
  const normal = (raw: string) => {
    const t = raw.trim();
    return t && validate ? validate(t) : t || null;
  };
  const q = search.trim();
  const made = q ? normal(q) : null;
  const refused = creatable && q !== "" && made === null;
  const canCreate =
    creatable &&
    made !== null &&
    !selected.includes(made) &&
    !options.some((o) => o.value.toLowerCase() === made.toLowerCase());
  const add = (pieces: string[]) => {
    const fresh = pieces.map(normal).filter((v): v is string => !!v && !selected.includes(v));
    if (fresh.length) set([...selected, ...new Set(fresh)]);
    setSearch("");
  };

  const hear = useRef(onSearch);
  useEffect(() => {
    hear.current = onSearch;
  });
  useEffect(() => {
    if (!q || !hear.current) return;
    const t = setTimeout(() => hear.current?.(q), 150);
    return () => clearTimeout(t);
  }, [q]);

  if (readOnly)
    return (
      <div className={cn("flex flex-wrap gap-1", className)}>
        {selected.map((v) => (
          <Badge key={v} variant="secondary">
            {labelOf(options, v)}
            {name && <input type="hidden" name={name} value={v} />}
          </Badge>
        ))}
      </div>
    );

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
            ghost,
            ariaInvalid && "border-destructive in-data-[slot=property]:border-destructive",
            "has-[button[aria-expanded=true]]:border-ring has-[button[aria-expanded=true]]:ring-ring/50 has-[button[aria-expanded=true]]:ring-[3px]",
            "has-[button:focus-visible]:border-ring has-[button:focus-visible]:ring-ring/50 has-[button:focus-visible]:ring-[3px]",
            className,
          )}
        >
          {selected.map((v) => (
            <Badge key={v} variant="secondary" className={cn("gap-0.5", !locked.has(v) && "pr-0.5")}>
              {labelOf(options, v)}
              {!locked.has(v) && (
                <button
                  type="button"
                  onClick={() => toggle(v)}
                  aria-label={`Remove ${labelOf(options, v)}`}
                  className={cn(chipButton, "hover:bg-muted-foreground/20")}
                >
                  <IconX className="size-3" />
                </button>
              )}
              {name && <input type="hidden" name={name} value={v} />}
            </Badge>
          ))}
          <PopoverTrigger asChild>
            <button
              id={id}
              type="button"
              aria-describedby={describedBy}
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
            className="text-base md:text-sm"
            onKeyDown={(e) => {
              const last = selected.at(-1);
              if (e.key === "Backspace" && !search && last !== undefined && !locked.has(last)) set(selected.slice(0, -1));
              // A comma finishes a tag, as in the old comma separated field.
              if (e.key === "," && canCreate) {
                e.preventDefault();
                toggle(made!);
              }
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (!creatable || !/[,;\n]/.test(text)) return;
              e.preventDefault();
              add(text.split(/[,;\n]+/));
            }}
          />
          <CommandList>
            {refused && <p className="text-muted-foreground px-3 py-2 text-xs">{invalid}</p>}
            {!canCreate && !refused && <CommandEmpty>{creatable ? "Type to add one." : "No match."}</CommandEmpty>}
            <CommandGroup>
              {options.filter((o) => !o.locked).map((o) => (
                <CommandItem key={o.value} value={o.value} keywords={[o.label ?? ""]} onSelect={() => toggle(o.value)}>
                  <IconCheck className={cn(selected.includes(o.value) ? "opacity-100" : "opacity-0")} />
                  {o.label ?? o.value}
                  {o.hint !== undefined && <span className="text-muted-foreground ml-auto text-xs">{o.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
            {canCreate && (
              <CommandGroup>
                <CommandItem value={`__create ${made}`} onSelect={() => toggle(made!)}>
                  <IconPlus /> Add &ldquo;{made}&rdquo;
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
