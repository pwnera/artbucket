import {
  IconAdjustments,
  IconAt,
  IconChartBar,
  IconBuilding,
  IconKey,
  IconLayoutGrid,
  IconMail,
  IconBrush,
  IconWorldWww,
  IconWorld,
  IconPalette,
  IconUser,
  IconUsers,
  IconUsersGroup,
  type Icon,
} from "@tabler/icons-react";
import type { Me } from "@/components/account";
import type { Feature } from "@/lib/limits";
import { can, type Action } from "@/lib/permissions";

/**
 * Settings, as a list of sections. Each belongs to a context (the workspace
 * you are in, its organization, or your own account), names the action that
 * opening it takes (lib/permissions.ts), and lives at /settings/{context}/{id}. The page, its menu and ⌘K all read
 * this list; adding a section is an entry here and a case in the page.
 */

export const CONTEXTS = ["workspace", "organization", "account", "development"] as const;
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
  /** A page of its own elsewhere, rather than a section at /settings/{context}/{id}. */
  href?: string;
  /** Only while developing (`pnpm dev`): a contributor's page, not a user's. */
  dev?: boolean;
  /** Left out for this person anyway: what it sets is the server's. */
  hidden?: (me: Me) => boolean;
  /** What using it takes (lib/limits.ts): switched off for the organization, it leads to the plan that has it, or is left out. */
  feature?: Feature;
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
    id: "members",
    label: "Members",
    icon: IconUsers,
    description: "Who can open this workspace and what each may do here: through the organization, here, or on some collections.",
    action: "member.manage",
  },
  {
    context: "workspace",
    id: "team",
    label: "Team",
    icon: IconUsersGroup,
    description: "Everyone in the organization, share and upload links, and the audit log.",
    action: "member.manage",
    href: "/team",
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
    context: "organization",
    id: "general",
    label: "General",
    icon: IconBuilding,
    description: "The organization's name, as its people and invitations see it, and deleting it.",
    action: "organization.manage",
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
    id: "usage",
    label: "Usage",
    icon: IconChartBar,
    description: "What the organization stores and serves, and any limits this server puts on it.",
    action: "organization.manage",
  },
  {
    context: "organization",
    id: "branding",
    label: "Branding",
    icon: IconBrush,
    description: "What your people and guests see the product called, and how it looks: the app, sign-in, share links, portals and email.",
    action: "organization.manage",
    feature: "branding",
  },
  {
    context: "organization",
    id: "domains",
    label: "Domains",
    icon: IconWorldWww,
    description: "Addresses of your own, for the app and for portals, each proved by a DNS record.",
    action: "organization.manage",
    feature: "domains",
  },
  {
    context: "organization",
    id: "hub",
    label: "BrandHub",
    icon: IconWorld,
    description: "Prove your listings are yours with a GitHub account, and act on what people report or claim about them.",
    action: "organization.manage",
    hidden: (me) => !me.hub,
  },
  {
    context: "organization",
    id: "email-domains",
    label: "Email domains",
    icon: IconAt,
    description: "The domains your people have their email at, each proved by a DNS record.",
    action: "organization.manage",
  },
  {
    context: "organization",
    id: "sso",
    label: "Single sign-on",
    icon: IconKey,
    description: "Your people sign in through your own identity provider, by the domain of their work email.",
    action: "organization.manage",
    feature: "sso",
  },
  {
    context: "organization",
    id: "email",
    label: "Email",
    icon: IconMail,
    description: "How invitations and password resets are sent. Off until you turn it on.",
    action: "organization.manage",
    hidden: (me) => me.auth.serverEmail,
  },
  {
    context: "account",
    id: "profile",
    label: "Profile",
    icon: IconUser,
    description: "Your name and password.",
    action: null,
  },
  {
    context: "development",
    id: "design",
    label: "Design system",
    icon: IconPalette,
    description: "Every component in use, as a living reference.",
    action: null,
    href: "/design",
    dev: true,
  },
];

export const hrefOf = (s: Pick<Section, "context" | "id" | "href">) => s.href ?? `/settings/${s.context}/${s.id}`;
/** Whether this person may open a section: its action, or for the account's, being signed in. */
export const opens = (me: Me, s: Section) =>
  (!s.dev || process.env.NODE_ENV === "development") && !s.hidden?.(me) && (s.action ? can(me, s.action) : s.dev || !!me.user);
/** Its feature is off for the organization: the section is a plan's, not this person's yet. */
export const locked = (me: Me, s: Section) => !!s.feature && !!me.features && !me.features.includes(s.feature);
/** Where the menu takes this section: the plan that has it when locked, else the section. */
export const hrefFor = (me: Me, s: Section) => (locked(me, s) ? me.upgrade! : hrefOf(s));
/** The sections to list: what this person may open, a locked one only where there is a plan to take. */
export const allowedFor = (me: Me) => SECTIONS.filter((s) => opens(me, s) && (!locked(me, s) || !!me.upgrade));
export const find = (context: string, id: string) => SECTIONS.find((s) => s.context === context && s.id === id);

/** How a context is headed in the menu: "Workspace · Library". */
export const contextTitle = (c: Context, me: Me) =>
  c === "workspace"
    ? `Workspace · ${me.workspace.name}`
    : c === "organization"
      ? `Organization · ${me.workspace.organization.name}`
      : c === "account"
        ? "Account"
        : "Development";
