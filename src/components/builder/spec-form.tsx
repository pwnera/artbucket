"use client";

import { useId, useState } from "react";
import { IconPlus, IconX } from "@/components/icons";
import { z } from "zod";
import { IconButton } from "@/components/icon-button";
import { InfoTip } from "@/components/info-tip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RULE_SPEC, ruleKey, ruleLabel, ruleName, specKeys, type RuleSpec, type RuleType } from "@/lib/rules";
import type { ViewRule } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * A rule's spec as a form (build spec 3.5.4, W6.4), its fields generated
 * from RULE_SPEC[type]: enums become selects, numbers inputs, keys
 * comboboxes over the brand's rules. The rule card and the rules sheet
 * (W6.6) both use it. A type with no spec (text, list) draws nothing.
 *
 * A field commits on Enter or on leaving it. The form keeps a draft and
 * hands the spec on only when the whole of it parses, so a gradient can be
 * filled stop by stop; until then each field says what it lacks.
 *
 * Props:
 * - type: the rule's type, which picks the schema.
 * - spec: as it stands; null for none.
 * - rules: the brand's rules, for the fields that name another rule (a
 *   color's pair, a gradient's stops).
 * - onChange: the whole spec after a field changed; null when none is left.
 */
export type SpecFormProps = {
  type: RuleType;
  spec: RuleSpec | null;
  rules: ViewRule[];
  onChange(spec: RuleSpec | null): void;
};

type Path = (string | number)[];
type Obj = Record<string, unknown>;
type Form = { set(path: Path, v: unknown): void; errors: Record<string, string>; keys: string };

/** Past optional and nullable: what the field holds. */
const bare = (s: z.ZodType): z.ZodType => (s instanceof z.ZodOptional || s instanceof z.ZodNullable ? bare(s.unwrap() as z.ZodType) : s);

/** It names a rule by key: a pair, or a gradient stop (a key or a hex). */
const namesRule = (s: z.ZodType) => s === ruleKey || (s instanceof z.ZodUnion && (s.options as readonly z.ZodType[]).includes(ruleKey));

const WORDS: Record<string, string> = { cmyk: "CMYK", rgb: "RGB", ral: "RAL", url: "URL" };
const words = (name: string) => WORDS[name] ?? ruleLabel(name);

/** A value as typed: a list's items after commas, a pair's parts after spaces (tracking by size: "12 0.02, 48 -0.01"). */
const encode = (v: unknown, depth = 0): string =>
  Array.isArray(v) ? v.map((x) => encode(x, depth + 1)).join(depth ? " " : ", ") : v === undefined || v === null ? "" : String(v);

/** Typed text as the schema reads it. What doesn't fit stays text, so the schema says why. */
function decode(text: string, s: z.ZodType, depth = 0): unknown {
  const t = text.trim();
  if (s instanceof z.ZodNumber) return t !== "" && Number.isFinite(Number(t)) ? Number(t) : t;
  if (s instanceof z.ZodArray || s instanceof z.ZodTuple) {
    const items = s instanceof z.ZodTuple ? (s.def.items as z.ZodType[]) : [];
    const parts = t.split(depth ? /\s+/ : /\s*,\s*/).filter(Boolean);
    return parts.map((p, i) => decode(p, bare(s instanceof z.ZodArray ? (s.element as z.ZodType) : (items[i] ?? items[0])), depth + 1));
  }
  if (s instanceof z.ZodUnion) {
    const options = s.options as readonly z.ZodType[];
    const tries = options.map((o) => decode(t, bare(o), depth));
    return tries.find((v, i) => options[i].safeParse(v).success) ?? t;
  }
  return t;
}

/** `o` with `v` at `path`; undefined leaves the field out. */
function setIn(o: unknown, [head, ...rest]: Path, v: unknown): unknown {
  const at = rest.length ? setIn((o as Obj | undefined)?.[head], rest, v) : v;
  if (typeof head === "number") {
    const list = [...((o as unknown[] | undefined) ?? [])];
    list[head] = at;
    return list;
  }
  const next: Obj = { ...(o as Obj | undefined) };
  if (at === undefined) delete next[head];
  else next[head] = at;
  return next;
}

const getIn = (o: unknown, path: PropertyKey[]): unknown => path.reduce<unknown>((x, k) => (x as Obj | undefined)?.[k as string], o);

export function SpecForm({ type, spec, rules, onChange }: SpecFormProps) {
  const schema = (RULE_SPEC as Partial<Record<RuleType, z.ZodObject>>)[type];
  const [draft, setDraft] = useState<Obj>(spec ?? {});
  const [seen, setSeen] = useState(spec);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<string[]>([]);
  // A new spec from outside (an undo, another version) replaces the draft.
  if (spec !== seen) {
    setSeen(spec);
    setDraft(spec ?? {});
    setErrors({});
    setMissing([]);
  }
  const keys = useId();
  if (!schema) return null;

  // Key fields name rules of the spec's own type: a color's pair and stops are colors.
  const named = new Map(rules.filter((r) => r.type === type).map((r) => [r.key, ruleName(r)]));

  const form: Form = {
    keys,
    errors,
    set(path, v) {
      const next = setIn(draft, path, v) as Obj;
      setDraft(next);
      const got = schema.safeParse(next);
      if (!got.success) {
        setErrors(Object.fromEntries(got.error.issues.map((i) => [i.path.join("."), getIn(next, i.path) === undefined ? "Needed" : i.message])));
        return;
      }
      setErrors({});
      // The server refuses a key no rule has; say so here instead.
      const unknown = specKeys(got.data as RuleSpec).filter((k) => !named.has(k));
      setMissing(unknown);
      if (unknown.length) return;
      onChange(Object.keys(got.data).length ? (got.data as RuleSpec) : null);
    },
  };

  return (
    <div className="grid gap-2">
      <Fields schema={schema} value={draft} path={[]} form={form} />
      {missing.length > 0 && (
        <p role="alert" className="text-destructive text-xs">
          No {type} rule {missing.join(", ")}: pick one of the list.
        </p>
      )}
      <datalist id={keys}>
        {[...named].map(([key, name]) => (
          <option key={key} value={key}>
            {name}
          </option>
        ))}
      </datalist>
    </div>
  );
}

