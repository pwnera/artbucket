"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { IconArrowRight, IconCheck, IconPlus, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import { MakeDialog, pickWorkspace, useGo, type Me } from "@/components/account";
import { send } from "@/components/collections";
import { FieldsEditor } from "@/components/field-manager";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { formatSize, type Limits } from "@/lib/limits";
import type { FieldDef } from "@/lib/fields";
import type { Scope } from "@/lib/scopes";

/** A titled group of controls, the unit every settings panel is made of. */
export function Group({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border p-4 sm:p-5">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="text-muted-foreground text-sm text-pretty">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** One name, saved by PATCH: a workspace's or an organization's. */
export function NameForm({ what, url, name }: { what: string; url: string; name: string }) {
  const id = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Group title="Name" description={`What people see the ${what} called: in the sidebar, in invitations, on share links.`}>
      <form
        className="flex max-w-md items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const next = String(new FormData(e.currentTarget).get("name") ?? "").trim();
          if (!next || next === name) return;
          setBusy(true);
          const ok = await send("PATCH", url, { name: next });
          setBusy(false);
          if (!ok) return;
          toast.success(`Renamed to ${next}`);
          router.refresh();
        }}
      >
        <div className="grid flex-1 gap-2">
          <Label htmlFor={id} className="sr-only">
            Name
          </Label>
          <Input id={id} name="name" defaultValue={name} required maxLength={80} />
        </div>
        <Button type="submit" disabled={busy}>
          Save
        </Button>
      </form>
    </Group>
  );
}

/** The workspace's custom fields, saved as they change. */
export function FieldsPanel({ fields }: { fields: FieldDef[] }) {
  const router = useRouter();
  return <FieldsEditor fields={fields} onChanged={() => router.refresh()} />;
}

const SCOPE_LABEL: Record<Scope, string> = { read: "Viewer", propose: "Contributor", write: "Editor", admin: "Admin" };

