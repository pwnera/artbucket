"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { IconCircleCheck, IconCloudUpload, IconExternalLink, IconLock, IconRefresh, IconUpload } from "@tabler/icons-react";
import { BrandMark, ThemeToggle, useAccent } from "@/components/brand";
import { Downloads, LocalDate, meta, PublicGrid, Stage, type PublicItem } from "@/components/public-grid";
import { Card } from "@/components/sign-in";
import { GridSkeleton } from "@/components/skeletons";
import { isActive, putWithProgress, UploadTray, type Upload } from "@/components/uploads";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Brand } from "@/lib/branding";
import { inkOn } from "@/lib/color";
import { pool } from "@/lib/pool";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  filename: string;
  title: string | null;
  description: string | null;
  creator: string | null;
  copyright: string | null;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  url: string;
  download: string;
  thumbnail: string | null;
};

type Shared = {
  share: {
    kind: "view" | "upload";
    name: string | null;
    workspace: string | null;
    organization: string | null;
    target: { type: string; label: string | null };
    expiresAt: string | null;
    brand: Brand;
  };
  data: Item[];
  total: number;
};

/** GET /api/v1/shared/{token}'s body, whatever its status: the page's server render passes the first one. */
export type SharedBody = Partial<Shared> & {
  error?: { code?: string; message?: string; detail?: { name?: string | null; brand?: Brand } };
};

type Locked = { at: "password"; name: string | null; wrong: boolean; note?: string; brand?: Brand };
type State = { at: "loading" } | { at: "error"; title: string; message: string; retry?: boolean } | Locked | { at: "open"; shared: Shared };

/**
 * What a response means for the page. `wrong`: a password was just typed, so
 * a refusal says it isn't right. `was` is what showed before, for a refusal
 * that doesn't say whose link it is.
 */
function next(body: SharedBody, wrong: boolean, was: State): State {
  if (body.share) return { at: "open", shared: body as Shared };
  const e = body.error ?? {};
  if (e.code === "password") return { at: "password", name: e.detail?.name ?? null, wrong, brand: e.detail?.brand };
  if (e.code === "rate_limited" && was.at === "password") return { ...was, wrong: false, note: e.message };
  if (e.code === "gone") return { at: "error", title: "This link has expired", message: "Ask whoever sent it for a new one." };
  if (e.code === "not_found") return { at: "error", title: "This link doesn't work", message: "It was revoked, or it was never a link here." };
  // A passing failure (a 500, the rate limit) isn't a revoked link: say so, and offer another go.
  return { at: "error", title: "This link didn't open", message: e.message ?? "Something went wrong on our side. Try again in a moment.", retry: true };
}

// This tab's storage can refuse (a private window); the password still works until a reload.
const kept = (k: string) => {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
};
const keep = (k: string, v: string | null) => {
  try {
    if (v === null) sessionStorage.removeItem(k);
    else sessionStorage.setItem(k, v);
  } catch {}
};

/** As a portal's tile: a preview from the same signed rendition, the download, and the original to open or play. */
const toPublic = (a: Item): PublicItem => ({
  ...a,
  preview: a.thumbnail?.replace("/w_640,", "/w_1600,") ?? null,
  downloads: [{ label: "Original", hint: "The file as uploaded", url: a.download, filename: a.filename }],
  original: a.url,
});

/** The organization's accent on this page's own tree, from the first paint (useAccent reaches menus and dialogs). */
const accentVars = (accent: string | null | undefined) =>
  accent ? ({ "--primary": accent, "--primary-foreground": inkOn(accent), "--ring": accent } as React.CSSProperties) : undefined;

/**
 * /s/{token}: a share link, for someone without an account. It reads
 * /api/v1/shared/{token} like any client; the server renders the first answer
 * (`initial`). A password goes in a header, and is kept in this tab once it
 * worked.
 */
