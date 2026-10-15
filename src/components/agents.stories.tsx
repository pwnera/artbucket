import preview from "#.storybook/preview";
import { asked, key, keys, kept } from "#.storybook/fixtures/account";
import { NOW, me, viewer, withMe } from "#.storybook/fixtures/brands";
import { inApp } from "#.storybook/fixtures/library";
import { delay, http, HttpResponse } from "msw";
import { expect, screen, spyOn, waitFor, within } from "storybook/test";
import { Agents } from "@/components/agents";

const ORIGIN = "https://app.acme.test";
const MCP = `${ORIGIN}/api/v1/mcp`;

/** What the last write sent, newest last. */
let sent: { method: string; path: string; body: unknown }[] = [];
const take = (data: (body: Record<string, unknown>) => unknown) =>
  async ({ request }: { request: Request }) => {
    const body = request.method === "DELETE" ? null : ((await request.json().catch(() => null)) as Record<string, unknown> | null);
    sent.push({ method: request.method, path: new URL(request.url).pathname, body });
    await delay(100);
    return HttpResponse.json({ data: data(body ?? {}) });
  };

/** The page's tab is the URL's `?tab=`: what the story opens on. */
const on = (tab: string) => ({ nextjs: { navigation: { pathname: "/connections", query: { tab } } } });

/** Whatever was open (a menu, a dialog) is gone and the page is no longer hidden behind it: axe runs after this. */
const settled = () => waitFor(() => expect(document.querySelector("[data-aria-hidden]")).toBeNull());

/**
 * Connections: every agent the catalog knows as a card (Apps), the agents people connected and what each asked for
 * (Connected), the keys an admin made for scripts (API keys) and the brands kept in Git (Repositories). Each card
 * opens its setup: what to paste where, a key when it needs one, and a wait for its first call.
 */
const meta = preview.meta({
  title: "App/Features/AI/Agents",
  component: Agents,
  args: { keys, origin: ORIGIN, anonymous: null, asked, kept, connect: "https://app.artbucket.test/github/connect" },
  argTypes: { keys: { control: false }, asked: { control: false }, kept: { control: false } },
  // Inner first: who is looking (Ada, an admin), inside the app's shell.
  decorators: [withMe(me), inApp],
  parameters: { layout: "fullscreen", ...on("apps") },
  beforeEach: ({ msw }) => {
    sent = [];
    msw.use(
      http.post("/api/v1/keys", take((b) => ({ ...key({ id: "key_new", name: String(b.name), scope: b.scope as "read" }), secret: "ab_live_9d2e7f1c4b8a" }))),
      http.delete("/api/v1/keys/:id", take(() => ({}))),
      http.patch("/api/v1/keys/:id", take(() => ({}))),
      http.get("/api/v1/keys", () => HttpResponse.json({ data: keys })),
    );
    // A tab writes the URL (?tab=) in place; here it is only recorded, so the story's own address stays.
    const replace = spyOn(history, "replaceState").mockImplementation(() => {});
    const copy = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    // "2 days ago" reads against a fixed now; swapped by hand (a spy on Date.now recurses).
    const real = Date.now;
    Date.now = () => NOW.getTime();
    return () => {
      replace.mockRestore();
      copy.mockRestore();
      Date.now = real;
    };
  },
});

/** Apps: one URL for every agent, the groups, and each card saying whether it is connected here. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("tab", { name: "Apps", selected: true })).toBeInTheDocument();
    await expect(canvas.getByText(MCP)).toBeInTheDocument();
    // Claude has one connected, ChatGPT none.
    await expect(canvas.getByRole("button", { name: "Setup for Claude" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Connect ChatGPT" })).toBeInTheDocument();
  },
});

/** An agent's setup: what to paste where, copied in one click, and a wait for its first call. */
export const CopySetup = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Connect ChatGPT" }));
    const dialog = await screen.findByRole("dialog", { name: "ChatGPT" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Copy the URL" }));
    await expect(navigator.clipboard.writeText).toHaveBeenCalledWith(MCP);
    await expect(within(dialog).getByText("Waiting for its first call")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await settled();
  },
});

