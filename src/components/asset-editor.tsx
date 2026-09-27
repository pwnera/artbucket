"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { IconBook, IconCertificate, IconCheck, IconCopy, IconDownload, IconLock, IconPhoto, IconReplace, IconShare, IconSparkles, IconX } from "@tabler/icons-react";
import { toast } from "sonner";
import { send, type Collection } from "@/components/collections";
import { Combobox, MultiCombobox, type Option } from "@/components/combobox";
import { Field, FieldInputs, readFieldValues } from "@/components/fields";
import { call, curl, ForAgents } from "@/components/agent-access";
import { FontPlayground } from "@/components/font-preview";
import { ImagePicker } from "@/components/rich-text";
import { Renditions } from "@/components/renditions";
import { Thumb, type Asset } from "@/components/gallery";
import { Lottie } from "@/components/media";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Can, useCan, Writable } from "@/components/can";
import { IconButton } from "@/components/icon-button";
import { ShareDialog } from "@/components/share-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { FieldDef } from "@/lib/fields";
import { contextLabel, ruleLabel, type Rule } from "@/lib/rules";
import { fileTypeBadge, formatBytes } from "@/lib/filename";
import { isFont } from "@/lib/font";
import { embedUrl, hasPreview, isLottie } from "@/lib/preview";
import { CHANNELS } from "@/lib/rights";
import { ago } from "@/lib/time";

