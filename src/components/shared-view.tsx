"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { IconDownload, IconLock, IconPhoto, IconUpload } from "@tabler/icons-react";
import { BrandMark, ThemeToggle, useAccent } from "@/components/brand";
import type { Brand } from "@/lib/branding";
import { Card } from "@/components/sign-in";
import { putWithProgress, UploadTray, type Upload } from "@/components/uploads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBytes } from "@/lib/filename";
import { pool } from "@/lib/pool";
import { cn } from "@/lib/utils";

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
  data: {
    id: string;
    filename: string;
    title: string | null;
    creator: string | null;
    copyright: string | null;
    mime: string;
    size: number;
    width: number | null;
    height: number | null;
    url: string;
    download: string;
    thumbnail: string | null;
  }[];
  total: number;
};

type State =
  | { at: "loading" }
  | { at: "error"; title: string; message: string }
  | { at: "password"; name: string | null; wrong: boolean; brand?: Brand }
  | { at: "open"; shared: Shared };

/**
 * /s/{token}: a share link, for someone without an account. It reads
 * /api/v1/shared/{token} like any client, sending the password in a header
 * once it is given; the password stays in this tab only.
 */
export function SharedView({ token }: { token: string }) {
  const [state, setState] = useState<State>({ at: "loading" });
  const password = useRef<string | null>(null);
  const headers = useCallback(
    (): HeadersInit => (password.current ? { "X-Share-Password": password.current } : {}),
    [],
  );

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/shared/${token}`, { headers: headers(), cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return setState({ at: "open", shared: body });
    const e = body.error ?? {};
    if (e.code === "password") return setState({ at: "password", name: e.detail?.name ?? null, wrong: !!password.current, brand: e.detail?.brand });
    setState({
      at: "error",
      title: e.code === "gone" ? "This link has expired" : "This link doesn't work",
      message: e.code === "gone" ? "Ask whoever sent it for a new one." : "It was revoked, or it was never a link here.",
    });
  }, [token, headers]);

  const brand = state.at === "open" ? state.shared.share.brand : state.at === "password" ? state.brand : undefined;
  useAccent(brand?.accent);
  useEffect(() => {
    if (brand) document.title = brand.name;
  }, [brand]);

  useEffect(() => {
    // The first fetch, and each one after a password: state follows the response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (state.at === "loading") return <Card title="Opening the link…">{null}</Card>;
  if (state.at === "error") return <Card title={state.title} lead={state.message}>{null}</Card>;
  if (state.at === "password") return <PasswordForm name={state.name} wrong={state.wrong} brand={state.brand} onSubmit={(p) => ((password.current = p), void load())} />;

  const { share } = state.shared;
  const title = share.name ?? share.target.label ?? "Shared";
  const from = [share.organization, share.workspace].filter(Boolean).join(" · ");
  return (
    <div className="min-h-svh">
      <header className="bg-background/95 sticky top-0 z-10 flex h-14 items-center gap-3 border-b px-4 backdrop-blur sm:px-8">
        <BrandMark brand={share.brand} className="size-7 max-w-24" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold">{title}</p>
          {from && <p className="text-muted-foreground truncate text-xs">Shared from {from}</p>}
        </div>
        <ThemeToggle />
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
        {share.kind === "upload" ? (
          <Dropzone token={token} headers={headers} into={share.target.label} expiresAt={share.expiresAt} />
        ) : (
          <Grid shared={state.shared} />
        )}
      </main>
    </div>
  );
}

function PasswordForm({ name, wrong, brand, onSubmit }: { name: string | null; wrong: boolean; brand?: Brand; onSubmit: (p: string) => void }) {
  const id = useId();
  return (
    <Card title={name ?? "This link is protected"} lead="Whoever shared it gave it a password." brand={brand}>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(String(new FormData(e.currentTarget).get("password") ?? ""));
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor={id}>Password</Label>
          <Input id={id} name="password" type="password" required autoFocus aria-invalid={wrong || undefined} />
          {wrong && <p className="text-destructive text-sm">That password isn&apos;t right.</p>}
        </div>
        <Button type="submit">
          <IconLock /> Open
        </Button>
      </form>
    </Card>
  );
}

function Grid({ shared }: { shared: Shared }) {
  if (!shared.data.length) {
    return <p className="text-muted-foreground py-24 text-center">Nothing here yet.</p>;
  }
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {shared.total} {shared.total === 1 ? "file" : "files"}
        {shared.share.expiresAt && ` · until ${new Date(shared.share.expiresAt).toLocaleDateString()}`}
      </p>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {shared.data.map((a) => (
          <li key={a.id} className="group overflow-hidden rounded-lg border">
            <a href={a.url} target="_blank" rel="noreferrer" className="bg-muted flex aspect-square items-center justify-center">
              {a.thumbnail ? (
                // Renditions are already sized and cached: next/image would only resize them again.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.thumbnail} alt={a.title ?? a.filename} className="size-full object-contain" loading="lazy" />
              ) : (
                <IconPhoto className="text-muted-foreground size-8" />
              )}
            </a>
            <div className="flex items-center gap-2 p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={a.title ?? a.filename}>
                  {a.title ?? a.filename}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {[a.width && a.height ? `${a.width}×${a.height}` : null, formatBytes(a.size), a.creator && `© ${a.creator}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Button variant="ghost" size="icon-sm" asChild>
                <a href={a.download} aria-label={`Download ${a.filename}`} title="Download">
                  <IconDownload />
                </a>
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {shared.total > shared.data.length && (
        <p className="text-muted-foreground text-center text-sm">The first {shared.data.length} are shown.</p>
      )}
    </div>
  );
}

