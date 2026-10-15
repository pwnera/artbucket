import preview from "#.storybook/preview";
import { expect, fn } from "storybook/test";
import { IconBook, IconPhoto, IconSettings } from "@/components/icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Views of one thing, side by side: a brand's Rules, Pages and Releases. Arrow keys move between tabs and show each. */
const meta = preview.meta({
  title: "App/Primitives/Tabs",
  component: Tabs,
  args: { defaultValue: "rules", orientation: "horizontal", activationMode: "automatic", onValueChange: fn(), className: "max-w-md" },
  argTypes: {
    orientation: { control: "inline-radio", options: ["horizontal", "vertical"] },
    activationMode: { control: "inline-radio", options: ["automatic", "manual"] },
  },
  render: (args) => (
    <Tabs {...args}>
      <TabsList>
        <TabsTrigger value="rules">Rules</TabsTrigger>
        <TabsTrigger value="pages">Pages</TabsTrigger>
        <TabsTrigger value="releases">Releases</TabsTrigger>
        <TabsTrigger value="settings" disabled>
          Settings
        </TabsTrigger>
      </TabsList>
      <TabsContent value="rules" className="text-muted-foreground text-sm">
        Colors, type, logos and voice, as data.
      </TabsContent>
      <TabsContent value="pages" className="text-muted-foreground text-sm">
        The guideline pages readers see.
      </TabsContent>
      <TabsContent value="releases" className="text-muted-foreground text-sm">
        Every release, and what it changed.
      </TabsContent>
    </Tabs>
  ),
});

export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Pages" }));
    await expect(canvas.getByRole("tab", { name: "Pages" })).toHaveAttribute("aria-selected", "true");
    await expect(canvas.getByRole("tabpanel")).toHaveTextContent("The guideline pages readers see.");
    await expect(args.onValueChange).toHaveBeenLastCalledWith("pages");
  },
});

/** Tab reaches the chosen tab only; arrows move along the list, skip the disabled tab, and wrap. */
export const Keyboard = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.tab();
    await expect(canvas.getByRole("tab", { name: "Rules" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByRole("tab", { name: "Pages" })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    await expect(canvas.getByRole("tab", { name: "Rules" })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect(canvas.getByRole("tab", { name: "Releases" })).toHaveFocus();
    await expect(args.onValueChange).toHaveBeenLastCalledWith("releases");
    // The next Tab leaves the list for the panel.
    await userEvent.tab();
    await expect(canvas.getByRole("tabpanel")).toHaveFocus();
  },
});

/** Manual: arrows only move focus, Enter or Space shows the tab. For panels that are slow to draw. */
export const Manual = meta.story({
  args: { activationMode: "manual" },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.tab();
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByRole("tab", { name: "Pages" })).toHaveFocus();
    await expect(canvas.getByRole("tab", { name: "Rules" })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{Enter}");
    await expect(args.onValueChange).toHaveBeenLastCalledWith("pages");
  },
});

/** The line style, under a page's header: a brand's sections. */
export const Line = meta.story({
  render: (args) => (
    <Tabs {...args}>
      <TabsList variant="line">
        <TabsTrigger value="rules">
          <IconBook /> Rules
        </TabsTrigger>
        <TabsTrigger value="assets">
          <IconPhoto /> Assets
        </TabsTrigger>
        <TabsTrigger value="settings">
          <IconSettings /> Settings
        </TabsTrigger>
      </TabsList>
      <TabsContent value="rules" className="text-muted-foreground text-sm">
        Colors, type, logos and voice, as data.
      </TabsContent>
      <TabsContent value="assets" className="text-muted-foreground text-sm">
        The brand&apos;s logos, fonts and images.
      </TabsContent>
      <TabsContent value="settings" className="text-muted-foreground text-sm">
        Its name, address and who can edit it.
      </TabsContent>
    </Tabs>
  ),
});

export const Vertical = meta.story({ args: { orientation: "vertical" } });

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

export const Dark = meta.story({ globals: { theme: "dark" } });

export const DarkLine = Line.extend({ globals: { theme: "dark" } });
