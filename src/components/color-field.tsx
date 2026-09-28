"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * A color as the picker and as its hex, both editable: brand people have
 * #6D4AFF in hand, and pasting into a native picker is awkward or impossible.
 * The hex applies once it is a whole color and goes back to the value if left
 * half typed. `name` goes on the picker, for forms.
 */
export function ColorField({
  value,
  onChange,
  name,
  id,
  label = "Color",
}: {
  value: string;
  onChange: (hex: string) => void;
  name?: string;
  id?: string;
  label?: string;
}) {
  const [text, setText] = useState(value);
  // Follow the value when it changes elsewhere (the picker, a reset).
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  return (
    <div className="flex items-center gap-2">
      {/* Named by an outside <Label> when given an id; by `label` otherwise, not just "color well". */}
      <Input id={id} name={name} type="color" aria-label={id ? undefined : label} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-14 p-1" />
      <Input
        aria-label={`${label}, hex`}
        value={text}
        pattern="#[0-9a-fA-F]{6}"
        maxLength={7}
        spellCheck={false}
        autoComplete="off"
        className="w-24 font-mono"
        onChange={(e) => {
          const raw = e.target.value.trim();
          // Pasted without its #, as design tools copy it.
          const v = raw && !raw.startsWith("#") ? `#${raw}` : raw;
          setText(v);
          if (HEX.test(v)) onChange(v.toLowerCase());
        }}
        onBlur={() => !HEX.test(text) && setText(value)}
      />
    </div>
  );
}
