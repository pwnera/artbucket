"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { IconCheck, IconCopy, IconFolderUp, IconLink, IconLock, IconPlus, IconShare, IconTrash, IconUsers, IconWorld } from "@tabler/icons-react";
import { Snippet } from "@/components/agent-access";
import { useCan, useMe } from "@/components/can";
import { send } from "@/components/collections";
import { Confirm } from "@/components/confirm";
import { CopyButton, copyText } from "@/components/copy-button";
import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { sendResult } from "@/lib/send";
import { ago } from "@/lib/time";

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

/** The first of them that can't be an address; a loose check, the server has the last word. */
const badEmail = (raw: string) => emailsIn(raw).find((e) => !/.+@.+\..+/.test(e)) ?? null;

const WORKSPACE = "workspace";

/** Unambiguous characters only: a password read aloud or retyped from a message. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const generated = () => Array.from(crypto.getRandomValues(new Uint32Array(12)), (n) => ALPHABET[n % ALPHABET.length]).join("");

/** A date as the date input holds it, in the maker's own day, not UTC's. */
const localDay = (d: Date) => d.toLocaleDateString("en-CA");
const inDays = (n: number) => localDay(new Date(Date.now() + n * 86_400_000));
const PRESETS = [
  { value: "1", label: "1 day" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "never", label: "Never" },
];

const MODES = {
  team: { label: "Team", icon: IconUsers, hint: "People who can already see it in the library. Anyone else is asked to sign in." },
  link: { label: "Link", icon: IconLink, hint: "Anyone with the link can look and download, without an account." },
  public: { label: "Public", icon: IconWorld, hint: "Anyone at all, at a URL that never changes: for embedding on a site." },
} as const;
type Mode = keyof typeof MODES;

/**
 * Make a link for someone without an account: to look at a collection or an
 * asset and download it, or to send files into a collection for review. It
 * can expire, ask for a password, and go straight to people by email.
 * Without a collection or asset given, it asks which (`collections`). Links
 * already made for the same thing come first, to copy or revoke, so nobody
 * makes a second one to resend the first.
 *
 * An asset asks one question: who can open it. People with access (its link
 * in the library), anyone with a link (the page above), or anyone at all
 * (public, for embedding). A file link for anyone, for a while, is in Sizes
 * and formats. `onChanged` hears the asset back when public changes;
 * `onMade` hears that the links changed (one made or revoked).
 */
export function ShareDialog(props: ShareProps) {
  // Callers keep it mounted while closed and swap `target`: every opening starts over, so
  // one asset's made link, tab or half-typed form never shows up in the next one's dialog.
  const open = props.open ?? true;
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((n) => n + 1);
  }
  return <Share key={session} {...props} />;
}

type ShareProps = {
  target: ShareTarget;
  /** False plays the close animation while the parent keeps it mounted. */
  open?: boolean;
  /** To pick from, when the target has none yet. */
  collections?: { id: string; name: string }[];
  onClose: () => void;
  onMade?: () => void;
  onChanged?: (asset: { id: string; public: boolean }) => void;
};

