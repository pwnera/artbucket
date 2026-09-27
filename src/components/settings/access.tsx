"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import {
  IconBuilding,
  IconFolder,
  IconHistory,
  IconLayoutGrid,
  IconLink,
  IconLock,
  IconMail,
  IconPhoto,
  IconPlus,
  IconShare,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";
import type { Me } from "@/components/account";
import { can } from "@/lib/permissions";
import { Snippet } from "@/components/agent-access";
import { copy } from "@/components/brand-values";
import { send } from "@/components/collections";
import type { ShareLink } from "@/components/share-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SidebarData } from "@/lib/sidebar";
import type { Scope } from "@/lib/scopes";
import { ago, exact } from "@/lib/time";

type Resource = "organization" | "workspace" | "collection" | "asset";
type Grant = { id: string; resource: Resource; resourceId: string; workspaceId: string | null; label: string | null; scope: Scope };
type Invitation = { id: string; email: string; resource: Resource; resourceId: string; label: string | null; scope: Scope; invitedBy: string; expiresAt: string };
export type Members = { data: { id: string; name: string; email: string; grants: Grant[] }[]; invitations: Invitation[] };
type AuditEntry = { id: string; at: string; actor: string; action: string; target: string | null; detail: Record<string, unknown> | null; ip: string | null };
export type AuditPage = { data: AuditEntry[]; next: string | null };

const SCOPES: { scope: Scope; label: string; hint: string }[] = [
  { scope: "read", label: "Viewer", hint: "Search, look, download" },
  { scope: "propose", label: "Contributor", hint: "Also upload and suggest; it waits for review" },
  { scope: "write", label: "Editor", hint: "Also edit, approve, delete, and share links" },
  { scope: "admin", label: "Admin", hint: "Also manage people and keys" },
];
const scopeName = (s: Scope) => SCOPES.find((x) => x.scope === s)?.label ?? s;
const ICON: Record<Resource, typeof IconFolder> = { organization: IconBuilding, workspace: IconLayoutGrid, collection: IconFolder, asset: IconPhoto };

// ---- people -----------------------------------------------------------------

type Where = { resource: Resource; resourceId: string; label: string };

