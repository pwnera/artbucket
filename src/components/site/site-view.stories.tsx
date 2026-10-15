import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SiteView } from "@/components/site/site-view";
import { LOOKS } from "@/lib/brand-theme";
import { FIXTURES, fixtureUrl, fixtureView } from "@/lib/fixtures/brand-book";

/**
 * A brand's site, as a portal and the in-app reader draw it, from the fixture books (lib/fixtures/brand-book.ts):
 * Blender uses every section template; big, ugly, hairline and rtl hold the renderers to their guardrails.
 */
type Args = { fixture: string; page: string; context: string; look: string; headline: string };

const meta = {
  title: "Brand site/Book",
  parameters: { layout: "fullscreen" },
  args: { fixture: "blender", page: "overview", context: "default", look: "own", headline: "" },
  argTypes: {
    fixture: { control: "select", options: Object.keys(FIXTURES) },
    page: { control: "text" },
    context: { control: "select", options: ["default", "dark-background", "print"] },
    // A look over the book's own layout, as set_theme { look } applies it.
    look: { control: "select", options: ["own", ...Object.keys(LOOKS)] },
    // The opening cover's title in place of the book's, a line break included (\n): every look keeps it.
    headline: { control: "text" },
  },
  render: ({ fixture, page, context, look, headline }: Args) => {
    const own = fixtureView(fixture, page || null);
    const opening = own.page?.sections[0];
    const base =
      headline && own.page && opening?.template === "cover"
        ? { ...own, page: { ...own.page, sections: [{ ...opening, title: headline.replaceAll("\\n", "\n") }, ...own.page.sections.slice(1)] } }
        : own;
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

/**
 * Every look's opening and its sections, to hold each to the design bar in its own character: a two-line cover
 * headline (the line break kept on every look), then every template on the big book.
 */
const HEADLINE = "Blender.\nThe freedom to create.";
export const DocumentationCover: Story = { args: { look: "documentation", headline: HEADLINE } };
export const EditorialCover: Story = { args: { look: "editorial", headline: HEADLINE } };
export const SwissCover: Story = { args: { look: "swiss", headline: HEADLINE } };
export const BoldCover: Story = { args: { look: "bold", headline: HEADLINE } };
export const CinematicCover: Story = { args: { look: "cinematic", headline: HEADLINE } };
export const PlayfulCover: Story = { args: { look: "playful", headline: HEADLINE } };
export const BoardCover: Story = { args: { look: "board", headline: HEADLINE } };
export const DocumentationEveryTemplate: Story = { args: { look: "documentation", fixture: "big", page: "everything" } };
export const EditorialEveryTemplate: Story = { args: { look: "editorial", fixture: "big", page: "everything" } };
export const SwissEveryTemplate: Story = { args: { look: "swiss", fixture: "big", page: "everything" } };
export const BoldEveryTemplate: Story = { args: { look: "bold", fixture: "big", page: "everything" } };
export const CinematicEveryTemplate: Story = { args: { look: "cinematic", fixture: "big", page: "everything" } };
export const PlayfulEveryTemplate: Story = { args: { look: "playful", fixture: "big", page: "everything" } };
export const BoardEveryTemplate: Story = { args: { look: "board", fixture: "big", page: "everything" } };
