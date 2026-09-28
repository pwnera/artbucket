"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { IconFolderUp, IconLock, IconShare } from "@tabler/icons-react";
import { Snippet } from "@/components/agent-access";
import { useCan, useMe } from "@/components/can";
import { send } from "@/components/collections";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type ShareTarget = {
  kind: "view" | "upload";
  collection?: { id: string; name: string };
  /** `public`: served at /a/{id} to anyone already. `shareable`: approved, and the caller may share it; else only its team link. */
  asset?: { id: string; name: string; public?: boolean; shareable?: boolean };
};

export type ShareLink = {
  id: string;
  kind: "view" | "upload";
  name: string | null;
  target: { type: "collection" | "asset" | "workspace"; id: string | null; label: string | null };
  url: string;
  password: boolean;
  expiresAt: string | null;
  expired: boolean;
  createdBy: string;
  createdAt: string;
};

/** "a@x.com, b@y.com" or one per line, to a list. */
export const emailsIn = (raw: string) =>
  raw
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);

const WORKSPACE = "workspace";

/**
 * Make a link for someone without an account: to look at a collection or an
 * asset and download it, or to send files into a collection for review. It
 * can expire, ask for a password, and go straight to people by email.
 * Without a collection or asset given, it asks which (`collections`).
 *
 * An asset asks one question: who can open it. People with access (its link
 * in the library), anyone with a link (the page above), or anyone at all
 * (public, for embedding). A file link for anyone, for a while, is in Sizes
 * and formats. `onChanged` hears the asset back when public changes.
 */
