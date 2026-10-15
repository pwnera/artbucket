import preview from "#.storybook/preview";
import { expect, screen, spyOn, waitFor } from "storybook/test";
import { SectionView } from "@/components/brand-sections";
import { bookView, StorySite } from "@/components/site/story-site";
import { FIXTURES } from "@/lib/fixtures/brand-book";
import { boundKeys, type Template } from "@/lib/pages";
import { resolve } from "@/lib/rules";

type SectionProps = { template: Template; fixture: string; id: string };

/** Where a template is first used in a fixture book, or the section `id` names. */
function find(fixture: string, template: Template, id: string) {
  for (const p of FIXTURES[fixture]().pages) {
    const s = p.sections.find((x) => (id ? x.id === id : x.template === template));
    if (s) return p.slug;
  }
  throw new Error(`No ${template} section in ${fixture}`);
}

/**
 * One section of a fixture book, drawn as its page draws it: its frame (landmark, anchor, title, ground, a tab per
 * context), then its template's own part, bound to its rules.
 */
function Section({ template, fixture, id }: SectionProps) {
  const view = bookView(fixture, find(fixture, template, id));
  const s = view.page!.sections.find((x) => (id ? x.id === id : x.template === template))!;
  const rules = resolve(view.rules, "");
  return (
    <StorySite view={view}>
      <SectionView section={s} rules={boundKeys(s).flatMap((k) => rules.filter((r) => r.key === k))} />
    </StorySite>
  );
}

/**
 * The section templates a brand's pages are made of, one story each, from the fixture books
 * (lib/fixtures/brand-book.ts: Blender uses every one). Pick another book or a section by its id in the controls.
 * Samples drawn in the brand's own pairs (`data-specimen`, Blender's white on orange) are its colors, not the
 * renderer's: axe leaves them out, and holds everything around them to 4.5:1.
 */
const meta = preview.meta({
  title: "Brand site/Sections",
  component: Section,
  parameters: { layout: "fullscreen", a11y: { context: { exclude: ["[data-specimen]"] } } },
  args: { fixture: "blender", template: "text" as Template, id: "" },
  argTypes: { fixture: { control: "select", options: Object.keys(FIXTURES) }, id: { control: "text" } },
});

/** Copy a value without a clipboard prompt: the test browser has none to grant. */
const clipboard = () => spyOn(navigator.clipboard, "writeText").mockResolvedValue();

/** A page's opening: eyebrow, title, lede, over the brand's ground. */
export const Cover = meta.story({ args: { template: "cover" } });
/** A band that opens a part of a long page, numbered when the book is. */
export const Header = meta.story({ args: { template: "header" } });
/** Words, with the rules they bind and an aside. */
export const Text = meta.story({ args: { template: "text" } });
/** One line, set large. */
export const Statement = meta.story({ args: { template: "statement" } });
export const Quote = meta.story({ args: { template: "quote" } });
/** A picture beside words. */
export const Split = meta.story({ args: { template: "split" } });
/** Cards, here as stats. */
export const Cards = meta.story({ args: { template: "cards" } });

/** The palette: a click on a swatch copies its hex, and says so on the swatch. */
export const Palette = meta.story({
  args: { template: "palette", id: "palette" },
  play: async ({ canvas, userEvent }) => {
    const write = clipboard();
    await userEvent.click(canvas.getByRole("button", { name: "Copy #e87d0d" }));
    await expect(write).toHaveBeenCalledWith("#e87d0d");
    await expect((await canvas.findAllByText("Copied")).length).toBeGreaterThan(0);
  },
});

/** A section that shows several contexts gets a tab each: the dark background's values in its own. */
export const ContextTabs = meta.story({
  args: { template: "palette", id: "palette" },
  play: async ({ canvas, userEvent }) => {
    const dark = canvas.getByRole("tab", { name: /Dark background/ });
    await userEvent.click(dark);
    await expect(dark).toHaveAttribute("aria-selected", "true");
  },
});

export const Type = meta.story({ args: { template: "type" } });
/** The logos on a light, dark or see-through backdrop, each a download away. */
export const Logos = meta.story({
  args: { template: "logos" },
  play: async ({ canvas }) => {
    const links = canvas.getAllByRole("link", { name: /Download/ });
    await expect(links[0]).toHaveAttribute("href");
  },
});
export const DoDont = meta.story({ args: { template: "dodont" } });

/** The gallery: a picture opens in a lightbox, which the arrow keys step through the section's stills. */
export const Gallery = meta.story({
  args: { template: "gallery" },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getAllByRole("button", { name: /^Look at/ })[0]);
    const dialog = await screen.findByRole("dialog");
    const first = dialog.textContent;
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(screen.getByRole("dialog").textContent).not.toBe(first));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

export const Collection = meta.story({ args: { template: "collection" } });
export const Icons = meta.story({ args: { template: "icons" } });
/** Links out: downloads, sites, files. */
export const Links = meta.story({ args: { template: "links" } });
/** The book's pages as cards. */
export const Pages = meta.story({ args: { template: "pages" } });
export const Diagram = meta.story({ args: { template: "diagram" } });
/** What's new, from the view's releases. */
export const Updates = meta.story({ args: { template: "updates" } });
export const Annotated = meta.story({ args: { template: "annotated" } });
export const Specs = meta.story({ args: { template: "specs" } });
export const Specimen = meta.story({ args: { template: "specimen" } });
export const Pattern = meta.story({ args: { template: "pattern" } });
export const Chart = meta.story({ args: { template: "chart" } });
/** Words to paste, filled in from a short form. */
export const Copy = meta.story({ args: { template: "copy" } });

/** Questions as native folds, one open at a time. */
export const Faq = meta.story({
  args: { template: "faq", id: "faq" },
  play: async ({ canvas, userEvent }) => {
    const folds = canvas.getAllByRole("group");
    const [first, second] = folds;
    await userEvent.click(first.querySelector("summary")!);
    await expect(first).toHaveAttribute("open");
    await userEvent.click(second.querySelector("summary")!);
    await waitFor(() => expect(first).not.toHaveAttribute("open"));
  },
});

/** The glossary: each term beside its meaning. */
export const Glossary = meta.story({ args: { template: "faq", id: "glossary" } });
export const Embed = meta.story({ args: { template: "embed" } });
/** A request for an asset that isn't there, as a form. */
export const Request = meta.story({ args: { template: "request" } });
