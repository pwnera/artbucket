"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import {
  IconAdjustmentsHorizontal,
  IconBuilding,
  IconCopy,
  IconFolder,
  IconFolderUp,
  IconHistory,
  IconLayoutGrid,
  IconLink,
  IconLock,
  IconMail,
  IconPhoto,
  IconPlus,
  IconRefresh,
  IconSend,
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
import { SendLinkDialog, ShareDialog, type ShareLink } from "@/components/share-dialog";
import { useMe } from "@/components/can";
import { IconButton } from "@/components/icon-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SidebarData } from "@/lib/sidebar";
import { allows, type Scope } from "@/lib/scopes";
import { ABILITIES, type Ability } from "@/lib/access";
import { ago, exact } from "@/lib/time";

type Resource = "organization" | "workspace" | "collection" | "asset";
type Grant = { id: string; resource: Resource; resourceId: string; workspaceId: string | null; label: string | null; scope: Scope; limits: Ability[] };
type Invitation = {
  id: string;
  email: string;
  resource: Resource;
  resourceId: string;
  label: string | null;
  scope: Scope;
  limits: Ability[];
  invitedBy: string;
  expiresAt: string;
  /** Its link, to copy again; null when it can't be opened any more. */
  url: string | null;
};
export type Members = { data: { id: string; name: string; email: string; grants: Grant[] }[]; invitations: Invitation[] };
type AuditEntry = { id: string; at: string; actor: string; action: string; target: string | null; detail: Record<string, unknown> | null; ip: string | null };
export type AuditPage = { data: AuditEntry[]; next: string | null };

const SCOPES: { scope: Scope; label: string; hint: string }[] = [
  { scope: "read", label: "Viewer", hint: "Search, look, download" },
  { scope: "propose", label: "Contributor", hint: "Also upload and suggest; it waits for review" },
  { scope: "write", label: "Editor", hint: "Also edit, approve, delete, and share links" },
  { scope: "admin", label: "Admin", hint: "Also manage people and keys" },
];
/** What an editor's or admin's grant can have off (lib/access.ts). */
const ABILITY: Record<Ability, string> = {
  approve: "Approve uploads and tags",
  delete: "Delete assets and collections",
  share: "Share links and upload requests",
  setup: "Manage fields and brand",
};
/** "Editor, no delete or share": the role with what it has off. */
const NOT: Record<Ability, string> = { approve: "approving", delete: "deleting", share: "sharing", setup: "setup" };
const roleName = (scope: Scope, limits: Ability[] = []) =>
  limits.length && allows(scope, "write") ? `${scopeName(scope)}, no ${ABILITIES.filter((a) => limits.includes(a)).map((a) => NOT[a]).join(" or ")}` : scopeName(scope);
const ORDER: Scope[] = ["read", "propose", "write", "admin"];
const scopeName = (s: Scope) => SCOPES.find((x) => x.scope === s)?.label ?? s;
const ICON: Record<Resource, typeof IconFolder> = { organization: IconBuilding, workspace: IconLayoutGrid, collection: IconFolder, asset: IconPhoto };

// ---- people -----------------------------------------------------------------

type Where = { resource: Resource; resourceId: string; label: string };

/**
 * People and their grants, and invitations waiting: the whole organization
 * (Team), or `view="workspace"`, only who can open this workspace and what
 * they may do in it (Settings). Each grant is changed only by whoever may
 * manage what it is on.
 */
