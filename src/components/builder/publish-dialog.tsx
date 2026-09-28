"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { IconExternalLink, IconLoader2, IconWorldUpload } from "@tabler/icons-react";
import Link from "next/link";
import { LibraryPicker } from "@/components/asset-picker";
import type { BuilderApi } from "@/components/builder/use-builder";
import { useAssetUrl } from "@/components/site/asset-url";
import { Thumb } from "@/components/thumb";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { type SnapRule, whatsNew, type WhatsNew } from "@/lib/history";
import type { SnapPage } from "@/lib/pages";
import { ruleName } from "@/lib/rules";
import { IDLE, snapshot, subscribe } from "@/lib/saving";

/**
 * Publish (build spec 3.5.3, W6.3): a note, an image, and what changed since
 * the last publish (lib/history.ts whatsNew against the draft); the result
 * lists the portals it now shows on. Requests go through b.transport, so the
 * dev page records them.
 *
 * The draft is the brand's latest version, which is what a publish
 * publishes, so it is read from the server once every write has landed.
 *
 * Props:
 * - b: the builder.
 * - open, onOpenChange: a controlled dialog; the builder opens it for
 *   b.panel "publish".
 */
export type PublishDialogProps = {
  b: BuilderApi;
  open: boolean;
  onOpenChange(open: boolean): void;
};

/** GET .../versions's rows, as far as publishing reads them. */
type Version = { number: number; publishedAt: string | null };
/** GET .../versions/{n}, as far as whatsNew reads it. */
type Snapshot = { rules: SnapRule[]; pages: SnapPage[] | null };
/** POST .../publish's answer. */
type Published = { number?: number; unchanged?: boolean; portals?: { slug: string; name: string; url: string }[] };

type News = { error: string } | { draft: number | null; since: number | null; changes: WhatsNew | null };

