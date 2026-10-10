"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useOptimistic, useState, useTransition } from "react";
import {
  IconBuilding,
  IconFolder,
  IconFolderUp,
  IconHistory,
  IconLayoutGrid,
  IconLink,
  IconLock,
  IconMail,
  IconPalette,
  IconPhoto,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSend,
  IconShare,
  IconTrash,
  IconUpload,
  IconX,
} from "@/components/icons";
import { toast } from "sonner";
import type { Me } from "@/components/account";
import { DayGroups, Initials, useFeed } from "@/components/activity";
import { Snippet } from "@/components/agent-access";
import { useMe } from "@/components/can";
import { Confirm } from "@/components/confirm";
import { CopyButton } from "@/components/copy-button";
import { IconButton } from "@/components/icon-button";
import { SendLinkDialog, ShareDialog, type ShareLink } from "@/components/share-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AuditAction } from "@/lib/core/audit";
import { can } from "@/lib/permissions";
import { roleName, ROLES, SCOPES, type Scope } from "@/lib/scopes";
import { send } from "@/lib/send";
import type { SidebarData } from "@/lib/sidebar";
import { undoable } from "@/lib/undo";
import { ago, exact } from "@/lib/time";
import { useFlashNew } from "@/lib/motion";
import { SavedMark } from "@/components/settings/panels";
import { useKept } from "@/lib/motion";

type Resource = "organization" | "project" | "collection" | "asset" | "brand";
type Grant = { id: string; resource: Resource; resourceId: string; projectId: string | null; label: string | null; scope: Scope };
type Invitation = {
  id: string;
  email: string;
  resource: Resource;
  resourceId: string;
  label: string | null;
  scope: Scope;
  invitedBy: string;
  expiresAt: string;
  /** Its link, to copy again; null when it can't be opened any more. */
  url: string | null;
};
type Member = { id: string; name: string; email: string; grants: Grant[] };
export type Members = { data: Member[]; invitations: Invitation[] };
type AuditEntry = { id: string; at: string; actor: string; action: AuditAction; target: string | null; detail: Record<string, unknown> | null; ip: string | null };
export type AuditPage = { data: AuditEntry[]; next: string | null };

const ICON: Record<Resource, typeof IconFolder> = { organization: IconBuilding, project: IconLayoutGrid, collection: IconFolder, asset: IconPhoto, brand: IconPalette };

/** A role in a picker: its name, and what it may do under it, so the choice is made knowing. The trigger shows the name only. */
function RoleOption({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="grid">
      <span>{label}</span>
      <span className="text-muted-foreground text-xs">{hint}</span>
    </div>
  );
}

// ---- people -----------------------------------------------------------------

type Where = { resource: Resource; resourceId: string; label: string };

/**
 * People and their grants, and invitations waiting: the whole organization
 * (Team), or `view="project"`, only who can open this project and what
 * they may do in it (Settings). Each grant is changed only by whoever may
 * manage what it is on.
 */