/** Its first call arrives (the keys are asked again every 3 seconds): it is connected, with something to try. */
export const FirstCall = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get("/api/v1/keys", () =>
        HttpResponse.json({ data: [...keys, key({ id: "key_gpt", name: "ChatGPT (Ada Lovelace)", owner: "Ada Lovelace", lastUsedAt: new Date(NOW).toISOString(), calls: 1, projects: ["Acme"] })] }),
      ),
    ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Connect ChatGPT" }));
    const dialog = await screen.findByRole("dialog", { name: "ChatGPT" });
    await expect(await within(dialog).findByText("ChatGPT (Ada Lovelace)", {}, { timeout: 5000 })).toBeInTheDocument();
    await expect(within(dialog).getByText(/is connected\./)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await settled();
  },
});

/** An agent that needs a key (n8n): made right there, filled into the setup and shown once; closing without Done asks first. */
export const SetupWithAKey = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("radio", { name: "Automations" }));
    await userEvent.click(canvas.getByRole("button", { name: "Connect n8n" }));
    const dialog = await screen.findByRole("dialog", { name: "n8n" });
    await expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue("n8n");
    await userEvent.click(within(dialog).getByRole("button", { name: "Make key" }));
    await expect(await within(dialog).findByText("Key filled in below. Copy it now: it is shown only once.")).toBeInTheDocument();
    await expect(within(dialog).getAllByText(/ab_live_9d2e7f1c4b8a/).length).toBeGreaterThan(0);
    await expect(sent.at(-1)).toEqual({ method: "POST", path: "/api/v1/keys", body: { name: "n8n", scope: "propose" } });
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await expect(await screen.findByRole("alertdialog", { name: "Close without copying the key?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await settled();
  },
});

/** A search looks through every group; nothing found points to any MCP client. */
export const Search = meta.story({
  play: async ({ canvas, userEvent }) => {
    const find = canvas.getByRole("searchbox", { name: "Find your agent" });
    await userEvent.type(find, "cursor");
    // Omar connected Cursor: its card opens its setup.
    await expect(canvas.getByRole("button", { name: "Setup for Cursor" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Setup for Claude" })).not.toBeInTheDocument();
    await userEvent.clear(find);
    await userEvent.type(find, "teletype");
    await expect(canvas.getByText("No agent called “teletype” here")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Set up any MCP client" }));
    await expect(await screen.findByRole("dialog", { name: "Any MCP client" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await settled();
  },
});

/** A tab writes itself into the URL, so the page can be shared open on it. */
export const SwitchTab = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("tab", { name: /API keys/ }));
    await expect(history.replaceState).toHaveBeenCalledWith(null, "", "/connections?tab=keys");
  },
});

/** Connected: the agents people connected, each with where it works, and what each asked for these 30 days. */
export const Connected = meta.story({
  parameters: on("connected"),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("tab", { name: /Connected/, selected: true })).toBeInTheDocument();
    await expect(canvas.getByText("2 projects")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "2 waiting in Review" })).toHaveAttribute("href", "/review");
    const table = canvas.getByRole("table");
    await expect(within(table).getByRole("row", { name: /Claude \(Ada Lovelace\).*1,240/ })).toHaveTextContent("3, license expired");
    await expect(within(table).getByRole("row", { name: /Old export script/ })).toHaveTextContent("Revoked");
  },
});

/** Where a connected agent works, changed without signing in again: the projects to tick and what it may do. */
export const ChangeWhere = meta.story({
  parameters: on("connected"),
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get("/api/v1/keys/:id", () =>
        HttpResponse.json({
          data: {
            id: "key_claude",
            name: "Claude (Ada Lovelace)",
            projects: [
              { id: "prj_acme", name: "Acme", organization: "Acme", scope: "propose" },
              { id: "prj_northwind", name: "Northwind", organization: "Acme", scope: "propose" },
            ],
            givable: [
              { id: "prj_acme", name: "Acme", organization: "Acme", max: "write" },
              { id: "prj_northwind", name: "Northwind", organization: "Acme", max: "write" },
            ],
          },
        }),
      ),
    ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Projects Ada Lovelace's Claude works in" }));
    const dialog = await screen.findByRole("dialog", { name: "Claude (Ada Lovelace)" });
    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /Northwind/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent.at(-1)).toEqual({ method: "PATCH", path: "/api/v1/keys/key_claude", body: { projects: ["prj_acme"], scope: "propose" } }));
    await expect(await screen.findByText("Claude (Ada Lovelace) works in 1 project")).toBeInTheDocument();
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await settled();
  },
});

