"use client";

import { useEffect, useId, useState } from "react";
import { IconBook, IconCheck, IconDownload, IconLink, IconPhoto, IconSparkles, IconX } from "@tabler/icons-react";
import { toast } from "sonner";
import { send, type Collection } from "@/components/collections";
import { MultiCombobox, type Option } from "@/components/combobox";
import { Field, FieldInputs, readFieldValues } from "@/components/fields";
import { call, curl, ForAgents } from "@/components/agent-access";
import { FontPlayground } from "@/components/font-preview";
import { Renditions } from "@/components/renditions";
import { Thumb, type Asset } from "@/components/gallery";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { FieldDef } from "@/lib/fields";
import { contextLabel, ruleLabel, type Rule } from "@/lib/rules";
import { fileTypeBadge, formatBytes } from "@/lib/filename";
import { isFont } from "@/lib/font";
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
  const tags = useLibraryTags();
  const m = asset.metadata ?? {};

  async function save(form: FormData) {
    setBusy(true);
    const str = (k: string) => String(form.get(k) ?? "");
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

  const facts = [
    asset.width && asset.height ? `${asset.width} × ${asset.height}` : null,
    formatBytes(asset.size),
    m.camera,
    m.capturedAt?.slice(0, 10),
  ].filter(Boolean);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="grid max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-5xl md:h-[min(760px,calc(100dvh-2rem))] md:grid-cols-[1fr_380px] md:grid-rows-1 md:overflow-hidden">
        <div className="bg-muted/50 flex min-h-64 flex-col border-b md:min-h-0 md:border-r md:border-b-0">
          <div className="relative flex min-h-64 flex-1 items-center justify-center md:min-h-0">
            {asset.mime.startsWith("image/") ? (
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
                    Sizes and formats are made from images only. Download keeps the {fileTypeBadge(asset.filename, asset.mime)} file as
                    stored, with these edits written in where the format allows.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
          <div className="flex items-center gap-2 border-t px-4 py-3">
            <Badge variant="outline">{fileTypeBadge(asset.filename, asset.mime)}</Badge>
            <span className="text-muted-foreground truncate text-xs tabular-nums">{facts.join(" · ")}</span>
            <span className="ml-auto" />
            <Button variant="outline" size="sm" type="button" onClick={copyLink} title="A link to this asset, in the library">
              <IconLink /> <span className="sr-only sm:not-sr-only">Copy link</span>
            </Button>
            {asset.mime.startsWith("image/") && <Renditions asset={asset} />}
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
                Edits are written into the file on download.
              </DialogDescription>
            </div>
            <ForAgents
              className="shrink-0"
              subject="This asset"
              about="What an agent reads before using this asset: its title, credit and fields, the brand rules that point at it, and ready-made sizes."
              reads={(origin) => [
                { label: "MCP tool", text: call("describe_asset", { id: asset.id }) },
                ...(asset.mime.startsWith("image/")
                  ? [{ label: "A size to hand out", text: call("rendition_url", { id: asset.id, width: 1200, format: "webp" }) }]
                  : []),
                { label: "REST", text: curl(`${origin}/a/${asset.id}`, ["Accept: application/json"]) },
              ]}
            />
          </div>

          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 py-4">
            <Review asset={asset} onReviewed={onReviewed} />
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

            {fields.length > 0 && (
              <>
                <Separator className="my-1" />
                <FieldInputs defs={fields} values={asset.fields} inherited={asset.inherited} sources={sources} />
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t px-6 py-4">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
