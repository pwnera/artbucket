import {
  IconAdjustments,
  IconCreditCard,
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
} from "@/components/icons";
import type { Me } from "@/components/account";
import type { Feature } from "@/lib/limits";
import { can, type Action } from "@/lib/permissions";

/**
 * Settings, as a list of sections. Each belongs to a context (the project
 * you are in, its organization, or your own account), names the action that
 * opening it takes (lib/permissions.ts), and lives at /settings/{context}/{id}. The page, its menu and ⌘K all read
 * this list; adding a section is an entry here and a case in the page.
 */

export const CONTEXTS = ["project", "organization", "account", "development"] as const;
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
    context: "project",
    id: "general",
    label: "General",
    icon: IconLayoutGrid,
    description: "The project's name.",
    action: "project.manage",
  },
  {
    context: "project",
    id: "members",
    label: "Members",
    icon: IconUsers,
    description: "Who can open this project, and as what.",
    action: "member.manage",
  },
  {
    context: "project",
    id: "team",
    label: "Team",
    icon: IconUsersGroup,
    description: "People, share links and the audit log.",
    action: "member.manage",
    href: "/team",
  },
  {
    context: "project",
    id: "fields",
    label: "Custom fields",
    icon: IconAdjustments,
    description: "Fields every asset here can carry.",
    action: "field.manage",
  },
  {
    context: "organization",
    id: "general",
    label: "General",
    icon: IconBuilding,
    description: "The organization's name.",
    action: "organization.manage",
  },
  {
    context: "organization",
    id: "projects",
    label: "Projects",
    icon: IconLayoutGrid,
    description: "The organization's libraries.",
    action: "organization.manage",
  },
  {
    context: "organization",
    id: "groups",
    label: "Groups",
    icon: IconUsersGroup,
    description: "People who share access: give a group a role, and each of its members has it.",
    action: "organization.manage",
  },
  {
    context: "organization",
    id: "usage",
    label: "Usage",
    icon: IconChartBar,
    description: "Storage, delivery and limits.",
    action: "organization.manage",
  },
  {
    context: "organization",
    id: "branding",
    label: "Branding",
    icon: IconBrush,
    description: "The product's name, logo and accent.",
    action: "organization.manage",
    feature: "branding",
  },
  {
    context: "organization",
    id: "domains",
    label: "Domains",
    icon: IconWorldWww,
    description: "Your own addresses for the app and portals, and where your people have their email.",
    action: "organization.manage",
    // Not gated as a whole: email domains are everyone's, the web half is a plan's (feature "domains") and says so itself.
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
    id: "sso",
    label: "Single sign-on",
    icon: IconKey,
    description: "Sign in through your identity provider.",
    action: "organization.manage",
    feature: "sso",
  },
  {
    context: "organization",
    id: "email",
    label: "Email sending",
    icon: IconMail,
    description: "How invitations and password resets are sent.",
    action: "organization.manage",
    hidden: (me) => me.auth.serverEmail,
  },
  {
    context: "organization",
    id: "billing",
    label: "Billing",
    icon: IconCreditCard,
    description: "The organization's plan and payments.",
    action: "organization.manage",
    // The page sends it on to me.billing (BILLING_URL).
    hidden: (me) => !me.billing,
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
/** The organization may use this feature. */
export const has = (me: Me, f: Feature) => !me.features || me.features.includes(f);
/** Its feature is off for the organization: the section is a plan's, not this person's yet. */
export const locked = (me: Me, s: Section) => !!s.feature && !has(me, s.feature);
/** Where the menu takes this section: the plan that has it when locked, else the section. */
export const hrefFor = (me: Me, s: Section) => (locked(me, s) ? me.upgrade! : hrefOf(s));
/** The sections to list: what this person may open, a locked one only where there is a plan to take. */
export const allowedFor = (me: Me) => SECTIONS.filter((s) => opens(me, s) && (!locked(me, s) || !!me.upgrade));
export const find = (context: string, id: string) => SECTIONS.find((s) => s.context === context && s.id === id);

/** How a context is headed in the menu: "Project · Library". */
export const contextTitle = (c: Context, me: Me) =>
  c === "project"
    ? `Project · ${me.project.name}`
    : c === "organization"
      ? `Organization · ${me.project.organization.name}`
      : c === "account"
        ? "Account"
        : "Development";
