"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { IconCheck, IconDots, IconMessageCircle, IconRestore } from "@/components/icons";
import { toast } from "sonner";
import type { z } from "zod";
import { useCan, useMe } from "@/components/can";
import { Confirm } from "@/components/confirm";
import type { Transport } from "@/components/builder/use-builder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MAX_COMMENT, openCounts, sectionKey, threads as thread, type Thread } from "@/lib/comments";
import type { Action } from "@/lib/permissions";
import type { Comment } from "@/lib/schemas";
import type { Sent } from "@/lib/send";
import { ago, exact } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * Review comments on a brand's pages, as a design tool has them: pinned to a
 * section, or to the page as a whole, answered in a thread, and resolved
 * when settled (lib/core/brand-comments.ts keeps them, lib/comments.ts
 * threads and counts them). Editors read the open ones before they publish,
 * so the counts are the point as much as the threads are.
 *
 * Three parts, which the builder places:
 * - useComments: the brand's threads, read on arrival, every 30 s while the
 *   tab is in view, and again when the window gets the focus back. Every
 *   write shows at once and is taken back, with a toast saying why, when the
 *   server refuses it.
 * - CommentsPanel: one page's threads, or one section's, with a box for a
 *   new comment on top.
 * - CommentBadge: the round pill a section wears with its open count.
 *
 * Requests go through the builder's transport, so the dev page records
 * them. Who may do what comes from /api/v1/me (components/can.tsx); where
 * nothing provides it, as on the dev page, controls show and the server
 * decides. Whose a comment is comes from the server (`mine`), which knows a
 * key from a person.
 */

/** A comment as GET .../comments sends it; `pending` while one written here is on its way. */
export type BrandComment = z.output<typeof Comment> & { pending?: boolean };
export type CommentThread = Thread<BrandComment>;
export { sectionKey };

/** What useComments gives the builder. */
export type Comments = {
  /** Every thread on the brand's pages: open ones first, the one that moved last on top. */
  threads: CommentThread[];
  /** Open threads per page slug. */
  byPage: Map<string, number>;
  /** Open threads per section, keyed by sectionKey(page, section id): ids repeat across pages. */
  bySection: Map<string, number>;
  /** Open threads on every page. */
  openCount: number;
  /** Read once; false until the first answer, or while the server can't be reached. */
  loaded: boolean;
  /** Why the last read failed; null when it didn't. */
  error: string | null;
  refresh(): Promise<void>;
  /** Each resolves to whether the server took it; a refusal has been toasted and taken back. */
  create(page: string, section: string | null, body: string): Promise<boolean>;
  reply(parentId: string, body: string): Promise<boolean>;
  resolve(id: string, resolved: boolean): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  edit(id: string, body: string): Promise<boolean>;
};

const POLL = 30_000;
const TMP = "tmp:";

/** Threads back to the rows they were made from: a first comment, then its replies. */
const flatten = (ts: CommentThread[]): BrandComment[] => ts.flatMap(({ replies, ...root }) => [root, ...replies]);

const why = (res: Sent, doing: string) => (res.ok ? "" : res.network ? "Couldn't reach the server." : (res.error?.message ?? `Couldn't ${doing}.`));

