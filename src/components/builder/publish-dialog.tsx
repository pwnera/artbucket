"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { IconExternalLink, IconLoader2, IconMessageCircle, IconWorldUpload } from "@tabler/icons-react";
import Link from "next/link";
import { toast } from "sonner";
import { LibraryPicker } from "@/components/asset-picker";
import type { BuilderApi, Transport } from "@/components/builder/use-builder";
import type { Status } from "@/components/builder/use-status";
import { useAssetUrl } from "@/components/site/asset-url";
import { Thumb } from "@/components/thumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { releaseLines, type ReleaseLine, type SnapRule } from "@/lib/history";
import type { SnapPage } from "@/lib/pages";
import { ruleName } from "@/lib/rules";
import { IDLE, snapshot, subscribe } from "@/lib/saving";

/**
 * Publish a release (build spec 3.5.3, W6.3, and the prototype's "Publish a
 * release"): the release's number and how long it has been a draft, a note,
 * an image, what changes since the last release line by line (lib/history.ts
 * releaseLines against the draft), and the Brand Agent Score before and
 * after, with the open review comments one click away; the result
 * lists the portals it now shows on. Publishing and sharing are two things (a
 * version readers get, and a door with an address and who gets in; one brand
 * can be on several portals, one portal can show several brands), but a
 * brand no portal shows yet can get one in the same step: named for the
 * brand, showing it, open to the workspace's members or to anyone. Requests go through the host's
 * transport, so the builder's dev page records them.
 *
 * The draft is the brand's latest version, which is what a publish
 * publishes, so it is read from the server once every write has landed.
 *
 * The form is ReleaseForm, drawn by the builder's dialog (PublishDialog) and
 * by the release page (/brands/{slug}/releases/new) alike; `host` is what it
 * needs from either.
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

/** What the release form needs from where it is drawn. */
export type ReleaseHost = {
  brand: string;
  name: string;
  transport: Transport;
  /** The brand's status (lib/core/brand-status.ts): its score, and whether a portal shows it. */
  status: Status | null;
  /** Open review comments, and how to go to them. */
  comments: { open: number; review: (() => void) | string };
  /** A release landed: read the status again. */
  released(): void;
};

/** GET .../versions's rows, as far as publishing reads them. */
type Version = { number: number; publishedAt: string | null; createdAt: string };
/** GET .../versions/{n}, as far as releaseLines reads it. */
type Snapshot = { rules: SnapRule[]; pages: SnapPage[] | null };
/** POST .../publish's answer. */
type Published = {
  number?: number;
  unchanged?: boolean;
  portals?: { slug: string; name: string; url: string }[];
  /** Who sees it on BrandHub, and where; null with no hub. */
  hub?: { visibility: "private" | "public"; url: string } | null;
};

/** Who a portal made here lets in; a password portal is set up on the Portals page, where the password is typed. */
type Door = "members" | "public" | "none";
const DOORS: Record<Door, string> = { members: "People in this workspace", public: "Anyone with the address", none: "Not now" };

/** A portal's address from the brand's name, as the Portals page makes one. */
const slugOf = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "") || "brand";

/** `draftSince`: when the first version after the last release was made, the draft's start. */
type News = { error: string } | { draft: number | null; since: number | null; draftSince: string | null; changes: ReleaseLine[] | null };