/** Send files in, like the library's own upload: straight to storage, then handed in for review. */
function Dropzone({
  token,
  headers,
  into,
  expiresAt,
}: {
  token: string;
  headers: () => HeadersInit;
  into: string | null;
  expiresAt: string | null;
}) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const track = (id: string, patch: Partial<Upload>) => setUploads((us) => us.map((u) => (u.id === id ? { ...u, ...patch } : u)));

  async function send(files: File[]) {
    const batch = files.map((file) => ({ file, id: crypto.randomUUID() }));
    setUploads((us) => [...us, ...batch.map(({ file, id }) => ({ id, name: file.name, size: file.size, loaded: 0, status: "queued" as const }))]);
    const json = { ...headers(), "Content-Type": "application/json" };
    await pool(batch, 3, async ({ file, id }) => {
      const mime = file.type || "application/octet-stream";
      try {
        track(id, { status: "uploading" });
        const ticket = await fetch(`/api/v1/shared/${token}/uploads`, {
          method: "POST",
          headers: json,
          body: JSON.stringify({ filename: file.name, mime, size: file.size }),
        });
        if (!ticket.ok) throw new Error((await ticket.json()).error?.message ?? "Upload failed");
        const { token: staged, uploadUrl } = await ticket.json();
        await putWithProgress(uploadUrl, file, mime, (loaded) => track(id, { loaded }));
        track(id, { status: "saving", loaded: file.size });
        const done = await fetch(`/api/v1/shared/${token}/assets`, {
          method: "POST",
          headers: json,
          body: JSON.stringify({ token: staged, filename: file.name, mime }),
        });
        if (!done.ok) throw new Error((await done.json()).error?.message ?? "Couldn't hand it in");
        track(id, { status: "done" });
      } catch (e) {
        track(id, { status: "failed", error: e instanceof Error ? e.message : "Upload failed" });
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Send files{into ? ` for ${into}` : ""}</h1>
        <p className="text-muted-foreground text-sm">
          No account needed. What you send is reviewed before it is used.
          {expiresAt && ` This link works until ${new Date(expiresAt).toLocaleDateString()}.`}
        </p>
      </div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer.files.length) void send([...e.dataTransfer.files]);
        }}
        className={cn(
          "text-muted-foreground flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-16 transition-colors",
          over ? "border-primary bg-primary/5 text-foreground" : "hover:bg-muted/50",
        )}
      >
        <IconUpload className="size-8" />
        <span className="text-sm">Drop files here, or click to pick them</span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) void send([...e.target.files]);
          e.target.value = "";
        }}
      />
      <UploadTray uploads={uploads} onDismiss={() => setUploads([])} />
    </div>
  );
}