export function useComments(brand: string, transport: Transport): Comments {
  const me = useMe();
  const [rows, setRows] = useState<BrandComment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What work outliving a render reads: the latest rows, and a count of local changes, so a read
  // that set out before one of them doesn't put back what was there. And the caller's transport
  // as it is now: reads are keyed on the brand, never on the function, which can be new each
  // render (use-status.ts).
  const live = useRef({ rows, changes: 0, seq: 0, transport });
  useEffect(() => {
    live.current.transport = transport;
  });
  const base = `/api/v1/brands/${encodeURIComponent(brand)}/comments`;
  const author = me?.user?.name || me?.actor || "You";

  const commit = useCallback((next: BrandComment[]) => {
    live.current.rows = next;
    setRows(next);
  }, []);
  /** Change the rows here, before the server has answered. */
  const change = useCallback(
    (fn: (rows: BrandComment[]) => BrandComment[]) => {
      live.current.changes++;
      commit(fn(live.current.rows));
    },
    [commit],
  );

  const refresh = useCallback(async () => {
    const n = ++live.current.seq;
    const changes = live.current.changes;
    const res = await live.current.transport("GET", base);
    // A later read has been asked for, or a change was made here since: the newer state wins.
    if (n !== live.current.seq || changes !== live.current.changes) return;
    if (res.ok) {
      live.current.rows = flatten(res.data as CommentThread[]);
      setRows(live.current.rows);
      setLoaded(true);
    }
    setError(res.ok ? null : why(res, "read the comments"));
  }, [base]);

  // A new brand is a new set of comments: none shown until they are read.
  const [shownFor, setShownFor] = useState(brand);
  if (shownFor !== brand) {
    setShownFor(brand);
    setRows([]);
    setLoaded(false);
    setError(null);
  }
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Others comment too: every 30 s while the tab is in view, and at once when it is back.
  useEffect(() => {
    const seen = () => document.visibilityState === "visible";
    const t = setInterval(() => seen() && void refresh(), POLL);
    const back = () => seen() && void refresh();
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", back);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", back);
    };
  }, [refresh]);

  /** Put the server's answer in place of `id`, or take the change back and say why. */
  const settle = useCallback(
    (res: Sent, id: string, undo: (rows: BrandComment[]) => BrandComment[], doing: string) => {
      if (res.ok) {
        change((all) => all.map((c) => (c.id === id ? (res.data as BrandComment) : c)));
        return true;
      }
      change(undo);
      toast.error(`Couldn't ${doing}`, { description: why(res, doing) });
      return false;
    },
    [change],
  );

  const draft = useCallback(
    (at: Pick<BrandComment, "page" | "section" | "parent">, body: string): BrandComment => {
      const now = new Date().toISOString();
      return {
        id: `${TMP}${Math.random().toString(36).slice(2, 10)}`,
        ...at,
        body,
        author,
        authorId: me?.user?.id ?? null,
        mine: true,
        resolvedAt: null,
        resolvedBy: null,
        editedAt: null,
        createdAt: now,
        updatedAt: now,
        pending: true,
      };
    },
    [author, me?.user?.id],
  );

  const create = useCallback(
    async (page: string, section: string | null, body: string) => {
      const c = draft({ page, section, parent: null }, body.trim());
      change((all) => [...all, c]);
      const res = await transport("POST", base, { page, ...(section && { section }), body: c.body });
      return settle(res, c.id, (all) => all.filter((x) => x.id !== c.id), "post the comment");
    },
    [draft, change, transport, base, settle],
  );

  const reply = useCallback(
    async (parentId: string, body: string) => {
      const parent = live.current.rows.find((c) => c.id === parentId);
      const root = parent?.parent ? live.current.rows.find((c) => c.id === parent.parent) : parent;
      if (!root || root.pending) return false;
      const c = draft({ page: root.page, section: root.section, parent: root.id }, body.trim());
      const was = { resolvedAt: root.resolvedAt, resolvedBy: root.resolvedBy };
      // The server reopens a resolved thread that gets a reply; so does this, at once.
      change((all) => [...all.map((x) => (x.id === root.id ? { ...x, resolvedAt: null, resolvedBy: null } : x)), c]);
      const res = await transport("POST", base, { parent: root.id, body: c.body });
      return settle(res, c.id, (all) => all.filter((x) => x.id !== c.id).map((x) => (x.id === root.id ? { ...x, ...was } : x)), "post the reply");
    },
    [draft, change, transport, base, settle],
  );

  /** A PATCH, shown at once: `to` is what the comment looks like meanwhile. */
  const patch = useCallback(
    async (id: string, body: { body?: string; resolved?: boolean }, to: (c: BrandComment) => BrandComment, doing: string) => {
      const before = live.current.rows.find((c) => c.id === id);
      if (!before || before.pending) return false;
      change((all) => all.map((c) => (c.id === id ? to(c) : c)));
      const res = await transport("PATCH", `${base}/${encodeURIComponent(id)}`, body);
      return settle(res, id, (all) => all.map((c) => (c.id === id ? before : c)), doing);
    },
    [change, transport, base, settle],
  );

  const resolve = useCallback(
    (id: string, resolved: boolean) =>
      patch(
        id,
        { resolved },
        (c) => ({ ...c, resolvedAt: resolved ? (c.resolvedAt ?? new Date().toISOString()) : null, resolvedBy: resolved ? (c.resolvedBy ?? author) : null }),
        resolved ? "resolve the thread" : "reopen the thread",
      ),
    [patch, author],
  );

  const edit = useCallback(
    (id: string, body: string) => patch(id, { body: body.trim() }, (c) => ({ ...c, body: body.trim(), editedAt: new Date().toISOString() }), "save the comment"),
    [patch],
  );

  const remove = useCallback(
    async (id: string) => {
      const gone = live.current.rows.filter((c) => c.id === id || c.parent === id);
      if (!gone.length || gone.some((c) => c.pending)) return false;
      change((all) => all.filter((c) => !gone.includes(c)));
      const res = await transport("DELETE", `${base}/${encodeURIComponent(id)}`);
      if (res.ok) return true;
      change((all) => [...all, ...gone]);
      toast.error("Couldn't delete the comment", { description: why(res, "delete the comment") });
      return false;
    },
    [change, transport, base],
  );

  const threads = useMemo(() => thread(rows), [rows]);
  const counts = useMemo(() => openCounts(rows), [rows]);
  return { threads, byPage: counts.byPage, bySection: counts.bySection, openCount: counts.open, loaded, error, refresh, create, reply, resolve, remove, edit };
}

