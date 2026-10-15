import preview from "#.storybook/preview";
import { sidebar } from "#.storybook/fixtures/library";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { delay, http, HttpResponse } from "msw";
import { expect, screen, waitFor, within } from "storybook/test";
import type { Me } from "@/components/account";
import { AccessProvider } from "@/components/can";
import { AppHeader } from "@/components/page";
import { Shell } from "@/components/shell";
import type { SidebarData } from "@/lib/sidebar";

/** Who looks, as the layout hands it, with `over` on top: a notice, an offer to join, an assistant. */
const data = (over: Partial<Me> = {}): SidebarData => {
  const s = sidebar("admin");
  return { ...s, me: { ...s.me, ...over } };
};

const noticed = { sidebar: data({ notice: { text: "Your Team plan ends on 1 November 2026. Past that, Acme is read-only.", href: "/billing" } }) };
const offered = { sidebar: data({ joinable: { organization: { id: "org_northwind", name: "Northwind" }, domain: "acme.test" } }) };

/** What the last write sent, newest last. */
let sent: { method: string; path: string }[] = [];
const take = async ({ request }: { request: Request }) => {
  sent.push({ method: request.method, path: new URL(request.url).pathname });
  await delay(100);
  return HttpResponse.json({ data: {} });
};

/**
 * The app's frame, mounted once by the (app) layout: the sidebar, the operator's notice and an organization's offer
 * across the top, ⌘K, the "?" sheet, the collection dialog and the assistant's panel stay put while pages swap beside
 * them. On a phone the sidebar is a sheet. The sidebar's own stories are in Shell/Sidebar.
 */
const meta = preview.meta({
  title: "App/Features/Shell/Shell",
  component: Shell,
  args: { sidebar: data(), defaultOpen: true, defaultWidth: null, children: null },
  argTypes: { sidebar: { control: false }, children: { control: false } },
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/" } } },
  render: (args) => (
    <AccessProvider me={args.sidebar.me}>
      <Shell {...args}>
        <AppHeader trail={[{ label: "Explore" }]} />
        <div className="space-y-2 p-6 text-sm">
          <h1 className="font-display text-xl font-semibold">Explore</h1>
          <p className="text-muted-foreground">The page beside the sidebar.</p>
        </div>
      </Shell>
    </AccessProvider>
  ),
  beforeEach: () => {
    sent = [];
    document.cookie = "sidebar_state=; path=/; max-age=0";
    const project = document.cookie.match(/(?:^|;\s*)ab_project=([^;]*)/)?.[1];
    return () => {
      document.cookie = project ? `ab_project=${project}; path=/` : "ab_project=; path=/; max-age=0";
      for (const k of Object.keys(sessionStorage)) if (k.startsWith("notice:")) sessionStorage.removeItem(k);
    };
  },
});

/** The frame around a page: the sidebar open, the header with its toggle, the page in the main landmark. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("main")).toHaveTextContent("The page beside the sidebar.");
    await expect(canvas.getByRole("button", { name: "Toggle sidebar" })).toBeInTheDocument();
    await expect(document.querySelector("[data-slot=sidebar]")).toHaveAttribute("data-state", "expanded");
  },
});

/** Opened folded, as the person last left it. */
export const Folded = meta.story({ args: { defaultOpen: false } });

/**
 * The operator's word to an organization's admins (a plan that ends, a failed payment), across the top of every page.
 * Closed, it stays closed in this tab; it stands until the server drops it.
 */
export const Notice = meta.story({
  args: noticed,
  play: async ({ canvas, userEvent }) => {
    const banner = canvas.getByRole("status");
    await expect(banner).toHaveTextContent("Your Team plan ends on 1 November 2026.");
    await expect(within(banner).getByRole("link", { name: "See the plan" })).toHaveAttribute("href", "/billing");
    await userEvent.click(within(banner).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(banner).not.toBeInTheDocument());
    await expect(sessionStorage.getItem("notice:Your Team plan ends on 1 November 2026. Past that, Acme is read-only.")).toBe("1");
  },
});

