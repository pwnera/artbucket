import preview from "#.storybook/preview";
import { expect, screen, spyOn, waitFor } from "storybook/test";
import { CopyButton } from "@/components/copy-button";
import { IconLink } from "@/components/icons";

const ADDRESS = "https://acme.artbucket.page";

const meta = preview.meta({
  title: "App/Patterns/Copy button",
  component: CopyButton,
  args: { text: ADDRESS, label: "Copy the address", what: "the address", size: "icon-xs" as const, variant: "ghost" as const },
  argTypes: {
    size: { control: "select", options: ["icon-xs", "icon-sm", "icon", "icon-lg"] },
    variant: { control: "select", options: ["ghost", "outline", "secondary"] },
    icon: { control: false },
    text: { control: "text" },
  },
  // The clipboard as the stories see it: every write lands, unless a story says otherwise.
  beforeEach: () => {
    const write = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const item = spyOn(navigator.clipboard, "write").mockResolvedValue();
    return () => {
      write.mockRestore();
      item.mockRestore();
    };
  },
});

/** Copied: the icon turns into a check, said to a screen reader too; no toast. */
export const Playground = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Copy the address" }));
    await expect(navigator.clipboard.writeText).toHaveBeenCalledWith(ADDRESS);
    await expect(await canvas.findByText("Copied")).toBeInTheDocument();
  },
});

/** The clipboard refused: a toast with the text itself, kept up so it can be copied by hand. */
export const Refused = meta.story({
  beforeEach: () => void spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied")),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Copy the address" }));
    await expect(await screen.findByText("Couldn't copy the address")).toBeInTheDocument();
    await expect(screen.getByText(ADDRESS)).toBeInTheDocument();
    await expect(canvas.queryByText("Copied")).not.toBeInTheDocument();
  },
});

/** A link signed on demand: asked for in the click, and handed to the clipboard before it arrives (Safari's rule). */
export const SignedOnDemand = meta.story({
  args: { text: async () => `${ADDRESS}/a/ast_logo?sig=abc123`, label: "Copy a link", what: "the link", icon: IconLink, variant: "outline", size: "icon-sm" },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Copy a link" }));
    await waitFor(() => expect(navigator.clipboard.write).toHaveBeenCalledOnce());
    await expect(await canvas.findByText("Copied")).toBeInTheDocument();
  },
});

/** With its key in the tooltip, as in a menu bar. */
export const WithShortcut = meta.story({ args: { shortcut: ["mod", "⇧", "C"], variant: "outline", size: "icon-sm" } });

/** Beside the value it copies, as a share link's row has it. */
export const BesideItsValue = meta.story({
  render: (args) => (
    <div className="flex max-w-sm items-center gap-1 rounded-md border px-2 py-1">
      <code className="min-w-0 flex-1 truncate font-mono text-sm">{ADDRESS}</code>
      <CopyButton {...args} />
    </div>
  ),
});
