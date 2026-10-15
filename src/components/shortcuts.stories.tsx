import preview from "#.storybook/preview";
import { me, viewer, withMe } from "#.storybook/fixtures/brands";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { useState } from "react";
import { expect, fn, screen, waitFor, within } from "storybook/test";
import { ChordHint, GoKeys, Keys, ShortcutsDialog, SHORTCUTS, useShortcuts } from "@/components/shortcuts";

const meta = preview.meta({
  title: "App/Patterns/Shortcuts",
  component: ShortcutsDialog,
  args: { open: true, onOpenChange: fn() },
  decorators: [withMe(viewer)],
});

/** The "?" sheet: every shortcut by group, as the keys to press. */
export const Playground = meta.story({
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    for (const group of ["General", "Go to", "Explore", "Guidelines"]) await expect(within(dialog).getByRole("heading", { name: group })).toBeInTheDocument();
    // Team only for whoever manages people or links.
    await expect(within(dialog).queryByText("Team")).not.toBeInTheDocument();
  },
});

/** For an admin, G then T goes to Team too. */
export const ForAnAdmin = meta.story({
  decorators: [withMe(me)],
  play: async () => {
    await expect(await screen.findByText("Team")).toBeInTheDocument();
  },
});

/** The shell's keys (useShortcuts): "?" opens the sheet, G then a letter goes somewhere, with a hint while G waits. */
function Shell() {
  const [help, setHelp] = useState(false);
  const [palette, setPalette] = useState(false);
  const chord = useShortcuts({ setPalette, setHelp });
  return (
    <div className="grid gap-2 text-sm">
      <p>Press ? for the shortcuts, G then a letter to go somewhere, or ⌘K for the palette.</p>
      <p>Palette: {palette ? "open" : "closed"}</p>
      <ChordHint on={chord} />
      <ShortcutsDialog open={help} onOpenChange={setHelp} />
    </div>
  );
}

export const Keyboard = meta.story({
  render: () => <Shell />,
  parameters: { nextjs: { navigation: { pathname: "/brand" } } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.keyboard("?");
    await expect(await screen.findByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await userEvent.keyboard("g");
    await expect(canvas.getByText("then a letter")).toBeInTheDocument();
    await userEvent.keyboard("r");
    await expect(getRouter().push).toHaveBeenCalledWith("/review");
    await expect(canvas.queryByText("then a letter")).not.toBeInTheDocument();
    await userEvent.keyboard("{Meta>}k{/Meta}");
    await expect(canvas.getByText("Palette: open")).toBeInTheDocument();
  },
});

/** A shortcut's keys: a chord as one cap, a sequence as caps one after another; GoKeys finds a page's sequence. */
export const KeyCaps = meta.story({
  render: () => (
    <dl className="grid w-fit grid-cols-[auto_auto] items-center gap-x-6 gap-y-2 text-sm">
      {SHORTCUTS.slice(0, 7).map((s) => (
        <div key={s.label} className="contents">
          <dt>{s.label}</dt>
          <dd>
            <Keys {...s} />
          </dd>
        </div>
      ))}
      <dt>Review, by GoKeys</dt>
      <dd>
        <GoKeys to="/review" />
      </dd>
    </dl>
  ),
});