/** Every tag in the library, for autocomplete: an unfiltered search's facets. */
export function useLibraryTags() {
  const [tags, setTags] = useState<Option[]>([]);
  useEffect(() => {
    fetch("/api/v1/assets?limit=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b && setTags(b.facets.tags.map((t: { value: string; count: number }) => ({ value: t.value, hint: t.count }))));
  }, []);
  return tags;
}

const TEXT = [
  { key: "title", label: "Title" },
  { key: "creator", label: "Creator" },
  { key: "copyright", label: "Copyright" },
] as const;

/**
 * One asset, editable. Saves through the public PATCH, and Download returns
 * the file with these edits written into it.
 */
export function AssetEditor({
  asset,
  fields,
  collections,
  onClose,
  onSaved,
  onReviewed,
}: {
  asset: Asset;
  fields: FieldDef[];
  collections: Collection[];
  onClose: () => void;
  onSaved: () => void;
  /** A review action changed the asset. */
  onReviewed: (asset: Asset) => void;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const can = useCan();
  const editable = can("asset.edit", asset);
  const router = useRouter();
  const tags = useLibraryTags();
  const m = asset.metadata ?? {};

  async function save(form: FormData) {
    setBusy(true);
    const str = (k: string) => String(form.get(k) ?? "");
    const orNull = (k: string) => str(k).trim() || null;
    const res = await fetch(`/api/v1/assets/${asset.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: str("title"),
        description: str("description"),
        creator: str("creator"),
        copyright: str("copyright"),
        tags: form.getAll("tags").map(String),
        fields: readFieldValues(form, fields),
        // Replaced whole: empty everywhere is stored as no rights at all.
        rights: {
          license: orNull("license"),
          territories: form.getAll("territories").map(String),
          channels: form.getAll("channels").map(String),
          embargo: orNull("embargo"),
          expires: orNull("expires"),
          modelRelease: orNull("modelRelease"),
        },
        origin: orNull("origin"),
        generator: orNull("generator"),
        prompt: orNull("prompt"),
        parentAssetId: orNull("parentAssetId"),
        supersededBy: orNull("supersededBy"),
        private: form.get("private") === "on",
      }),
    });
    if (!res.ok) {
      setBusy(false);
      toast.error((await res.json()).error?.message ?? "Couldn't save");
      return;
    }
    // Membership goes through each collection's endpoint, only where it changed.
    const want = new Set(form.getAll("collection").map(String));
    const changes = collections.flatMap((c) => {
      const had = asset.collections.includes(c.id);
      if (had === want.has(c.id)) return [];
      const change = want.has(c.id) ? { add: [asset.id] } : { remove: [asset.id] };
      return [
        fetch(`/api/v1/collections/${c.id}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(change),
        }),
      ];
    });
    const failed = (await Promise.all(changes)).some((r) => !r.ok);
    setBusy(false);
    onSaved();
    // What the person may do comes from the server, and private moves it.
    if ((form.get("private") === "on") !== !!asset.private) router.refresh();
    if (failed) {
      toast.warning("Saved, but a collection change didn't go through");
      return;
    }
    toast.success("Saved");
    onClose();
  }

  // Where each inherited value comes from: the oldest collection that sets it wins.
  const sources: Record<string, string> = {};
  for (const c of collections
    .filter((c) => asset.collections.includes(c.id))
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))) {
    for (const k of Object.keys(c.fields)) sources[k] ??= c.name;
  }

  const copyLink = async () => {
    const href = new URL(`/?asset=${asset.id}`, location.origin).href;
    try {
      await navigator.clipboard.writeText(href);
      toast.success("Copied a link to this asset");
    } catch {
      toast.error("Couldn't copy the link", { description: href });
    }
  };

  const embed = embedUrl(asset);
  const facts = [
    asset.width && asset.height ? `${asset.width} × ${asset.height}` : null,
    formatBytes(asset.size),
    m.camera,
    m.capturedAt?.slice(0, 10),
  ].filter(Boolean);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="grid max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-5xl md:h-[min(760px,calc(100dvh-2rem))] md:grid-cols-[minmax(0,1fr)_380px] md:grid-rows-1 md:overflow-hidden">
        <div className="bg-muted/50 flex min-h-64 flex-col border-b md:min-h-0 md:border-r md:border-b-0">
          <div className="relative flex min-h-64 flex-1 items-center justify-center md:min-h-0">
            {embed ? (
              <iframe src={embed} title={m.title || asset.filename} allowFullScreen className="absolute inset-0 size-full" />
            ) : asset.mime.startsWith("video/") ? (
              // The original, streamed in ranges; the derived frame shows until it plays.
              <video
                src={`/a/${asset.id}`}
                poster={hasPreview(asset) ? `/a/${asset.id}/w_1280,f_webp` : undefined}
                controls
                playsInline
                preload="metadata"
                className="absolute inset-0 size-full object-contain p-6"
              />
            ) : asset.mime.startsWith("audio/") ? (
              <audio src={`/a/${asset.id}`} controls preload="metadata" className="w-full px-6" />
            ) : isLottie(asset) ? (
              <Lottie src={`/a/${asset.id}`} className="absolute inset-0 p-6" />
            ) : hasPreview(asset) ? (
              <Thumb src={`/a/${asset.id}/w_640,f_webp`} alt="" className="absolute inset-0 p-6" />
            ) : isFont(asset.mime, asset.filename) ? (
              <FontPlayground id={asset.id} />
            ) : (
              <Empty className="p-6">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconPhoto />
                  </EmptyMedia>
                  <EmptyTitle>No preview</EmptyTitle>
                  <EmptyDescription>
                    Nothing in this {fileTypeBadge(asset.filename, asset.mime, asset.probe)} file to show. Download keeps it as stored, with these
                    edits written in where the format allows.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
          <div className="flex items-center gap-2 border-t px-4 py-3">
            <Badge variant="outline">{fileTypeBadge(asset.filename, asset.mime, asset.probe)}</Badge>
            <span className="text-muted-foreground truncate text-xs tabular-nums">{facts.join(" · ")}</span>
            <span className="ml-auto" />
            {/* Copy: a link for people who have access. Share: a public link, for anyone. */}
            <IconButton label="Copy link, for people with access" type="button" onClick={copyLink}>
              <IconCopy />
            </IconButton>
            {asset.status === "active" && can("asset.share", asset) && (
              <IconButton label="Share: a public link, no account needed" type="button" onClick={() => setSharing(true)}>
                <IconShare />
              </IconButton>
            )}
            {sharing && <ShareDialog target={{ kind: "view", asset: { id: asset.id, name: m.title || asset.filename } }} onClose={() => setSharing(false)} />}
            {hasPreview(asset) && <Renditions asset={asset} />}
            <Button variant="outline" size="sm" asChild>
              {/* The file as stored, with these fields written into it. */}
              <a href={`/a/${asset.id}?download`} download>
                <IconDownload /> Download
              </a>
            </Button>
          </div>
        </div>

        {/* A review action returns the asset changed; remount the form so it shows that. */}
        <form key={asset.updatedAt} action={save} className="flex min-h-0 flex-col md:h-full">
          {/* The dialog's header, like every page's, ends with For agents. */}
          <div className="flex items-start gap-3 border-b px-6 pt-6 pb-4 pr-12">
            <div className="min-w-0 flex-1">
              <DialogTitle className={m.title ? "break-words" : "break-all"}>{m.title || asset.filename}</DialogTitle>
              <DialogDescription className="mt-1">
                {m.title && <span className="block break-all">{asset.filename}</span>}
                {editable ? "Edits are written into the file on download." : "You can look at this one, not change it."}
              </DialogDescription>
            </div>
            <ForAgents
              className="shrink-0"
              subject="This asset"
              about="What an agent reads before using this asset: its title, credit and fields, the brand rules that point at it, and ready-made sizes."
              reads={(origin) => [
                { label: "MCP tool", text: call("describe_asset", { id: asset.id }) },
                ...(hasPreview(asset)
                  ? [{ label: "A size to hand out", text: call("rendition_url", { id: asset.id, width: 1200, format: "webp" }) }]
                  : []),
                { label: "REST", text: curl(`${origin}/a/${asset.id}`, ["Accept: application/json"]) },
              ]}
            />
          </div>

          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 py-4">
            <Can do="asset.review" on={asset}>
              <Review asset={asset} onReviewed={onReviewed} />
            </Can>
            <Writable do="asset.edit" on={asset}>
            {asset.supersededBy && <Replaced by={asset.supersededBy} />}
            <BrandRules assetId={asset.id} />
            {TEXT.map(({ key, label }) => (
              <Field key={key} label={label} htmlFor={`${id}-${key}`}>
                <Input id={`${id}-${key}`} name={key} defaultValue={m[key] ?? ""} maxLength={2000} />
              </Field>
            ))}
            <Field label="Description" htmlFor={`${id}-description`}>
              <Textarea
                id={`${id}-description`}
                name="description"
                defaultValue={m.description ?? ""}
                maxLength={2000}
                rows={3}
              />
            </Field>

            <Separator className="my-1" />
            <Field label="Tags" htmlFor={`${id}-tags`} hint="Enter or comma adds a new tag.">
              <MultiCombobox id={`${id}-tags`} name="tags" options={tags} defaultValue={asset.tags} placeholder="Add tags" creatable />
            </Field>
            {collections.length > 0 && (
              <Field label="Collections" htmlFor={`${id}-collections`}>
                <MultiCombobox
                  id={`${id}-collections`}
                  name="collection"
                  options={collections.map((c) => ({ value: c.id, label: c.name, hint: c.count }))}
                  defaultValue={asset.collections}
                  placeholder="Add to a collection"
                />
              </Field>
            )}
            <div className="flex items-start justify-between gap-4 rounded-md border px-3 py-2">
              <Label htmlFor={`${id}-private`} className="grid flex-1 gap-1 font-normal">
                <span className="flex items-center gap-1.5 font-medium">
                  <IconLock className="size-4" /> Private
                </span>
                <span className="text-muted-foreground text-xs">
                  Only people added to it or to one of its collections, and admins, see it. Only in private collections, it is private anyway.
                </span>
              </Label>
              <Switch id={`${id}-private`} name="private" defaultChecked={!!asset.private} />
            </div>

            {fields.length > 0 && (
              <>
                <Separator className="my-1" />
                <FieldInputs defs={fields} values={asset.fields} inherited={asset.inherited} sources={sources} />
              </>
            )}

            <Separator className="my-1" />
            <RightsInputs asset={asset} />
            <Separator className="my-1" />
            <ProvenanceInputs asset={asset} />
            </Writable>
          </div>

          <div className="flex justify-end gap-2 border-t px-6 py-4">
            <Button variant="outline" type="button" onClick={onClose}>
              {editable ? "Cancel" : "Close"}
            </Button>
            {editable && (
              <Button type="submit" disabled={busy}>
                {busy ? "Saving" : "Save"}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const MODEL_RELEASE: Option[] = [
  { value: "released", label: "Signed" },
  { value: "missing", label: "Missing: editorial use only" },
  { value: "not-needed", label: "Not needed" },
];
const ORIGIN: Option[] = [
  { value: "shot", label: "Shot or made in house" },
  { value: "licensed", label: "Licensed" },
  { value: "generated", label: "Generated by a model" },
];

/** What it may be used for. /api/v1/check reads these; empty means unrestricted. */
function RightsInputs({ asset }: { asset: Asset }) {
  const id = useId();
  const r = asset.rights;
  return (
    <>
      <p className="text-sm font-medium">Rights</p>
      <Field label="License" htmlFor={`${id}-license`}>
        <Input id={`${id}-license`} name="license" defaultValue={r?.license ?? ""} maxLength={200} placeholder="e.g. Royalty-free, CC BY 4.0" />
      </Field>
      <Field label="Territories" htmlFor={`${id}-territories`} hint="Two-letter country codes, e.g. DE. Empty: anywhere.">
        <MultiCombobox id={`${id}-territories`} name="territories" options={[]} defaultValue={r?.territories ?? []} placeholder="Anywhere" creatable />
      </Field>
      <Field label="Channels" htmlFor={`${id}-channels`} hint="Empty: any use.">
        <MultiCombobox
          id={`${id}-channels`}
          name="channels"
          options={CHANNELS.map((value) => ({ value }))}
          defaultValue={r?.channels ?? []}
          placeholder="Any use"
          creatable
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Not before" htmlFor={`${id}-embargo`}>
          <Input id={`${id}-embargo`} name="embargo" type="date" defaultValue={r?.embargo ?? ""} />
        </Field>
        <Field label="Last day of use" htmlFor={`${id}-expires`}>
          <Input id={`${id}-expires`} name="expires" type="date" defaultValue={r?.expires ?? ""} />
        </Field>
      </div>
      <Field label="Model release" htmlFor={`${id}-release`}>
        <Combobox id={`${id}-release`} name="modelRelease" options={MODEL_RELEASE} defaultValue={r?.modelRelease ?? ""} placeholder="Unknown" />
      </Field>
    </>
  );
}

/** Where it came from, and what replaced it. Content Credentials are read from the file, not edited. */
function ProvenanceInputs({ asset }: { asset: Asset }) {
  const id = useId();
  const c = asset.c2pa;
  return (
    <>
      <p className="text-sm font-medium">Provenance</p>
      {c && (
        <div className="bg-muted/40 grid gap-1 rounded-lg border p-3 text-xs">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <IconCertificate className="size-4" /> Content Credentials
          </p>
          <p className="text-muted-foreground">
            {[
              c.signedBy && `Signed by ${c.signedBy}`,
              c.generator && `with ${c.generator}`,
              c.softwareAgent && `made by ${c.softwareAgent}`,
            ]
              .filter(Boolean)
              .join(", ") || "A manifest with nothing to show"}
            . {c.actions.length > 0 && `Actions: ${c.actions.map((a) => a.replace(/^c2pa\./, "")).join(", ")}. `}
            Kept intact in the original and in downloads; not verified here.
          </p>
        </div>
      )}
      <Field label="Origin" htmlFor={`${id}-origin`}>
        <Combobox id={`${id}-origin`} name="origin" options={ORIGIN} defaultValue={asset.origin ?? ""} placeholder="Unknown" />
      </Field>
      <Field label="Made with" htmlFor={`${id}-generator`}>
        <Input id={`${id}-generator`} name="generator" defaultValue={asset.generator ?? ""} maxLength={200} placeholder="The camera, tool or model" />
      </Field>
      <Field label="Prompt" htmlFor={`${id}-prompt`}>
        <Textarea id={`${id}-prompt`} name="prompt" defaultValue={asset.prompt ?? ""} maxLength={10000} rows={2} placeholder="For a generated asset" />
      </Field>
      <AssetRef
        name="parentAssetId"
        label="Made from"
        value={asset.parentAssetId}
        self={asset.id}
        pick="What was it made from?"
        about="The photo an edit started from, the image a model was given."
      />
      <AssetRef
        name="supersededBy"
        label="Replaced by"
        value={asset.supersededBy}
        self={asset.id}
        pick="What replaces it?"
        about="Checks then refuse this asset and point to the replacement instead."
      />
    </>
  );
}

/** Another asset, by reference: a hidden input carries its id with the form. */
function AssetRef({
  name,
  label,
  value,
  self,
  pick,
  about,
}: {
  name: string;
  label: string;
  value: string | null;
  self: string;
  pick: string;
  about: string;
}) {
  const [ref, setRef] = useState<Asset | null>(null);
  const [id, setId] = useState(value);
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    if (!id || ref?.id === id) return;
    let live = true;
    fetch(`/api/v1/assets/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && j && setRef(j.data));
    return () => {
      live = false;
    };
  }, [id, ref]);
  const shown = id && ref?.id === id ? ref : null;
  return (
    <Field label={label} hint={about}>
      <input type="hidden" name={name} value={id ?? ""} />
      <div className="flex items-center gap-2">
        {id ? (
          <a href={`/?asset=${id}`} className="flex min-w-0 flex-1 items-center gap-2 rounded-md border p-1.5 text-sm hover:underline">
            <span className="bg-muted relative size-8 shrink-0 overflow-hidden rounded">
              {shown && hasPreview(shown) && <Thumb src={`/a/${id}/w_64,f_webp`} alt="" />}
            </span>
            <span className="truncate">{shown ? (shown.metadata?.title ?? shown.filename) : "…"}</span>
          </a>
        ) : (
          <span className="text-muted-foreground flex-1 text-sm">None</span>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => setPicking(true)}>
          {id ? "Change" : "Pick"}
        </Button>
        {id && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setId(null)} aria-label={`Clear ${label.toLowerCase()}`}>
            <IconX />
          </Button>
        )}
      </div>
      {picking && (
        <ImagePicker
          any
          exclude={self}
          title={pick}
          description={about}
          onClose={() => setPicking(false)}
          onPick={(a) => {
            setRef(a as Asset);
            setId(a.id);
            setPicking(false);
          }}
        />
      )}
    </Field>
  );
}

/** A replaced asset says so first, and links to what replaced it. */
function Replaced({ by }: { by: string }) {
  return (
    <div className="bg-muted/40 grid gap-1 rounded-lg border p-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <IconReplace className="size-4" /> Replaced
      </p>
      <p className="text-muted-foreground text-xs">
        Checks refuse it and point to{" "}
        <a href={`/?asset=${by}`} className="text-foreground underline">
          its replacement
        </a>
        . Clear Replaced by, under Provenance, to use it again.
      </p>
    </div>
  );
}

/** The brand rules that point at this asset, linking to each on the guidelines page. */
function BrandRules({ assetId }: { assetId: string }) {
  const [rules, setRules] = useState<Rule[]>([]);
  useEffect(() => {
    let live = true;
    fetch(`/api/v1/brand/rules?asset=${assetId}`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => live && setRules(j.data));
    return () => {
      live = false;
    };
  }, [assetId]);
  if (!rules.length) return null;
  const several = new Set(rules.map((r) => r.brand)).size > 1;
  return (
    <div className="bg-muted/40 grid gap-2 rounded-lg border p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <IconBook className="size-4" /> Brand rules that use this
      </p>
      <ul className="grid gap-1.5">
        {rules.map((r) => (
          <li key={r.id} className="text-sm">
            <a href={`/brand?brand=${r.brand}#rule-${r.key}`} className="hover:underline">
              {several && <span className="text-muted-foreground">{r.brand} / </span>}
              {ruleLabel(r.key)}
            </a>
            {r.context && (
              <Badge variant="secondary" className="ml-2" title={r.context}>
                {contextLabel(r.context)}
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * What an agent suggested about this asset, and the buttons that decide it.
 * Each acts at once through the public PATCH, separately from Save. A
 * rejection is kept, with its reason, for the agent that suggested it.
 */
function Review({ asset, onReviewed }: { asset: Asset; onReviewed: (asset: Asset) => void }) {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  if (asset.status === "rejected") {
    return (
      <div className="bg-muted/40 grid gap-1 rounded-lg border p-3 text-sm">
        <p className="font-medium">Rejected</p>
        <p className="text-muted-foreground text-xs">
          Suggested by {asset.proposedBy ?? "an agent"}.{" "}
          {asset.reviewNote ? <>Reason: &ldquo;{asset.reviewNote}&rdquo;</> : "No reason given."} It stays out of the
          library; the agent can read why.
        </p>
      </div>
    );
  }
  if (asset.status !== "proposed" && !asset.proposedTags.length) return null;

  const patch = async (body: object) => {
    setBusy(true);
    const next = await send("PATCH", `/api/v1/assets/${asset.id}`, body);
    setBusy(false);
    if (next) onReviewed(next);
  };
  const accept = (tags: string[]) =>
    patch({ tags: [...asset.tags, ...tags], proposedTags: asset.proposedTags.filter((t) => !tags.includes(t)) });
  const dismiss = (tags: string[]) => patch({ proposedTags: asset.proposedTags.filter((t) => !tags.includes(t)) });
  const reject = async () => {
    setBusy(true);
    const next = await send("PATCH", `/api/v1/assets/${asset.id}`, { status: "rejected", reviewNote: reason || null });
    setBusy(false);
    if (next) {
      toast.success(`Rejected. ${asset.proposedBy ?? "The agent"} can read why.`);
      onReviewed(next);
    }
  };

  return (
    <div className="border-primary/30 bg-primary/5 grid gap-3 rounded-lg border p-3">
      {asset.status === "proposed" && (
        <div className="grid gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <IconSparkles className="text-primary size-4" /> Suggested by {asset.proposedBy ?? "an agent"}
            <span className="text-muted-foreground font-normal" suppressHydrationWarning>
              · {ago(asset.createdAt)}
            </span>
          </p>
          <p className="text-muted-foreground text-xs">
            It stays out of the library and search until you approve it. Fill in any required fields first.
          </p>
          {rejecting ? (
            <div className="grid gap-2">
              <Textarea
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why not? The agent reads this, e.g. off-brand colors, low resolution"
                aria-label="Reason for rejecting"
                maxLength={2000}
                rows={2}
              />
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={reject}>
                  <IconX /> Reject
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setRejecting(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button type="button" size="sm" disabled={busy} onClick={() => patch({ status: "active" })}>
                <IconCheck /> Approve
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setRejecting(true)}>
                <IconX /> Reject…
              </Button>
            </div>
          )}
        </div>
      )}
      {asset.proposedTags.length > 0 && (
        <div className="grid gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <IconSparkles className="text-primary size-4" /> Suggested tags
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {asset.proposedTags.map((t) => (
              <li key={t}>
                <Badge variant="outline" className="gap-0.5 border-dashed pr-0.5">
                  {t}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => accept([t])}
                    aria-label={`Accept tag ${t}`}
                    className="hover:bg-primary/15 rounded-full p-0.5"
                  >
                    <IconCheck className="size-3" />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => dismiss([t])}
                    aria-label={`Dismiss tag ${t}`}
                    className="hover:bg-muted-foreground/20 rounded-full p-0.5"
                  >
                    <IconX className="size-3" />
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
          {asset.proposedTags.length > 1 && (
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => accept(asset.proposedTags)}>
                Accept all
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => dismiss(asset.proposedTags)}>
                Dismiss all
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