/** An organization opened the domain of the person's address: join it, or not now (which the server keeps). */
export const JoinOffer = meta.story({
  args: offered,
  beforeEach: ({ msw }) => void msw.use(http.post("/api/v1/join", take), http.delete("/api/v1/join", take)),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("Northwind is here, with your acme.test address. Join it to look around.");
    await userEvent.click(canvas.getByRole("button", { name: "Join Northwind" }));
    await expect(await screen.findByText("You joined Northwind")).toBeInTheDocument();
    await expect(sent).toEqual([{ method: "POST", path: "/api/v1/join" }]);
    await expect(getRouter().refresh).toHaveBeenCalled();
    await expect(canvas.queryByRole("status")).not.toBeInTheDocument();
  },
});

export const JoinNotNow = meta.story({
  args: offered,
  beforeEach: ({ msw }) => void msw.use(http.delete("/api/v1/join", take)),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(canvas.queryByRole("status")).not.toBeInTheDocument());
    await expect(sent).toEqual([{ method: "DELETE", path: "/api/v1/join" }]);
  },
});

/** ⌘K (Ctrl+K) opens Jump to from anywhere, "?" the keyboard shortcuts. */
export const Keys = meta.story({
  play: async ({ userEvent }) => {
    await userEvent.keyboard("{Control>}k{/Control}");
    await expect(await screen.findByRole("dialog", { name: "Jump to" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await userEvent.keyboard("?");
    await expect(await screen.findByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** The project cookie is every tab's: switched in another, this tab says so when looked at again and loads it. */
export const SwitchedElsewhere = meta.story({
  play: async () => {
    document.cookie = "ab_project=prj_northwind; path=/";
    window.dispatchEvent(new Event("focus"));
    await expect(await screen.findByText("You switched project in another tab")).toBeInTheDocument();
    await expect(getRouter().refresh).toHaveBeenCalled();
  },
});

/** New collection, from ⌘K: the dialog is the shell's, for every page. */
export const NewCollection = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/fields", () => HttpResponse.json({ data: [] }))),
  play: async ({ userEvent }) => {
    await userEvent.keyboard("{Control>}k{/Control}");
    const palette = await screen.findByRole("dialog", { name: "Jump to" });
    await userEvent.type(within(palette).getByRole("combobox"), "new collection");
    await userEvent.click(await screen.findByRole("option", { name: /New collection/ }));
    const dialog = await screen.findByRole("dialog", { name: "New collection" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** With the server's assistant: Ask in the sidebar opens its panel, and the page leaves room for it. */
export const WithAssistant = meta.story({
  args: { sidebar: data({ assistant: "https://app.acme.test/assistant" }) },
  globals: { viewport: { value: "laptop" } },
  beforeEach: ({ msw }) =>
    void msw.use(http.get("https://app.acme.test/assistant", () => HttpResponse.json({ data: { notice: null, project: "Acme", chats: [], ideas: { library: [], asset: [] } } }))),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Ask" }));
    const panel = await screen.findByRole("complementary", { name: "Assistant" });
    await expect(await within(panel).findByRole("heading", { name: "Ask Artbucket" })).toBeInTheDocument();
    await expect(document.documentElement.style.getPropertyValue("--assistant-w")).toMatch(/^\d+px$/);
  },
});

/** On a phone: the sidebar is a sheet from the header's toggle, and the notice wraps above the page. */
export const Phone = meta.story({
  args: noticed,
  globals: { viewport: { value: "phone" } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Toggle sidebar" }));
    const sheet = await screen.findByRole("dialog", { name: "Sidebar" });
    await expect(within(sheet).getByRole("link", { name: "Explore" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

export const Dark = meta.story({ args: noticed, globals: { theme: "dark" } });
