import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SiteView } from "@/components/site/site-view";
import { LOOKS } from "@/lib/brand-theme";
import { FIXTURES, fixtureUrl, fixtureView } from "@/lib/fixtures/brand-book";

/**
 * A brand's site, as a portal and the in-app reader draw it, from the fixture books (lib/fixtures/brand-book.ts):
 * Blender uses every section template; big, ugly, hairline and rtl hold the renderers to their guardrails.
 */
type Args = { fixture: string; page: string; context: string; look: string };

const meta = {
  title: "Brand site/Book",
  parameters: { layout: "fullscreen" },
  args: { fixture: "blender", page: "overview", context: "default", look: "own" },
  argTypes: {
    fixture: { control: "select", options: Object.keys(FIXTURES) },
    page: { control: "text" },
    context: { control: "select", options: ["default", "dark-background", "print"] },
    // A look over the book's own layout, as set_theme { look } applies it.
    look: { control: "select", options: ["own", ...Object.keys(LOOKS)] },
  },
  render: ({ fixture, page, context, look }: Args) => {
    const base = fixtureView(fixture, page || null);
    const patch = Object.hasOwn(LOOKS, look) ? LOOKS[look].patch : null;
    const theme = patch ? { ...base.theme, ...patch, band: patch.header === "band" } : base.theme;
    const view = { ...base, theme, context: context === "default" ? null : context };
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
/** The Board look: a band of the brand color, then a dotted canvas, its titles centered. */
export const BoardOverview: Story = { args: { look: "board" } };
export const BoardColor: Story = { args: { look: "board", page: "color" } };
export const BoardLogo: Story = { args: { look: "board", page: "logo" } };