/** The organization's people and their grants, and invitations waiting. */
export function People({ me, members, collections }: { me: Me; members: Members; collections: SidebarData["collections"] }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<{ kind: "invite" } | { kind: "grant"; user: { id: string; name: string } } | null>(null);
  // Where a grant can be: the organization (its admins only), this workspace, or one of its collections.
  const places: Where[] = [
    ...(can(me, "organization.manage") ? [{ resource: "organization" as const, resourceId: me.workspace.organization.id, label: `${me.workspace.organization.name} (every workspace)` }] : []),
    { resource: "workspace", resourceId: me.workspace.id, label: `${me.workspace.name} (this workspace)` },
    ...collections.map((c) => ({ resource: "collection" as const, resourceId: c.id, label: `${c.name} (collection)` })),
  ];
  const refresh = () => router.refresh();

  async function change(g: Grant, userId: string, scope: Scope) {
    if (await send("POST", "/api/v1/grants", { user: userId, resource: g.resource, resourceId: g.resourceId, scope })) {
      toast.success(`Now ${scopeName(scope).toLowerCase()} on ${g.label}`);
      refresh();
    }
  }
  async function remove(g: Grant) {
    if (await send("DELETE", `/api/v1/grants/${g.id}`)) refresh();
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-sm font-semibold">
            People <span className="text-muted-foreground font-normal">{members.data.length}</span>
          </h2>
          <Button size="sm" onClick={() => setDialog({ kind: "invite" })}>
            <IconMail /> Invite
          </Button>
        </div>
        <ul className="divide-y rounded-lg border">
          {members.data.map((m) => (
            <li key={m.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.name}
                  {m.id === me.user?.id && <span className="text-muted-foreground font-normal"> (you)</span>}
                </p>
                <p className="text-muted-foreground truncate text-xs">{m.email}</p>
              </div>
              <div className="flex flex-col gap-1.5 sm:items-end">
                {m.grants.map((g) => (
                  <GrantRow key={g.id} grant={g} onScope={(s) => change(g, m.id, s)} onRemove={() => remove(g)} />
                ))}
                <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => setDialog({ kind: "grant", user: m })}>
                  <IconPlus /> Access to more
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {members.invitations.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">
            Invited <span className="text-muted-foreground font-normal">{members.invitations.length}</span>
          </h2>
          <ul className="divide-y rounded-lg border">
            {members.invitations.map((i) => {
              const I = ICON[i.resource];
              return (
                <li key={i.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <IconMail className="text-muted-foreground size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{i.email}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      <I className="mr-1 inline size-3.5" />
                      {scopeName(i.scope)} on {i.label} · by {i.invitedBy} · expires {ago(i.expiresAt)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Withdraw the invitation to ${i.email}`}
                    title="Withdraw"
                    onClick={async () => (await send("DELETE", `/api/v1/invitations/${i.id}`)) && refresh()}
                  >
                    <IconX />
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {dialog && <GrantDialog dialog={dialog} places={places} onClose={() => setDialog(null)} onDone={refresh} />}
    </div>
  );
}

function GrantRow({ grant: g, onScope, onRemove }: { grant: Grant; onScope: (s: Scope) => void; onRemove: () => void }) {
  const I = ICON[g.resource];
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs" title={g.resource}>
        <I className="size-3.5 shrink-0" />
        <span className="truncate">{g.label ?? g.resource}</span>
      </span>
      <Select value={g.scope} onValueChange={(v) => onScope(v as Scope)}>
        <SelectTrigger size="sm" className="h-7 w-32" aria-label={`Scope on ${g.label}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {SCOPES.map((s) => (
            <SelectItem key={s.scope} value={s.scope}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="ghost" size="icon-xs" aria-label={`Remove access to ${g.label}`} title="Remove" onClick={onRemove}>
        <IconTrash />
      </Button>
    </div>
  );
}

/** Invite someone new, or give a member access to one more thing. */
function GrantDialog({
  dialog,
  places,
  onClose,
  onDone,
}: {
  dialog: { kind: "invite" } | { kind: "grant"; user: { id: string; name: string } };
  places: Where[];
  onClose: () => void;
  onDone: () => void;
}) {
  const id = useId();
  const [where, setWhere] = useState(`${places.find((p) => p.resource === "workspace")!.resource}:${places.find((p) => p.resource === "workspace")!.resourceId}`);
  const [scope, setScope] = useState<Scope>("read");
  const [link, setLink] = useState<{ url: string; emailed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [resource, resourceId] = where.split(":") as [Resource, string];

  async function submit(form: FormData) {
    setBusy(true);
    const made =
      dialog.kind === "invite"
        ? await send("POST", "/api/v1/invitations", { email: String(form.get("email") ?? "").trim(), resource, resourceId, scope })
        : await send("POST", "/api/v1/grants", { user: dialog.user.id, resource, resourceId, scope });
    setBusy(false);
    if (!made) return;
    onDone();
    if (dialog.kind === "invite") setLink({ url: made.url, emailed: made.emailed });
    else onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dialog.kind === "invite" ? "Invite someone" : `More access for ${dialog.user.name}`}</DialogTitle>
          <DialogDescription>
            {dialog.kind === "invite"
              ? "They get a link to make an account, or sign in, and join. It works once, for a week."
              : "Access adds up and reaches down: editor on a collection is editor on everything in it."}
          </DialogDescription>
        </DialogHeader>
        {link ? (
          <div className="grid gap-3">
            <Snippet text={link.url} what="the invitation link" />
            <p className="text-muted-foreground text-sm">
              {link.emailed
                ? "We emailed it to them. The link is here too, this once, in case it lands in spam."
                : "Send it to them: it is shown this once. Turn on email in Settings to have invitations sent."}
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
              void submit(new FormData(e.currentTarget));
            }}
          >
            {dialog.kind === "invite" && (
              <div className="grid gap-2">
                <Label htmlFor={`${id}-email`}>Email</Label>
                <Input id={`${id}-email`} name="email" type="email" required autoFocus />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor={`${id}-where`}>On</Label>
              <Select value={where} onValueChange={setWhere}>
                <SelectTrigger id={`${id}-where`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {places.map((p) => (
                    <SelectItem key={p.resourceId} value={`${p.resource}:${p.resourceId}`}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${id}-scope`}>As</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
                <SelectTrigger id={`${id}-scope`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPES.map((s) => (
                    <SelectItem key={s.scope} value={s.scope}>
                      {s.label} <span className="text-muted-foreground">· {s.hint}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {dialog.kind === "invite" ? "Make the invitation" : "Give access"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---- share links ------------------------------------------------------------

/** Every share link on what you may share, to copy or revoke. */
export function Sharing({ shares: initial }: { shares: ShareLink[] }) {
  const [shares, setShares] = useState(initial);
  if (!shares.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconShare />
          </EmptyMedia>
          <EmptyTitle>No share links</EmptyTitle>
          <EmptyDescription>
            Share a collection, or collect uploads into one, from its menu in the sidebar; an asset, from its dialog.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <ul className="divide-y rounded-lg border">
      {shares.map((s) => (
        <li key={s.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
          {s.kind === "upload" ? <IconUpload className="text-muted-foreground size-4 shrink-0" /> : <IconLink className="text-muted-foreground size-4 shrink-0" />}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate font-medium">
              {s.name ?? s.target.label ?? "Untitled"}
              {s.password && <IconLock className="text-muted-foreground size-3.5" aria-label="Password" />}
              {s.expired && <Badge variant="outline">Expired</Badge>}
            </p>
            <p className="text-muted-foreground truncate text-xs">
              {s.kind === "upload" ? "Uploads into" : "Shows"} {s.target.label ?? "the workspace"} · by {s.createdBy} ·{" "}
              {s.expiresAt ? `until ${new Date(s.expiresAt).toLocaleDateString()}` : "no end date"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => copy(s.url, "the link")}>
            Copy link
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Revoke ${s.name ?? "this link"}`}
            title="Revoke"
            onClick={async () => {
              if (!(await send("DELETE", `/api/v1/shares/${s.id}`))) return;
              setShares((xs) => xs.filter((x) => x.id !== s.id));
              toast.success("Revoked: the link no longer works");
            }}
          >
            <IconTrash />
          </Button>
        </li>
      ))}
    </ul>
  );
}

// ---- audit ------------------------------------------------------------------

const SAYS: Record<string, string> = {
  "user.signed_up": "made an account",
  "user.signed_in": "signed in",
  "organization.created": "made the organization",
  "organization.renamed": "renamed the organization to",
  "workspace.created": "made the workspace",
  "workspace.renamed": "renamed a workspace to",
  "grant.set": "gave access to",
  "grant.removed": "took access from",
  "invitation.created": "invited",
  "invitation.revoked": "withdrew the invitation to",
  "invitation.accepted": "accepted an invitation as",
  "key.created": "made the API key",
  "key.revoked": "revoked the API key",
  "share.created": "made a share link to",
  "share.revoked": "revoked a share link to",
  "setting.changed": "changed the setting",
  "setting.reset": "reset the setting",
  "email.failed": "couldn't email",
};

/** Detail as a short phrase: "editor on Autumn 26". */
function detail(d: Record<string, unknown> | null) {
  if (!d) return null;
  const parts = [
    typeof d.scope === "string" && (d.on ? `${scopeName(d.scope as Scope).toLowerCase()} on ${d.on}` : scopeName(d.scope as Scope).toLowerCase()),
    typeof d.kind === "string" && `${d.kind} link`,
    d.password === true && "with a password",
    typeof d.from === "string" && `was ${d.from}`,
    Array.isArray(d.changed) && d.changed.length > 0 && `changed ${d.changed.join(", ")}`,
    typeof d.error === "string" && d.error,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** Who changed who may do what, newest first. */
export function Audit({ first }: { first: AuditPage }) {
  const [items, setItems] = useState(first.data);
  const [next, setNext] = useState(first.next);
  async function more() {
    if (!next) return;
    const res = await fetch(`/api/v1/audit?before=${encodeURIComponent(next)}`);
    if (!res.ok) return;
    const page: AuditPage = await res.json();
    setItems((xs) => [...xs, ...page.data.filter((p) => !xs.some((x) => x.id === p.id))]);
    setNext(page.next);
  }
  if (!items.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconHistory />
          </EmptyMedia>
          <EmptyTitle>Nothing yet</EmptyTitle>
          <EmptyDescription>Sign-ins, access changes, invitations, keys and share links are recorded here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-lg border">
        {items.map((e) => (
          <li key={e.id} className="flex items-start gap-3 px-3 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <p className="leading-6">
                <span className="font-medium">{e.actor}</span> <span className="text-muted-foreground">{SAYS[e.action] ?? e.action}</span>{" "}
                {e.target && <span className="font-medium">{e.target}</span>}
              </p>
              {(detail(e.detail) || e.ip) && (
                <p className="text-muted-foreground text-xs">{[detail(e.detail), e.ip && `from ${e.ip}`].filter(Boolean).join(" · ")}</p>
              )}
            </div>
            <time dateTime={e.at} title={exact(e.at)} className="text-muted-foreground shrink-0 text-xs" suppressHydrationWarning>
              {ago(e.at)}
            </time>
          </li>
        ))}
      </ul>
      {next && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={more}>
            Load older
          </Button>
        </div>
      )}
    </div>
  );
}
