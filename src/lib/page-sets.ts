import type { SectionInput } from "./pages.ts";

/**
 * A page set (generate_pages `set`): the shape eBay's playbook gives each
 * topic, six pages under a parent, each with starter sections to write over.
 * Without a parent, a page named for the topic holds them and lists them.
 * Slugs carry the topic, so sets on logo and color sit side by side.
 * Empty when the topic has no letter or digit to make a slug of.
 *
 * Relative imports only: `pnpm test` runs this under plain Node.
 */
export function pageSet(topic: string, parent?: string | null): { slug: string; title: string; parent: string | null; sections: SectionInput[] }[] {
  const t = topic.trim();
  const base = t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!base) return [];
  const root = parent
    ? null
    : { slug: base, title: t[0].toUpperCase() + t.slice(1), parent: null, sections: [{ template: "pages", title: "Contents" }] as SectionInput[] };
  const under = root?.slug ?? parent!;
  const prompt = (s: string) => `_${s}_`;
  const pages = [
    {
      slug: `our-${base}`,
      title: `Our ${t}`,
      sections: [
        { template: "text", title: "What it is", body: prompt(`What our ${t} is, what it stands for, and why it looks this way.`) },
        { template: "gallery", title: "The parts" },
      ],
    },
    {
      slug: `using-${base}`,
      title: `Using ${t}`,
      sections: [
        { template: "text", title: "How to use it", body: prompt("Sizes, spacing, color and placement, as rules.") },
        { template: "dodont", title: "Do and don't" },
      ],
    },
    {
      slug: `${base}-in-product`,
      title: "In product",
      sections: [
        { template: "text", title: "Where it appears", body: prompt(`How the ${t} shows up in the product's screens.`) },
        { template: "gallery", title: "Examples" },
      ],
    },
    {
      slug: `${base}-in-marketing`,
      title: "In marketing",
      sections: [
        { template: "text", title: "Where it appears", body: prompt(`How the ${t} works in campaigns, ads and print.`) },
        { template: "gallery", title: "Examples" },
      ],
    },
    {
      slug: `${base}-best-practices`,
      title: "Best practices",
      sections: [
        { template: "dodont", title: "Do and don't" },
        { template: "faq", title: "Questions" },
      ],
    },
    { slug: `${base}-showcase`, title: "Showcase", sections: [{ template: "gallery", title: "Work we are proud of", props: { layout: "bento" } }] },
  ].map((p) => ({ ...p, parent: under, sections: p.sections as SectionInput[] }));
  return root ? [root, ...pages] : pages;
}
