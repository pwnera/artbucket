import preview from "#.storybook/preview";
import { me, viewer } from "#.storybook/fixtures/brands";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { delay, http, HttpResponse } from "msw";
import { expect, fn, screen, waitFor } from "storybook/test";
import { AccountMenu, MakeDialog, ProjectSwitcher, type Me } from "@/components/account";
import { SidebarMenu, SidebarMenuItem, SidebarProvider } from "@/components/ui/sidebar";

/** The sidebar's top and foot, outside the shell: a sidebar of their own, open, so they read as they do there. */
const InSidebar = ({ children }: { children: React.ReactNode }) => (
  <SidebarProvider defaultOpen className="min-h-0">
    <SidebarMenu className="w-64">
      <SidebarMenuItem>{children}</SidebarMenuItem>
    </SidebarMenu>
  </SidebarProvider>
);

/** Whatever was open (a menu, a dialog) is gone and the page is no longer hidden behind it: axe runs after this. */
const settled = () => waitFor(() => expect(document.querySelector("[data-aria-hidden]")).toBeNull());

/** What the last write sent, newest last. */
let sent: { method: string; path: string; body: unknown }[] = [];
const take = (data: unknown, status = 200) =>
  async ({ request }: { request: Request }) => {
    sent.push({ method: request.method, path: new URL(request.url).pathname, body: await request.json().catch(() => null) });
    await delay(100);
    return status < 400 ? HttpResponse.json({ data }) : HttpResponse.json({ error: { message: "That didn't work" } }, { status });
  };

/**
 * The sidebar's foot: who you are, settings, theme, help and signing out; or, signed out, Sign in back to this page.
 * Its top is the project switcher, below.
 */
const meta = preview.meta({
  title: "App/Features/Account/Account menu",
  component: AccountMenu,
  args: { me, openShortcuts: fn() },
  argTypes: { me: { control: false } },
  render: (args) => (
    <InSidebar>
      <AccountMenu {...args} />
    </InSidebar>
  ),
  beforeEach: () => {
    sent = [];
    // Switching project writes the project cookie: put it back as it was.
    const was = document.cookie.match(/(?:^|;\s*)ab_project=([^;]*)/)?.[1];
    return () => void (document.cookie = was ? `ab_project=${was}; path=/` : "ab_project=; path=/; max-age=0");
  },
});

/** Who you are and your role here, then Profile, Settings, Theme, Help and Sign out. */
export const Playground = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Ada Lovelace/ }));
    const menu = await screen.findByRole("menu");
    await expect(menu).toHaveTextContent("ada@acme.test");
    await expect(menu).toHaveTextContent("Admin in Acme");
    await expect(screen.getByRole("menuitem", { name: "Profile" })).toHaveAttribute("href", "/settings/account/profile");
    await expect(screen.getByRole("menuitem", { name: /Settings/ })).toHaveAttribute("href", "/settings");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(menu).not.toBeInTheDocument());
    await settled();
  },
});

/** Help: the docs, the keyboard shortcuts, an issue, and feedback to whoever runs the server. */
export const Help = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Ada Lovelace/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Help" }));
    await expect(await screen.findByRole("menuitem", { name: "Send feedback" })).toBeInTheDocument();
    await expect(screen.getByRole("menuitem", { name: "Docs (opens in a new tab)" })).toHaveAttribute("target", "_blank");
    await userEvent.click(screen.getByRole("menuitem", { name: /Keyboard shortcuts/ }));
    await expect(args.openShortcuts).toHaveBeenCalledOnce();
    await settled();
  },
});

/** Signing out goes to sign-in. */
export const SignOut = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.post("/api/auth/sign-out", take({}))),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Ada Lovelace/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/login"));
    await expect(sent.at(-1)?.path).toBe("/api/auth/sign-out");
    await settled();
  },
});

/** Offline, signing out stays put and says so, rather than seeming signed out. */
export const SignOutFails = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.post("/api/auth/sign-out", () => HttpResponse.error())),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Ada Lovelace/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    await expect(await screen.findByText("Couldn't sign you out")).toBeInTheDocument();
    await expect(getRouter().push).not.toHaveBeenCalled();
    await settled();
  },
});

/** Nobody signed in (a public library): Sign in, coming back to this page. */
export const SignedOut = meta.story({
  args: { me: { ...me, user: null } as Me },
  parameters: { nextjs: { navigation: { pathname: "/brands/acme" } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?next=%2Fbrands%2Facme");
  },
});

/** A long name and address: truncated, never wider than the sidebar. */
export const LongName = meta.story({
  args: { me: { ...me, user: { id: "usr_long", name: "Maximiliana Theodora Featherstonehaugh-Montgomery", email: "maximiliana.featherstonehaugh@acme-international.test" } } },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

// ---- the project switcher ---------------------------------------------------------------------------------

/**
 * The sidebar's top: the mark, the project and its organization. It opens onto every project, by organization; one
 * picked sets the project cookie and loads it, and every tab hears of it.
 */
export const ProjectSwitcher_ = meta.story({
  name: "Project switcher",
  render: (args) => (
    <InSidebar>
      <ProjectSwitcher me={args.me} />
    </InSidebar>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Acme/ }));
    await expect(await screen.findByRole("menuitem", { name: "A Acme" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "N Northwind" }));
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/"));
    await expect(document.cookie).toContain("ab_project=prj_northwind");
    await settled();
  },
});

/** New project, from the switcher: named, made, then gone into. */
export const NewProject = meta.story({
  render: (args) => (
    <InSidebar>
      <ProjectSwitcher me={args.me} />
    </InSidebar>
  ),
  beforeEach: ({ msw }) => void msw.use(http.post("/api/v1/projects", take({ id: "prj_autumn", name: "Autumn campaign" }))),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Acme/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "New project in Acme" }));
    const dialog = await screen.findByRole("dialog", { name: "New project" });
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Autumn campaign");
    await userEvent.click(screen.getByRole("button", { name: "Make project" }));
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/"));
    await expect(sent.at(-1)).toEqual({ method: "POST", path: "/api/v1/projects", body: { name: "Autumn campaign" } });
    await expect(await screen.findByText("Made Autumn campaign")).toBeInTheDocument();
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await settled();
  },
});

/** Someone who can't manage the organization: switch, or start an organization of their own, but no new project here. */
export const ProjectSwitcherViewer = meta.story({
  args: { me: viewer },
  render: (args) => (
    <InSidebar>
      <ProjectSwitcher me={args.me} />
    </InSidebar>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Acme/ }));
    await expect(await screen.findByRole("menuitem", { name: "New organization" })).toBeInTheDocument();
    await expect(screen.queryByRole("menuitem", { name: /New project/ })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await settled();
  },
});

/** Naming a new organization: it comes with a first project, and its maker is its admin. A refusal keeps it open. */
export const NewOrganizationRefused = meta.story({
  render: () => <MakeDialog kind="organization" onClose={fn()} />,
  beforeEach: ({ msw }) => void msw.use(http.post("/api/v1/organizations", take(null, 422))),
  play: async ({ userEvent }) => {
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Northwind Studio");
    await userEvent.click(screen.getByRole("button", { name: "Make organization" }));
    await expect(await screen.findByText("That didn't work")).toBeInTheDocument();
    await expect(screen.getByRole("dialog", { name: "New organization" })).toBeInTheDocument();
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
});
