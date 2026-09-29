"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  IconBuilding,
  IconCheck,
  IconKeyboard,
  IconLoader2,
  IconLogin,
  IconLogout,
  IconPlus,
  IconSelector,
  IconSettings,
  IconSunMoon,
  IconUser,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { BrandMark, ThemeItems } from "@/components/brand";
import { send } from "@/components/collections";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import { can } from "@/lib/permissions";
import { roleName, type Scope } from "@/lib/scopes";
import type { Off } from "@/lib/access";

type Ref = { id: string; slug: string; name: string };
export type WorkspaceRef = Ref & { organization: Ref };

/** GET /api/v1/me: who is looking, where, and what they may do there. */
export type Me = {
  user: { id: string; name: string; email: string } | null;
  key: boolean;
  actor: string;
  workspace: WorkspaceRef;
  scope: Scope | null;
  orgScope: Scope | null;
  narrowed: boolean;
  /** The organization can send email now. */
  email: boolean;
  narrow: { collections: Record<string, Scope>; assets: Record<string, Scope> };
  off: Off;
  hidden: string[];
  workspaces: WorkspaceRef[];
  auth: { signUp: boolean; open: boolean; oidc: { name: string } | null; sso: boolean; anonymous: Scope | null; passwordReset: boolean; serverEmail: boolean };
};

/** Go somewhere and redraw it from the server: after signing in or out, or switching workspace, every page's data is someone else's. */
export function useGo() {
  const router = useRouter();
  return (path: string) => {
    router.push(path);
    router.refresh();
  };
}

let channel: BroadcastChannel | null | undefined;
/** Where a tab says it switched workspace. One per tab: a channel never hears its own messages, so a tab never hears itself. */
export const workspaceChannel = () =>
  channel === undefined ? (channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("artbucket:workspace")) : channel;

/** The workspace cookie as this tab last wrote or saw it: a change it didn't make was made in another tab. */
let known: string | undefined;

/** The cookie lib/core/access.ts reads to pick the workspace. A year: it is a preference, not a secret. */
export function pickWorkspace(id: string) {
  document.cookie = `ab_workspace=${id}; path=/; max-age=31536000; samesite=lax`;
  known = id;
  workspaceChannel()?.postMessage(id);
}

/**
 * The workspace another tab switched this browser to since this tab last
 * looked, or null. The cookie is shared, so every request this tab makes
 * already goes there.
 */
export function switchedElsewhere(): string | null {
  const now = document.cookie.match(/(?:^|;\s*)ab_workspace=([^;]*)/)?.[1];
  if (!now || now === known) return null;
  known = now;
  return now;
}

/** Signs out, then goes to `to`; an invitation passes its own page, so it isn't lost. Offline, it stays and says so. */
export async function signOut(go: (path: string) => void, to = "/login") {
  const res = await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(
    () => null,
  );
  if (!res?.ok) {
    toast.error("Couldn't sign you out", { description: "Check the connection and try again." });
    return;
  }
  go(to);
}

const initials = (s: string) =>
  s
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/**
 * The sidebar's top: the mark, the workspace you are in and its
 * organization. Opens onto every workspace you can switch to, grouped by
 * organization, and making a new one.
 */
