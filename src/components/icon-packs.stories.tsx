import preview from "#.storybook/preview";
import { delay, http, HttpResponse } from "msw";
import { expect, fn, screen, waitFor, within } from "storybook/test";
import { IconPackImport } from "@/components/icon-packs";
import type { IconSet } from "@/lib/icons";

/** One-ink glyphs, as a set of interface icons draws them, and one with colors of its own, as a logo set's. */
const glyph = (d: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round"><path d="${d}"/></svg>`;
const SHAPES: Record<string, string> = {
  "arrow-right": "M5 12h14M13 6l6 6-6 6",
  "arrow-left": "M19 12H5M11 6l-6 6 6 6",
  "arrow-up": "M12 19V5M6 11l6-6 6 6",
  "arrow-down": "M12 5v14M6 13l6 6 6-6",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  star: "M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z",
  check: "M5 12l5 5L20 7",
  x: "M6 6l12 12M18 6L6 18",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5",
  home: "M3 11l9-8 9 8v10H3z",
  heart: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4",
};
const icons = Object.entries(SHAPES).map(([name, d]) => ({ name, svg: glyph(d) }));
const coloured = { name: "acme", svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#2f62ff"/><path d="M7 16l5-9 5 9z" fill="#ff5b1f"/></svg>` };

const set = (s: Partial<IconSet> & Pick<IconSet, "prefix" | "name" | "total">): IconSet => ({
  author: null,
  license: null,
  samples: ["arrow-right", "user", "star"],
  category: "UI 24px",
  palette: false,
  height: 24,
  ...s,
});
const tabler = set({ prefix: "tabler", name: "Tabler Icons", total: icons.length, author: { name: "Paweł Kuna" }, license: { title: "MIT", spdx: "MIT", url: "https://github.com/tabler/tabler-icons/blob/master/LICENSE" } });
const sets: IconSet[] = [
  tabler,
  set({ prefix: "lucide", name: "Lucide", total: 1_540, author: { name: "Lucide Contributors" }, license: { title: "ISC" } }),
  set({ prefix: "simple-icons", name: "Simple Icons", total: 3_300, author: { name: "Simple Icons Collaborators" }, license: { title: "CC0 1.0" }, category: "Logos", samples: ["acme"], palette: true }),
];
const GROUPS: Record<string, string[]> = { Interface: ["UI 24px"], Logos: ["Logos"] };

/** What the picker reads (/api/v1/icons...): the sets, their samples, a set's icons by name and category, and imports. `page` icons at a time. */
const iconsApi = ({ page = 96, missing = [] as string[] } = {}) => [
  http.get("/api/v1/icons/:prefix/samples", ({ params }) => HttpResponse.json({ data: params.prefix === "simple-icons" ? [coloured] : icons.slice(0, 3) })),
  http.get("/api/v1/icons/:prefix", async ({ request }) => {
    const u = new URL(request.url);
    const q = u.searchParams.get("q") ?? "";
    const offset = Number(u.searchParams.get("offset") ?? 0);
    const category = u.searchParams.get("category");
    const found = icons.filter((i) => i.name.includes(q) && (!category || (category === "Arrows") === i.name.startsWith("arrow")));
    await delay(50);
    return HttpResponse.json({ set: tabler, categories: ["Arrows", "People"], total: found.length, data: found.slice(offset, offset + Math.min(page, Number(u.searchParams.get("limit")))) });
  }),
  http.get("/api/v1/icons", async ({ request }) => {
    const u = new URL(request.url);
    const q = (u.searchParams.get("q") ?? "").toLowerCase();
    const group = u.searchParams.get("group");
    const data = sets.filter((s) => (s.name.toLowerCase().includes(q) || s.license?.title.toLowerCase().includes(q)) && (!group || GROUPS[group]?.includes(s.category ?? "")));
    await delay(50);
    return HttpResponse.json({ data, total: data.length });
  }),
  http.post("/api/v1/icons", async ({ request }) => {
    const body = (await request.json()) as { icons: string[] };
    await delay(150);
    return HttpResponse.json({ data: body.icons.filter((n) => !missing.includes(n)).map((n) => ({ id: `ast_icon_${n}` })), missing: body.icons.filter((n) => missing.includes(n)) }, { status: 201 });
  }),
];

/**
 * Icon packs (the library's Import, Icon packs): open source sets through Iconify, found by name or kind, then a set's
 * icons searched, picked (Shift-click for a run) and imported as SVG assets, credited, with the license in their rights.
 */
const meta = preview.meta({
  title: "App/Features/Library/Icon packs",
  component: IconPackImport,
  args: { open: true, onOpenChange: fn(), onDone: fn(), into: null },
  beforeEach: ({ msw }) => void msw.use(...iconsApi()),
});

const dialog = () => screen.findByRole("dialog");

/** The sets: each with a few of its icons, its count, license and author. */
export const Playground = meta.story({
  play: async () => {
    const d = within(await dialog());
    await expect(d.getByRole("heading", { name: "Icon packs" })).toBeInTheDocument();
    await expect(await d.findByRole("button", { name: /Tabler Icons/ })).toHaveTextContent("12 icons · MIT · Paweł Kuna");
    await expect(d.getByRole("searchbox", { name: "Search icon sets" })).toHaveFocus();
  },
});

/** Narrowed by kind, then searched: Logos holds Simple Icons; a search with no set says so. */
export const FindASet = meta.story({
  play: async ({ userEvent }) => {
    const d = within(await dialog());
    await d.findByRole("button", { name: /Lucide/ });
    await userEvent.click(d.getByRole("radio", { name: "Logos" }));
    await waitFor(() => expect(d.queryByRole("button", { name: /Lucide/ })).not.toBeInTheDocument());
    await expect(d.getByRole("button", { name: /Simple Icons/ })).toBeInTheDocument();
    await userEvent.click(d.getByRole("radio", { name: "All" }));
    await userEvent.type(d.getByRole("searchbox", { name: "Search icon sets" }), "zzz");
    await expect(await d.findByText("No set matches “zzz”.")).toBeInTheDocument();
  },
});

/**
 * The whole import: open Tabler, search its icons, pick two and a run with Shift, import them. Each lands as an
 * asset, the toast credits the set, and what was imported stays marked.
 */
export const ImportFromASet = meta.story({
  play: async ({ args, userEvent }) => {
    const d = within(await dialog());
    await userEvent.click(await d.findByRole("button", { name: /Tabler Icons/ }));
    await expect(await d.findByRole("heading", { name: "Tabler Icons" })).toBeInTheDocument();
    await expect(d.getByRole("link", { name: /MIT/ })).toHaveAttribute("href", tabler.license!.url);
    const search = d.getByRole("searchbox", { name: "Search Tabler Icons" });
    await userEvent.type(search, "arrow");
    await waitFor(() => expect(d.getAllByRole("button", { pressed: false })).toHaveLength(4));
    await expect(d.getByText("4 matching")).toBeInTheDocument();
    await userEvent.click(d.getByRole("button", { name: "arrow-right" }));
    await userEvent.keyboard("{Shift>}");
    await userEvent.click(d.getByRole("button", { name: "arrow-down" }));
    await userEvent.keyboard("{/Shift}");
    await expect(d.getAllByRole("button", { pressed: true })).toHaveLength(4);
    // One dropped again.
    await userEvent.click(d.getByRole("button", { name: "arrow-up" }));
    await expect(d.getByText("3 picked")).toBeInTheDocument();
    await userEvent.click(d.getByRole("button", { name: "Import 3 icons" }));
    await expect(await screen.findByText("Imported 3 icons from Tabler Icons")).toBeInTheDocument();
    await expect(screen.getByText("Tagged icon, under MIT, credited to Paweł Kuna.")).toBeInTheDocument();
    await expect(args.onDone).toHaveBeenCalledWith(["ast_icon_arrow-right", "ast_icon_arrow-left", "ast_icon_arrow-down"]);
    await expect(d.getByRole("button", { name: "arrow-right" })).toBeDisabled();
    await expect(d.getByRole("button", { name: "Import" })).toBeDisabled();
  },
});

/** An icon the set no longer has: the rest import, and the toast counts what was missing. */
export const SomeMissing = meta.story({
  beforeEach: ({ msw }) => void msw.use(...iconsApi({ missing: ["bell"] })),
  play: async ({ userEvent }) => {
    const d = within(await dialog());
    await userEvent.click(await d.findByRole("button", { name: /Tabler Icons/ }));
    await userEvent.click(await d.findByRole("button", { name: "heart" }));
    await userEvent.click(d.getByRole("button", { name: "bell" }));
    await userEvent.click(d.getByRole("button", { name: "Import 2 icons" }));
    await expect(await screen.findByText("Imported 1 icon from Tabler Icons")).toBeInTheDocument();
    await expect(screen.getByText(/1 not found in the set\./)).toBeInTheDocument();
    // What wasn't found stays picked, to try again or drop.
    await expect(d.getByRole("button", { name: "bell" })).toHaveAttribute("aria-pressed", "true");
  },
});

/** A big set shows a page, then more on asking; a category narrows it. */
export const MoreAndCategories = meta.story({
  beforeEach: ({ msw }) => void msw.use(...iconsApi({ page: 8 })),
  play: async ({ userEvent }) => {
    const d = within(await dialog());
    await userEvent.click(await d.findByRole("button", { name: /Tabler Icons/ }));
    await userEvent.click(await d.findByRole("button", { name: "Show more (4 left)" }));
    await expect(await d.findByRole("button", { name: "bell" })).toBeInTheDocument();
    await userEvent.click(d.getByRole("button", { name: "Pick all shown" }));
    await expect(d.getByText("12 picked")).toBeInTheDocument();
    await userEvent.click(d.getByRole("button", { name: "Clear" }));
    await userEvent.click(d.getByRole("combobox", { name: "Category" }));
    await userEvent.click(await screen.findByRole("option", { name: "People" }));
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    await waitFor(() => expect(d.queryByRole("button", { name: "arrow-right" })).not.toBeInTheDocument());
    // Back to every set.
    await userEvent.click(d.getByRole("button", { name: "All icon sets" }));
    await expect(await d.findByRole("heading", { name: "Icon packs" })).toBeInTheDocument();
  },
});

/** Iconify unreachable: the reason, in place of the sets. */
export const Unreachable = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/icons", () => HttpResponse.json({ error: { code: "upstream", message: "Iconify didn't answer. Try again in a moment." } }, { status: 502 }))),
  play: async () => {
    await expect(await within(await dialog()).findByText("Iconify didn't answer. Try again in a moment.")).toBeInTheDocument();
  },
});

/** While the sets come: placeholders the size of their cards. */
export const Loading = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/icons", () => delay("infinite"))),
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

export const Dark = meta.story({ globals: { theme: "dark" } });