/** Revoking asks first; an agent in several projects stops working in this one only. */
export const Revoke = meta.story({
  parameters: on("connected"),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Revoke Ada Lovelace's Claude" }));
    const ask = await screen.findByRole("alertdialog", { name: "Revoke Ada Lovelace's Claude here?" });
    await expect(ask).toHaveTextContent("It stops working in this project at once and keeps the others.");
    await userEvent.click(within(ask).getByRole("button", { name: "Revoke" }));
    await expect(await screen.findByText("Revoked Ada Lovelace's Claude")).toBeInTheDocument();
    await expect(sent.at(-1)).toMatchObject({ method: "DELETE", path: "/api/v1/keys/key_claude" });
    await waitFor(() => expect(canvas.queryByRole("button", { name: "Revoke Ada Lovelace's Claude" })).not.toBeInTheDocument());
    await settled();
  },
});

/** Nobody connected an agent yet: browse the apps. */
export const NoneConnected = meta.story({
  args: { keys: [], asked: { days: 30, clients: [] } },
  parameters: on("connected"),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("No agent connected yet")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Browse apps" }));
    await expect(history.replaceState).toHaveBeenCalledWith(null, "", "/connections?tab=apps");
  },
});

/** API keys, for what can't sign in on its own: made with a name and what it may do, its secret shown this once. */
export const ApiKeys = meta.story({
  parameters: on("keys"),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Name" }), "Nightly export");
    await userEvent.click(canvas.getByRole("button", { name: "Make key" }));
    await expect(await canvas.findByText("Copy Nightly export now: it is shown this once")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Copy the key" }));
    await expect(navigator.clipboard.writeText).toHaveBeenCalledWith("ab_live_9d2e7f1c4b8a");
    await userEvent.click(canvas.getByRole("button", { name: "Done, I copied it" }));
    await expect(canvas.queryByText(/it is shown this once/)).not.toBeInTheDocument();
    await expect(canvas.getByText("Never called", { selector: "[data-api-key=key_new] *" })).toBeInTheDocument();
  },
});

/** The brands kept in Git: where, which branch and folder, and how fresh. */
export const Repositories = meta.story({
  parameters: on("repositories"),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "acme/brand.git" })).toHaveAttribute("href", "https://github.com/acme/brand.git");
    await expect(canvas.getByText("Changes to bring in")).toBeInTheDocument();
    await expect(canvas.getByText("Not synced yet")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Bring a brand in" })).toHaveAttribute("href", "https://app.artbucket.test/github/connect");
  },
});

/** ANONYMOUS_SCOPE set to write: anyone can change everything, said at the top. */
export const OpenToAnyone = meta.story({
  args: { anonymous: "write" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Without a key, anyone can change everything")).toBeInTheDocument();
  },
});

/** Someone who can't manage keys: no API keys tab, and agents that need one say to ask an admin. */
export const Viewer = meta.story({
  decorators: [withMe(viewer)],
  args: { keys: keys.filter((k) => k.owner === "Ada Lovelace"), kept: [], connect: null },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.queryByRole("tab", { name: /API keys/ })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("tab", { name: /Repositories/ })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("radio", { name: "Automations" }));
    await userEvent.click(canvas.getByRole("button", { name: "Connect Zapier" }));
    const dialog = await screen.findByRole("dialog", { name: "Zapier" });
    await expect(within(dialog).getByText("Needs a key: ask an admin for one with the Suggest scope.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await settled();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

export const Dark = meta.story({ parameters: on("connected"), globals: { theme: "dark" } });