export function PublishDialog({ b, open, onOpenChange }: PublishDialogProps) {
  const host: ReleaseHost = {
    brand: b.brand,
    name: b.view.brand.name,
    transport: b.transport,
    status: b.status,
    comments: {
      open: b.comments.openCount,
      review: () => {
        onOpenChange(false);
        b.setCommentsOnPage(true);
        b.setDock("comments");
      },
    },
    released: () => void b.refreshStatus(),
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="app-tokens">
        <DialogTitle className="sr-only">Release</DialogTitle>
        {open && <ReleaseForm host={host} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

const draftDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/**
 * The release form, in a dialog or on a page: `onClose` is Cancel and, once
 * released, Done; `onDone`, when given, is Done instead.
 */
export function ReleaseForm({ host, onClose, onDone }: { host: ReleaseHost; onClose: () => void; onDone?: () => void }) {
  const { brand, transport } = host;
  // What is still on its way to the server isn't in the version a publish would take.
  const saving = useSyncExternalStore(subscribe, snapshot, () => IDLE).inFlight > 0;
  const [news, setNews] = useState<News | null>(null);
  const [note, setNote] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Published | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // Offered only when the brand is on no portal and this person may make one (b.status.portals is [] then, null when they can't tell).
  const offer = host.status?.portals?.length === 0;
  const [door, setDoor] = useState<Door>("members");
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
      if (!draft) return { draft: null, since: null, draftSince: null, changes: null };
      if (draft.publishedAt) return { draft: draft.number, since: draft.number, draftSince: null, changes: null };
      const drafts = since ? versions.filter((v) => v.number > since.number) : versions;
      const draftSince = drafts.at(-1)?.createdAt ?? null;
      const [was, is] = await Promise.all([since ? transport("GET", `${base}/${since.number}`) : null, transport("GET", `${base}/${draft.number}`)]);
      if (!is.ok || (was && !was.ok)) return { error: "Couldn't read what changed." };
      return { draft: draft.number, since: since?.number ?? null, draftSince, changes: releaseLines(was ? (was.data as Snapshot) : null, is.data as Snapshot) };
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
    if (!res.ok) {
      setBusy(false);
      return setFailed(res.network ? "Couldn't reach the server. Nothing was released." : (res.error?.message ?? "Couldn't release."));
    }
    const published = res.data as Published;
    if (offer && door !== "none") {
      // The address from the name, then with a number, should another portal have it.
      const base = slugOf(host.name);
      for (const slug of [base, `${base}-guidelines`, `${base}-2`, `${base}-3`]) {
        const made = await transport("POST", "/api/v1/portals", { name: host.name, slug, access: door, brands: [brand] });
        if (made.ok) {
          const p = made.data as { slug: string; name: string; url: string };
          published.portals = [...(published.portals ?? []), { slug: p.slug, name: p.name, url: p.url }];
          break;
        }
        if (made.network || made.status !== 409) {
          toast.error("Released, but the portal wasn't made", { description: (!made.network && made.error?.message) || "Make one on the Portals page." });
          break;
        }
      }
    }
    setBusy(false);
    setDone(published);
    host.released();
  };

  if (done) return <Result done={done} brand={brand} onClose={onDone ?? onClose} />;

  const draft = news && "draft" in news ? news : null;
  const current = draft && draft.draft !== null && draft.draft === draft.since;
  // What releasing does to the Brand Agent Score: the Released step, done.
  const step = host.status?.steps.find((s) => s.id === "publish");
  const score = host.status && step && !step.done && !current ? { was: host.status.score, is: Math.min(100, host.status.score + step.points) } : null;
  const n = draft?.draft;
  return (
    <div className="grid gap-4">
      <header className="grid gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display flex items-center gap-2 text-xl font-semibold">
            <IconWorldUpload aria-hidden className="size-5" /> {n && !current ? `Release @${n}` : "Release"}
          </h2>
          {draft?.draftSince && !current && <Badge variant="warning">Draft since {draftDate(draft.draftSince)}</Badge>}
        </div>
        <p className="text-muted-foreground text-sm">Portals and BrandHub show the latest release. Until then, readers see what they saw before.</p>
      </header>

      <div className="grid gap-1.5">
        <Label htmlFor="publish-note">Note for readers</Label>
        <Textarea id="publish-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} placeholder="What changed, and why" />
      </div>

      <section aria-labelledby="publish-news" aria-busy={!news || saving} className="grid gap-2">
        <h3 id="publish-news" className="text-sm font-medium">
          {draft?.since ? `What changes since @${draft.since}` : "What readers get"}
        </h3>
        {!news || saving ? (
          <div className="grid gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : "error" in news ? (
          <p className="text-muted-foreground text-sm">{news.error} You can still release.</p>
        ) : current ? (
          <p className="text-muted-foreground text-sm">Nothing new: release @{news.draft} is already what readers see.</p>
        ) : news.changes && news.since ? (
          <Changes lines={news.changes} />
        ) : (
          <p className="text-sm">The first release: readers get every page and rule.</p>
        )}
      </section>

      {score && (
        <p className="bg-muted flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm">
          <span>Brand Agent Score</span>
          <b className="tabular-nums">
            {score.was} → {score.is}
          </b>
        </p>
      )}

      {host.comments.open > 0 && (
        // Review before readers get it: the open threads, one click away.
        <p role="note" className="border-warning/40 bg-warning/10 flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <IconMessageCircle aria-hidden className="text-warning size-4 shrink-0" />
          <span className="flex-1">
            {host.comments.open} open {host.comments.open === 1 ? "comment" : "comments"} on these pages.
          </span>
          {typeof host.comments.review === "string" ? (
            <Button variant="outline" size="xs" asChild>
              <Link href={host.comments.review}>Review</Link>
            </Button>
          ) : (
            <Button variant="outline" size="xs" onClick={host.comments.review}>
              Review
            </Button>
          )}
        </p>
      )}

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

      {offer && (
        <fieldset className="grid gap-2 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">Also share it on a portal</legend>
          <p className="text-muted-foreground text-xs">No portal shows {host.name} yet. A portal is its own address for it, which you can style and close later.</p>
          <div role="radiogroup" aria-label="Who gets in" className="grid gap-1">
            {(Object.keys(DOORS) as Door[]).map((d) => (
              <label key={d} className="flex items-center gap-2 text-sm">
                <input type="radio" name="publish-door" value={d} checked={door === d} onChange={() => setDoor(d)} className="accent-primary" />
                {DOORS[d]}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {failed && (
        <p role="alert" className="text-destructive text-sm">
          {failed}
        </p>
      )}

      <footer className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={publish} disabled={busy || saving || !!current}>
          {busy || saving ? <IconLoader2 className="animate-spin" /> : <IconWorldUpload />}
          {saving ? "Saving" : n && !current ? `Publish @${n}` : "Publish"}
        </Button>
      </footer>

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
    </div>
  );
}

/** Past this many lines, the rest are counted. */
const LINES = 12;
const MARK: Record<ReleaseLine["mark"], { sign: string; tone: string; say: string }> = {
  added: { sign: "+", tone: "text-success", say: "added" },
  changed: { sign: "~", tone: "text-warning", say: "changed" },
  removed: { sign: "-", tone: "text-destructive", say: "removed" },
};

/** What changes, a line each (lib/history.ts releaseLines): a mark, the rule or page, and how; a color's swatches before and after. */
function Changes({ lines }: { lines: ReleaseLine[] }) {
  if (!lines.length) return <p className="text-muted-foreground text-sm">Nothing readers would notice: only hidden pages, order or wording they don&apos;t see.</p>;
  return (
    <ul className="grid gap-1.5 rounded-lg border p-3 text-sm">
      {lines.slice(0, LINES).map((l) => {
        const m = MARK[l.mark];
        return (
          <li key={l.kind === "rule" ? `r:${l.key}@${l.context ?? ""}` : `p:${l.slug}`} className="flex items-baseline gap-2">
            <span aria-label={m.say} className={`${m.tone} w-3 shrink-0 font-mono font-semibold`}>
              {m.sign}
            </span>
            <span className="min-w-0">
              {l.kind === "rule" ? (
                <>
                  <code className="font-mono text-xs" title={ruleName({ key: l.key, label: l.label })}>
                    {l.key}
                  </code>
                  {l.context && <span className="text-muted-foreground"> ({l.context})</span>}{" "}
                  {l.before && l.after && (
                    <span className="inline-flex items-center gap-1 align-middle">
                      <Swatch hex={l.before} /> → <Swatch hex={l.after} />
                    </span>
                  )}{" "}
                  <span className="text-muted-foreground">{l.what}</span>
                </>
              ) : (
                <>
                  page <b className="font-medium">{l.title}</b>: <span className="text-muted-foreground">{l.what}</span>
                </>
              )}
            </span>
          </li>
        );
      })}
      {lines.length > LINES && <li className="text-muted-foreground ps-5">and {lines.length - LINES} more</li>}
    </ul>
  );
}

function Swatch({ hex }: { hex: string }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs">
      <span className="inline-block size-3 rounded-sm ring-1 ring-black/10 dark:ring-white/10" style={{ background: hex }} />
      {hex}
    </span>
  );
}

/** What publishing did: the version readers now get, and the portals that show it. */
function Result({ done, brand, onClose }: { done: Published; brand: string; onClose: () => void }) {
  const portals = done.portals ?? [];
  return (
    <div className="grid gap-4">
      <header className="grid gap-1.5">
        <h2 className="font-display flex items-center gap-2 text-xl font-semibold">
          <IconWorldUpload aria-hidden className="size-5" /> {done.unchanged ? "Already released" : done.number ? `Released @${done.number}` : "Released"}
        </h2>
        <p className="text-muted-foreground text-sm">
          {done.unchanged
            ? `Nothing changed since release @${done.number ?? "the last"}, so readers already see this.`
            : `Readers now get ${done.number ? `release @${done.number}` : "this release"}.`}
        </p>
      </header>
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
        <div className="bg-muted grid gap-2 rounded-lg p-3">
          <p className="text-sm font-medium">Share it outside the team</p>
          <p className="text-muted-foreground text-sm">No portal shows this brand yet. A portal is its own address, with your look and who may read it.</p>
          <Button asChild size="sm" variant="outline" className="justify-self-start">
            <Link href={`/portals?${new URLSearchParams({ new: brand })}`}>Create a portal for it</Link>
          </Button>
        </div>
      )}
      {done.hub && (
        <p className="text-muted-foreground text-sm">
          {done.hub.visibility === "public" ? "Public on BrandHub, where anyone and any agent reads it: " : "Private on BrandHub, for people in this workspace: "}
          <a href={done.hub.url} target="_blank" rel="noreferrer" className="text-foreground inline-flex items-center gap-1 underline underline-offset-2">
            {done.hub.visibility === "public" ? done.hub.url.replace(/^https?:\/\//, "") : "see it there"} <IconExternalLink className="size-3.5" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          {done.hub.visibility === "private" && (
            <>
              {". "}
              <Link href="/brands" className="text-foreground underline underline-offset-2">
                Make it public
              </Link>
            </>
          )}
        </p>
      )}
      <footer className="flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </footer>
    </div>
  );
}