export function WorkspaceSwitcher({ me }: { me: Me }) {
  const router = useRouter();
  // The old workspace stays on screen until the new one arrives: say it's on its way.
  const [pending, start] = useTransition();
  const [making, setMaking] = useState<"workspace" | "organization" | null>(null);
  const { isMobile } = useSidebar();
  const orgs = new Map<string, { org: Ref; workspaces: WorkspaceRef[] }>();
  for (const w of me.workspaces) {
    const o = orgs.get(w.organization.id) ?? { org: w.organization, workspaces: [] };
    o.workspaces.push(w);
    orgs.set(w.organization.id, o);
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent gap-3" aria-busy={pending || undefined}>
            <BrandMark className="max-w-8" />
            <span className="grid min-w-0 flex-1 text-left leading-tight">
              <span className="truncate font-semibold tracking-tight">{me.workspace.name}</span>
              <span className="text-muted-foreground truncate text-xs">{me.workspace.organization.name}</span>
            </span>
            {pending ? (
              <IconLoader2 className="text-muted-foreground ml-auto animate-spin" aria-label="Switching workspace" />
            ) : (
              <IconSelector className="text-muted-foreground ml-auto" />
            )}
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64" side={isMobile ? "bottom" : "right"} align="start">
          {[...orgs.values()].map(({ org, workspaces }, i) => (
            <DropdownMenuGroup key={org.id}>
              {i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-muted-foreground flex items-center gap-1.5 text-xs font-normal">
                <IconBuilding className="size-3.5" /> {org.name}
              </DropdownMenuLabel>
              {workspaces.map((w) => (
                <DropdownMenuItem
                  key={w.id}
                  onSelect={() =>
                    w.id !== me.workspace.id &&
                    start(() => {
                      pickWorkspace(w.id);
                      router.push("/");
                      router.refresh();
                    })
                  }
                >
                  <span className="bg-muted text-muted-foreground flex size-5 items-center justify-center rounded text-2xs font-semibold uppercase">
                    {w.name[0]}
                  </span>
                  <span className="truncate">{w.name}</span>
                  {w.id === me.workspace.id && <IconCheck className="ml-auto" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ))}
          {(can(me, "organization.manage") || me.user) && <DropdownMenuSeparator />}
          {can(me, "organization.manage") && (
            <DropdownMenuItem onSelect={() => setMaking("workspace")}>
              <IconPlus /> New workspace in {me.workspace.organization.name}
            </DropdownMenuItem>
          )}
          {me.user && (
            <DropdownMenuItem onSelect={() => setMaking("organization")}>
              <IconBuilding /> New organization
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {making && <MakeDialog kind={making} org={me.workspace.organization.name} onClose={() => setMaking(null)} />}
    </>
  );
}

/** Name a new workspace or organization, then go into it. */
export function MakeDialog({ kind, org, onClose }: { kind: "workspace" | "organization"; org?: string; onClose: () => void }) {
  const id = useId();
  const go = useGo();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
            if (!name) return;
            setBusy(true);
            const made = await send("POST", kind === "workspace" ? "/api/v1/workspaces" : "/api/v1/organizations", { name });
            setBusy(false);
            if (!made) return;
            toast.success(`Made ${name}`);
            pickWorkspace(kind === "workspace" ? made.id : made.workspace.id);
            onClose();
            go("/");
          }}
        >
          <DialogHeader>
            <DialogTitle>{kind === "workspace" ? "New workspace" : "New organization"}</DialogTitle>
            <DialogDescription>
              {kind === "workspace"
                ? `A library of its own in ${org}: its own assets, collections, fields, brands and keys. The organization's admins can open it.`
                : "A team of its own, with a first workspace. You are its admin; invite people from Team."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={id}>Name</Label>
            <Input id={id} name="name" required maxLength={80} autoFocus placeholder={kind === "workspace" ? "Autumn campaign" : "Acme Studio"} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {kind === "workspace" ? "Make workspace" : "Make organization"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The sidebar's foot: who you are, settings, keys, theme and signing out; or signing in, for nobody, back to this page. */
export function AccountMenu({ me, openShortcuts }: { me: Me; openShortcuts: () => void }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const go = useGo();
  const pathname = usePathname();
  const params = useSearchParams();
  if (!me.user) {
    const here = `${pathname}${params.size ? `?${params}` : ""}`;
    return (
      <SidebarMenuButton asChild tooltip="Sign in">
        <Link href={here === "/" ? "/login" : `/login?next=${encodeURIComponent(here)}`}>
          <IconLogin /> <span>Sign in</span>
        </Link>
      </SidebarMenuButton>
    );
  }
  const who = me.user.name || me.user.email;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton className="data-[state=open]:bg-sidebar-accent" tooltip={who}>
          {/* A little wider than an icon, pulled left so its centre lines up with the icons above. */}
          <span className="bg-muted -ml-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold">
            {initials(who)}
          </span>
          <span className="truncate">{who}</span>
          <IconSelector className="text-muted-foreground ml-auto" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60" side={isMobile ? "top" : "right"} align="end">
        <DropdownMenuLabel className="grid font-normal">
          <span className="truncate font-medium">{who}</span>
          <span className="text-muted-foreground truncate text-xs">{me.user.email}</span>
          <span className="text-muted-foreground truncate text-xs">
            {me.scope ? `${roleName(me.scope)} in ${me.workspace.name}` : `Some of ${me.workspace.name}`}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/account/profile" onClick={() => setOpenMobile(false)}>
            <IconUser /> Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings" onClick={() => setOpenMobile(false)}>
            <IconSettings /> Settings
            <DropdownMenuShortcut className="flex gap-1 tracking-normal">
              <Kbd keys={["G"]} />
              <Kbd keys={["S"]} />
            </DropdownMenuShortcut>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            setOpenMobile(false);
            openShortcuts();
          }}
        >
          <IconKeyboard /> Keyboard shortcuts
          <DropdownMenuShortcut className="tracking-normal">
            <Kbd keys={["?"]} />
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <IconSunMoon /> Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <ThemeItems />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut(go)}>
          <IconLogout /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
