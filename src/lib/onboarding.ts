import { gitLink } from "./git.ts";
import { brandPath, builderPath } from "./site.ts";

/**
 * Onboarding by use case (PRD): what someone came to do decides their first
 * win, so each is a short list that ends in it. A company's brand and
 * assets: a released brand. An open-source project's brand: public on
 * BrandHub (a public portal where the server has no hub). A client's: a
 * client workspace. A brand and design system for a product: the brand kept
 * in its code (a Git repository, from which its tokens and DESIGN.md go out
 * with every push). AI agents on the brand: a first MCP call. Every step is
 * checked off from what the app knows, never by hand.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

export const PATHS = [
  {
    id: "company",
    label: "Manage my company's brand and assets",
    blurb: "One library and one set of guidelines for everyone who makes things for you.",
    win: "a released brand",
  },
  {
    id: "oss",
    label: "Create a brand for my open-source project",
    blurb: "Logo, colors and usage rules, public for contributors, press and agents.",
    win: "your brand in public",
  },
  {
    id: "clients",
    label: "Manage brands and assets for my clients",
    blurb: "A workspace per client, and portals under your name or theirs.",
    win: "a client workspace",
  },
  {
    id: "product",
    label: "Build a brand and a design system for my product",
    blurb: "Rules as tokens, kept in Git and exported to your code.",
    win: "the brand in your code",
  },
  {
    id: "ai",
    label: "Give my AI agents our brand",
    blurb: "One MCP URL for Claude, Cursor, n8n and others, with the rules they must follow.",
    win: "a first MCP call",
  },
] as const;
export type PathId = (typeof PATHS)[number]["id"];

export const isPath = (p: unknown): p is PathId => PATHS.some((x) => x.id === p);

/** What the app knows, as the steps read it. */
export type Facts = {
  /** The organization has a name of its own, not "Default". */
  named: boolean;
  /** The app wears the organization's logo and color. */
  branded: boolean;
  /** The organization must turn its own email on (the server sends nobody's), and hasn't. */
  noEmail: boolean;
  uploaded: boolean;
  /** The default brand, as its status says (lib/readiness.ts); null when there is none. */
  brand: {
    slug: string;
    basics: boolean;
    tokens: boolean;
    published: boolean;
    git: boolean;
    /** Public on BrandHub. */
    public: boolean;
    /** A portal shows it. */
    portal: boolean;
  } | null;
  /** This server runs BrandHub. */
  hub: boolean;
  /** Someone else is in the organization, or invited. */
  team: boolean;
  workspaces: number;
  /** An agent is connected: a key exists. */
  agent: boolean;
  /** An agent called an MCP tool (the `tool` events Connections reads). */
  mcp: boolean;
  /** Where this server connects a brand to Git (GIT_CONNECT_URL), for an admin. */
  git: string | null;
};

export type OnboardingStep = {
  id: string;
  label: string;
  why: string;
  done: boolean;
  /** The path's first win: its last step. */
  win?: true;
  href?: string;
  /** Done where the list is: the library's own upload. */
  upload?: true;
};

/** A path's steps, in order, the win last. */
export function onboardingSteps(path: PathId, f: Facts): OnboardingStep[] {
  const b = f.brand;
  // Without a brand, every brand step starts by making one.
  const builder = b ? builderPath(b.slug) : "/brands";
  const basics = {
    id: "basics",
    label: "Set up your brand",
    why: "Colors, type, logo and voice, as pages people and agents read.",
    done: !!b?.basics,
    href: builder,
  };
  // Brand as code: the integration's connect page where the server has one, else the brand, whose Settings show the CLI way.
  const git = {
    id: "git",
    label: "Connect your Git repository",
    why: "The brand's files beside your code, reviewed in pull requests, in step both ways.",
    done: !!b?.git,
    href: b && f.git ? gitLink(f.git, b.slug) : b ? brandPath(b.slug) : "/brands",
  };
  const release = { id: "publish", label: "Release your brand", why: "Readers, portals and agents get what you release.", done: !!b?.published, href: builder };
  switch (path) {
    case "company":
      return [
        { id: "upload", label: "Upload your first assets", why: "Logos, photos, fonts: anything the brand uses.", done: f.uploaded, upload: true },
        basics,
        ...(f.noEmail ? [{ id: "email", label: "Turn on email", why: "Invites and password resets need it.", done: false, href: "/settings/organization/email" }] : []),
        { id: "team", label: "Invite your team", why: "Decide who can see, add and approve.", done: f.team, href: "/team" },
        git,
        { id: "publish", label: "Release your brand", why: "Readers, portals and agents get what you release.", done: !!b?.published, href: builder, win: true },
      ];
    case "oss":
      return [
        { ...basics, why: "Logo, colors, type and voice: start blank, from a template, or from your repository." },
        git,
        release,
        f.hub
          ? {
              id: "public",
              label: "Make it public on BrandHub",
              why: "Contributors, press and agents read it without an account.",
              done: !!b?.public,
              href: b ? `${brandPath(b.slug)}/settings` : "/brands",
              win: true,
            }
          : { id: "portal", label: "Open a public portal", why: "A press kit anyone can read, on its own address.", done: !!b?.portal, href: "/portals", win: true },
      ];
    case "product":
      return [
        { id: "tokens", label: "Put in your colors and type", why: "Each rule is a token: color, font, size.", done: !!b?.tokens, href: builder },
        { id: "publish", label: "Make a release", why: "Tokens and DESIGN.md serve what is released.", done: !!b?.published, href: builder },
        { ...git, why: "Brand as code: tokens and DESIGN.md go out to your code with every push.", win: true as const },
      ];
    case "clients":
      return [
        { id: "name", label: "Name your organization", why: "It heads every page, email and share link.", done: f.named, href: "/settings/organization/general" },
        { id: "look", label: "Put your logo on the app", why: "The app, emails and portals wear it and your color.", done: f.branded, href: "/settings/organization/branding" },
        { id: "workspace", label: "Make a client workspace", why: "One per client: its own library, brands and people.", done: f.workspaces > 1, href: "/settings/organization/workspaces", win: true },
      ];
    case "ai":
      return [
        basics,
        { id: "agent", label: "Connect an agent", why: "Claude, Cursor, ChatGPT: one URL for all of them.", done: f.agent, href: "/connections" },
        { id: "mcp", label: "Make its first call", why: "Ask it something only the brand can answer.", done: f.mcp, href: "/connections", win: true },
      ];
  }
}