export function SharedView({ token, initial, asset = null }: { token: string; initial: SharedBody | null; asset?: string | null }) {
  const [state, setState] = useState<State>(() => (initial ? next(initial, false, { at: "loading" }) : { at: "loading" }));
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState(false);
  const password = useRef<string | null>(null);
  const latest = useRef(state);
  const store = `share:${token}:password`;
  useEffect(() => {
    latest.current = state;
  });
  const headers = useCallback((): HeadersInit => (password.current ? { "X-Share-Password": password.current } : {}), []);

  const load = useCallback(async (typed = false) => {
    const sent = password.current;
    setPending(true);
    try {
      const res = await fetch(`/api/v1/shared/${token}`, { headers: headers(), cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as SharedBody;
      if (res.ok && sent) keep(store, sent);
      if (!res.ok && body.error?.code === "password" && sent) {
        password.current = null;
        keep(store, null);
      }
      setState(next(body, typed && !!sent, latest.current));
    } catch {
      // At the door, the door stays, saying why.
      const was = latest.current;
      const offline = "Couldn't reach the server. Check the connection and try again.";
      setState(was.at === "password" ? { ...was, wrong: false, note: offline } : { at: "error", title: "Couldn't reach the link", message: offline, retry: true });
    } finally {
      setPending(false);
    }
  }, [token, headers, store]);

  useEffect(() => {
    // The server rendered what anyone sees; a password this tab kept may open more.
    password.current = kept(store);
    const now = latest.current;
    if (now.at === "loading" || (now.at === "password" && password.current)) {
      setChecking(true);
      void load().finally(() => setChecking(false));
    }
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const brand = state.at === "open" ? state.shared.share.brand : state.at === "password" ? state.brand : undefined;
  useAccent(brand?.accent);

  if (state.at === "loading" || (checking && state.at === "password")) {
    return (
      <div role="status" aria-label="Opening the link" className="min-h-svh" style={accentVars(brand?.accent)}>
        <div className="flex h-14 items-center gap-3 border-b px-4 sm:px-8">
          <Skeleton className="size-7 rounded-lg" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-8">
          <Skeleton className="h-8 w-64" />
          <GridSkeleton count={8} />
        </div>
      </div>
    );
  }
  if (state.at === "error") {
    return (
      <Card title={state.title} lead={state.message}>
        {state.retry ? (
          <Button variant="outline" className="w-full" pending={pending} onClick={() => void load()}>
            <IconRefresh /> Try again
          </Button>
        ) : null}
      </Card>
    );
  }
  if (state.at === "password") {
    return (
      <div style={accentVars(brand?.accent)}>
        <PasswordForm
          state={state}
          onSubmit={(p) => {
            password.current = p;
            return load(true);
          }}
        />
      </div>
    );
  }

  const { share } = state.shared;
  const title = share.name ?? share.target.label ?? "Shared";
  const from = [share.organization, share.workspace].filter(Boolean).join(" · ");
  const single = share.target.type === "asset" && state.shared.data.length === 1;
  return (
    <div className="min-h-svh" style={accentVars(share.brand.accent)}>
      <header className="bg-background/95 sticky top-0 z-10 flex h-14 items-center gap-3 border-b px-4 backdrop-blur sm:px-8">
        <BrandMark brand={share.brand} className="size-7 max-w-24" />
        <p className="text-muted-foreground min-w-0 flex-1 truncate text-sm">{from ? `Shared from ${from}` : "Shared with you"}</p>
        <ThemeToggle />
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
        {share.kind === "upload" ? (
          <Dropzone token={token} headers={headers} into={share.target.label} expiresAt={share.expiresAt} />
        ) : single ? (
          <Single item={toPublic(state.shared.data[0])} expiresAt={share.expiresAt} />
        ) : (
          <Listing token={token} headers={headers} title={title} shared={state.shared} asset={asset} />
        )}
      </main>
    </div>
  );
}

function PasswordForm({ state, onSubmit }: { state: Locked; onSubmit: (p: string) => Promise<unknown> }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const problem = state.note ?? (state.wrong ? "That password isn't right." : null);
  useEffect(() => {
    // After a wrong one, the whole password is selected, ready to retype.
    if (state.wrong) input.current?.select();
  }, [state]);
  return (
    <Card title={state.name ?? "This link is protected"} lead="Whoever shared it gave it a password." brand={state.brand}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          await onSubmit(String(new FormData(e.currentTarget).get("password") ?? ""));
          setBusy(false);
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor={id}>Password</Label>
          <PasswordInput
            ref={input}
            id={id}
            name="password"
            required
            autoFocus
            autoComplete="current-password"
            aria-invalid={!!problem || undefined}
            aria-describedby={problem ? `${id}-err` : undefined}
          />
          {problem && (
            <p id={`${id}-err`} role="alert" className="text-destructive text-sm">
              {problem}
            </p>
          )}
        </div>
        <Button type="submit" pending={busy}>
          <IconLock /> Open
        </Button>
      </form>
    </Card>
  );
}

/** A link to one asset: a delivery, not a file index. */
function Single({ item, expiresAt }: { item: PublicItem; expiresAt: string | null }) {
  return (
    <article className="mx-auto grid max-w-4xl gap-6">
      <Stage item={item} className="max-h-[70svh] min-h-64 rounded-xl border [&>img]:max-h-[70svh]" />
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{item.title ?? item.filename}</h1>
          <p className="text-muted-foreground text-sm tabular-nums">{[meta(item), item.copyright].filter(Boolean).join(" · ")}</p>
          {item.description && <p className="pt-2 text-sm">{item.description}</p>}
          {expiresAt && <p className="text-muted-foreground text-xs">This link works until <LocalDate at={expiresAt} />.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {item.original && (
            <Button variant="outline" size="lg" asChild>
              <a href={item.original} target="_blank" rel="noreferrer">
                <IconExternalLink /> Open original
              </a>
            </Button>
          )}
          <Downloads item={item} variant="default" size="lg" />
        </div>
      </div>
    </article>
  );
}

/** A collection's approved assets, a page at a time: more load as the end comes into view, or with the button. */
function Listing({ token, headers, title, shared, asset }: { token: string; headers: () => HeadersInit; title: string; shared: Shared; asset: string | null }) {
  const [items, setItems] = useState(shared.data);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const { total } = shared;
  const left = items.length < total;

  const loadMore = useCallback(async () => {
    setMore(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/v1/shared/${token}?offset=${items.length}`, { headers: headers(), cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as Shared;
      setItems((xs) => [...xs, ...body.data.filter((a) => !xs.some((x) => x.id === a.id))]);
    } catch {
      setFailed(true);
    } finally {
      setMore(false);
    }
  }, [token, headers, items.length]);

  useEffect(() => {
    const el = end.current;
    if (!el || !left || more || failed) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && void loadMore(), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [left, more, failed, loadMore]);

  if (!items.length) {
    return (
      <div className="py-24 text-center">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-2 text-sm">Nothing here yet. Check back soon.</p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight break-words">{title}</h1>
        <p className="text-muted-foreground text-sm">
          {total} {total === 1 ? "file" : "files"}
          {shared.share.expiresAt && (
            <>
              {" "}
              · until <LocalDate at={shared.share.expiresAt} />
            </>
          )}
        </p>
      </div>
      <PublicGrid items={items.map(toPublic)} asset={asset} />
      {left && (
        <div ref={end} className="flex flex-col items-center gap-2">
          <p className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
            {items.length} of {total}
          </p>
          <Button variant="outline" pending={more} onClick={() => void loadMore()}>
            {failed ? "Try again" : "Show more"}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Send files in, like the library's own upload: straight to storage, then handed in for review. */
function Dropzone({ token, headers, into, expiresAt }: { token: string; headers: () => HeadersInit; into: string | null; expiresAt: string | null }) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const files = useRef(new Map<string, File>());
  const input = useRef<HTMLInputElement>(null);

  const run = useCallback(
    async (batch: { file: File; id: string }[]) => {
      const patch = (id: string, p: Partial<Upload>) => setUploads((us) => us.map((u) => (u.id === id ? { ...u, ...p } : u)));
      const json = { ...headers(), "Content-Type": "application/json" };
      await pool(batch, 3, async ({ file, id }) => {
        const mime = file.type || "application/octet-stream";
        try {
          patch(id, { status: "uploading" });
          const ticket = await fetch(`/api/v1/shared/${token}/uploads`, {
            method: "POST",
            headers: json,
            body: JSON.stringify({ filename: file.name, mime, size: file.size }),
          });
          if (!ticket.ok) throw new Error((await ticket.json().catch(() => null))?.error?.message ?? "Upload failed");
          const { token: staged, uploadUrl } = await ticket.json();
          await putWithProgress(uploadUrl, file, mime, (loaded) => patch(id, { loaded }));
          patch(id, { status: "saving", loaded: file.size });
          const done = await fetch(`/api/v1/shared/${token}/assets`, {
            method: "POST",
            headers: json,
            body: JSON.stringify({ token: staged, filename: file.name, mime }),
          });
          if (!done.ok) throw new Error((await done.json().catch(() => null))?.error?.message ?? "Couldn't hand it in");
          patch(id, { status: "done" });
        } catch (e) {
          patch(id, { status: "failed", error: e instanceof Error ? e.message : "Upload failed" });
        }
      });
    },
    [token, headers],
  );

  const send = useCallback(
    (list: File[]) => {
      const batch = list.map((file) => ({ file, id: crypto.randomUUID() }));
      for (const b of batch) files.current.set(b.id, b.file);
      setUploads((us) => [...us, ...batch.map(({ file, id }) => ({ id, name: file.name, size: file.size, loaded: 0, status: "queued" as const }))]);
      void run(batch);
    },
    [run],
  );

  useEffect(() => {
    // The whole page takes the drop: a file that misses the box would open in the tab and end the page.
    const carries = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!carries(e)) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (carries(e)) e.preventDefault();
    };
    const leave = (e: DragEvent) => {
      if (!carries(e)) return;
      depth.current -= 1;
      if (depth.current <= 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!carries(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      if (e.dataTransfer?.files.length) send([...e.dataTransfer.files]);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [send]);

  const active = uploads.some(isActive);
  useEffect(() => {
    // Closing the tab mid-upload would drop files silently: the browser asks first.
    if (!active) return;
    const stay = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", stay);
    return () => window.removeEventListener("beforeunload", stay);
  }, [active]);

  const allDone = uploads.length > 0 && uploads.every((u) => u.status === "done" || u.status === "deduped");
  const retry = (id: string) => {
    const file = files.current.get(id);
    if (!file) return;
    setUploads((us) => us.map((u) => (u.id === id ? { ...u, status: "queued", loaded: 0, error: undefined } : u)));
    void run([{ file, id }]);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Send files{into ? ` for ${into}` : ""}</h1>
        <p className="text-muted-foreground text-sm">
          No account needed. What you send is reviewed before it is used.
          {expiresAt && (
            <>
              {" "}
              This link works until <LocalDate at={expiresAt} />.
            </>
          )}
        </p>
      </div>
      {allDone && (
        <div role="status" className="animate-in fade-in-0 flex items-start gap-3 rounded-xl border p-4">
          <IconCircleCheck className="text-success mt-0.5 size-5 shrink-0" />
          <div className="space-y-0.5">
            <p className="text-sm font-medium">
              Thank you: {uploads.length} {uploads.length === 1 ? "file" : "files"} sent for review
            </p>
            <p className="text-muted-foreground text-sm">Someone will look them over before they are used. Send more any time.</p>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={cn(
          "text-muted-foreground flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-16 transition-colors [&>*]:pointer-events-none",
          dragging ? "border-primary bg-primary/5 text-foreground" : "hover:bg-muted/50",
        )}
      >
        <IconUpload className="size-8" />
        <span className="text-sm">Drop files or choose them</span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) send([...e.target.files]);
          e.target.value = "";
        }}
      />
      <UploadTray
        inline
        uploads={uploads}
        onDismiss={() => (setUploads([]), files.current.clear())}
        onRetry={retry}
        labels={{ done: "Sent", finished: (n) => `${n} sent for review` }}
      />
      {dragging && (
        <div className="bg-background/80 animate-in fade-in-0 pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm duration-150">
          <div className="border-primary/40 bg-muted/50 flex size-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed">
            <IconCloudUpload className="size-10" stroke={1.5} />
            <p className="text-lg font-medium">Drop to send{into ? ` for ${into}` : ""}</p>
          </div>
        </div>
      )}
    </div>
  );
}