export function PublishDialog({ b, open, onOpenChange }: PublishDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="app-tokens">{open && <Body b={b} onClose={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function Body({ b, onClose }: { b: BuilderApi; onClose: () => void }) {
  const { brand, transport } = b;
  // What is still on its way to the server isn't in the version a publish would take.
  const saving = useSyncExternalStore(subscribe, snapshot, () => IDLE).inFlight > 0;
  const [news, setNews] = useState<News | null>(null);
  const [note, setNote] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Published | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const url = useAssetUrl();

  useEffect(() => {
    if (saving) return;
    let gone = false;
    const base = `/api/v1/brands/${encodeURIComponent(brand)}/versions`;
    const read = async (): Promise<News> => {
      const list = await transport("GET", base);
      if (!list.ok) return { error: list.network ? "Couldn't reach the server." : (list.error?.message ?? "Couldn't read the history.") };
      const versions = list.data as Version[];
      const [draft] = versions;
      const since = versions.find((v) => v.publishedAt) ?? null;
      // No history yet: the publish makes the first version, and readers get everything.
      if (!draft) return { draft: null, since: null, changes: null };
      if (draft.publishedAt) return { draft: draft.number, since: draft.number, changes: null };
      const [was, is] = await Promise.all([since ? transport("GET", `${base}/${since.number}`) : null, transport("GET", `${base}/${draft.number}`)]);
      if (!is.ok || (was && !was.ok)) return { error: "Couldn't read what changed." };
      return { draft: draft.number, since: since?.number ?? null, changes: whatsNew(was ? (was.data as Snapshot) : null, is.data as Snapshot) };
    };
    void read().then((n) => !gone && setNews(n));
    return () => {
      gone = true;
    };
  }, [saving, brand, transport]);

  const publish = async () => {
    setBusy(true);
    setFailed(null);
    const res = await transport("POST", `/api/v1/brands/${encodeURIComponent(brand)}/publish`, {
      ...(note.trim() && { note: note.trim() }),
      ...(image && { image }),
    });
    setBusy(false);
    if (res.ok) setDone(res.data as Published);
    else setFailed(res.network ? "Couldn't reach the server. Nothing was published." : (res.error?.message ?? "Couldn't publish."));
  };

  if (done) return <Result done={done} onClose={onClose} />;

  const current = news && "draft" in news && news.draft !== null && news.draft === news.since;
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <IconWorldUpload className="size-5" /> Publish
        </DialogTitle>
        <DialogDescription>Portals show the latest publish. Until then, readers see what they saw before.</DialogDescription>
      </DialogHeader>

      <section aria-labelledby="publish-news" aria-busy={!news || saving} className="grid gap-2">
        <h3 id="publish-news" className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {news && "draft" in news && news.since ? `New since version ${news.since}` : "What readers get"}
        </h3>
        {!news || saving ? (
          <div className="grid gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : "error" in news ? (
          <p className="text-muted-foreground text-sm">{news.error} You can still publish.</p>
        ) : current ? (
          <p className="text-muted-foreground text-sm">Nothing new: version {news.draft} is already what readers see.</p>
        ) : news.changes ? (
          <Changes changes={news.changes} rules={b.state.rules} />
        ) : (
          <p className="text-sm">The first publish: readers get every page and rule.</p>
        )}
      </section>

      <div className="grid gap-1.5">
        <Label htmlFor="publish-note">Note for readers</Label>
        <Textarea id="publish-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} placeholder="What changed, and why" />
      </div>

      <div className="grid gap-1.5">
        <p className="text-sm font-medium">Image</p>
        <div className="flex items-center gap-2">
          {image && (
            <span className="bg-muted relative size-12 shrink-0 overflow-hidden rounded-md border">
              <Thumb src={url(image, "/w_160,f_webp")} alt="The note's image" />
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => setPicking(true)}>
            {image ? "Replace" : "Choose"}
          </Button>
          {image && (
            <Button variant="ghost" size="sm" onClick={() => setImage(null)}>
              Remove
            </Button>
          )}
        </div>
      </div>

      {failed && (
        <p role="alert" className="text-destructive text-sm">
          {failed}
        </p>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={publish} disabled={busy || saving || !!current}>
          {busy || saving ? <IconLoader2 className="animate-spin" /> : <IconWorldUpload />}
          {saving ? "Saving" : "Publish"}
        </Button>
      </DialogFooter>

      {picking && (
        <LibraryPicker
          title="Choose an image"
          description="Shown beside the note in What's new."
          onClose={() => setPicking(false)}
          onPick={(a) => {
            setPicking(false);
            setImage(a.id);
          }}
        />
      )}
    </>
  );
}

/** Past this many names in one row, the rest are counted: a first publish is all new. */
const NAMES = 6;

function Changes({ changes, rules }: { changes: WhatsNew; rules: BuilderApi["state"]["rules"] }) {
  const { pages, rules: r } = changes;
  const rule = (key: string) => ruleName({ key, label: rules.find((x) => x.key === key && x.label)?.label });
  const rows: [string, string[]][] = [
    ["New pages", pages.added.map((p) => p.title)],
    ["Updated pages", pages.changed.map((p) => p.title)],
    ["Removed pages", pages.removed.map((p) => p.title)],
    ["New rules", r.added.map(rule)],
    ["Changed rules", r.changed.map(rule)],
    ["Removed rules", r.removed.map(rule)],
  ].filter((row): row is [string, string[]] => row[1].length > 0);
  if (!rows.length) return <p className="text-muted-foreground text-sm">Nothing readers would notice: only hidden pages, order or wording they don&apos;t see.</p>;
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
      {rows.map(([name, xs]) => (
        <div key={name} className="contents">
          <dt className="text-muted-foreground">{name}</dt>
          <dd>
            {xs.slice(0, NAMES).join(", ")}
            {xs.length > NAMES && <span className="text-muted-foreground"> and {xs.length - NAMES} more</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** What publishing did: the version readers now get, and the portals that show it. */
function Result({ done, onClose }: { done: Published; onClose: () => void }) {
  const portals = done.portals ?? [];
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <IconWorldUpload className="size-5" /> {done.unchanged ? "Already published" : "Published"}
        </DialogTitle>
        <DialogDescription>
          {done.unchanged
            ? `Nothing changed since version ${done.number ?? "the last"}, so readers already see this.`
            : `Readers now get ${done.number ? `version ${done.number}` : "this version"}.`}
        </DialogDescription>
      </DialogHeader>
      {portals.length ? (
        <div className="grid gap-2">
          <p className="text-sm">It shows on:</p>
          <ul className="grid gap-1">
            {portals.map((p) => (
              <li key={p.slug}>
                <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline underline-offset-2">
                  {p.name} <IconExternalLink className="size-3.5" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No portal shows this brand yet.{" "}
          <Link href="/portals" className="text-foreground underline underline-offset-2">
            Add it to one
          </Link>{" "}
          to share it outside the workspace.
        </p>
      )}
      <DialogFooter>
        <Button onClick={onClose}>Done</Button>
      </DialogFooter>
    </>
  );
}
