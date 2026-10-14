import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SiteView } from "@/components/site/site-view";
import { FIXTURES, fixtureUrl, fixtureView } from "@/lib/fixtures/brand-book";

/**
 * A brand's site, as a portal and the in-app reader draw it, from the fixture books (lib/fixtures/brand-book.ts):
 * Blender uses every section template; big, ugly, hairline and rtl hold the renderers to their guardrails.
 */
type Args = { fixture: string; page: string; context: string };

const meta = {
  title: "Brand site/Book",
  parameters: { layout: "fullscreen" },
  args: { fixture: "blender", page: "overview", context: "default" },
  argTypes: {
    fixture: { control: "select", options: Object.keys(FIXTURES) },
    page: { control: "text" },
    context: { control: "select", options: ["default", "dark-background", "print"] },
  },
  render: ({ fixture, page, context }: Args) => {
    const view = { ...fixtureView(fixture, page || null), context: context === "default" ? null : context };
    return <SiteView view={view} href={(p, s) => `?page=${p}${s ? `#${s}` : ""}`} url={fixtureUrl} />;
  },
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
export const Logo: Story = { args: { page: "logo" } };
export const LogoUse: Story = { args: { page: "logo-use" } };
export const Color: Story = { args: { page: "color" } };
export const Typography: Story = { args: { page: "typography" } };
export const Space: Story = { args: { page: "space" } };
export const Voice: Story = { args: { page: "voice" } };
export const DarkBackground: Story = { args: { page: "color", context: "dark-background" } };
export const EveryTemplate: Story = { args: { fixture: "big", page: "everything" } };
export const Hairline: Story = { args: { fixture: "hairline" } };
export const RightToLeft: Story = { args: { fixture: "rtl" } };
export const Guardrails: Story = { args: { fixture: "ugly", page: "grounds" } };