export function ShareDialog({
  target,
  collections = [],
  onClose,
  onMade,
  onChanged,
}: {
  target: ShareTarget;
  /** To pick from, when the target has none yet. */
  collections?: { id: string; name: string }[];
  onClose: () => void;
  onMade?: () => void;
  onChanged?: (asset: { id: string; public: boolean }) => void;
}) {
  const id = useId();
  const can = useCan();
  const me = useMe();
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<(ShareLink & { emailed: number }) | null>(null);
  const upload = target.kind === "upload";
  const choosing = !target.collection && !target.asset;
  const choices = collections.filter((c) => can(upload ? "collection.collect" : "collection.share", c));
  const intoWorkspace = upload && can("share.collect_workspace");
  const [picked, setPicked] = useState(choices[0]?.id ?? (intoWorkspace ? WORKSPACE : ""));
  const chosen = target.collection ?? (choosing ? choices.find((c) => c.id === picked) : undefined);
  const what = chosen?.name ?? target.asset?.name ?? "the workspace";
  const shareable = target.asset?.shareable !== false;
  const [mode, setMode] = useState<"team" | "link" | "public">(shareable ? "link" : "team");

  async function make(form: FormData) {
    const expires = String(form.get("expires") ?? "");
    const password = String(form.get("password") ?? "");
    const emails = emailsIn(String(form.get("emails") ?? ""));
    setBusy(true);
    const link = await send("POST", "/api/v1/shares", {
      kind: target.kind,
      collection: chosen?.id,
      asset: target.asset?.id,
      name: String(form.get("name") ?? "").trim() || undefined,
      password: password || undefined,
      // The last day it works, through the end of that day, where the person making it is.
      expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : undefined,
      emails: emails.length ? emails : undefined,
    });
    setBusy(false);
    if (!link) return;
    setMade(link);
    onMade?.();
  }

  const body = made ? (
    <div className="grid gap-3">
      <Snippet text={made.url} what="the link" />
      <p className="text-muted-foreground text-sm">
        {made.emailed > 0 && `Emailed to ${made.emailed} ${made.emailed === 1 ? "person" : "people"}. `}
        {made.password && (
          <>
            <IconLock className="mr-1 inline size-3.5" />
            It asks for the password: send that separately.{" "}
          </>
        )}
        {made.expiresAt ? `It works until ${new Date(made.expiresAt).toLocaleDateString()}.` : "It works until you revoke it."}{" "}
        Every link is in{" "}
        <Link href="/team?tab=sharing" className="underline underline-offset-2">
          Team
        </Link>
        .
      </p>
      <DialogFooter>
        <Button onClick={onClose}>Done</Button>
      </DialogFooter>
    </div>
  ) : (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void make(new FormData(e.currentTarget));
      }}
    >
      {choosing && (
        <div className="grid gap-2">
          <Label htmlFor={`${id}-where`}>{upload ? "Files go into" : "Collection"}</Label>
          <Select value={picked} onValueChange={setPicked}>
            <SelectTrigger id={`${id}-where`} className="w-full">
              <SelectValue placeholder="Pick one" />
            </SelectTrigger>
            <SelectContent>
              {choices.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
              {intoWorkspace && <SelectItem value={WORKSPACE}>The workspace, no collection</SelectItem>}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor={`${id}-name`}>What they see it called</Label>
        <Input
          key={what}
          id={`${id}-name`}
          name="name"
          maxLength={120}
          defaultValue={upload ? `Uploads for ${what}` : what}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-emails`}>Send it to</Label>
        <Input id={`${id}-emails`} name="emails" placeholder="photographer@studio.com, agency@example.com" disabled={!me?.email} />
        <p className="text-muted-foreground text-xs">
          {me?.email ? (
            "Optional. They get it by email; the link is also shown here."
            ) : (
            <>
              Email is off: copy the link instead.{" "}
              {can("organization.manage") && (
                <Link href="/settings/organization/email" className="underline underline-offset-2">
                  Turn it on
                </Link>
              )}
            </>
          )}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor={`${id}-expires`}>Last day</Label>
          <Input id={`${id}-expires`} name="expires" type="date" min={new Date().toISOString().slice(0, 10)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-password`}>Password</Label>
          <Input id={`${id}-password`} name="password" type="password" minLength={4} autoComplete="new-password" placeholder="None" />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || (choosing && !picked && !target.asset)}>
          Make link
        </Button>
      </DialogFooter>
    </form>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {upload ? <IconFolderUp className="size-5" /> : <IconShare className="size-5" />}
            {upload ? `Request uploads${choosing ? "" : ` into ${what}`}` : `Share ${choosing ? "a collection" : what}`}
          </DialogTitle>
          <DialogDescription>
            {upload
              ? "Anyone with the link can send files, without an account. They land in Review, not in the library, until someone approves them."
              : target.asset
                ? "Who can open it?"
                : "Anyone with the link can see and download its approved assets, without an account."}
          </DialogDescription>
        </DialogHeader>
        {target.asset && !upload ? (
          <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
            <TabsList className="w-full">
              <TabsTrigger value="team">People with access</TabsTrigger>
              <TabsTrigger value="link" disabled={!shareable}>
                Anyone with the link
              </TabsTrigger>
              <TabsTrigger value="public" disabled={!shareable}>
                Public
              </TabsTrigger>
            </TabsList>
            {!shareable && <p className="text-muted-foreground text-xs">It goes outside once it is approved, by someone who may share it.</p>}
            <TabsContent value="team">
              <TeamLink id={target.asset.id} />
            </TabsContent>
            <TabsContent value="link" className="grid gap-3">
              {body}
            </TabsContent>
            <TabsContent value="public">
              <PublicToggle asset={target.asset} onChanged={onChanged} />
            </TabsContent>
          </Tabs>
        ) : (
          body
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Email an existing link to more people. */
export function SendLinkDialog({ link, onClose }: { link: ShareLink; onClose: () => void }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send {link.name ?? link.target.label ?? "the link"}</DialogTitle>
          <DialogDescription>
            {link.kind === "upload" ? "They get a link to send files in, no account needed." : "They get a link to look and download, no account needed."}
            {link.password && " Send them the password separately."}
          </DialogDescription>
        </DialogHeader>
        {sent !== null ? (
          <>
            <p className="text-sm">
              Sent to {sent} {sent === 1 ? "person" : "people"}.
            </p>
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const emails = emailsIn(String(new FormData(e.currentTarget).get("emails") ?? ""));
              if (!emails.length) return;
              setBusy(true);
              const r = await send("POST", `/api/v1/shares/${link.id}/send`, { emails });
              setBusy(false);
              if (r) setSent(r.emailed);
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor={id}>Email addresses</Label>
              <Input id={id} name="emails" required autoFocus placeholder="photographer@studio.com, agency@example.com" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                Send
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The asset in the library: it opens for people with access to it, and nobody else. */
function TeamLink({ id }: { id: string }) {
  const href = typeof window === "undefined" ? "" : new URL(`/?asset=${id}`, window.location.origin).href;
  return (
    <div className="grid gap-3 pt-2">
      <Snippet text={href} what="the link" />
      <p className="text-muted-foreground text-sm">Only people who can already see it in the library can open this. Anyone else is asked to sign in.</p>
    </div>
  );
}

/** Served at /a/{id} to anyone while it stays approved: for embedding on a site. */
function PublicToggle({ asset, onChanged }: { asset: { id: string; public?: boolean }; onChanged?: (a: { id: string; public: boolean }) => void }) {
  const fieldId = useId();
  const [on, setOn] = useState(!!asset.public);
  const [busy, setBusy] = useState(false);
  const url = typeof window === "undefined" ? "" : new URL(`/a/${asset.id}`, window.location.origin).href;
  return (
    <div className="grid gap-3 pt-2">
      <div className="flex items-center gap-3">
        <Switch
          id={fieldId}
          checked={on}
          disabled={busy}
          onCheckedChange={async (next) => {
            setBusy(true);
            const a = await send("PATCH", `/api/v1/assets/${asset.id}`, { public: next });
            setBusy(false);
            if (!a) return;
            setOn(a.public);
            onChanged?.(a);
          }}
        />
        <Label htmlFor={fieldId}>{on ? "Anyone with the URL gets the file" : "Off: only people with access"}</Label>
      </div>
      {on && <Snippet text={url} what="the URL" />}
      <p className="text-muted-foreground text-sm">
        For embedding on a site or in an email: the URL never changes, and works while the asset stays approved and unexpired. Archive it, or turn this off, and it stops.
      </p>
    </div>
  );
}
