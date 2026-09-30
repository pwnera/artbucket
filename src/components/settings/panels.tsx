"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { IconArrowRight, IconCheck, IconDots, IconPlus, IconRefresh, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import { MakeDialog, pickWorkspace, useGo, type Me } from "@/components/account";
import { FieldsEditor } from "@/components/field-manager";
import { IconButton } from "@/components/icon-button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Progress } from "@/components/ui/progress";
import type { FieldDef } from "@/lib/fields";
import { formatSize, type Limits } from "@/lib/limits";
import { roleName, type Scope } from "@/lib/scopes";
import { send } from "@/lib/send";
import { cn } from "@/lib/utils";

/**
 * A titled group of controls, the unit every settings panel is made of.
 * `tone="danger"` sets apart what can't be undone, so nobody wanders into it.
 */
export function Group({
  title,
  description,
  tone,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  tone?: "danger";
  children: React.ReactNode;
}) {
  return (
    <section className={cn("space-y-4 rounded-lg border p-4 sm:p-5", tone === "danger" && "border-destructive/40 bg-destructive/5")}>
      <div className="space-y-1">
        <h2 className={cn("font-display text-sm font-semibold", tone === "danger" && "text-destructive")}>{title}</h2>
        {description && <p className="text-muted-foreground text-sm text-pretty">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * "Saved", beside the button that saved, for a moment, and said to screen
 * readers. `at` is when it last saved (0: not yet); each new one shows again.
 */
export function SavedMark({ at, children = "Saved" }: { at: number; children?: string }) {
  // Filled a frame after mounting: a live region inserted already holding its text (a row that
  // replaced its edit form) often goes unannounced.
  const [live, setLive] = useState(false);
  useEffect(() => {
    const f = requestAnimationFrame(() => setLive(true));
    return () => cancelAnimationFrame(f);
  }, []);
  // Once faded it is hidden from screen readers too, so a "Saved" no one sees isn't read out later.
  const [faded, setFaded] = useState(0);
  return (
    <span aria-live="polite" className="text-muted-foreground flex items-center gap-1 text-xs">
      {live && at > 0 && (
        // Fades after 1.5s; reduced motion keeps the delay, so it still reads first.
        <span
          key={at}
          aria-hidden={faded === at || undefined}
          onAnimationEnd={() => setFaded(at)}
          className="animate-out fade-out-0 fill-mode-forwards flex items-center gap-1 delay-1500 duration-500"
        >
          <IconCheck className="text-success size-3.5" /> {children}
        </span>
      )}
    </span>
  );
}

/** The browser's own "Leave site?" while a form of several fields holds edits. */
export function useLeaveGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}

/** A section whose data didn't load: say so, rather than an empty state that invites making it all again. */
export function LoadFailed() {
  const router = useRouter();
  return (
    <Group title="Couldn't load this" description="The server didn't answer, or answered with an error. Nothing here has changed.">
      <Button variant="outline" className="w-fit" onClick={() => router.refresh()}>
        <IconRefresh /> Try again
      </Button>
    </Group>
  );
}

/** One name, saved by PATCH: a workspace's or an organization's. Explicit: it shows in invitations and links. */
export function NameForm({ what, url, name }: { what: string; url: string; name: string }) {
  const id = useId();
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [saved, setSaved] = useState(name);
  const [savedAt, setSavedAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const next = value.trim();
  return (
    <Group title="Name" description={`What people see the ${what} called: in the sidebar, in invitations, on share links.`}>
      <form
        className="flex max-w-md items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!next || next === saved) return;
          setBusy(true);
          const ok = await send("PATCH", url, { name: next });
          setBusy(false);
          if (!ok) return;
          setSaved(next);
          setSavedAt(Date.now());
          router.refresh();
        }}
      >
        <Label htmlFor={id} className="sr-only">
          Name
        </Label>
        <Input id={id} name="name" value={value} onChange={(e) => setValue(e.target.value)} required maxLength={80} className="flex-1" />
        <Button type="submit" pending={busy} disabled={!next || next === saved}>
          Save
        </Button>
        <SavedMark at={savedAt} />
      </form>
    </Group>
  );
}

/** The workspace's custom fields, saved as they change. */
export function FieldsPanel({ fields }: { fields: FieldDef[] }) {
  const router = useRouter();
  return <FieldsEditor fields={fields} onChanged={() => router.refresh()} />;
}

type WorkspaceRow = { id: string; slug: string; name: string; scope: Scope | null };

/** The organization's workspaces: open one, rename one, make another. */
export function WorkspacesPanel({ me, workspaces }: { me: Me; workspaces: WorkspaceRow[] }) {
  const go = useGo();
  const [making, setMaking] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renamed, setRenamed] = useState<{ id: string; at: number } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-lg border">
        {workspaces.map((w) => {
          const deletable = workspaces.length > 1;
          return (
            <li key={w.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded text-xs font-semibold uppercase">
                {w.name[0]}
              </span>
              {renaming === w.id ? (
                <form
                  className="flex min-w-0 flex-1 gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
                    if (!name || name === w.name) return setRenaming(null);
                    setBusy(true);
                    const ok = await send("PATCH", `/api/v1/workspaces/${w.id}`, { name });
                    setBusy(false);
                    if (!ok) return;
                    setRenaming(null);
                    setRenamed({ id: w.id, at: Date.now() });
                    router.refresh();
                  }}
                >
                  <Input
                    name="name"
                    defaultValue={w.name}
                    required
                    maxLength={80}
                    autoFocus
                    className="h-8 min-w-0"
                    aria-label={`New name for ${w.name}`}
                    onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                  />
                  <Button type="submit" size="sm" pending={busy}>
                    Save
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      <span className="truncate">{w.name}</span>
                      {renamed?.id === w.id && <SavedMark at={renamed.at} />}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">{w.slug}</p>
                  </div>
                  {w.scope && <Badge variant="outline">{roleName(w.scope)}</Badge>}
                  {/* Below sm, Rename and Delete fold into one menu, so the name keeps its width. */}
                  <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => setRenaming(w.id)}>
                    Rename
                  </Button>
                  {deletable && (
                    <IconButton
                      variant="ghost"
                      label={`Delete the workspace ${w.name}`}
                      className="text-muted-foreground hover:text-destructive hidden sm:inline-flex"
                      onClick={() => setDeleting(w.id)}
                    >
                      <IconTrash />
                    </IconButton>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton variant="ghost" label={`More for ${w.name}`} className="sm:hidden">
                        <IconDots />
                      </IconButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setRenaming(w.id)}>Rename</DropdownMenuItem>
                      {deletable && (
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(w.id)}>
                          <IconTrash /> Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {deletable && (
                    <DeleteButton
                      what={`the workspace ${w.name}`}
                      name={w.name}
                      says="Its assets, collections, fields, brands, keys and links go with it, at once, and its files soon after. This can't be undone."
                      url={`/api/v1/workspaces/${w.id}`}
                      open={deleting === w.id}
                      onOpenChange={(o) => !o && setDeleting(null)}
                      onDeleted={() => {
                        if (w.id !== me.workspace.id) return router.refresh();
                        pickWorkspace(workspaces.find((x) => x.id !== w.id)!.id);
                        go("/");
                      }}
                    />
                  )}
                  {w.id === me.workspace.id ? (
                    <span className="text-muted-foreground flex min-w-16 items-center justify-center gap-1 text-xs">
                      <IconCheck className="size-3.5" /> Here
                    </span>
                  ) : (
                    <Button variant="outline" size="sm" className="min-w-16" onClick={() => (pickWorkspace(w.id), go("/"))}>
                      Open <IconArrowRight />
                    </Button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      <Button variant="outline" onClick={() => setMaking(true)}>
        <IconPlus /> New workspace
      </Button>
      {making && <MakeDialog kind="workspace" org={me.workspace.organization.name} onClose={() => setMaking(false)} />}
    </div>
  );
}

/** better-auth's own endpoints, as the person signed in: null when it worked, else what went wrong. */
async function auth(path: string, body: unknown) {
  const res = await fetch(`/api/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!res) return "Couldn't reach the server. Check the connection and try again.";
  if (res.ok) return null;
  return ((await res.json().catch(() => ({}))).message as string | undefined) ?? "That didn't work";
}

/** Your name, and your password. Each form says its own errors, under itself. */
export function ProfilePanel({ me, passwordReset }: { me: Me; passwordReset: boolean }) {
  const id = useId();
  const router = useRouter();
  const [name, setName] = useState(me.user?.name ?? "");
  const [savedName, setSavedName] = useState(me.user?.name ?? "");
  const [nameAt, setNameAt] = useState(0);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameBusy, setNameBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const nextName = name.trim();
  return (
    <div className="space-y-6">
      <Group title="Name" description={`How history and invitations name you. You sign in as ${me.user?.email}.`}>
        <form
          className="grid max-w-md gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!nextName || nextName === savedName) return;
            setNameBusy(true);
            const error = await auth("update-user", { name: nextName });
            setNameBusy(false);
            setNameError(error);
            if (error) return;
            setSavedName(nextName);
            setNameAt(Date.now());
            router.refresh();
          }}
        >
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
              }}
              required
              maxLength={120}
              aria-label="Name"
              aria-invalid={!!nameError || undefined}
              className="flex-1"
            />
            <Button type="submit" pending={nameBusy} disabled={!nextName || nextName === savedName}>
              Save
            </Button>
            <SavedMark at={nameAt}>Name saved</SavedMark>
          </div>
          {nameError && (
            <p role="alert" className="text-destructive text-sm">
              {nameError}
            </p>
          )}
        </form>
      </Group>
      <Group
        title="Password"
        description={
          passwordReset
            ? "Changing it signs you out everywhere else."
            : "Changing it signs you out everywhere else. There is no email here to reset a forgotten one: keep it somewhere safe."
        }
      >
        <form
          className="grid max-w-md gap-3"
          onChange={() => setPasswordError(null)}
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            setPasswordBusy(true);
            const error = await auth("change-password", {
              currentPassword: String(f.get("current") ?? ""),
              newPassword: String(f.get("next") ?? ""),
              revokeOtherSessions: true,
            });
            setPasswordBusy(false);
            setPasswordError(error);
            if (error) return;
            toast.success("Password changed");
            form.reset();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor={`${id}-current`}>Current password</Label>
            <PasswordInput id={`${id}-current`} name="current" autoComplete="current-password" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-next`}>New password</Label>
            <PasswordInput id={`${id}-next`} name="next" autoComplete="new-password" minLength={10} showLength={10} required />
          </div>
          {passwordError && (
            <p role="alert" className="text-destructive text-sm">
              {passwordError}
            </p>
          )}
          <Button type="submit" className="w-fit" pending={passwordBusy}>
            Change password
          </Button>
        </form>
      </Group>
    </div>
  );
}

/**
 * Delete something that can't come back: its name typed out first, so a
 * slip of the mouse isn't enough. Its own button, or `open` from elsewhere
 * (a row's menu).
 */
export function DeleteButton({
  what,
  name,
  says,
  url,
  onDeleted,
  open,
  onOpenChange,
}: {
  what: string;
  name: string;
  says: string;
  url: string;
  onDeleted: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const id = useId();
  const [inner, setInner] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (o: boolean) => {
    if (busy) return;
    setTyped("");
    if (open === undefined) setInner(o);
    onOpenChange?.(o);
  };
  return (
    <AlertDialog open={open ?? inner} onOpenChange={set}>
      {open === undefined && (
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="w-fit">
            <IconTrash /> Delete {what}
          </Button>
        </AlertDialogTrigger>
      )}
      <AlertDialogContent>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (typed !== name) return;
            setBusy(true);
            const ok = await send("DELETE", url);
            setBusy(false);
            if (!ok) return;
            toast.success(`Deleted ${name}`);
            onDeleted();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {what}?</AlertDialogTitle>
            <AlertDialogDescription>{says}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={id}>
              Type <span className="font-mono">{name}</span> to confirm
            </Label>
            <Input id={id} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={busy}>
              Cancel
            </AlertDialogCancel>
            <Button type="submit" variant="destructive" pending={busy} disabled={typed !== name}>
              Delete
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The organization's own page: deleting it, for its admins. */
export function DeleteOrganization({ me }: { me: Me }) {
  const go = useGo();
  const org = me.workspace.organization;
  return (
    <Group
      tone="danger"
      title="Delete the organization"
      description="Its workspaces and everything in them, its people's access and its invitations go at once, and its files soon after."
    >
      <DeleteButton
        what="this organization"
        name={org.name}
        says="Nobody can get anything in it back, and every link to its assets stops working. This can't be undone."
        url={`/api/v1/organizations/${org.id}`}
        onDeleted={() => go("/")}
      />
    </Group>
  );
}

export type Usage = {
  limits: Limits;
  /** Where to manage the plan behind the limits (BILLING_URL); null when there is nowhere. */
  billing: string | null;
  used: { storage: number; editors: number; workspaces: number; brands: number; domains: number };
  traffic: {
    days: number;
    workspaces: { id: string; name: string; storage: number; requests: number; bytes: number }[];
    daily: { day: string; requests: number; bytes: number }[];
  };
};

/** How the Usage panel names a feature the limits switch off. */
const OFF = { agents: "connecting agents and API keys", shares: "share and upload links", sso: "setting up single sign-on" } as const;

/** What the organization uses, against the limits whoever runs the server set. */
export function UsagePanel({ usage }: { usage: Usage }) {
  const { limits: l, billing, used, traffic } = usage;
  const rows: [string, number, number | null, (n: number) => string][] = [
    ["Storage", used.storage, l.storage, formatSize],
    ["Editors", used.editors, l.editors, String],
    ["Workspaces", used.workspaces, l.workspaces, String],
    ["Brands", used.brands, l.brands, String],
    ["Custom domains", used.domains, l.domains, String],
  ];
  const off = l.features ? (["agents", "shares", "sso"] as const).filter((f) => !l.features!.includes(f)) : [];
  const total = traffic.workspaces.reduce((t, w) => ({ requests: t.requests + w.requests, bytes: t.bytes + w.bytes }), { requests: 0, bytes: 0 });
  return (
    <div className="space-y-6">
      <Group
        title="Limits"
        description={`${billing ? "What your plan allows." : "Set by whoever runs this server, not from here."} Deleted assets stop counting at once. Editors are people with write or admin anywhere, invitations included.`}
      >
        {l.readOnly && (
          <p role="status" className="text-destructive text-sm font-medium">
            This organization is read-only: everyone can look, nobody can change anything.
          </p>
        )}
        <dl className="grid max-w-lg gap-4">
          {rows.map(([label, n, max, fmt]) => {
            const pct = max ? (n / max) * 100 : 100;
            return (
              <div key={label} className="grid gap-1.5">
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <dt className="font-medium">{label}</dt>
                  <dd className={cn("tabular-nums", pct >= 100 && max !== null ? "text-destructive" : "text-muted-foreground")}>
                    {fmt(n)} {max === null ? "used, no limit" : `of ${fmt(max)}`}
                  </dd>
                </div>
                {max !== null && (
                  <Progress
                    value={Math.min(100, pct)}
                    aria-label={`${label} used`}
                    // The indicator, not the track: near the limit it warns, at it it's red.
                    className={cn(
                      pct >= 100
                        ? "[&>[data-slot=progress-indicator]]:bg-destructive"
                        : pct >= 80 && "[&>[data-slot=progress-indicator]]:bg-warning",
                    )}
                  />
                )}
              </div>
            );
          })}
        </dl>
        {off.length > 0 && (
          <p className="text-muted-foreground text-sm">
            Off here: {off.map((f) => OFF[f]).join(", ")}.
          </p>
        )}
        {billing && (
          <Button asChild variant="outline" size="sm">
            <a href={billing}>
              Manage plan
              <IconArrowRight aria-hidden />
            </a>
          </Button>
        )}
      </Group>
      <Group title={`Delivery, last ${traffic.days} days`} description="What asset URLs served, originals, renditions and downloads, by workspace.">
        <table className="w-full max-w-2xl text-sm">
          <thead className="text-muted-foreground text-left text-xs">
            <tr>
              <th className="py-1.5 font-medium">Workspace</th>
              <th className="py-1.5 text-right font-medium">Stored</th>
              <th className="py-1.5 text-right font-medium">Requests</th>
              <th className="py-1.5 text-right font-medium">Served</th>
            </tr>
          </thead>
          <tbody className="divide-y tabular-nums">
            {traffic.workspaces.length === 0 && (
              <tr>
                <td colSpan={4} className="text-muted-foreground py-3 text-center">
                  Nothing served in the last {traffic.days} days.
                </td>
              </tr>
            )}
            {traffic.workspaces.map((w) => (
              <tr key={w.id}>
                <td className="py-1.5">{w.name}</td>
                <td className="py-1.5 text-right">{formatSize(w.storage)}</td>
                <td className="py-1.5 text-right">{w.requests.toLocaleString()}</td>
                <td className="py-1.5 text-right">{formatSize(w.bytes)}</td>
              </tr>
            ))}
            {traffic.workspaces.length > 1 && (
              <tr className="font-medium">
                <td className="py-1.5">All</td>
                <td className="py-1.5 text-right">{formatSize(used.storage)}</td>
                <td className="py-1.5 text-right">{total.requests.toLocaleString()}</td>
                <td className="py-1.5 text-right">{formatSize(total.bytes)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </Group>
    </div>
  );
}
