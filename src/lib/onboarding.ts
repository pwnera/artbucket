import { gitLink } from "./git.ts";
import { brandPath, guidelinesPath } from "./site.ts";

/**
 * Onboarding by path (PRD): who someone is decides what their first win is,
 * so each path is a short list that ends in it. A brand manager's is a
 * published brand; a design system's, the brand kept in its code (a Git
 * repository, from which its tokens and DESIGN.md go out with every push);
 * an agency's, a client workspace; an AI builder's, a first MCP call. Every
 * step is checked off from what the app knows, never by hand.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

export const PATHS = [
  { id: "brand", label: "I manage a brand", win: "a published brand" },
  { id: "system", label: "I run a design system", win: "the brand in your code" },
  { id: "agency", label: "I'm an agency", win: "a client workspace" },
  { id: "ai", label: "I build with AI", win: "a first MCP call" },
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
  brand: { slug: string; basics: boolean; tokens: boolean; published: boolean; git: boolean } | null;
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
  const builder = b ? guidelinesPath(b.slug) : "/brands";
  const basics = {
    id: "basics",
    label: "Set up your brand",
    why: "Colors, type, logo and voice, as pages people and agents read.",
    done: !!b?.basics,
    href: builder,
  };
  switch (path) {
    case "brand":
      return [
        { id: "upload", label: "Upload your first assets", why: "Logos, photos, fonts: anything the brand uses.", done: f.uploaded, upload: true },
        basics,
        ...(f.noEmail ? [{ id: "email", label: "Turn on email", why: "Invites and password resets need it.", done: false, href: "/settings/organization/email" }] : []),
        { id: "team", label: "Invite your team", why: "Decide who can see, add and approve.", done: f.team, href: "/team" },
        { id: "publish", label: "Publish your brand", why: "Readers, portals and agents get what you publish.", done: !!b?.published, href: builder, win: true },
      ];
    case "system":
      return [
        { id: "tokens", label: "Put in your colors and type", why: "Each rule is a token: color, font, size.", done: !!b?.tokens, href: builder },
        { id: "publish", label: "Publish a release", why: "Tokens and DESIGN.md serve what is published.", done: !!b?.published, href: builder },
        {
          id: "git",
          label: "Keep it in your code",
          why: "Brand as code: the brand's files in a Git repository, reviewed in pull requests.",
          done: !!b?.git,
          href: b && f.git ? gitLink(f.git, b.slug) : b ? brandPath(b.slug) : "/brands",
          win: true,
        },
      ];
    case "agency":
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