export function People({
  me,
  members,
  collections,
  view = "organization",
  inviting = false,
}: {
  me: Me;
  members: Members;
  collections: SidebarData["collections"];
  view?: "organization" | "workspace";
  /** Open with the invite dialog up: ⌘K's "Invite people". */
  inviting?: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<{ kind: "invite" } | { kind: "grant"; user: { id: string; name: string } } | null>(
    inviting ? { kind: "invite" } : null,
  );
  const [resent, setResent] = useState<{ email: string; url: string; emailed: boolean } | null>(null);
  const manages = (g: Pick<Grant, "resource">) => can(me, g.resource === "organization" ? "organization.manage" : "member.manage");
  // Where a grant can be: the organization (its admins, and not from a workspace's view), this workspace, or one of its collections.
  const places: Where[] = [
    ...(view === "organization" && can(me, "organization.manage") ? [{ resource: "organization" as const, resourceId: me.workspace.organization.id, label: `${me.workspace.organization.name} (every workspace)` }] : []),
    { resource: "workspace", resourceId: me.workspace.id, label: `${me.workspace.name} (this workspace)` },
    ...collections.map((c) => ({ resource: "collection" as const, resourceId: c.id, label: `${c.name} (${c.private ? "private " : ""}collection)` })),
  ];
  const refresh = () => router.refresh();

  async function change(g: Grant, userId: string, scope: Scope, limits?: Ability[]) {
    if (await send("POST", "/api/v1/grants", { user: userId, resource: g.resource, resourceId: g.resourceId, scope, limits })) {
      toast.success(`Now ${roleName(scope, limits ?? g.limits).toLowerCase()} on ${g.label}`);
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
            {view === "workspace" ? `Who can open ${me.workspace.name}` : "People"}{" "}
            <span className="text-muted-foreground font-normal">{members.data.length}</span>
          </h2>
          <Button size="sm" onClick={() => setDialog({ kind: "invite" })}>
            <IconMail /> Invite people
          </Button>
        </div>
        <ul className="divide-y rounded-lg border">
          {members.data.map((m) => (
            <li key={m.id} className="flex flex-col gap-2 px-3 py-3 lg:flex-row lg:items-start">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.name}
                  {m.id === me.user?.id && <span className="text-muted-foreground font-normal"> (you)</span>}
                </p>
                <p className="text-muted-foreground truncate text-xs">{m.email}</p>
                {view === "workspace" && <p className="mt-1 text-xs">{roleHere(m.grants, me.workspace.id)}</p>}
              </div>
              <div className="flex flex-col gap-1.5 lg:items-end">
                {m.grants.map((g) => (
                  <GrantRow
                    key={g.id}
                    grant={g}
                    editable={manages(g)}
                    onScope={(s) => change(g, m.id, s)}
                    onLimits={(l) => change(g, m.id, g.scope, l)}
                    onRemove={() => remove(g)}
                  />
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
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                  <IconMail className="text-muted-foreground size-4 shrink-0" />
                  <div className="min-w-48 flex-1">
                    <p className="truncate font-medium">{i.email}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      <I className="mr-1 inline size-3.5" />
                      {roleName(i.scope, i.limits)} on {i.label} · by {i.invitedBy} · expires {ago(i.expiresAt)}
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                  {i.url && (
                    <IconButton variant="ghost" label="Copy link" onClick={() => copy(i.url!, "the invitation link")}>
                      <IconCopy />
                    </IconButton>
                  )}
                  <IconButton
                    variant="ghost"
                    label="Send again: a new link and a new week"
                    onClick={async () => {
                      const r = await send("POST", `/api/v1/invitations/${i.id}/resend`);
                      if (!r) return;
                      setResent({ email: i.email, url: r.url, emailed: r.emailed });
                      refresh();
                    }}
                  >
                    <IconRefresh />
                  </IconButton>
                  <IconButton
                    variant="ghost"
                    label={`Withdraw the invitation to ${i.email}`}
                    onClick={async () => (await send("DELETE", `/api/v1/invitations/${i.id}`)) && refresh()}
                  >
                    <IconX />
                  </IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {members.data.length > 0 && members.invitations.length === 0 && view === "organization" && (
        <p className="text-muted-foreground text-sm">No invitations waiting.</p>
      )}

      {dialog && <GrantDialog me={me} dialog={dialog} places={places} onClose={() => setDialog(null)} onDone={refresh} />}
      {resent && (
        <Dialog open onOpenChange={(o) => !o && setResent(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Invitation for {resent.email}</DialogTitle>
              <DialogDescription>A new link, good for a week. The one sent before no longer works.</DialogDescription>
            </DialogHeader>
            <InviteLink me={me} url={resent.url} emailed={resent.emailed} />
            <DialogFooter>
              <Button onClick={() => setResent(null)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/** "Admin here, through the organization": what someone may do in this workspace, and why. */
function roleHere(grants: Grant[], workspaceId: string) {
  const org = grants.find((g) => g.resource === "organization");
  const ws = grants.find((g) => g.resource === "workspace" && g.resourceId === workspaceId);
  const top = [org, ws].filter(Boolean).sort((a, b) => ORDER.indexOf(b!.scope) - ORDER.indexOf(a!.scope))[0];
  if (!top) return <span className="text-muted-foreground">Some collections or assets only</span>;
  return (
    <>
      <Badge variant="outline">{scopeName(top.scope)}</Badge>{" "}
      <span className="text-muted-foreground">{top.resource === "organization" ? "through the organization" : "in this workspace"}</span>
    </>
  );
}

/** A new invitation's link, and whether it went by email; where to turn email on when it didn't. */
function InviteLink({ me, url, emailed }: { me: Me; url: string; emailed: boolean }) {
  return (
    <div className="grid gap-2">
      <Snippet text={url} what="the invitation link" />
      <p className="text-muted-foreground text-sm">
        {emailed ? (
          "We emailed it to them. The link is here too, this once, in case it lands in spam."
        ) : (
          <>
            Send it to them yourself: it is shown this once.{" "}
            {can(me, "organization.manage") && (
              <Link href="/settings/organization/email" className="underline underline-offset-2">
                Turn on email
              </Link>
            )}
            {can(me, "organization.manage") && " to have invitations sent."}
          </>
        )}
      </p>
    </div>
  );
}

function GrantRow({
  grant: g,
  editable,
  onScope,
  onLimits,
  onRemove,
}: {
  grant: Grant;
  editable: boolean;
  onScope: (s: Scope) => void;
  onLimits: (l: Ability[]) => void;
  onRemove: () => void;
}) {
  const I = ICON[g.resource];
  const where = (
    <span className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs" title={g.resource}>
      <I className="size-3.5 shrink-0" />
      <span className="truncate">{g.label ?? g.resource}</span>
    </span>
  );
  if (!editable) {
    return (
      <div className="flex items-center gap-1.5" title="Changed by the organization's admins">
        {where}
        <Badge variant="outline">{roleName(g.scope, g.limits)}</Badge>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      {where}
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
      {allows(g.scope, "write") && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              variant="ghost"
              size="icon-xs"
              label={g.limits.length ? roleName(g.scope, g.limits) : `What ${scopeName(g.scope).toLowerCase()} may do on ${g.label}`}
              className={g.limits.length ? "text-primary" : undefined}
            >
              <IconAdjustmentsHorizontal />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>As {scopeName(g.scope).toLowerCase()}, may</DropdownMenuLabel>
            {ABILITIES.map((a) => (
              <DropdownMenuCheckboxItem
                key={a}
                checked={!g.limits.includes(a)}
                onCheckedChange={(on) => onLimits(on ? g.limits.filter((l) => l !== a) : [...g.limits, a])}
              >
                {ABILITY[a]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <IconButton variant="ghost" size="icon-xs" label={`Remove access to ${g.label}`} onClick={onRemove}>
        <IconTrash />
      </IconButton>
    </div>
  );
}

/** Invite someone new, or give a member access to one more thing. */
function GrantDialog({
  me,
  dialog,
  places,
  onClose,
  onDone,
}: {
  me: Me;
  dialog: { kind: "invite" } | { kind: "grant"; user: { id: string; name: string } };
  places: Where[];
  onClose: () => void;
  onDone: () => void;
}) {
  const id = useId();
  const [where, setWhere] = useState(`${places.find((p) => p.resource === "workspace")!.resource}:${places.find((p) => p.resource === "workspace")!.resourceId}`);
  const [scope, setScope] = useState<Scope>("read");
  const [limits, setLimits] = useState<Ability[]>([]);
  const [link, setLink] = useState<{ url: string; emailed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [resource, resourceId] = where.split(":") as [Resource, string];
  // Only an editor's or admin's grant has abilities to switch off.
  const off = allows(scope, "write") ? limits : [];

  async function submit(form: FormData) {
    setBusy(true);
    const made =
      dialog.kind === "invite"
        ? await send("POST", "/api/v1/invitations", { email: String(form.get("email") ?? "").trim(), resource, resourceId, scope, limits: off })
        : await send("POST", "/api/v1/grants", { user: dialog.user.id, resource, resourceId, scope, limits: off });
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
            <InviteLink me={me} url={link.url} emailed={link.emailed} />
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
            {allows(scope, "write") && (
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium">May</legend>
                {ABILITIES.map((a) => (
                  <Label key={a} className="font-normal">
                    <Checkbox
                      checked={!limits.includes(a)}
                      onCheckedChange={(on) => setLimits((l) => (on ? l.filter((x) => x !== a) : [...l, a]))}
                    />
                    {ABILITY[a]}
                  </Label>
                ))}
              </fieldset>
            )}
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

/**
 * Every share link on what you may share: new ones for collecting uploads
 * or showing a collection, and each to copy, email or revoke.
 */
export function Sharing({ shares, collections }: { shares: ShareLink[]; collections: { id: string; name: string }[] }) {
  const router = useRouter();
  const me = useMe();
  const [making, setMaking] = useState<"view" | "upload" | null>(null);
  const [sending, setSending] = useState<ShareLink | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold">
          Links <span className="text-muted-foreground font-normal">{shares.length}</span>
        </h2>
        <Button size="sm" onClick={() => setMaking("upload")}>
          <IconFolderUp /> Request uploads
        </Button>
        <Button size="sm" variant="outline" onClick={() => setMaking("view")}>
          <IconShare /> Share a collection
        </Button>
      </div>
      {shares.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconShare />
            </EmptyMedia>
            <EmptyTitle>No links yet</EmptyTitle>
            <EmptyDescription>
              Request uploads gives a photographer or an agency a link to send files in, no account needed; they wait
              in Review. Share a collection lets someone look and download. An asset is shared from its dialog.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="divide-y rounded-lg border">
          {shares.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
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
              <IconButton variant="ghost" label="Copy link" onClick={() => copy(s.url, "the link")}>
                <IconCopy />
              </IconButton>
              {me?.email && !s.expired && (
                <IconButton variant="ghost" label="Email it to people" onClick={() => setSending(s)}>
                  <IconSend />
                </IconButton>
              )}
              <IconButton
                variant="ghost"
                label={`Revoke ${s.name ?? "this link"}`}
                onClick={async () => {
                  if (!(await send("DELETE", `/api/v1/shares/${s.id}`))) return;
                  toast.success("Revoked: the link no longer works");
                  router.refresh();
                }}
              >
                <IconTrash />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {making && <ShareDialog target={{ kind: making }} collections={collections} onClose={() => setMaking(null)} onMade={() => router.refresh()} />}
      {sending && <SendLinkDialog link={sending} onClose={() => setSending(null)} />}
    </div>
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
  "workspace.deleted": "deleted the workspace",
  "organization.deleted": "deleted the organization",
  "grant.set": "gave access to",
  "grant.removed": "took access from",
  "invitation.created": "invited",
  "invitation.revoked": "withdrew the invitation to",
  "invitation.accepted": "accepted an invitation as",
  "key.created": "made the API key",
  "key.revoked": "revoked the API key",
  "share.created": "made a share link to",
  "share.revoked": "revoked a share link to",
  "asset.signed_url": "made a signed URL to",
  "asset.published": "made public",
  "asset.unpublished": "made private again",
  "portal.created": "made the portal",
  "portal.updated": "changed the portal",
  "portal.deleted": "deleted the portal",
  "portal.request_approved": "let into a portal",
  "portal.request_denied": "turned down for a portal",
  "portal.request_removed": "took portal access from",
  "domain.verified": "verified the domain",
  "domain.primary": "made the default domain",
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
