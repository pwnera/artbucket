"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { IconArrowRight, IconCheck, IconPlus } from "@tabler/icons-react";
import { toast } from "sonner";
import { MakeDialog, pickWorkspace, useGo, type Me } from "@/components/account";
import { send } from "@/components/collections";
import { FieldsEditor } from "@/components/field-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
