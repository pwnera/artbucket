"use client";

import { useId, useRef, useState } from "react";
import {
  IconArrowDown,
  IconArrowUp,
  IconCalendarEvent,
  IconForms,
  IconHash,
  IconList,
  IconToggleLeft,
  IconTrash,
  IconTypography,
  type Icon,
} from "@/components/icons";
import { toast } from "sonner";
import { MultiCombobox } from "@/components/combobox";
import { Confirm } from "@/components/confirm";
import { Field } from "@/components/fields";
import { IconButton } from "@/components/icon-button";
import { SavedMark } from "@/components/settings/panels";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FIELD_TYPES, type FieldDef, type FieldType } from "@/lib/fields";
import { send } from "@/lib/send";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/info-tip";
import { transition } from "@/lib/motion";

export const TYPES: Record<FieldType, { label: string; icon: Icon }> = {
  text: { label: "Text", icon: IconTypography },
  number: { label: "Number", icon: IconHash },
  date: { label: "Date", icon: IconCalendarEvent },
  boolean: { label: "Yes / no", icon: IconToggleLeft },
  select: { label: "Pick list", icon: IconList },
};

/** "Usage rights" -> "usage_rights": the key values are stored under. */
export const keyFor = (label: string) =>
  label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+|_+$/g, "")
    .slice(0, 40);

type Call = (method: string, url: string, payload?: unknown) => Promise<boolean>;

/**
 * The project's custom field schema, in Settings: add, adjust, reorder,
 * remove. Everything goes through /api/v1/fields and saves as it changes.
 * A field's type can't change once made; make a new field instead. The order
 * here is the order every asset's panel and the upload form show.
 */
