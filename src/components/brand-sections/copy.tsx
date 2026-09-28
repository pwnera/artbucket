"use client";

import { useId, useState } from "react";
import type { z } from "zod";
import { Body, RuleSlot } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { CopyButton } from "@/components/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { plainText } from "@/lib/markdown";
import { fillSlots, type TEMPLATE_PROPS } from "@/lib/pages";
import { ruleName, type TEXT_SPEC } from "@/lib/rules";
import type { ViewRule } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * Words to paste: each text rule it binds as its block, with a copy button
 * when its spec says `copy` and its length against `max`. Then, with
 * props.form and props.template, a generator: the reader fills the fields
 * and the template shows filled, to copy. Client only: what they type never
 * leaves the page.
 */

type Props = z.output<typeof TEMPLATE_PROPS.copy>;

export function CopySection({ section: s, rules }: SectionProps) {
  const p = s.props as Props;
  // Only its keys: `rules` also carries a background color and items' keys.
  const shown = rules.filter((r) => s.keys.includes(r.key));
  return (
    <div className="space-y-8">
      <Body />
      {shown.map((r) => (
        <Words key={r.key} rule={r} />
      ))}
      {p.form?.length && p.template ? <Generator form={p.form} template={p.template} /> : null}
    </div>
  );
}

/** A rule's block, and under it what its spec asks for: its length against the most it may take, and a copy button. */
function Words({ rule: r }: { rule: ViewRule }) {
  const spec = (r.spec ?? {}) as z.output<typeof TEXT_SPEC>;
  if (!spec.copy && spec.max === undefined) return <RuleSlot rule={r} />;
  // As read: Markdown's marks are neither pasted nor counted, and an emoji counts once.
  const text = plainText(String(r.value));
  const n = [...text].length;
  const over = spec.max !== undefined && n > spec.max;
  return (
    <div className="bg-card text-card-foreground rounded-xl border px-5 pt-2 pb-4">
      <RuleSlot rule={r} />
      <div className="flex items-center justify-end gap-3 text-sm">
        {spec.max !== undefined && (
          <p className={cn("tabular-nums", over ? "text-destructive font-medium" : "text-muted-foreground")}>
            {n} of {spec.max} characters{over && `, ${n - spec.max} over`}
          </p>
        )}
        {spec.copy && <CopyButton text={text} label={`Copy ${ruleName(r)}`} what={ruleName(r)} variant="outline" size="icon-sm" />}
      </div>
    </div>
  );
}

/** The form, and the template filled as the reader types; a field left blank keeps its {slot}, so the gap shows. */
function Generator({ form, template }: { form: NonNullable<Props["form"]>; template: string }) {
  const id = useId();
  const [values, setValues] = useState<Record<string, string>>({});
  const filled = fillSlots(template, values);
  return (
    <div className="bg-card text-card-foreground space-y-4 rounded-xl border p-5">
      {/* Paper gets the template with its slots, not empty fields. */}
      <div className="grid gap-4 @xl:grid-cols-2 print:hidden">
        {form.map((f) => (
          <div key={f.name} className="grid gap-2">
            <Label htmlFor={`${id}-${f.name}`}>{f.label}</Label>
            <Input id={`${id}-${f.name}`} value={values[f.name] ?? ""} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
          </div>
        ))}
      </div>
      <div className="bg-muted flex items-start gap-3 rounded-lg p-4">
        {/* Not read out on every key: the fields say what was typed. */}
        <output htmlFor={form.map((f) => `${id}-${f.name}`).join(" ")} aria-live="off" className="min-w-0 flex-1 break-words whitespace-pre-wrap">
          {filled}
        </output>
        <CopyButton text={filled} label="Copy it" what="the line" variant="outline" size="icon-sm" />
      </div>
    </div>
  );
}
