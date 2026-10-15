import preview from "#.storybook/preview";
import { expect, screen, waitFor } from "storybook/test";
import { AppIcon, BrandMark, Logo, ThemeToggle } from "@/components/brand";
import { DEFAULT_BRAND } from "@/lib/branding";

/** The product's marks, and an organization's in their place (white-labeling, lib/branding.ts). */
const meta = preview.meta({
  title: "App/Patterns/Brand marks",
  component: BrandMark,
  args: { brand: DEFAULT_BRAND, className: "size-10" },
});

/** The sidebar's mark, from the brand it is given (or the app's, from context). */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("img", { name: "Artbucket" })).toBeInTheDocument();
  },
});

export const Icon = meta.story({
  render: () => (
    <div className="flex items-end gap-3">
      <AppIcon className="size-16" />
      <AppIcon className="size-16" fill="#c6f432" />
      <AppIcon className="size-16" fill="#ff5b1f" />
      <AppIcon className="size-8" />
      <AppIcon className="size-4" />
    </div>
  ),
});

export const Wordmark = meta.story({
  render: () => (
    <div className="flex flex-wrap items-center gap-4 text-2xl">
      <Logo />
      <Logo variant="black" />
      <span className="rounded-md bg-neutral-900 p-2">
        <Logo variant="white" />
      </span>
    </div>
  ),
});

/** The sidebar's mark: the product's icon, the same in a brand's accent (Follow a brand), a renamed product's initial, or its logo. */
export const SidebarMark = meta.story({
  render: () => (
    <div className="flex items-center gap-3">
      <BrandMark brand={DEFAULT_BRAND} />
      <BrandMark brand={{ ...DEFAULT_BRAND, accent: "#2f62ff" }} />
      <BrandMark brand={{ ...DEFAULT_BRAND, name: "Acme Assets", accent: "#14a874", custom: true }} />
      <BrandMark brand={{ ...DEFAULT_BRAND, name: "Acme", logo: "/icon.svg", custom: true }} />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("img", { name: "Acme Assets" })).toHaveTextContent("A");
    await expect(canvas.getByRole("img", { name: "Acme" })).toHaveAttribute("src", "/icon.svg");
  },
});

/** The theme where there is no account menu (signed out, shared links, portals): light, dark or the system's. */
export const ThemeMenu = meta.story({
  render: () => <ThemeToggle />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Theme" }));
    await expect(await screen.findByRole("menuitemradio", { name: "Dark" })).toBeInTheDocument();
    await expect(screen.getByRole("menuitemradio", { name: "System" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  },
});
