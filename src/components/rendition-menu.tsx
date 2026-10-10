"use client";

import { useId, useState } from "react";
import { IconCheck } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { parseTransform, PRESETS, serializeTransform } from "@/lib/transform";
import { cn } from "@/lib/utils";

// Moved to lib/transform.ts; still here for the imports that name it from this file.
export { renditionLabel } from "@/lib/transform";

/**
 * Which rendition of an asset a rule means: the original, one of the library's
 * standard sizes, or any spec /a/{id}/{spec} accepts. A command list, so the
 * arrows and typing pick one; the search box gives focus somewhere to land.
 */
export function RenditionMenu({ value, onChange }: { value: string | null; onChange: (spec: string | null) => void }) {
  const known = value === null || PRESETS.some((p) => p.spec === value);
  const [custom, setCustom] = useState(known ? "" : value);
  const [bad, setBad] = useState(false);
  const errorId = useId();
  const options: { name: string; spec: string | null; hint: string }[] = [
    { name: "Original", spec: null, hint: "as uploaded" },
    ...PRESETS.map((p) => ({ name: p.name, spec: p.spec, hint: p.spec })),
  ];

  return (
    <div>
      <Command>
        <CommandInput placeholder="Rendition" className="text-base md:text-sm" />
        <CommandList>
          <CommandEmpty>No match.</CommandEmpty>
          <CommandGroup>
            {options.map((o) => (
              <CommandItem key={o.name} value={o.name} keywords={[o.hint]} onSelect={() => onChange(o.spec)}>
                <IconCheck className={cn("size-4 shrink-0", value === o.spec ? "opacity-100" : "opacity-0")} />
                <span className="shrink-0 whitespace-nowrap">{o.name}</span>
                <span className="text-muted-foreground ms-auto min-w-0 truncate font-mono text-2xs" title={o.hint}>
                  {o.hint}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
      <form
        className="grid gap-1 px-3 pt-2 pb-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          const t = parseTransform(custom.trim());
          const spec = t && serializeTransform(t);
          setBad(!spec);
          if (!spec) return;
          setCustom(spec);
          onChange(spec);
        }}
      >
        <div className="flex items-center gap-2">
          <Input
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              setBad(false);
            }}
            placeholder="Custom, e.g. w_512,h_512,f_png"
            aria-label="Custom size"
            aria-invalid={bad || undefined}
            aria-describedby={bad ? errorId : undefined}
            className={cn("h-8 font-mono text-xs", !known && "ring-primary/40 ring-2")}
          />
          <Button type="submit" size="sm" variant="secondary">
            Use
          </Button>
        </div>
        {bad && (
          <p id={errorId} role="alert" className="text-destructive animate-in fade-in-0 text-xs">
            Not a size. Try w_512,f_png
          </p>
        )}
      </form>
    </div>
  );
}
