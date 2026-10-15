import preview from "#.storybook/preview";
import { expect, fn, screen, spyOn } from "storybook/test";
import { EditWays } from "@/components/edit-ways";

const meta = preview.meta({
  title: "App/Features/Brands/Edit ways",
  component: EditWays,
  args: {
    brand: "acme",
    ways: { mcp: "https://app.artbucket.test/api/v1/mcp", git: "https://app.artbucket.test/github/connect?brand=acme" },
    open: true,
    onOpenChange: fn(),
  },
});

/** Edit on a brand's guidelines: the three ways its pages change, over the pages as readers see them. */
export const Playground = meta.story({
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole("dialog", { name: "Edit these pages" });
    await expect(dialog).toBeInTheDocument();
    await expect(screen.getByRole("heading", { name: "With an agent" })).toBeInTheDocument();
    await expect(screen.getByRole("link", { name: "Connect a repository" })).toHaveAttribute("href", args.ways.git);
    await expect(screen.getByText("npx artbucket site eject acme-guidelines --brand acme --create")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await expect(args.onOpenChange).toHaveBeenCalledWith(false);
  },
});

/** A server without a Git integration: In Git offers the CLI's pull instead of connecting. */
export const NoGitIntegration = meta.story({
  args: { ways: { mcp: "https://app.artbucket.test/api/v1/mcp", git: null } },
  play: async () => {
    await screen.findByRole("dialog");
    await expect(screen.queryByRole("link", { name: "Connect a repository" })).not.toBeInTheDocument();
    await expect(screen.getByText("npx artbucket brand pull brand --brand acme")).toBeInTheDocument();
  },
});

/** Copying the MCP address puts it on the clipboard. */
export const CopyTheAddress = meta.story({
  beforeEach: () => {
    const clip = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    return () => clip.mockRestore();
  },
  play: async ({ args, userEvent }) => {
    await userEvent.click(await screen.findByRole("button", { name: "Copy the MCP address" }));
    await expect(navigator.clipboard.writeText).toHaveBeenCalledWith(args.ways.mcp);
  },
});

export const Closed = meta.story({ args: { open: false } });

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
