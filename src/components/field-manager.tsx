"use client";

import { useId, useState } from "react";
import {
  IconCalendarEvent,
  IconHash,
  IconList,
  IconToggleLeft,
  IconTrash,
  IconTypography,
  type Icon,
} from "@tabler/icons-react";
import { send } from "@/components/collections";
import { MultiCombobox } from "@/components/combobox";
import { Field } from "@/components/fields";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FIELD_TYPES, type FieldDef, type FieldType } from "@/lib/fields";

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

/**
 * The library's custom field schema: add, adjust, remove. Everything goes
 * through /api/v1/fields. A field's type can't change once made; make a new
 * field instead.
 */
export function FieldManager({
  fields,
  onClose,
  onChanged,
}: {
  fields: FieldDef[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const id = useId();
  const [type, setType] = useState<FieldType>("text");
  const [label, setLabel] = useState("");
  // Remounts the add form's uncontrolled bits (options, required) after a save.
  const [round, setRound] = useState(0);

  const call = async (method: string, url: string, payload?: unknown) => {
    const ok = (await send(method, url, payload)) !== null;
    if (ok) onChanged();
    return ok;
  };

  async function add(form: FormData) {
    const ok = await call("POST", "/api/v1/fields", {
      key: keyFor(label),
      label: label.trim(),
      type,
      options: type === "select" ? form.getAll("options").map(String) : [],
      required: form.get("required") === "on",
      position: fields.length,
    });
    if (ok) {
      setLabel("");
      setType("text");
      setRound((r) => r + 1);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Custom fields</DialogTitle>
          <DialogDescription>
            Fields every asset in this library can carry. Required ones must be filled when files are uploaded, or
            come from a collection.
          </DialogDescription>
        </DialogHeader>

        {fields.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {fields.map((f) => (
              <FieldRow key={f.key} field={f} call={call} />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
            No custom fields yet.
          </p>
        )}

        <form key={round} action={add} className="bg-muted/40 grid gap-4 rounded-lg border p-4">
          <h3 className="text-sm font-medium">Add a field</h3>
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <Field
              label="Name"
              htmlFor={`${id}-name`}
              hint={label && (keyFor(label) ? `Stored as ${keyFor(label)}` : "Start the name with a letter")}
            >
              <Input
                id={`${id}-name`}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
                maxLength={80}
                placeholder="Campaign"
              />
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
            <Button type="submit" className="ml-auto" disabled={!keyFor(label)}>
              Add field
            </Button>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One field: label, required and options are editable; key and type are fixed. */
function FieldRow({
  field: f,
  call,
}: {
  field: FieldDef;
  call: (method: string, url: string, payload?: unknown) => Promise<boolean>;
}) {
  const url = `/api/v1/fields/${f.key}`;
  const { label, icon: Icon } = TYPES[f.type];
  return (
    <li>
      <form
        action={async (form) => {
          await call("PATCH", url, {
            label: String(form.get("label") ?? "").trim(),
            required: form.get("required") === "on",
            ...(f.type === "select" ? { options: form.getAll("options").map(String) } : {}),
          });
        }}
        className="grid gap-3 p-3"
      >
        <div className="flex items-center gap-2">
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
          <Input name="label" defaultValue={f.label} required maxLength={80} aria-label={`Name of ${f.key}`} className="h-8" />
          <Label className="text-muted-foreground shrink-0 font-normal">
            <Switch name="required" defaultChecked={f.required} />
            Required
          </Label>
          <Button type="submit" variant="outline" size="sm">
            Save
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${f.label}`}>
                <IconTrash />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {f.label}?</AlertDialogTitle>
                <AlertDialogDescription>Its value is removed from every asset and collection.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => void call("DELETE", url)}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        {f.type === "select" && (
          <MultiCombobox
            name="options"
            options={[]}
            defaultValue={f.options}
            placeholder="Add options"
            creatable
            className="ml-10 w-auto"
          />
        )}
      </form>
    </li>
  );
}
