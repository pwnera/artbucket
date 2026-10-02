"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconArchive,
  IconBookmark,
  IconBriefcase,
  IconBrush,
  IconBuildingStore,
  IconCamera,
  IconFlag,
  IconFolder,
  IconHeart,
  IconLock,
  IconLeaf,
  IconMovie,
  IconMusic,
  IconPalette,
  IconPhoto,
  IconRocket,
  IconSparkles,
  IconSpeakerphone,
  IconStar,
  IconUsers,
  IconWorld,
  type Icon,
} from "@tabler/icons-react";
import { useCan } from "@/components/can";
import { toast } from "sonner";
import { send } from "@/lib/send";
import { Confirm } from "@/components/confirm";
import { Field, FieldInputs, readFieldValues } from "@/components/fields";
import { SubmitButton } from "@/components/submit-button";
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
import { InfoTip } from "@/components/info-tip";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { COLLECTION_ICONS, type CollectionIcon as IconName } from "@/lib/collection-icons";
import type { FieldDef, FieldValue } from "@/lib/fields";

export type Collection = {
  id: string;
  name: string;
  icon: IconName | null;
  fields: Record<string, FieldValue>;
  /** Only people with a grant on it, and admins, see it. */
  private?: boolean;
  count: number;
  createdAt?: string;
};

const ICONS: Record<IconName, Icon> = {
  folder: IconFolder,
  photo: IconPhoto,
  palette: IconPalette,
  brush: IconBrush,
  camera: IconCamera,
  movie: IconMovie,
  music: IconMusic,
  star: IconStar,
  heart: IconHeart,
  flag: IconFlag,
  bookmark: IconBookmark,
  briefcase: IconBriefcase,
  "building-store": IconBuildingStore,
  speakerphone: IconSpeakerphone,
  rocket: IconRocket,
  sparkles: IconSparkles,
  leaf: IconLeaf,
  world: IconWorld,
  users: IconUsers,
  archive: IconArchive,
};

/** A collection's icon; a folder when it has none. */
export function CollectionIcon({ icon, className }: { icon: IconName | null; className?: string }) {
  const I = (icon && ICONS[icon]) || IconFolder;
  return <I className={className} />;
}

/** Moved to lib/send; importers here keep working. */
export { send };

/**
 * Create or edit a collection: its name and the values its members inherit.
 * Nothing is required of a collection, so every field is optional here.
 * Pass `open` false to play the close animation while keeping it mounted;
 * typed edits ask before a stray Esc or click throws them away.
 */
export function CollectionDialog({
  collection,
  fields,
  open = true,
  onClose,
  onSaved,
}: {
  /** Absent to create one. */
  collection?: Collection;
  fields: FieldDef[];
  open?: boolean;
  onClose: () => void;
  onSaved: (c: Collection | null) => void;
}) {
  const id = useId();
  const [icon, setIcon] = useState<IconName>(collection?.icon ?? "folder");
  const [dirty, setDirty] = useState(false);
  // A dialog kept mounted starts clean each time it opens.
  const [seen, setSeen] = useState({ open, collection });
  if (seen.open !== open || seen.collection !== collection) {
    setSeen({ open, collection });
    if (open) {
      setDirty(false);
      setIcon(collection?.icon ?? "folder");
    }
  }
  const can = useCan();
  const router = useRouter();
  const optional = fields.map((d) => ({ ...d, required: false }));

  async function save(form: FormData) {
    const values = readFieldValues(form, optional);
    const name = String(form.get("name") ?? "");
    const hidden = form.get("private") === "on";
    const data = collection
      ? await send("PATCH", `/api/v1/collections/${collection.id}`, { name, icon, fields: values, private: hidden })
      : await send("POST", "/api/v1/collections", {
          name,
          icon,
          private: hidden,
          fields: Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null)),
        });
    if (data) {
      setDirty(false);
      onSaved(data);
      onClose();
      // What the person may do comes from the server, and private moves it.
      if (hidden !== !!collection?.private) router.refresh();
    }
  }

  async function remove() {
    if (!collection) return false;
    const ok = await send("DELETE", `/api/v1/collections/${collection.id}`);
    if (!ok) return false;
    toast.success(`Deleted ${collection.name}`);
    onSaved(null);
    onClose();
    return true;
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" guard={{ dirty, onDiscard: onClose }}>
        {/* Keyed, so a form reopened for another collection starts from its values. */}
        <form key={collection?.id ?? "new"} action={save} onInput={() => setDirty(true)} className="grid gap-6">
          <DialogHeader>
            <DialogTitle>{collection ? "Edit collection" : "New collection"}</DialogTitle>
            <DialogDescription>
              {fields.length
                ? "Assets inherit these values, unless they set their own."
                : "Group assets without moving them."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="Name" htmlFor={id}>
              <Input id={id} name="name" required maxLength={120} defaultValue={collection?.name} autoFocus />
            </Field>
            <div className="grid gap-2">
              <Label>Icon</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={1}
                value={icon}
                // Clicking the current icon would clear it; keep one picked.
                onValueChange={(v) => {
                  if (!v) return;
                  setIcon(v as IconName);
                  setDirty(true);
                }}
                className="grid w-full grid-cols-10"
              >
                {COLLECTION_ICONS.map((name) => (
                  <ToggleGroupItem
                    key={name}
                    value={name}
                    aria-label={name.replaceAll("-", " ")}
                    className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground aspect-square h-auto w-full px-0"
                  >
                    <CollectionIcon icon={name} className="size-4" />
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="flex items-start justify-between gap-4 rounded-md border px-3 py-2">
              <Label htmlFor={`${id}-private`} className="grid flex-1 gap-1 font-normal">
                <span className="flex items-center gap-1.5 font-medium">
                  <IconLock className="size-4" /> Private
                  <InfoTip label="More about private">
                    Only people you add, and admins, see it. Assets that are only in private collections are private too.
                  </InfoTip>
                </span>
              </Label>
              <Switch id={`${id}-private`} name="private" defaultChecked={!!collection?.private} onCheckedChange={() => setDirty(true)} />
            </div>
            {fields.length > 0 && (
              <>
                <Separator />
                <FieldInputs defs={optional} values={collection?.fields} />
              </>
            )}
          </div>
          <DialogFooter className="sm:justify-between">
            {collection && can("collection.delete") ? (
              <Confirm title={`Delete ${collection.name}?`} says="Its assets stay in the library." action="Delete" run={remove}>
                <Button variant="ghost" type="button" className="text-destructive">
                  Delete
                </Button>
              </Confirm>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" type="button" onClick={onClose}>
                Cancel
              </Button>
              <SubmitButton>{collection ? "Save" : "Create"}</SubmitButton>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