export function FieldsEditor({ fields, onChanged }: { fields: FieldDef[]; onChanged: () => void }) {
  const id = useId();
  const [type, setType] = useState<FieldType>("text");
  const [label, setLabel] = useState("");
  // Remounts the add form's uncontrolled bits (options, required) after a save.
  const [round, setRound] = useState(0);
  const [adding, setAdding] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  // The order shown: moved at once, then saved; the server's order again when it answers.
  const [order, setOrder] = useState(fields);
  const [seen, setSeen] = useState(fields);
  if (fields !== seen) {
    setSeen(fields);
    setOrder(fields);
  }

  const call: Call = async (method, url, payload) => {
    const ok = (await send(method, url, payload)) !== null;
    if (ok) onChanged();
    return ok;
  };

  async function add(form: FormData) {
    const key = keyFor(label);
    // The API refuses a pick list with nothing to pick, in its own words; say it in ours, before asking.
    if (type === "select" && !form.getAll("options").some((o) => String(o).trim())) {
      toast.error("Add at least one option", { description: "A pick list offers its options: type one, then Enter." });
      return;
    }
    setAdding(true);
    const ok = await call("POST", "/api/v1/fields", {
      key,
      label: label.trim(),
      type,
      options: type === "select" ? form.getAll("options").map(String) : [],
      required: form.get("required") === "on",
      position: order.length,
    });
    setAdding(false);
    if (!ok) return;
    toast.success(`Added ${label.trim()}`);
    setFresh(key);
    setLabel("");
    setType("text");
    setRound((r) => r + 1);
  }

  // Quick moves save one batch after another, so two batches' requests can't interleave into ties,
  // and the list refreshes once the last lands instead of jumping back to a half-saved order.
  const moves = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);

  // Every field renumbered from 0: the API doesn't say positions, and deletes leave gaps and adds ties,
  // so saving only the two that swapped could leave them out of order.
  function move(from: number, to: number) {
    const next = [...order];
    next.splice(to, 0, ...next.splice(from, 1));
    // The two rows swap places as a glide, not a jump.
    transition(() => setOrder(next));
    pending.current++;
    moves.current = moves.current.then(async () => {
      await Promise.all(next.map((f, i) => send("PATCH", `/api/v1/fields/${f.key}`, { position: i })));
      // A refusal toasted already; the refresh brings back whatever order the server has.
      if (--pending.current === 0) onChanged();
    });
  }

  return (
    <div className="grid gap-4">
      {order.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {order.map((f, i) => (
            <FieldRow
              key={f.key}
              field={f}
              call={call}
              fresh={f.key === fresh}
              onUp={i > 0 ? () => move(i, i - 1) : undefined}
              onDown={i < order.length - 1 ? () => move(i, i + 1) : undefined}
            />
          ))}
        </ul>
      ) : (
        <Empty className="border p-6 md:p-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconForms />
            </EmptyMedia>
            <EmptyTitle>No custom fields yet</EmptyTitle>
            <EmptyDescription>Like Campaign, Usage rights or Approved.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <form
        key={round}
        onSubmit={(e) => {
          e.preventDefault();
          void add(new FormData(e.currentTarget));
        }}
        className="bg-muted/40 grid gap-4 rounded-lg border p-4"
      >
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          Add a field
          <InfoTip>Pick lists and yes/no fields become filters.</InfoTip>
        </h3>
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <Field label="Name" htmlFor={`${id}-name`} hint={label && (keyFor(label) ? `Stored as ${keyFor(label)}` : "Start the name with a letter")}>
            <Input id={`${id}-name`} value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={80} placeholder="Campaign" />
          </Field>
          <Field label="Type" htmlFor={`${id}-type`}>
            <Select value={type} onValueChange={(v) => setType(v as FieldType)}>
              <SelectTrigger id={`${id}-type`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => {
                  const { label, icon: Icon } = TYPES[t];
                  return (
                    <SelectItem key={t} value={t}>
                      <Icon /> {label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </Field>
        </div>
        {type === "select" && (
          <Field label="Options" htmlFor={`${id}-options`}>
            <MultiCombobox id={`${id}-options`} name="options" options={[]} placeholder="web, print, social" creatable />
          </Field>
        )}
        <div className="flex items-center gap-2">
          <Switch id={`${id}-required`} name="required" />
          <Label htmlFor={`${id}-required`} className="font-normal">
            Required at upload
          </Label>
          <Button type="submit" className="ml-auto" pending={adding} disabled={!keyFor(label)}>
            Add field
          </Button>
        </div>
      </form>
    </div>
  );
}

/**
 * One field: label, required and options save as they change, each with a
 * check; key and type are fixed. Up and down set the order.
 */
function FieldRow({
  field: f,
  call,
  fresh,
  onUp,
  onDown,
}: {
  field: FieldDef;
  call: Call;
  /** Just added: it slides in, so the eye finds it. */
  fresh: boolean;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const url = `/api/v1/fields/${f.key}`;
  const { label, icon: Icon } = TYPES[f.type];
  const [savedAt, setSavedAt] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [required, setRequired] = useState(f.required);
  const [options, setOptions] = useState(f.options);
  // The label last sent: Enter submits, and the blur after it shouldn't send it again.
  const sent = useRef(f.label);
  const save = async (patch: Record<string, unknown>) => {
    const ok = await call("PATCH", url, patch);
    if (ok) setSavedAt(Date.now());
    return ok;
  };
  return (
    <li
      data-vt={`field-${f.key}`}
      aria-busy={deleting || undefined}
      className={cn(
        "transition-opacity",
        fresh && "animate-in fade-in-0 slide-in-from-top-1 duration-200",
        deleting && "pointer-events-none opacity-50",
      )}
    >
      {/* onSubmit, not action: React resets a form after an action, which would flash the old label until the refresh lands. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const next = String(new FormData(e.currentTarget).get("label") ?? "").trim();
          if (!next || next === sent.current) return;
          sent.current = next;
          void save({ label: next }).then((ok) => ok || (sent.current = f.label));
        }}
        className="grid gap-3 p-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md">
                <Icon className="size-4" />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {label} · stored as {f.key}
            </TooltipContent>
          </Tooltip>
          <Input
            name="label"
            defaultValue={f.label}
            required
            maxLength={80}
            aria-label={`Name of ${f.key}`}
            className="h-8 min-w-40 flex-1"
            // Enter submits the form; leaving the field does too. Left empty, it goes back to the name it had:
            // submitting would run the browser's validation, which pulls focus straight back into the field.
            onBlur={(e) => {
              const el = e.currentTarget;
              if (!el.value.trim()) el.value = sent.current;
              else el.form?.requestSubmit();
            }}
          />
          <div className="ml-auto flex items-center gap-2">
            <SavedMark at={savedAt} />
            <Label className="text-muted-foreground shrink-0 font-normal">
              <Switch
                checked={required}
                onCheckedChange={async (on) => {
                  setRequired(on);
                  // Refused, it goes back to what the server has.
                  if (!(await save({ required: on }))) setRequired(!on);
                }}
              />
              Required
            </Label>
            <IconButton type="button" variant="ghost" size="icon-xs" label={`Move ${f.label} up`} disabled={!onUp} onClick={onUp}>
              <IconArrowUp />
            </IconButton>
            <IconButton type="button" variant="ghost" size="icon-xs" label={`Move ${f.label} down`} disabled={!onDown} onClick={onDown}>
              <IconArrowDown />
            </IconButton>
            <Confirm
              title={`Delete ${f.label}?`}
              says="Its value is removed from every asset and collection."
              action="Delete"
              run={async () => {
                setDeleting(true);
                const ok = await call("DELETE", url);
                if (!ok) {
                  setDeleting(false);
                  return null;
                }
                toast.success(`Deleted ${f.label}`);
                return ok;
              }}
            >
              <IconButton type="button" variant="ghost" label={`Delete ${f.label}`} className="text-muted-foreground hover:text-destructive">
                <IconTrash />
              </IconButton>
            </Confirm>
          </div>
        </div>
        {f.type === "select" && (
          <MultiCombobox
            options={[]}
            value={options}
            onChange={async (next) => {
              // The API wants at least one; the last chip stays rather than vanish unsaved.
              if (!next.length) return void toast.error("A pick list needs at least one option");
              const was = options;
              setOptions(next);
              if (!(await save({ options: next }))) setOptions(was);
            }}
            placeholder="Add options"
            creatable
            className="w-auto sm:ml-10"
          />
        )}
      </form>
    </li>
  );
}
