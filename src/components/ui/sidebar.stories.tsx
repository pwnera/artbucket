import preview from "#.storybook/preview";
import { expect, fn, screen, waitFor } from "storybook/test";
import { IconActivity, IconBook, IconDots, IconInbox, IconPhoto, IconPlus, IconSettings } from "@/components/icons";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";

/**
 * The app's navigation down the left. Folds to icons (the trigger, the rail or Mod+B), is dragged wider at its edge,
 * and is a sheet on a phone. Everything inside comes from these parts; the app's own is components/app-sidebar.tsx.
 */
const meta = preview.meta({
  title: "App/Primitives/Sidebar",
  component: SidebarProvider,
  args: { defaultOpen: true, onOpenChange: fn() },
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "laptop" } },
  render: (args) => (
    <SidebarProvider {...args}>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" tooltip="Acme">
                <span className="bg-primary text-primary-foreground grid size-8 shrink-0 place-items-center rounded-md text-sm font-semibold">A</span>
                <span>Acme</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive tooltip="Assets">
                    <IconPhoto />
                    <span>Assets</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Guidelines">
                    <IconBook />
                    <span>Guidelines</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Review">
                    <IconInbox />
                    <span>Review</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>3</SidebarMenuBadge>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Activity">
                    <IconActivity />
                    <span>Activity</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarSeparator />
          <SidebarGroup>
            <SidebarGroupLabel>Collections</SidebarGroupLabel>
            <SidebarGroupAction aria-label="New collection">
              <IconPlus />
            </SidebarGroupAction>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <span>Spring campaign</span>
                  </SidebarMenuButton>
                  <SidebarMenuAction showOnHover aria-label="More for Spring campaign">
                    <IconDots />
                  </SidebarMenuAction>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton href="#social">
                        <span>Social</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton href="#print" isActive>
                        <span>Print</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <span>Northwind autumn launch, press kit and partner assets</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Settings">
                <IconSettings />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-3">
          <SidebarTrigger />
          <h1 className="text-sm font-medium">Assets</h1>
        </header>
        <div className="text-muted-foreground p-4 text-sm">The page.</div>
      </SidebarInset>
    </SidebarProvider>
  ),
});

const sidebar = (el: HTMLElement) => el.querySelector<HTMLElement>("[data-slot=sidebar][data-state]")!;

export const Playground = meta.story({
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    await expect(canvas.getByRole("button", { name: "Assets" })).toHaveAttribute("aria-current", "page");
    // The trigger folds it to icons, and the menu's names move to tooltips.
    await userEvent.click(canvas.getByRole("button", { name: "Toggle sidebar" }));
    await expect(sidebar(canvasElement)).toHaveAttribute("data-state", "collapsed");
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false);
    await userEvent.hover(canvas.getByRole("button", { name: "Guidelines" }));
    await expect(await screen.findByRole("tooltip")).toHaveTextContent("Guidelines");
    await userEvent.unhover(canvas.getByRole("button", { name: "Guidelines" }));
    // Mod+B opens it again, from anywhere but a field.
    await userEvent.click(canvas.getByText("The page."));
    await userEvent.keyboard("{Control>}b{/Control}");
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(true);
  },
});

/** The first Tab stop skips the nav: a link to the page's content. */
export const SkipLink = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab();
    await expect(canvas.getByRole("link", { name: "Skip to content" })).toHaveFocus();
  },
});

/** Folded to icons from the start (the cookie said so). */
export const Collapsed = meta.story({ args: { defaultOpen: false } });

/** On a phone it is a sheet over the page, opened by the trigger and closed by Escape. */
export const Phone = meta.story({
  globals: { viewport: { value: "phone" } },
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: "Toggle sidebar" });
    await userEvent.click(trigger);
    const sheet = await screen.findByRole("dialog", { name: "Sidebar" });
    await expect(sheet).toHaveTextContent("Guidelines");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** While the nav loads: skeleton rows in the menu's place. */
export const Loading = meta.story({
  render: (args) => (
    <SidebarProvider {...args}>
      <Sidebar collapsible="none" className="h-svh border-r">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Collections</SidebarGroupLabel>
            <SidebarMenu>
              {[0, 1, 2, 3].map((i) => (
                <SidebarMenuItem key={i}>
                  <SidebarMenuSkeleton showIcon />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  ),
});

export const Dark = meta.story({ globals: { theme: "dark", viewport: { value: "laptop" } } });
