import preview from "#.storybook/preview";
import { expect, screen, spyOn, waitFor, within } from "storybook/test";
import { call, curl, ForAgents, SetupPart, Snippet } from "@/components/agent-access";

const meta = preview.meta({
  title: "App/Features/Settings/Agent access",
  component: Snippet,
  args: { text: "https://app.artbucket.test/api/v1/mcp", what: "the URL", multiline: false, prose: false },
  // Every copy here goes to a stand-in clipboard: headless Chromium has no real one to write to.
  beforeEach: () => {
    const write = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    return () => write.mockRestore();
  },
});

/** A line to copy: an MCP call, a request, the URL an agent connects to. */
export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Copy the URL" }));
    await expect(navigator.clipboard.writeText).toHaveBeenCalledWith(args.text);
    await expect(await canvas.findByText("Copied")).toBeInTheDocument();
  },
});

/** A request (`curl`) breaks anywhere rather than run past its box. */
export const Request = meta.story({
  args: { text: curl("https://app.artbucket.test/api/v1/assets?q=logo&type=image"), what: "the request" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("curl -H 'Authorization: Bearer <key>' 'https://app.artbucket.test/api/v1/assets?q=logo&type=image'")).toBeInTheDocument();
  },
});

/** An MCP tool call, as a person reads it. */
export const ToolCall = meta.story({
  args: { text: call("search_assets", { q: "logo", tags: [], brand: "acme", page: null }), what: "the call" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('search_assets({"q":"logo","brand":"acme"})')).toBeInTheDocument();
  },
});

/** Config and commands keep their lines, and scroll sideways. */
export const Multiline = meta.story({
  args: {
    what: "the config",
    multiline: true,
    text: `{\n  "mcpServers": {\n    "artbucket": { "type": "http", "url": "https://app.artbucket.test/api/v1/mcp" }\n  }\n}`,
  },
});

/** A prompt to paste into a chat wraps at words. */
export const Prose = meta.story({
  args: {
    what: "the prompt",
    prose: true,
    text: "Use the Artbucket MCP server at https://app.artbucket.test/api/v1/mcp. Before making anything on-brand, read the Acme brand rules, and ask check_use before you hand out an asset.",
  },
});

/** The page's For agents button: what this page is to an agent, and the one URL every agent connects to. */
export const ForAgentsPanel = meta.story({
  render: () => (
    <div className="flex justify-end">
      <ForAgents
        about="Assets matching logo, as an agent searches them."
        reads={(origin) => [
          { label: "MCP", text: call("search_assets", { q: "logo" }) },
          { label: "REST", text: curl(`${origin}/api/v1/assets?q=logo`) },
        ]}
      />
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "For agents" }));
    const panel = await screen.findByRole("dialog");
    await expect(within(panel).getByText("This page, for an agent")).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "Copy mcp" }));
    await expect(navigator.clipboard.writeText).toHaveBeenCalledWith('search_assets({"q":"logo"})');
    await userEvent.click(within(panel).getByRole("button", { name: "Copy the URL" }));
    await expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(`${location.origin}/api/v1/mcp`);
    await expect(within(panel).getByRole("link", { name: /Set up Claude, ChatGPT, Cursor and more/ })).toHaveAttribute("href", "/connections");
    // Escape would close the copy button's tooltip first: the trigger closes the panel in one.
    await userEvent.click(canvas.getByRole("button", { name: "For agents" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** One step of an agent's setup: a sentence, something to copy, or a one-click install. */
export const SetupSteps = meta.story({
  render: () => (
    <div className="grid max-w-xl gap-3">
      <SetupPart part="Open Claude's settings, then Connectors, and add a custom connector with this URL:" />
      <SetupPart part={{ copy: "https://app.artbucket.test/api/v1/mcp", what: "the URL" }} />
      <SetupPart part={{ copy: "claude mcp add --transport http artbucket https://app.artbucket.test/api/v1/mcp", what: "the command", multiline: true }} />
      <SetupPart part={{ href: "cursor://anysphere.cursor-deeplink/mcp/install?name=artbucket", label: "Add to Cursor" }} />
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("link", { name: "Add to Cursor" })).toHaveAttribute("href", "cursor://anysphere.cursor-deeplink/mcp/install?name=artbucket");
    await userEvent.click(canvas.getByRole("button", { name: "Copy the command" }));
    await expect(navigator.clipboard.writeText).toHaveBeenCalledWith("claude mcp add --transport http artbucket https://app.artbucket.test/api/v1/mcp");
  },
});

/** A long address on a phone breaks rather than widen the page. */
export const Phone = meta.story({
  args: { text: curl("https://app.artbucket.test/api/v1/collections/col_spring-launch-2026-regional-partner-assets/assets?type=image&status=approved"), what: "the request" },
  globals: { viewport: { value: "phone" } },
});
