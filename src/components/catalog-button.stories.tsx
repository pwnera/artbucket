import preview from "#.storybook/preview";
import { expect, fn } from "storybook/test";
import { CatalogButton } from "@/components/catalog-button";

const meta = preview.meta({
  title: "App/Patterns/Catalog button",
  component: CatalogButton,
  args: { id: "col_spring", name: "Spring campaign", variant: "outline" as const, size: "icon-sm" as const },
  argTypes: { variant: { control: "select", options: ["outline", "ghost"] }, size: { control: "select", options: ["icon-sm", "icon"] } },
});

/** A link to the object in the catalog, named for it. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Spring campaign in the catalog" })).toHaveAttribute("href", "/catalog?o=col_spring");
  },
});

/** Without a name. */
export const Unnamed = meta.story({
  args: { name: undefined, variant: "ghost" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Open in the catalog" })).toBeInTheDocument();
  },
});

/** Where leaving must ask first (unsaved edits): a button that hands the address to `onOpen`. */
export const AsksFirst = meta.story({
  args: { id: "ast_logo", name: undefined, onOpen: fn() },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Open in the catalog" }));
    await expect(args.onOpen).toHaveBeenCalledWith("/catalog?o=ast_logo");
  },
});