export function People({
  me,
  members,
  collections,
  brands = [],
  view = "organization",
  inviting = false,
}: {
  me: Me;
  members: Members;
  collections: SidebarData["collections"];
  /** Brands a grant can be on, beside the project and its collections. */
  brands?: { id: string; name: string; private?: boolean }[];
  view?: "organization" | "project";
  /** Open with the invite dialog up: ⌘K's "Invite people". */
  inviting?: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<{ kind: "invite" } | { kind: "grant"; user: { id: string; name: string } } | null>(
    inviting ? { kind: "invite" } : null,
  );
  const [resent, setResent] = useState<{ email: string; url: string; emailed: boolean } | null>(null);
  // Kept while they fade out, so they leave showing what they showed.
  const shownDialog = useKept(dialog);
  const shownResent = useKept(resent);
  const [resending, setResending] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const manages = (g: Pick<Grant, "resource">) => can(me, g.resource === "organization" ? "organization.manage" : "member.manage");
  // Where a grant can be: the organization (its admins, and not from a project's view), this project, or one of its collections.
  const places: Where[] = [
    ...(view === "organization" && can(me, "organization.manage") ? [{ resource: "organization" as const, resourceId: me.project.organization.id, label: `${me.project.organization.name} (every project)` }] : []),
    { resource: "project", resourceId: me.project.id, label: `${me.project.name} (this project)` },
    ...collections.map((c) => ({ resource: "collection" as const, resourceId: c.id, label: `${c.name} (${c.private ? "private " : ""}collection)` })),
    ...brands.map((b) => ({ resource: "brand" as const, resourceId: b.id, label: `${b.name} (${b.private ? "private " : ""}brand)` })),
  ];
  const refresh = () => router.refresh();

  function close() {
    setDialog(null);
    // ⌘K's ?invite opened it; a reload shouldn't open it again.
    const url = new URL(window.location.href);
    if (!url.searchParams.has("invite")) return;
    url.searchParams.delete("invite");
    window.history.replaceState(null, "", url);
  }

  /** True when it took: the row says Saved beside the role itself. */
  async function change(g: Grant, userId: string, scope: Scope) {
    if (!(await send("POST", "/api/v1/grants", { user: userId, resource: g.resource, resourceId: g.resourceId, scope }))) return false;
    refresh();
    return true;
  }
  async function remove(g: Grant, m: Member) {
    if (!(await send("DELETE", `/api/v1/grants/${g.id}`))) return false;
    refresh();
    // Your own admin grant asked first instead: putting it back would take the admin just given up.
    if (m.id !== me.user?.id || g.scope !== "admin") {
      undoable(`Removed ${m.name}'s access to ${g.label}`, {
        undo: async () => {
          const back = await send("POST", "/api/v1/grants", { user: m.id, resource: g.resource, resourceId: g.resourceId, scope: g.scope });
          // send() said why it failed; nothing more to say.
          if (!back) return false;
          refresh();
        },
      });
    }
    return true;
  }

  const needle = q.trim().toLowerCase();
  const matches = (...s: string[]) => !needle || s.some((x) => x.toLowerCase().includes(needle));
  // You first: the row you most often come to change is your own.
  const people = members.data.filter((m) => matches(m.name, m.email)).sort((a, b) => Number(b.id === me.user?.id) - Number(a.id === me.user?.id));
  const invited = members.invitations.filter((i) => matches(i.email));
  // An invitation just sent lights up in the list when the refresh brings it.
  useFlashNew(
    members.invitations.map((i) => i.id),
    (id) => `[data-invite="${CSS.escape(id)}"]`,
  );

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex-1 text-sm font-semibold">
            {view === "project" ? `Who can open ${me.project.name}` : "People"}{" "}
            <span className="text-muted-foreground font-normal">{members.data.length}</span>
          </h2>
          {members.data.length + members.invitations.length > 5 && (
            <div className="relative w-full sm:w-56">
              <IconSearch className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name or email" aria-label="Filter people" className="h-8 pl-8" />
            </div>
          )}
          <Button size="sm" onClick={() => setDialog({ kind: "invite" })}>
            <IconMail /> Invite people
          </Button>
        </div>
        {needle && !people.length && !invited.length ? (
          <p className="text-muted-foreground rounded-lg border px-3 py-6 text-center text-sm">No one matches &ldquo;{q.trim()}&rdquo;.</p>
        ) : (
          people.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {people.map((m) => (
                <li key={m.id} className="flex flex-col gap-2 px-3 py-3 lg:flex-row lg:items-start">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Initials name={m.name || m.email} className="size-8 text-xs" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {m.name}
                        {m.id === me.user?.id && <span className="text-muted-foreground font-normal"> (you)</span>}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">{m.email}</p>
                      {view === "project" && <p className="mt-1 text-xs">{roleHere(m.grants, me.project.id)}</p>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 pl-11 lg:items-end lg:pl-0">
                    {m.grants.map((g) => (
                      <GrantRow
                        key={g.id}
                        grant={g}
                        who={m.name}
                        editable={manages(g)}
                        mine={m.id === me.user?.id}
                        onScope={(s) => change(g, m.id, s)}
                        onRemove={() => remove(g, m)}
                      />
                    ))}
                    <Button variant="ghost" size="xs" className="text-muted-foreground w-fit" onClick={() => setDialog({ kind: "grant", user: m })}>
                      <IconPlus /> Access to more
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )
        )}
      </section>

      {invited.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">
            Invited <span className="text-muted-foreground font-normal">{members.invitations.length}</span>
          </h2>
          <ul className="divide-y rounded-lg border">
            {invited.map((i) => {
              const I = ICON[i.resource];
              return (
                <li key={i.id} data-invite={i.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                  <IconMail className="text-muted-foreground size-4 shrink-0" />
                  <div className="min-w-48 flex-1">
                    <p className="truncate font-medium">{i.email}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      <I className="mr-1 inline size-3.5" />
                      {roleName(i.scope)} on {i.label} · by {i.invitedBy} · expires {ago(i.expiresAt)}
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    {i.url && <CopyButton text={i.url} label={`Copy ${i.email}'s invitation link`} what="the invitation link" size="icon-sm" />}
                    <IconButton
                      variant="ghost"
                      label="Send again: a new link and a new week"
                      pending={resending === i.id}
                      onClick={async () => {
                        setResending(i.id);
                        const r = await send("POST", `/api/v1/invitations/${i.id}/resend`);
                        setResending(null);
                        if (!r) return;
                        setResent({ email: i.email, url: r.url, emailed: r.emailed });
                        refresh();
                      }}
                    >
                      <IconRefresh />
                    </IconButton>
                    <Confirm
                      title={`Withdraw the invitation to ${i.email}?`}
                      says="Its link stops working at once. You can invite them again later."
                      action="Withdraw"
                      run={async () => {
                        const ok = await send("DELETE", `/api/v1/invitations/${i.id}`);
                        if (!ok) return null;
                        toast.success(`Withdrew the invitation to ${i.email}`);
                        refresh();
                        return ok;
                      }}
                    >
                      <IconButton variant="ghost" label={`Withdraw the invitation to ${i.email}`} className="text-muted-foreground hover:text-destructive">
                        <IconX />
                      </IconButton>
                    </Confirm>
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

      {shownDialog && <GrantDialog me={me} dialog={shownDialog} open={!!dialog} places={places} onClose={close} onDone={refresh} />}
      {shownResent && (
        <Dialog open={!!resent} onOpenChange={(o) => !o && setResent(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Invitation for {shownResent.email}</DialogTitle>
              <DialogDescription>A new link, good for a week. The one sent before no longer works.</DialogDescription>
            </DialogHeader>
            <InviteLink me={me} url={shownResent.url} emailed={shownResent.emailed} />
            <DialogFooter>
              <Button onClick={() => setResent(null)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/** "Admin here, through the organization": what someone may do in this project, and why. */
function roleHere(grants: Grant[], projectId: string) {
  const org = grants.find((g) => g.resource === "organization");
  const ws = grants.find((g) => g.resource === "project" && g.resourceId === projectId);
  const top = [org, ws].filter(Boolean).sort((a, b) => SCOPES.indexOf(b!.scope) - SCOPES.indexOf(a!.scope))[0];
  if (!top) return <span className="text-muted-foreground">Some collections or assets only</span>;
  return (
    <>
      <Badge variant="outline">{roleName(top.scope)}</Badge>{" "}
      <span className="text-muted-foreground">{top.resource === "organization" ? "through the organization" : "in this project"}</span>
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
          "Emailed. It stays under Invited until they join."
        ) : (
          <>
            Send it yourself. It stays under Invited until used or expired.{" "}
            {can(me, "organization.manage") && (
              <>
                <Link href="/settings/organization/email" className="underline underline-offset-2">
                  Turn on email
                </Link>{" "}
                to have invitations sent.
              </>
            )}
          </>
        )}
      </p>
    </div>
  );
}

/**
 * One grant: where, and as what. A change shows at once and rolls back only
 * if the server refuses. Lowering or removing your own admin asks first.
 */
function GrantRow({
  grant: g,
  who,
  editable,
  mine,
  onScope,
  onRemove,
}: {
  grant: Grant;
  /** Whose grant: every label names them, so ten rows don't all read "Remove access to Library". */
  who: string;
  editable: boolean;
  mine: boolean;
  onScope: (s: Scope) => Promise<unknown>;
  onRemove: () => Promise<boolean>;
}) {
  const [shown, setShown] = useOptimistic({ scope: g.scope });
  const [, start] = useTransition();
  const [asking, setAsking] = useState<{ scope: Scope } | "remove" | null>(null);
  const [savedAt, setSavedAt] = useState(0);
  // The request runs inside the transition, and router.refresh() with it, so the new value holds until the new props land.
  const scope = (s: Scope) => start(async () => {
    setShown({ scope: s });
    if (await onScope(s)) setSavedAt(Date.now());
  });
  const ownAdmin = mine && g.scope === "admin";

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
        <Badge variant="outline">{roleName(g.scope)}</Badge>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      {where}
      <Select value={shown.scope} onValueChange={(v) => (ownAdmin && v !== "admin" ? setAsking({ scope: v as Scope }) : scope(v as Scope))}>
        <SelectTrigger size="sm" className="h-7 w-32" aria-label={`${who}'s role on ${g.label}`}>
          <SelectValue>{roleName(shown.scope)}</SelectValue>
        </SelectTrigger>
        <SelectContent align="end">
          {ROLES.map((r) => (
            <SelectItem key={r.scope} value={r.scope}>
              <RoleOption label={r.label} hint={r.hint} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <IconButton
        variant="ghost"
        size="icon-xs"
        label={`Remove ${who}'s access to ${g.label}`}
        className="text-muted-foreground hover:text-destructive"
        onClick={() => (ownAdmin ? setAsking("remove") : void onRemove())}
      >
        <IconTrash />
      </IconButton>
      <Confirm
        open={!!asking}
        onOpenChange={(o) => !o && setAsking(null)}
        title={asking === "remove" ? `Remove your own admin access to ${g.label}?` : `Stop being an admin on ${g.label}?`}
        says="You may no longer be able to manage people here, so you couldn't undo this yourself. Another admin could."
        action={asking === "remove" ? "Remove my access" : "Lower my access"}
        run={() => {
          if (asking === "remove") return onRemove();
          if (asking) scope(asking.scope);
          return true;
        }}
      />
      <SavedMark at={savedAt} />
    </div>
  );
}

/** Invite someone new, or give a member access to one more thing. */
function GrantDialog({
  me,
  dialog,
  places,
  open = true,
  onClose,
  onDone,
}: {
  open?: boolean;
  me: Me;
  dialog: { kind: "invite" } | { kind: "grant"; user: { id: string; name: string } };
  places: Where[];
  onClose: () => void;
  onDone: () => void;
}) {
  const id = useId();
  const [where, setWhere] = useState(`${places.find((p) => p.resource === "project")!.resource}:${places.find((p) => p.resource === "project")!.resourceId}`);
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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dialog.kind === "invite" ? "Invite someone" : `More access for ${dialog.user.name}`}</DialogTitle>
          <DialogDescription>
            {dialog.kind === "invite"
              ? "The link works once, for a week."
              : "Access reaches down: editor on a collection is editor on everything in it."}
          </DialogDescription>
        </DialogHeader>
        {link ? (
          <div className="animate-in fade-in-0 zoom-in-[0.98] grid gap-3 duration-200">
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
                  <SelectValue>{roleName(scope)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.scope} value={r.scope}>
                      <RoleOption label={r.label} hint={r.hint} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" pending={busy}>
                {dialog.kind === "grant" ? "Give access" : me.email ? "Send invitation" : "Create invite link"}
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
              Collect files or share a collection, no account needed.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="divide-y rounded-lg border">
          {shares.map((s) => {
            const name = s.name ?? s.target.label ?? "Untitled";
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                {s.kind === "upload" ? <IconUpload className="text-muted-foreground size-4 shrink-0" /> : <IconLink className="text-muted-foreground size-4 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-medium">
                    {name}
                    {s.password && <IconLock className="text-muted-foreground size-3.5" aria-label="Password" />}
                    {s.expired && <Badge variant="outline">Expired</Badge>}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {s.kind === "upload" ? "Uploads into" : "Shows"} {s.target.label ?? "the project"} · by {s.createdBy} ·{" "}
                    {s.expiresAt ? `until ${new Date(s.expiresAt).toLocaleDateString()}` : "no end date"}
                  </p>
                </div>
                <CopyButton text={s.url} label={`Copy the link to ${name}`} what="the link" size="icon-sm" />
                {me?.email && !s.expired && (
                  <IconButton variant="ghost" label="Email it to people" onClick={() => setSending(s)}>
                    <IconSend />
                  </IconButton>
                )}
                <Confirm
                  title="Revoke this link?"
                  says="Anyone with it gets an error page. A revoked link can't be brought back; make a new one instead."
                  action="Revoke"
                  run={async () => {
                    const ok = await send("DELETE", `/api/v1/shares/${s.id}`);
                    if (!ok) return null;
                    toast.success("Revoked: the link no longer works");
                    router.refresh();
                    return ok;
                  }}
                >
                  <IconButton variant="ghost" label={`Revoke ${name}`} className="text-muted-foreground hover:text-destructive">
                    <IconTrash />
                  </IconButton>
                </Confirm>
              </li>
            );
          })}
        </ul>
      )}
      {making && <ShareDialog target={{ kind: making }} collections={collections} onClose={() => setMaking(null)} onMade={() => router.refresh()} />}
      {sending && <SendLinkDialog link={sending} onClose={() => setSending(null)} />}
    </div>
  );
}

// ---- audit ------------------------------------------------------------------

// Every action the server records, so a new one is a compile error here, not a raw key in the log.
const SAYS: Record<AuditAction, string> = {
  "user.signed_up": "made an account",
  "user.signed_in": "signed in",
  "organization.created": "made the organization",
  "organization.renamed": "renamed the organization to",
  "project.created": "made the project",
  "project.renamed": "renamed a project to",
  "project.deleted": "deleted the project",
  "organization.deleted": "deleted the organization",
  "grant.set": "gave access to",
  "grant.removed": "took access from",
  "group.created": "made the group",
  "group.renamed": "renamed the group",
  "group.deleted": "deleted the group",
  "group.members": "changed who is in the group",
  "share.project": "shared into another project",
  "invitation.created": "invited",
  "invitation.resent": "sent a new invitation to",
  "invitation.revoked": "withdrew the invitation to",
  "invitation.accepted": "accepted an invitation as",
  "key.created": "made the API key",
  "key.revoked": "revoked the API key",
  "share.created": "made a share link to",
  "share.revoked": "revoked a share link to",
  "share.sent": "emailed a link to",
  "asset.signed_url": "made a signed URL to",
  "asset.published": "turned on the embed URL of",
  "asset.unpublished": "turned off the embed URL of",
  "portal.created": "made the portal",
  "portal.updated": "changed the portal",
  "portal.deleted": "deleted the portal",
  "brand.published": "released the guidelines of",
  "brand.public": "made public on BrandHub",
  "brand.private": "made private on BrandHub",
  "brand.claimed": "claimed on BrandHub, by its domain,",
  "portal.request_approved": "let into a portal",
  "portal.request_denied": "turned down for a portal",
  "portal.request_removed": "took portal access from",
  "site.deployed": "deployed to the site",
  "domain.added": "added the domain",
  "domain.verified": "verified the domain",
  "domain.unverified": "unverified the domain",
  "email_domain.added": "added the email domain",
  "email_domain.verified": "verified the email domain",
  "email_domain.unverified": "unverified the email domain",
  "email_domain.removed": "removed the email domain",
  "email_domain.opened": "let anyone join from",
  "email_domain.closed": "stopped joining from",
  "email_domain.landing": "changed where people land joining from",
  "email_domain.joined": "joined by email domain as",
  "domain.removed": "removed the domain",
  "domain.primary": "made the default domain",
  "domain.app": "changed whether a domain serves the app",
  "github.added": "named the GitHub account",
  "github.verified": "verified the GitHub account",
  "github.removed": "removed the GitHub account",
  "sso.saved": "set up single sign-on for",
  "sso.verified": "verified single sign-on for",
  "sso.removed": "turned off single sign-on for",
  "sso.required": "required single sign-on for",
  "sso.optional": "allowed passwords again for",
  "sso.joined": "joined through single sign-on as",
  "setting.changed": "changed the setting",
  "setting.reset": "reset the setting",
  "email.failed": "couldn't email",
};

/** Detail as a short phrase: "editor on Autumn 26". */
function detail(d: Record<string, unknown> | null) {
  if (!d) return null;
  const parts = [
    typeof d.scope === "string" && (d.on ? `${roleName(d.scope as Scope).toLowerCase()} on ${d.on}` : roleName(d.scope as Scope).toLowerCase()),
    typeof d.kind === "string" && `${d.kind} link`,
    typeof d.to === "number" && `to ${d.to} ${d.to === 1 ? "person" : "people"}`,
    d.password === true && "with a password",
    typeof d.from === "string" && `was ${d.from}`,
    Array.isArray(d.changed) && d.changed.length > 0 && `changed ${d.changed.join(", ")}`,
    typeof d.error === "string" && d.error,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

type Kind = "all" | "access" | "keys" | "links" | "signins";
/** The log's filters, by action. Sign-ins are the noise under the changes, so All leaves them to their own tab. */
const KINDS: { id: Kind; label: string; has: (a: string) => boolean }[] = [
  { id: "all", label: "All", has: (a) => a !== "user.signed_in" },
  { id: "access", label: "Access", has: (a) => a.startsWith("grant.") || a.startsWith("invitation.") },
  { id: "keys", label: "Keys", has: (a) => a.startsWith("key.") },
  { id: "links", label: "Links", has: (a) => a.startsWith("share.") || a === "asset.signed_url" },
  { id: "signins", label: "Sign-ins", has: (a) => a.startsWith("user.") },
];

/** Who changed who may do what, newest first, by day. The filter is in the URL (`?audit=`). */
export function Audit({ first }: { first: AuditPage }) {
  const params = useSearchParams();
  const { items, next, busy, more } = useFeed("/api/v1/audit", first);
  const kind = KINDS.find((k) => k.id === params.get("audit")) ?? KINDS[0]!;

  function filter(v: string) {
    const q = new URLSearchParams(params);
    if (v === "all") q.delete("audit");
    else q.set("audit", v);
    window.history.replaceState(null, "", q.size ? `?${q}` : window.location.pathname);
  }

  if (!items.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconHistory />
          </EmptyMedia>
          <EmptyTitle>Nothing yet</EmptyTitle>
          <EmptyDescription>Sign-ins, access, invitations, keys and links show here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  const shown = items.filter((e) => kind.has(e.action));
  const older = (
    <Button variant="outline" size="sm" pending={busy} onClick={more}>
      Load older
    </Button>
  );
  return (
    <div className="space-y-4">
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <ToggleGroup type="single" variant="outline" size="sm" value={kind.id} onValueChange={(v) => v && filter(v)} aria-label="Show">
          {KINDS.map((k) => (
            <ToggleGroupItem key={k.id} value={k.id} className="px-3">
              {k.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {shown.length === 0 ? (
        <Empty size="sm" className="border">
          <EmptyHeader>
            <EmptyTitle>
              Nothing under {kind.label} in the latest {items.length} entries
            </EmptyTitle>
            <EmptyDescription>{next ? "There may be some further back." : "That's everything there is."}</EmptyDescription>
          </EmptyHeader>
          {next && older}
        </Empty>
      ) : (
        <DayGroups items={shown}>
          {(list) =>
            list.map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                <Initials name={e.actor} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="leading-6">
                    <span className="font-medium">{e.actor}</span> <span className="text-muted-foreground">{SAYS[e.action] ?? e.action}</span>{" "}
                    {e.target && <span className="font-medium">{e.target}</span>}
                  </p>
                  {(detail(e.detail) || e.ip) && (
                    <p className="text-muted-foreground text-xs">{[detail(e.detail), e.ip && `from ${e.ip}`].filter(Boolean).join(" · ")}</p>
                  )}
                </div>
                <time dateTime={e.at} title={exact(e.at)} className="text-muted-foreground shrink-0 text-xs leading-6" suppressHydrationWarning>
                  {ago(e.at)}
                </time>
              </li>
            ))
          }
        </DayGroups>
      )}
      {shown.length > 0 && next && <div className="flex justify-center">{older}</div>}
    </div>
  );
}