/** The organization's workspaces: open one, rename one, make another. */
export function WorkspacesPanel({ me, workspaces }: { me: Me; workspaces: { id: string; slug: string; name: string; scope: Scope | null }[] }) {
  const go = useGo();
  const [making, setMaking] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-lg border">
        {workspaces.map((w) => (
          <li key={w.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded text-xs font-semibold uppercase">
              {w.name[0]}
            </span>
            {renaming === w.id ? (
              <form
                className="flex flex-1 gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
                  if (name && (await send("PATCH", `/api/v1/workspaces/${w.id}`, { name }))) {
                    setRenaming(null);
                    router.refresh();
                  }
                }}
              >
                <Input name="name" defaultValue={w.name} required maxLength={80} autoFocus className="h-8" aria-label={`New name for ${w.name}`} />
                <Button type="submit" size="sm">
                  Save
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                  Cancel
                </Button>
              </form>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{w.name}</p>
                  <p className="text-muted-foreground truncate text-xs">{w.slug}</p>
                </div>
                {w.scope && <Badge variant="outline">{SCOPE_LABEL[w.scope]}</Badge>}
                <Button variant="ghost" size="sm" onClick={() => setRenaming(w.id)}>
                  Rename
                </Button>
                {workspaces.length > 1 && (
                  <DeleteButton
                    what={`the workspace ${w.name}`}
                    name={w.name}
                    says="Its assets, collections, fields, brands, keys and links go with it, at once, and its files soon after. This can't be undone."
                    url={`/api/v1/workspaces/${w.id}`}
                    onDeleted={() => {
                      if (w.id !== me.workspace.id) return router.refresh();
                      pickWorkspace(workspaces.find((x) => x.id !== w.id)!.id);
                      go("/");
                    }}
                    icon
                  />
                )}
                {w.id === me.workspace.id ? (
                  <span className="text-muted-foreground flex w-16 items-center justify-center gap-1 text-xs">
                    <IconCheck className="size-3.5" /> Here
                  </span>
                ) : (
                  <Button variant="outline" size="sm" className="w-16" onClick={() => (pickWorkspace(w.id), go("/"))}>
                    Open <IconArrowRight />
                  </Button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      <Button variant="outline" onClick={() => setMaking(true)}>
        <IconPlus /> New workspace
      </Button>
      {making && <MakeDialog kind="workspace" org={me.workspace.organization.name} onClose={() => setMaking(false)} />}
    </div>
  );
}

/** Your name, and your password: better-auth's own endpoints, as the person signed in. */
export function ProfilePanel({ me, passwordReset }: { me: Me; passwordReset: boolean }) {
  const id = useId();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const post = async (path: string, body: unknown) => {
    const res = await fetch(`/api/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return true;
    setError((await res.json().catch(() => ({}))).message ?? "That didn't work");
    return false;
  };
  return (
    <div className="space-y-6">
      <Group title="Name" description={`How history and invitations name you. You sign in as ${me.user?.email}.`}>
        <form
          className="flex max-w-md gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
            if (name && (await post("update-user", { name }))) {
              toast.success("Saved");
              router.refresh();
            }
          }}
        >
          <Input name="name" defaultValue={me.user?.name} required maxLength={120} aria-label="Name" />
          <Button type="submit">Save</Button>
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
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const form = e.currentTarget;
            setError(null);
            const ok = await post("change-password", {
              currentPassword: String(f.get("current") ?? ""),
              newPassword: String(f.get("next") ?? ""),
              revokeOtherSessions: true,
            });
            if (ok) {
              toast.success("Password changed");
              form.reset();
            }
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor={`${id}-current`}>Current password</Label>
            <Input id={`${id}-current`} name="current" type="password" autoComplete="current-password" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-next`}>New password</Label>
            <Input id={`${id}-next`} name="next" type="password" autoComplete="new-password" minLength={10} required />
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <Button type="submit" className="w-fit">
            Change password
          </Button>
        </form>
      </Group>
    </div>
  );
}

/**
 * Delete something that can't come back: its name typed out first, so a
 * slip of the mouse isn't enough.
 */
export function DeleteButton({
  what,
  name,
  says,
  url,
  onDeleted,
  icon,
}: {
  what: string;
  name: string;
  says: string;
  url: string;
  onDeleted: () => void;
  icon?: boolean;
}) {
  const id = useId();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog onOpenChange={() => setTyped("")}>
      <AlertDialogTrigger asChild>
        {icon ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Delete ${what}`} className="text-muted-foreground hover:text-destructive">
            <IconTrash />
          </Button>
        ) : (
          <Button variant="destructive" className="w-fit">
            <IconTrash /> Delete {what}
          </Button>
        )}
      </AlertDialogTrigger>
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
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={busy || typed !== name}>
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
    <Group title="Delete the organization" description="Its workspaces and everything in them, its people's access and its invitations go at once, and its files soon after.">
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
  used: { storage: number; editors: number; workspaces: number; brands: number };
  traffic: {
    days: number;
    workspaces: { id: string; name: string; storage: number; requests: number; bytes: number }[];
    daily: { day: string; requests: number; bytes: number }[];
  };
};

/** What the organization uses, against the limits whoever runs the server set. */
export function UsagePanel({ usage }: { usage: Usage }) {
  const { limits: l, used, traffic } = usage;
  const rows: [string, number, number | null, (n: number) => string][] = [
    ["Storage", used.storage, l.storage, formatSize],
    ["Editors", used.editors, l.editors, String],
    ["Workspaces", used.workspaces, l.workspaces, String],
    ["Brands", used.brands, l.brands, String],
  ];
  const off = l.features ? (["agents", "shares"] as const).filter((f) => !l.features!.includes(f)) : [];
  const total = traffic.workspaces.reduce((t, w) => ({ requests: t.requests + w.requests, bytes: t.bytes + w.bytes }), { requests: 0, bytes: 0 });
  return (
    <div className="space-y-6">
      <Group
        title="Limits"
        description="Set by whoever runs this server, not from here. Deleted assets stop counting at once. Editors are people with write or admin anywhere, invitations included."
      >
        {l.readOnly && (
          <p role="status" className="text-destructive text-sm font-medium">
            This organization is read-only: everyone can look, nobody can change anything.
          </p>
        )}
        <dl className="grid max-w-lg gap-4">
          {rows.map(([label, n, max, fmt]) => (
            <div key={label} className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <dt className="font-medium">{label}</dt>
                <dd className="text-muted-foreground tabular-nums">
                  {fmt(n)} {max === null ? "used, no limit" : `of ${fmt(max)}`}
                </dd>
              </div>
              {max !== null && <Progress value={max ? Math.min(100, (n / max) * 100) : 100} aria-label={`${label} used`} />}
            </div>
          ))}
        </dl>
        {off.length > 0 && (
          <p className="text-muted-foreground text-sm">
            Off here: {off.map((f) => (f === "agents" ? "connecting agents and API keys" : "share and upload links")).join(", ")}.
          </p>
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
