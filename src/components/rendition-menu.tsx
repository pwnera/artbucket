"use client";

import { useState } from "react";
import { IconCheck } from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseTransform, PRESETS, serializeTransform } from "@/lib/transform";
import { cn } from "@/lib/utils";

/** "Web" for a preset's spec, the spec itself otherwise, "Original" for none. */
export const renditionLabel = (spec: string | null) =>
  spec === null ? "Original" : (PRESETS.find((p) => p.spec === spec)?.name ?? spec);

/**
 * Which rendition of an asset a rule means: the original, one of the library's
 * standard sizes, or any spec /a/{id}/{spec} accepts.
 */
export function RenditionMenu({ value, onChange }: { value: string | null; onChange: (spec: string | null) => void }) {
  const known = value === null || PRESETS.some((p) => p.spec === value);
  const [custom, setCustom] = useState(known ? "" : value);
  const options: { name: string; spec: string | null; hint: string }[] = [
    { name: "Original", spec: null, hint: "as uploaded" },
    ...PRESETS.map((p) => ({ name: p.name, spec: p.spec, hint: p.spec })),
  ];

  return (
    <div className="p-1">
      <p className="text-muted-foreground px-2 pt-1.5 pb-1 text-xs font-medium">Rendition</p>
      {options.map((o) => (
        <button
          key={o.name}
          type="button"
          onClick={() => onChange(o.spec)}
          aria-pressed={value === o.spec}
          className="hover:bg-muted focus-visible:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none"
        >
          <IconCheck className={cn("size-4 shrink-0", value === o.spec ? "opacity-100" : "opacity-0")} />
          <span className="shrink-0 whitespace-nowrap">{o.name}</span>
          <span className="text-muted-foreground ml-auto min-w-0 truncate font-mono text-[11px]" title={o.hint}>
            {o.hint}
          </span>
        </button>
      ))}
      <form
        className="flex items-center gap-2 px-2 pt-2 pb-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const t = parseTransform(custom.trim());
          const spec = t && serializeTransform(t);
          if (!spec) return void toast.error("Not a rendition. Try w_512,f_png");
          setCustom(spec);
          onChange(spec);
        }}
      >
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Custom, e.g. w_512,h_512,f_png"
          aria-label="Custom rendition"
          className={cn("h-8 font-mono text-xs", !known && "ring-primary/40 ring-2")}
        />
        <Button type="submit" size="sm" variant="secondary">
          Use
        </Button>
      </form>
    </div>
  );
}