// ---- the panel ----------------------------------------------------------------

/**
 * One page's threads, or one section's when `section` is set, with a box
 * for a new comment on top. Resolved threads hide behind "Show resolved".
 * A thread on another section of the page names it (`sectionName`, else
 * "A section"), and a click on that picks the section in the canvas.
 *
 * Props:
 * - comments: useComments' answer.
 * - page: the page's slug.
 * - section: a section's id, to show and comment on it alone; null for the page.
 * - onPickSection: a thread's section was clicked.
 * - sectionName: a section's title by its id, for those links; undefined when it has none.
 */
export type CommentsPanelProps = {
  comments: Comments;
  page: string;
  section: string | null;
  onPickSection(id: string): void;
  sectionName?(id: string): string | undefined;
  className?: string;
};

/** Whether the person may do `action`; outside the app's provider (the dev page), the server decides. */
function useMay() {
  const me = useMe();
  const can = useCan();
  return (action: Action) => !me || can(action);
}

/** Minutes move on: "just now" becomes "3 minutes ago" without a new answer from the server. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function CommentsPanel({ comments, page, section, onPickSection, sectionName, className }: CommentsPanelProps) {
  const may = useMay();
  const now = useNow();
  const [resolved, setResolved] = useState(false);
  const toggle = useId();
  const here = comments.threads.filter((t) => t.page === page && (!section || t.section === section));
  const settled = here.filter((t) => t.resolvedAt).length;
  const shown = resolved ? here : here.filter((t) => !t.resolvedAt);
  const where = section ? "this section" : "this page";

  return (
    <div className={cn("app-tokens grid content-start gap-3 font-sans text-sm", className)}>
      {may("brand.comment") && (
        <Composer
          label={`Comment on ${where}`}
          action="Comment"
          onPost={(body) => comments.create(page, section, body)}
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          {here.length - settled === 1 ? "1 open thread" : `${here.length - settled || "No"} open threads`}
        </p>
        {settled > 0 && (
          <div className="flex items-center gap-2">
            <Switch id={toggle} size="sm" checked={resolved} onCheckedChange={setResolved} />
            <Label htmlFor={toggle} className="text-muted-foreground text-xs font-normal">
              Show resolved ({settled})
            </Label>
          </div>
        )}
      </div>
      {!comments.loaded ? (
        comments.error ? (
          <div className="grid justify-items-start gap-2">
            <p className="text-muted-foreground">{comments.error}</p>
            <Button variant="outline" size="sm" onClick={() => void comments.refresh()}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="grid gap-2" aria-busy>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )
      ) : shown.length ? (
        <ul className="grid gap-2">
          {shown.map((t) => (
            <li key={t.id}>
              <ThreadCard
                t={t}
                comments={comments}
                now={now}
                // Only where it isn't the section in view already.
                onPick={!section && t.section ? () => onPickSection(t.section!) : undefined}
                sectionName={t.section ? (sectionName?.(t.section) ?? "A section") : null}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground py-4 text-center">
          {settled ? `Every thread on ${where} is resolved.` : `No comments on ${where} yet.`}
        </p>
      )}
    </div>
  );
}

function ThreadCard({
  t,
  comments,
  now,
  onPick,
  sectionName,
}: {
  t: CommentThread;
  comments: Comments;
  now: number;
  onPick?: () => void;
  sectionName: string | null;
}) {
  const may = useMay();
  const done = !!t.resolvedAt;
  return (
    <article className={cn("bg-card grid gap-2 rounded-lg border p-3", done && "bg-muted/40", t.pending && "opacity-70")}>
      {(onPick || done) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {onPick && sectionName && (
            <button type="button" onClick={onPick} className="text-primary-ink truncate text-xs font-medium hover:underline">
              {sectionName}
            </button>
          )}
          {done && (
            <Badge variant="success" title={t.resolvedAt ? exact(t.resolvedAt) : undefined}>
              <IconCheck /> Resolved{t.resolvedBy ? ` by ${t.resolvedBy}` : ""}
            </Badge>
          )}
        </div>
      )}
      <Entry c={t} comments={comments} now={now}>
        {may("brand.comment") && !t.pending && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={done ? "Reopen the thread" : "Resolve the thread"}
            title={done ? "Reopen" : "Resolve"}
            onClick={() => void comments.resolve(t.id, !done)}
          >
            {done ? <IconRestore /> : <IconCheck />}
          </Button>
        )}
      </Entry>
      {t.replies.length > 0 && (
        <ul className="border-border grid gap-2 border-s ps-3">
          {t.replies.map((r) => (
            <li key={r.id}>
              <Entry c={r} comments={comments} now={now} />
            </li>
          ))}
        </ul>
      )}
      {may("brand.comment") && !t.pending && (
        <Composer compact label="Reply" action="Reply" onPost={(body) => comments.reply(t.id, body)} />
      )}
    </article>
  );
}

/** One comment: who, when, what; its own menu to edit it or delete it. `children`: more actions beside the menu. */
function Entry({ c, comments, now, children }: { c: BrandComment; comments: Comments; now: number; children?: React.ReactNode }) {
  const can = useCan();
  const me = useMe();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Anyone's, with brand.edit; outside the app's provider, one's own only, as the server will say.
  const deletable = c.mine || (!!me && can("brand.edit"));
  const replies = c.parent ? 0 : comments.threads.find((t) => t.id === c.id)?.replies.length ?? 0;

  return (
    <div className={cn("grid gap-1", c.pending && "opacity-70")}>
      <div className="flex items-center gap-2">
        <span className="truncate font-medium">{c.author}</span>
        <time dateTime={c.createdAt} title={exact(c.createdAt)} className="text-muted-foreground shrink-0 text-xs">
          {c.pending ? "Posting" : ago(c.createdAt, now)}
        </time>
        {c.editedAt && <span className="text-muted-foreground text-xs" title={exact(c.editedAt)}>(edited)</span>}
        <span className="ms-auto flex shrink-0 items-center gap-0.5">
          {children}
          {!c.pending && (c.mine || deletable) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label="Comment actions">
                  <IconDots />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="app-tokens">
                {c.mine && <DropdownMenuItem onSelect={() => setEditing(true)}>Edit</DropdownMenuItem>}
                {deletable && (
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </span>
      </div>
      {editing ? (
        <Composer
          compact
          initial={c.body}
          label="Edit the comment"
          action="Save"
          autoFocus
          keep
          onCancel={() => setEditing(false)}
          onPost={async (body) => {
            const ok = body === c.body || (await comments.edit(c.id, body));
            if (ok) setEditing(false);
            return ok;
          }}
        />
      ) : (
        <p className="break-words whitespace-pre-wrap">{c.body}</p>
      )}
      <Confirm
        open={deleting}
        onOpenChange={setDeleting}
        title={replies ? "Delete the thread?" : "Delete the comment?"}
        says={replies ? `Its ${replies === 1 ? "reply goes" : `${replies} replies go`} with it.` : undefined}
        action="Delete"
        run={() => comments.remove(c.id)}
      />
    </div>
  );
}

/**
 * A box to write in: ⌘/Ctrl+Enter posts, Esc cancels where there is
 * something to cancel. It empties as it posts, as a chat does, since the
 * comment shows in the list meanwhile; `keep` holds the text instead (an
 * edit, which closes once saved). What was written comes back when the post
 * fails, so it can be sent again. `compact` shows its button only once there
 * is text.
 */
function Composer({
  label,
  action,
  onPost,
  onCancel,
  initial = "",
  compact = false,
  keep = false,
  autoFocus = false,
}: {
  label: string;
  action: string;
  onPost(body: string): Promise<boolean>;
  onCancel?(): void;
  initial?: string;
  compact?: boolean;
  keep?: boolean;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const ready = text.trim().length > 0 && !busy;

  const post = async () => {
    if (!ready) return;
    setBusy(true);
    const body = text.trim();
    if (!keep) setText("");
    const ok = await onPost(body);
    setBusy(false);
    if (!ok) setText((t) => t || body);
  };

  return (
    <div className="grid gap-1.5">
      <Textarea
        aria-label={label}
        placeholder={label}
        value={text}
        maxLength={MAX_COMMENT}
        rows={compact ? 1 : 2}
        autoFocus={autoFocus}
        className={cn("resize-none", compact ? "min-h-8 py-1.5" : "min-h-16")}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void post();
          } else if (e.key === "Escape" && onCancel) {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
      />
      {(!compact || text || onCancel) && (
        <div className="flex items-center justify-end gap-2">
          <Kbd keys={["mod", "Enter"]} className="me-auto" />
          {onCancel && (
            <Button variant="ghost" size="xs" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button size="xs" disabled={!ready} onClick={() => void post()}>
            {action}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---- the badge ----------------------------------------------------------------

/**
 * The pill a section wears: its open threads, or the icon alone at 0 (a way
 * in to the first comment). In the app's colors, whatever the brand's page
 * around it looks like.
 */
export function CommentBadge({ count, onClick, className }: { count: number; onClick(): void; className?: string }) {
  const label = count ? `${count} open ${count === 1 ? "comment" : "comments"}` : "Comment";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "app-tokens inline-flex h-6 min-w-6 items-center justify-center gap-1 rounded-full px-1.5 font-sans text-xs font-medium tabular-nums shadow-sm transition-colors",
        "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
        count ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-background text-muted-foreground hover:text-foreground border",
        className,
      )}
    >
      <IconMessageCircle className="size-3.5" />
      {count > 0 && <span>{count}</span>}
    </button>
  );
}
