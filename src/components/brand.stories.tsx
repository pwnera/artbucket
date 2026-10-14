import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppIcon, BrandMark, Logo } from "@/components/brand";
import { DEFAULT_BRAND } from "@/lib/branding";

/** The product's marks, and an organization's in their place (white-labeling, lib/branding.ts). */
const meta = { title: "App/Brand marks" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Icon: Story = {
  render: () => (
    <div className="flex items-end gap-3">
      <AppIcon className="size-16" />
      <AppIcon className="size-16" fill="#c6f432" />
      <AppIcon className="size-16" fill="#ff5b1f" />
      <AppIcon className="size-8" />
      <AppIcon className="size-4" />
    </div>
  ),
};

export const Wordmark: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4 text-2xl">
      <Logo />
      <Logo variant="black" />
      <span className="rounded-md bg-neutral-900 p-2">
        <Logo variant="white" />
      </span>
    </div>
  ),
};

/** The sidebar's mark: the product's icon, the same in a brand's accent (Follow a brand), or a renamed product's initial. */
export const SidebarMark: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <BrandMark brand={DEFAULT_BRAND} />
      <BrandMark brand={{ ...DEFAULT_BRAND, accent: "#2f62ff" }} />
      <BrandMark brand={{ ...DEFAULT_BRAND, name: "Acme Assets", accent: "#14a874", custom: true }} />
    </div>
  ),
};
