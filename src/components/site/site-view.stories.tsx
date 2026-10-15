import preview from "#.storybook/preview";
import { SiteView } from "@/components/site/site-view";
import { LOOKS } from "@/lib/brand-theme";
import { FIXTURES, fixtureUrl, fixtureView } from "@/lib/fixtures/brand-book";

type BookProps = { fixture: string; page: string; context: string; look: string; headline: string };

/**
 * A brand's site, as a portal and the in-app reader draw it, from the fixture books (lib/fixtures/brand-book.ts):
 * Blender uses every section template; big, ugly, hairline and rtl hold the renderers to their guardrails. The
 * controls pick a book's page, a context, a look laid over its layout, and a headline for its cover.
 */
function Book({ fixture, page, context, look, headline }: BookProps) {
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
}

const meta = preview.meta({
  title: "Brand site/Book",
  component: Book,
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
});

/**
 * The brand's own pairs, drawn as it sets them (its specimens, data-specimen): Blender sets white on its orange
 * (2.8:1) and its ink on its blue in the dark-background context, the ugly book its paper on yellow and sky, and
 * the pairings show every color on every other, the failing ones faded and graded. Axe leaves those samples out;
 * everything the renderer draws around them is still held to 4.5:1.
 */
const brandColors = { a11y: { context: { exclude: ["[data-specimen]"] } } };

export const Overview = meta.story({ parameters: brandColors });
export const Logo = meta.story({ args: { page: "logo" } });
export const LogoUse = meta.story({ args: { page: "logo-use" } });
/** Every color on every other (the pairings): the pairs that fail are the brand's, shown faded and graded. */
export const Color = meta.story({ args: { page: "color" }, parameters: brandColors });
export const Typography = meta.story({ args: { page: "typography" } });
export const Space = meta.story({ args: { page: "space" } });
export const Voice = meta.story({ args: { page: "voice" } });
export const DarkBackground = meta.story({ args: { page: "color", context: "dark-background" }, parameters: brandColors });
export const EveryTemplate = meta.story({ args: { fixture: "big", page: "everything" }, parameters: brandColors });
export const Hairline = meta.story({ args: { fixture: "hairline" }, parameters: brandColors });
export const RightToLeft = meta.story({ args: { fixture: "rtl" } });
export const Guardrails = meta.story({ args: { fixture: "ugly", page: "grounds" }, parameters: brandColors });
/** The Board look: a band of the brand color, then a dotted canvas, its titles centered. */
export const BoardOverview = meta.story({ args: { look: "board" }, parameters: brandColors });
export const BoardColor = meta.story({ args: { look: "board", page: "color" }, parameters: brandColors });
export const BoardLogo = meta.story({ args: { look: "board", page: "logo" } });

/**
 * Every look's opening and its sections, to hold each to the design bar in its own character: a two-line cover
 * headline (the line break kept on every look), then every template on the big book.
 */
const HEADLINE = "Blender.\nThe freedom to create.";
export const DocumentationCover = meta.story({ args: { look: "documentation", headline: HEADLINE }, parameters: brandColors });
export const EditorialCover = meta.story({ args: { look: "editorial", headline: HEADLINE }, parameters: brandColors });
export const SwissCover = meta.story({ args: { look: "swiss", headline: HEADLINE }, parameters: brandColors });
export const BoldCover = meta.story({ args: { look: "bold", headline: HEADLINE }, parameters: brandColors });
export const CinematicCover = meta.story({ args: { look: "cinematic", headline: HEADLINE }, parameters: brandColors });
export const PlayfulCover = meta.story({ args: { look: "playful", headline: HEADLINE }, parameters: brandColors });
export const BoardCover = meta.story({ args: { look: "board", headline: HEADLINE }, parameters: brandColors });
export const DocumentationEveryTemplate = meta.story({ args: { look: "documentation", fixture: "big", page: "everything" }, parameters: brandColors });
export const EditorialEveryTemplate = meta.story({ args: { look: "editorial", fixture: "big", page: "everything" }, parameters: brandColors });
export const SwissEveryTemplate = meta.story({ args: { look: "swiss", fixture: "big", page: "everything" }, parameters: brandColors });
export const BoldEveryTemplate = meta.story({ args: { look: "bold", fixture: "big", page: "everything" }, parameters: brandColors });
export const CinematicEveryTemplate = meta.story({ args: { look: "cinematic", fixture: "big", page: "everything" }, parameters: brandColors });
export const PlayfulEveryTemplate = meta.story({ args: { look: "playful", fixture: "big", page: "everything" }, parameters: brandColors });
export const BoardEveryTemplate = meta.story({ args: { look: "board", fixture: "big", page: "everything" }, parameters: brandColors });