function Share({
  target,
  collections = [],
  open = true,
  onClose,
  onMade,
  onChanged,
}: ShareProps) {
  const id = useId();
  const can = useCan();
  const me = useMe();
  const manage = can("share.manage");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [made, setMade] = useState<ShareLink | null>(null);
  const [sent, setSent] = useState<{ emailed: number } | { error: string } | null>(null);
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [fresh, setFresh] = useState(false);
  const [emails, setEmails] = useState("");
  const [bad, setBad] = useState<string | null>(null);
  const [expires, setExpires] = useState("");
  const [password, setPassword] = useState("");
  const emailsRef = useRef<HTMLInputElement>(null);
  const upload = target.kind === "upload";
  const choosing = !target.collection && !target.asset;
  const choices = collections.filter((c) => can(upload ? "collection.collect" : "collection.share", c));
  const intoWorkspace = upload && can("share.collect_workspace");
  // Nothing preselected: a skim past the picker must not share whichever collection sorts first.
  const [picked, setPicked] = useState(!choices.length && intoWorkspace ? WORKSPACE : "");
  const chosen = target.collection ?? (choosing ? choices.find((c) => c.id === picked) : undefined);
  const what = chosen?.name ?? target.asset?.name ?? "the workspace";
  const shareable = target.asset?.shareable !== false;
  const [mode, setMode] = useState<Mode>(target.asset?.public && shareable ? "public" : shareable ? "link" : "team");

  useEffect(() => {
    // Only someone who may list links sees them; anyone else simply makes one.
    if (!manage) return;
    let live = true;
    fetch("/api/v1/shares", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((b) => live && setLinks(b.data ?? []))
      .catch(() => live && setLinks([]));
    return () => {
      live = false;
    };
  }, [manage]);

  const existing = (links ?? []).filter(
    (l) =>
      !l.expired &&
      l.kind === target.kind &&
      (target.asset
        ? l.target.type === "asset" && l.target.id === target.asset.id
        : chosen
          ? l.target.type === "collection" && l.target.id === chosen.id
          : picked === WORKSPACE && l.target.type === "workspace"),
  );

  async function revoke(l: ShareLink) {
    const r = await send("DELETE", `/api/v1/shares/${l.id}`);
    if (!r) return null;
    setLinks((xs) => xs?.filter((x) => x.id !== l.id) ?? null);
    toast.success("Revoked: the link no longer opens");
    onMade?.();
    return r;
  }

  async function make(form: FormData) {
    const wrong = badEmail(emails);
    if (wrong) {
      setBad(wrong);
      return emailsRef.current?.focus();
    }
    const to = emailsIn(emails);
    setBusy(true);
    // Made first, emailed after: a mail failure can't hide a link that already exists.
    const link: ShareLink | null = await send("POST", "/api/v1/shares", {
      kind: target.kind,
      collection: chosen?.id,
      asset: target.asset?.id,
      name: String(form.get("name") ?? "").trim() || undefined,
      password: password || undefined,
      // The last day it works, through the end of that day, where the person making it is.
      expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : undefined,
    });
    if (!link) return setBusy(false);
    setMade(link);
    setLinks((xs) => xs && [link, ...xs]);
    onMade?.();
    if (to.length) {
      const r = await sendResult("POST", `/api/v1/shares/${link.id}/send`, { emails: to }, { quiet: true });
      setSent(r.ok ? { emailed: r.data.emailed } : { error: r.network ? "the server couldn't be reached" : (r.error?.message?.replace(/^Not sent: /, "") ?? "it didn't go through") });
    }
    setBusy(false);
  }

  const lead =
    existing.length > 0 ? (
      <div className="grid gap-2">
        <p className="text-sm font-medium">{existing.length === 1 ? "Its link" : `Its ${existing.length} links`}</p>
        <ul className="divide-y rounded-md border">
          {existing.map((l) => (
            <li key={l.id} className="flex items-center gap-1 py-1.5 pr-1.5 pl-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-medium">
                  <span className="truncate">{l.name ?? l.target.label ?? "Link"}</span>
                  {l.password && <IconLock className="text-muted-foreground size-3.5 shrink-0" aria-label="Asks for a password" />}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {l.expiresAt ? `Until ${new Date(l.expiresAt).toLocaleDateString()}` : "Until revoked"} · made {ago(l.createdAt)}
                </p>
              </div>
              <CopyButton text={l.url} label="Copy the link" what="the link" size="icon-sm" />
              <Confirm title="Revoke this link?" says="It stops working at once, for everyone who has it." action="Revoke" run={() => revoke(l)}>
                <IconButton variant="ghost" label="Revoke" className="text-muted-foreground hover:text-destructive">
                  <IconTrash />
                </IconButton>
              </Confirm>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  const picker = choosing && (
    <div className="grid gap-2">
      <Label htmlFor={`${id}-where`}>{upload ? "Files go into" : "Collection"}</Label>
      <Select value={picked} onValueChange={setPicked}>
        <SelectTrigger id={`${id}-where`} className="w-full" autoFocus>
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
  );

  const preset = expires === "" ? "never" : (PRESETS.find((p) => p.value !== "never" && inDays(Number(p.value)) === expires)?.value ?? "");

  const body = made ? (
    <Made link={made} password={password} sent={sent} mailing={busy} onClose={onClose} />
  ) : (
    <div className="grid gap-4">
      {picker}
      {lead}
      {lead && !fresh ? (
        <DialogFooter>
          <Button variant="outline" onClick={() => setFresh(true)}>
            <IconPlus /> New link
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      ) : (
        <form
          className="grid gap-4"
          onChange={() => setDirty(true)}
          onSubmit={(e) => {
            e.preventDefault();
            void make(new FormData(e.currentTarget));
          }}
        >
          {lead && <p className="text-sm font-medium">New link</p>}
          <div className="grid gap-2">
            <Label htmlFor={`${id}-name`}>What they see it called</Label>
            <Input key={what} id={`${id}-name`} name="name" maxLength={120} defaultValue={upload ? `Uploads for ${what}` : what} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-emails`}>Send it to</Label>
            {/* Text, not type=email multiple: pasted from Outlook, addresses come with semicolons and spaces. */}
            <Input
              ref={emailsRef}
              id={`${id}-emails`}
              value={emails}
              onChange={(e) => {
                setEmails(e.target.value);
                if (bad) setBad(badEmail(e.target.value));
              }}
              onBlur={() => setBad(badEmail(emails))}
              placeholder="photographer@studio.com, agency@example.com"
              disabled={!me?.email}
              aria-invalid={!!bad || undefined}
              aria-describedby={`${id}-emails-hint`}
            />
            <p id={`${id}-emails-hint`} className={bad ? "text-destructive text-xs" : "text-muted-foreground text-xs"} role={bad ? "alert" : undefined}>
              {bad ? (
                <>&ldquo;{bad}&rdquo; isn&apos;t an email address.</>
              ) : me?.email ? (
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
          <div className="grid gap-2">
            <Label htmlFor={`${id}-expires`}>Last day</Label>
            <div className="flex flex-wrap items-center gap-2">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={preset}
                onValueChange={(v) => {
                  if (!v) return;
                  setExpires(v === "never" ? "" : inDays(Number(v)));
                  setDirty(true);
                }}
                aria-label="How long it works"
              >
                {PRESETS.map((p) => (
                  <ToggleGroupItem key={p.value} value={p.value}>
                    {p.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <Input id={`${id}-expires`} type="date" value={expires} min={localDay(new Date())} onChange={(e) => setExpires(e.target.value)} className="w-40" />
            </div>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={`${id}-password`}>Password</Label>
              <Button type="button" variant="link" size="xs" className="h-auto px-0" onClick={() => (setPassword(generated()), setDirty(true))}>
                Generate
              </Button>
            </div>
            <div className="flex items-start gap-1">
              <div className="flex-1">
                <PasswordInput
                  id={`${id}-password`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={4}
                  autoComplete="new-password"
                  placeholder="None"
                />
              </div>
              {password && <CopyButton text={password} label="Copy the password" what="the password" size="icon" />}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" pending={busy} disabled={choosing && !picked}>
              <IconLink /> Make link
            </Button>
          </DialogFooter>
        </form>
      )}
    </div>
  );

  const done = (
    <DialogFooter>
      <Button variant="outline" onClick={onClose}>
        Done
      </Button>
    </DialogFooter>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" guard={{ dirty: dirty && !made, onDiscard: onClose }}>
        <DialogHeader>
          <DialogTitle className="flex min-w-0 items-start gap-2 pr-6 leading-snug">
            {upload ? <IconFolderUp className="size-5 shrink-0" /> : <IconShare className="size-5 shrink-0" />}
            <span className="min-w-0 break-words">{upload ? `Request uploads${choosing ? "" : ` into ${what}`}` : `Share ${choosing ? "a collection" : what}`}</span>
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
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="gap-3">
            <TabsList className="w-full">
              {(Object.keys(MODES) as Mode[]).map((m) => {
                const M = MODES[m];
                return (
                  <TabsTrigger key={m} value={m} disabled={m !== "team" && !shareable}>
                    <M.icon /> {M.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
            <p className="text-muted-foreground text-xs">
              {shareable ? MODES[mode].hint : "It goes outside once it is approved, by someone who may share it."}
            </p>
            <TabsContent value="team" className="grid gap-4">
              <TeamLink id={target.asset.id} />
              {done}
            </TabsContent>
            <TabsContent value="link" className="grid gap-3">
              {body}
            </TabsContent>
            <TabsContent value="public" className="grid gap-4">
              <PublicToggle asset={target.asset} onChanged={onChanged} />
              {done}
            </TabsContent>
          </Tabs>
        ) : (
          body
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The link, made: copied already when the browser allowed it (quietly, since
 * Safari refuses a write that follows a round trip), and one click otherwise.
 */
function Made({
  link,
  password,
  sent,
  mailing,
  onClose,
}: {
  link: ShareLink;
  password: string;
  sent: { emailed: number } | { error: string } | null;
  mailing: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [auto, setAuto] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flash = () => {
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };
  useEffect(() => {
    let live = true;
    navigator.clipboard?.writeText(link.url).then(
      () => live && setAuto(true),
      () => {},
    );
    return () => {
      live = false;
      clearTimeout(timer.current);
    };
  }, [link.url]);
  return (
    <div className="grid gap-3">
      <Snippet text={link.url} what="the link" />
      {link.password && password && <Snippet text={password} what="the password" />}
      {sent && "error" in sent && (
        <p role="alert" className="text-destructive text-sm">
          Couldn&apos;t email it: {sent.error}. Copy the link instead.
        </p>
      )}
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {auto && "It's on your clipboard. "}
        {mailing && "Emailing it… "}
        {sent && "emailed" in sent && sent.emailed > 0 && `Emailed to ${sent.emailed} ${sent.emailed === 1 ? "person" : "people"}. `}
        {link.password && (
          <>
            <IconLock className="mr-1 inline size-3.5" />
            It asks for the password: send that separately.{" "}
          </>
        )}
        {link.expiresAt ? `It works until ${new Date(link.expiresAt).toLocaleDateString()}.` : "It works until you revoke it."} Every link is in{" "}
        <Link href="/team?tab=sharing" className="underline underline-offset-2">
          Team
        </Link>
        .
      </p>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
        <Button onClick={async () => (await copyText(link.url, { what: "the link" })) && flash()}>
          {copied ? <IconCheck className="animate-in zoom-in-50" /> : <IconCopy />}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </DialogFooter>
    </div>
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
          <DialogTitle className="pr-6 leading-snug break-words">Send {link.name ?? link.target.label ?? "the link"}</DialogTitle>
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
              <Button type="submit" pending={busy}>
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
    <div className="grid gap-3 pt-1">
      <Snippet text={href} what="the link" />
      <p className="text-muted-foreground text-sm">Only people who can already see it in the library can open this. Anyone else is asked to sign in.</p>
    </div>
  );
}

/**
 * Served at /a/{id} to anyone while it stays approved: for embedding on a
 * site. No undo toast: the switch is its own undo, where it was flipped.
 */
function PublicToggle({ asset, onChanged }: { asset: { id: string; public?: boolean }; onChanged?: (a: { id: string; public: boolean }) => void }) {
  const fieldId = useId();
  const [on, setOn] = useState(!!asset.public);
  const [busy, setBusy] = useState(false);
  const url = typeof window === "undefined" ? "" : new URL(`/a/${asset.id}`, window.location.origin).href;
  return (
    <div className="grid gap-3 pt-1">
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
