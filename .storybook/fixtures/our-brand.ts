import { fromFiles } from "@/lib/brand-files";
import { bookView, type BrandBook, type Picture } from "@/lib/fixtures/brand-book";

/**
 * Our own brand: the core's brand/ folder, read as brand as code reads it (lib/brand-files.ts fromFiles), its files
 * drawn as they are. Not a fixture made up for stories: a change to brand/ shows here.
 */
const folder = import.meta.glob("../../brand/**/*.yaml", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
// Next's static import: the file's address and size.
const svgs = import.meta.glob("../../brand/assets/*.svg", { import: "default", eager: true }) as Record<string, { src: string; width: number; height: number }>;
const path = (k: string) => k.replace(/^.*\/brand\//, "");
export const OURS: Record<string, Picture> = Object.fromEntries(
  Object.entries(svgs).map(([k, { src, width, height }], i) => {
    const filename = path(k).replace("assets/", "");
    return [`00000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`, { filename, title: filename, description: "", width, height, src }];
  }),
);
const read = fromFiles(Object.fromEntries(Object.entries(folder).map(([k, v]) => [path(k), v])), {
  assets: Object.fromEntries(Object.entries(OURS).map(([id, p]) => [`assets/${p.filename}`, id])),
});
if (!read.state) throw new Error(`brand/ doesn't read: ${read.errors.map((e) => `${e.file}: ${e.message}`).join("; ")}`);
// What a version holds, as the API takes it again: without the positions the order already says.
export const OUR_BOOK: BrandBook = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  rules: read.state.rules.map(({ position, ...r }) => r) as BrandBook["rules"],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  pages: read.state.pages.map(({ position, ...p }) => p) as BrandBook["pages"],
  theme: read.state.theme,
};

/** A page of our book as a reader gets it (overview when left out). */
export const ourView = (slug?: string) => bookView("artbucket", OUR_BOOK, { slug, pictures: OURS });

/** Our pages as the builder lists them, each with the rules its sections show by key ("On 2 pages"). */
export const ourNav = (): import("@/lib/builder-ops").NavEntry[] =>
  ourView().nav.map((p) => {
    const page = OUR_BOOK.pages.find((x) => x.slug === p.slug);
    const sections = JSON.stringify(page?.sections ?? []);
    return { ...p, hidden: page?.hidden ?? false, layout: "book", aliases: [], keys: [...new Set(OUR_BOOK.rules.map((r) => r.key))].filter((k) => sections.includes(`"${k}"`)) };
  });