function Fields({ schema, value, path, form, className }: { schema: z.ZodObject; value: Obj | undefined; path: Path; form: Form; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-x-3 gap-y-2", className)}>
      {Object.entries(schema.shape).map(([name, raw]) => (
        <Field key={name} name={name} raw={raw as z.ZodType} value={value?.[name]} path={[...path, name]} form={form} />
      ))}
    </div>
  );
}

const UNSET = "\u0000unset";

function Field({ name, raw, value, path, form }: { name: string; raw: z.ZodType; value: unknown; path: Path; form: Form }) {
  const id = useId();
  const s = bare(raw);
  const label = words(name);
  const about = raw.description ?? s.description;
  const error = form.errors[path.join(".")];
  const set = (v: unknown) => form.set(path, v);
  const described = error || about ? `${id}-note` : undefined;
  // quiet: the help is behind the label's (i), kept here for screen readers; an error always shows.
  const note = (quiet = false) =>
    described && (
      <p id={described} className={cn("text-2xs", error ? "text-destructive" : quiet ? "sr-only" : "text-muted-foreground")}>
        {error ?? about}
      </p>
    );

  // A group of fields of its own (a gradient): added, filled, removed whole.
  if (s instanceof z.ZodObject) {
    if (value === undefined)
      return (
        <div className="col-span-full">
          <Button variant="outline" size="xs" onClick={() => set({})}>
            <IconPlus /> Add {label.toLowerCase()}
          </Button>
          {note()}
        </div>
      );
    return (
      <fieldset className="col-span-full grid gap-2 rounded-md border p-2">
        <legend className="px-1 text-xs font-medium">{label}</legend>
        <Fields schema={s} value={value as Obj} path={path} form={form} />
        <Button variant="ghost" size="xs" className="justify-self-start" onClick={() => set(undefined)}>
          <IconX /> Remove {label.toLowerCase()}
        </Button>
      </fieldset>
    );
  }

  // Rows of fields (a gradient's stops).
  const element = s instanceof z.ZodArray ? bare(s.element as z.ZodType) : null;
  if (element instanceof z.ZodObject) {
    const rows = (value as Obj[] | undefined) ?? [];
    const one = label.toLowerCase().replace(/s$/, "");
    return (
      <fieldset className="col-span-full grid gap-2">
        <legend className="mb-1 text-xs font-medium">{label}</legend>
        {rows.map((row, i) => (
          <div key={i} className="flex items-start gap-1">
            <Fields schema={element} value={row} path={[...path, i]} form={form} className="flex-1 grid-cols-3" />
            <IconButton variant="ghost" size="icon-xs" label={`Remove ${one} ${i + 1}`} className="mt-5" onClick={() => set(rows.filter((_, j) => j !== i))}>
              <IconX />
            </IconButton>
          </div>
        ))}
        <Button variant="outline" size="xs" className="justify-self-start" onClick={() => set([...rows, {}])}>
          <IconPlus /> Add {one}
        </Button>
        {note()}
      </fieldset>
    );
  }

  let input: React.ReactNode;
  if (s instanceof z.ZodEnum || s instanceof z.ZodBoolean) {
    const options = s instanceof z.ZodEnum ? (s.options as string[]).map((o) => [o, o]) : [["true", "Yes"], ["false", "No"]];
    input = (
      <Select
        value={value === undefined ? UNSET : String(value)}
        onValueChange={(v) => set(v === UNSET ? undefined : s instanceof z.ZodBoolean ? v === "true" : v)}
      >
        <SelectTrigger id={id} size="sm" className="h-8 w-full text-xs" aria-describedby={described}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNSET} className="text-muted-foreground">
            Not set
          </SelectItem>
          {options.map(([v, text]) => (
            <SelectItem key={v} value={v}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  } else {
    // ponytail: an asset id (a color's texture) is typed as text; give it the asset picker when textures get used.
    input = (
      <TextInput
        id={id}
        value={encode(value)}
        onCommit={(text) => set(text.trim() === "" ? undefined : decode(text, s))}
        list={namesRule(s) ? form.keys : undefined}
        inputMode={s instanceof z.ZodNumber ? "decimal" : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
        className={cn("h-8 text-xs", namesRule(s) && "font-mono")}
      />
    );
  }
  return (
    <div className="grid content-start gap-1">
      <div className="flex items-center gap-1">
        <label htmlFor={id} className="text-xs font-medium">
          {label}
        </label>
        {about && <InfoTip>{about}</InfoTip>}
      </div>
      {input}
      {note(true)}
    </div>
  );
}

/** An input that commits on Enter or on leaving it; Esc puts back what is saved. */
function TextInput({ value, onCommit, ...props }: Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> & { value: string; onCommit(text: string): void }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  return (
    <Input
      {...props}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onCommit(text)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setText(value);
          // After the reset lands, so leaving doesn't commit the old text.
          const el = e.currentTarget;
          setTimeout(() => el.blur());
        }
      }}
    />
  );
}
