import preview from "#.storybook/preview";
import { useLinkStatus } from "@storybook/nextjs-vite/link.mock";
import { useSelectedLayoutSegments } from "@storybook/nextjs-vite/navigation.mock";
import { expect, mocked, within } from "storybook/test";
import { inApp } from "#.storybook/fixtures/library";
import { SettingsShell } from "@/components/settings/shell";

/** The section on show, as settings/layout.tsx reads it from the URL: past the route group. */
const at = (context: string, id: string) => () => void mocked(useSelectedLayoutSegments).mockReturnValue(["(sections)", context, id]);
const ADMIN = { hub: true, billing: "https://app.artbucket.test/billing", auth: { signUp: true, setupToken: false, open: false, oidc: null, google: false, sso: false, anonymous: null, passwordReset: true, serverEmail: false, captcha: null, turnstile: null } };

const meta = preview.meta({
  title: "App/Features/Settings/Shell",
  component: SettingsShell,
  args: { children: <p className="text-muted-foreground text-sm">The section&apos;s panel.</p> },
  decorators: [inApp],
  parameters: { layout: "fullscreen", app: { me: ADMIN } },
  beforeEach: at("organization", "sso"),
});

/** An organization admin on Single sign-on: every section they may open, by what it applies to, this one marked. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    const nav = canvas.getByRole("navigation", { name: "Settings" });
    await expect(within(nav).getByRole("link", { name: "Single sign-on" })).toHaveAttribute("aria-current", "page");
    await expect(canvas.getByRole("heading", { name: "Single sign-on" })).toBeInTheDocument();
    // Each section's link is its own address (hrefFor); People holds members, links and the audit log; Automations is in the sidebar.
    await expect(within(nav).getByRole("link", { name: "Groups" })).toHaveAttribute("href", "/settings/organization/groups");
    await expect(within(nav).getByRole("link", { name: "People" })).toHaveAttribute("href", "/settings/project/people");
    for (const name of ["Team", "Members"]) await expect(within(nav).queryByRole("link", { name })).not.toBeInTheDocument();
    await expect(within(nav).queryByRole("link", { name: "Automations" })).not.toBeInTheDocument();
    // Shown only where they apply (allowedFor): BrandHub with hub on, Email sending where the server sends none.
    await expect(within(nav).getByRole("link", { name: "BrandHub" })).toBeInTheDocument();
    await expect(within(nav).getByRole("link", { name: "Email sending" })).toBeInTheDocument();
  },
});

/** Another section open: the mark and the title move with the URL. */
export const OtherSection = meta.story({
  beforeEach: at("project", "features"),
  play: async ({ canvas }) => {
    const nav = canvas.getByRole("navigation", { name: "Settings" });
    await expect(within(nav).getByRole("link", { name: "Single sign-on" })).not.toHaveAttribute("aria-current");
    const features = within(nav).getAllByRole("link", { name: "Features" });
    await expect(features[0]).toHaveAttribute("aria-current", "page");
    await expect(features[1]).toHaveAttribute("href", "/settings/organization/features");
    await expect(canvas.getByText("What this project uses, where the organization lets it decide.")).toBeInTheDocument();
  },
});

/** A plan without single sign-on or branding: their links lead to the plans, locked. */
export const Locked = meta.story({
  beforeEach: at("organization", "general"),
  parameters: { app: { me: { ...ADMIN, features: ["agents", "shares", "domains", "rebuilds"], upgrade: "https://app.artbucket.test/billing/plans" } } },
  play: async ({ canvas }) => {
    const sso = within(canvas.getByRole("navigation", { name: "Settings" })).getByRole("link", { name: /Single sign-on/ });
    await expect(sso).toHaveAttribute("href", "https://app.artbucket.test/billing/plans");
    await expect(sso).toHaveAttribute("title", "On a paid plan: upgrade to use it");
  },
});

/** Someone who manages nothing: their own account's sections only. */
export const Viewer = meta.story({
  beforeEach: at("account", "profile"),
  parameters: { app: { scope: "read" } },
  play: async ({ canvas }) => {
    const nav = canvas.getByRole("navigation", { name: "Settings" });
    await expect(within(nav).getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
    await expect(within(nav).queryByRole("link", { name: "People" })).not.toBeInTheDocument();
    await expect(within(nav).queryByRole("link", { name: "Single sign-on" })).not.toBeInTheDocument();
  },
});

/** A section on its way: a spinner in its icon's place, the same size. */
export const Pending = meta.story({
  beforeEach: () => {
    mocked(useLinkStatus).mockReturnValue({ pending: true });
    return () => void mocked(useLinkStatus).mockReturnValue({ pending: false });
  },
});

/** Settings' own page, no section open: the menu alone. */
export const NoSection = meta.story({ beforeEach: () => void mocked(useSelectedLayoutSegments).mockReturnValue([]) });

/** On a phone the menu is a row that scrolls sideways, the open section kept in view. */
export const Phone = meta.story({ beforeEach: at("organization", "branding"), globals: { viewport: { value: "phone" } } });
