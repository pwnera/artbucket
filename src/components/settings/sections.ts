import {
  IconAdjustments,
  IconBuilding,
  IconHistory,
  IconLayoutGrid,
  IconMail,
  IconShare,
  IconUser,
  IconUsers,
  type Icon,
} from "@tabler/icons-react";
import type { Me } from "@/components/account";
import { can, type Action } from "@/lib/permissions";

/**
 * Settings, as a list of sections. Each belongs to a context (the workspace
 * you are in, its organization, or your own account), names the action that
 * opening it takes (lib/permissions.ts), and lives at /settings/{context}/{id}. The page, its menu and ⌘K all read
 * this list; adding a section is an entry here and a case in the page.
 */

export const CONTEXTS = ["workspace", "organization", "account"] as const;
export type Context = (typeof CONTEXTS)[number];

export type Section = {
  context: Context;
  id: string;
  label: string;
  icon: Icon;
  /** What it is for, under its title. */
  description: string;
  /** What opening it takes; none: anyone signed in (the account's own sections). */
  action: Action | null;
};

export const SECTIONS: Section[] = [
  {
    context: "workspace",
    id: "general",
    label: "General",
    icon: IconLayoutGrid,
    description: "The workspace's name. A workspace is a library of its own: assets, collections, fields, brands and keys.",
    action: "workspace.manage",
  },
  {
    context: "workspace",
    id: "fields",
    label: "Custom fields",
    icon: IconAdjustments,
    description: "Fields every asset here can carry. Required ones must be filled at upload, or come from a collection.",
    action: "field.manage",
  },
  {
    context: "workspace",
    id: "sharing",
    label: "Share links",
    icon: IconShare,
    description: "Links for people without an account: to look and download, or to send files in for review.",
    action: "share.manage",
  },
  {
    context: "organization",
    id: "general",
    label: "General",
    icon: IconBuilding,
    description: "The organization's name, as its people and invitations see it.",
    action: "organization.manage",
  },
  {
    context: "organization",
    id: "people",
    label: "People",
    icon: IconUsers,
    description: "Who is in, and what each may do: on the organization, a workspace, a collection or one asset.",
    action: "member.manage",
  },
  {
    context: "organization",
    id: "workspaces",
    label: "Workspaces",
    icon: IconLayoutGrid,
    description: "The organization's libraries. Its admins can open every one.",
    action: "organization.manage",
  },
  {
    context: "organization",
    id: "email",
    label: "Email",
    icon: IconMail,
    description: "How invitations and password resets are sent. Off until you turn it on.",
    action: "organization.manage",
  },
  {
    context: "organization",
    id: "audit",
    label: "Audit log",
    icon: IconHistory,
    description: "Who changed who may do what: sign-ins, access, invitations, keys, share links and settings.",
    action: "audit.read",
  },
  {
    context: "account",
    id: "profile",
    label: "Profile",
    icon: IconUser,
    description: "Your name and password.",
    action: null,
  },
];

export const hrefOf = (s: Pick<Section, "context" | "id">) => `/settings/${s.context}/${s.id}`;
/** Whether this person may open a section: its action, or for the account's, being signed in. */
export const opens = (me: Me, s: Section) => (s.action ? can(me, s.action) : !!me.user);
export const allowedFor = (me: Me) => SECTIONS.filter((s) => opens(me, s));
export const find = (context: string, id: string) => SECTIONS.find((s) => s.context === context && s.id === id);

/** How a context is headed in the menu: "Workspace · Library". */
export const contextTitle = (c: Context, me: Me) =>
  c === "workspace" ? `Workspace · ${me.workspace.name}` : c === "organization" ? `Organization · ${me.workspace.organization.name}` : "Account";
