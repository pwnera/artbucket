import preview from "#.storybook/preview";
import { IconFolders, IconPlus } from "@/components/icons";
import { expect, fn, screen, waitFor } from "storybook/test";
import { Flyout, SectionAdd, SECTIONS, SidebarSection, useSections, type SectionId } from "@/components/sidebar-prefs";
import { Sidebar, SidebarContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from "@/components/ui/sidebar";

const LABEL: Record<SectionId, string> = { brands: "Brands", collections: "Collections", portals: "Sites", shared: "Shared with us", searches: "Saved searches" };
const ROWS: Record<SectionId, string[]> = {
  brands: ["Acme", "Northwind"],
  collections: ["Autumn campaign", "Press kit"],
  portals: ["Acme brand portal"],
  shared: ["Field photos"],
  searches: ["Approved logos"],
};
const KEYS = ["artbucket:folded", "artbucket:order:sections"];
const add = fn();

/** The sidebar's sections as one person arranged them: in their order, folded or not. */
function Sections({ only }: { only?: SectionId[] }) {
  const { sorted, item } = useSections();
  return sorted
    .filter((id) => !only || only.includes(id))
    .map((id) => (
      <SidebarSection
        key={id}
        id={id}
        label={LABEL[id]}
        sortable={item(id)}
        action={id === "collections" ? <SectionAdd label="New collection" icon={<IconPlus />} onClick={add} /> : undefined}
      >
        <SidebarMenu>
          {ROWS[id].map((r) => (
            <SidebarMenuItem key={r}>
              <SidebarMenuButton>
                <IconFolders /> <span>{r}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarSection>
    ));
}

/**
 * A sidebar section (sidebar-prefs.tsx): a small-caps label that folds it and is its drag handle, a menu to move it,
 * and an add action. What is folded and in what order is the person's own, kept in this browser.
 */
const meta = preview.meta({
  title: "App/Features/Shell/Sidebar sections",
  component: Sections,
  subcomponents: { SidebarSection, SectionAdd },
  parameters: { layout: "fullscreen" },
  render: (args) => (
    <SidebarProvider className="min-h-0">
      <Sidebar collapsible="none" className="h-[560px] border-r">
        <SidebarContent className="gap-0 py-2">
          <Sections {...args} />
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  ),
  // Each story starts from no preferences, and leaves the browser's as it found them.
  beforeEach: () => {
    add.mockClear();
    const kept = KEYS.map((k) => [k, localStorage.getItem(k)] as const);
    for (const k of KEYS) localStorage.removeItem(k);
    return () => {
      for (const [k, v] of kept) {
        if (v === null) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      }
    };
  },
});

/** Every section, in the default order, open. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    const labels = canvas.getAllByRole("button", { expanded: true }).map((b) => b.textContent);
    await expect(labels).toEqual(SECTIONS.map((s) => LABEL[s]));
  },
});

/** Its label folds a section, by click or keyboard, and the browser remembers. */
export const Fold = meta.story({
  play: async ({ canvas, userEvent }) => {
    const brands = canvas.getByRole("button", { name: "Brands" });
    await userEvent.click(brands);
    await expect(brands).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(canvas.queryByText("Northwind")).not.toBeInTheDocument());
    await expect(JSON.parse(localStorage.getItem("artbucket:folded")!)).toEqual(["brands"]);
    brands.focus();
    await userEvent.keyboard("{Enter}");
    await expect(brands).toHaveAttribute("aria-expanded", "true");
  },
});

/** Folded before: it opens folded. */
export const Folded = meta.story({
  beforeEach: () => localStorage.setItem("artbucket:folded", JSON.stringify(["collections", "searches"])),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Collections" })).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.queryByText("Approved logos")).not.toBeInTheDocument();
  },
});

/** Move up and Move down, from the section's menu: reordering without a mouse. */
export const Reorder = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Brands section menu" }));
    await expect(await screen.findByRole("menuitem", { name: "Move up" })).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    const labels = canvas.getAllByRole("button", { expanded: true }).map((b) => b.textContent);
    await expect(labels.slice(0, 2)).toEqual(["Collections", "Brands"]);
  },
});

/** A section's add action, with its tooltip as its name. */
export const Add = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "New collection" }));
    await expect(add).toHaveBeenCalledOnce();
  },
});

/** In the panel that flies out of the folded rail: open, headed by its name, and a way to close the panel. */
export const InFlyout = meta.story({
  render: () => {
    const close = fn();
    return (
      <SidebarProvider className="min-h-0">
        <Sidebar collapsible="none" className="h-[360px] border-r">
          <SidebarContent>
            <Flyout.Provider value={{ close }}>
              <Sections only={["collections"]} />
            </Flyout.Provider>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    );
  },
  beforeEach: () => localStorage.setItem("artbucket:folded", JSON.stringify(["collections"])),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Collections" })).toBeInTheDocument();
    // Never folded in the panel, whatever the sidebar keeps.
    await expect(canvas.getByText("Press kit")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Close panel" })).toBeInTheDocument();
  },
});
