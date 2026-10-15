import preview from "#.storybook/preview";
import { catalogItems, lineage } from "#.storybook/fixtures/brands";
import { delay, http, HttpResponse } from "msw";
import { expect, fn, screen, waitFor } from "storybook/test";
import { LineageGraph } from "@/components/catalog-lineage";

const URL = "/api/v1/catalog/:id/lineage";
const site = catalogItems.find((i) => i.id === "sit_portal")!;

/** The next hop downstream of Acme: a second site that shows it. */
const hop = {
  root: "brd_acme",
  nodes: [
    { ...lineage.nodes.find((n) => n.id === "brd_acme")! },
    { ...site, id: "sit_press", slug: "press", name: "Acme press room", address: "acme/acme/site/press", up: 1, down: 0 },
  ],
  edges: [{ from: "brd_acme", to: "sit_press", kind: "offered", via: null }],
  unseen: 0,
  impact: { things: 1, projects: 1, line: "" },
};

/** An object's lineage (the catalog's Lineage tab): what it comes from on the left, what uses it on the right. */
const meta = preview.meta({
  title: "App/Features/Catalog/Lineage",
  component: LineageGraph,
  args: { id: "ast_logo", onOpen: fn() },
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get(URL, ({ params }) => HttpResponse.json(params.id === "brd_acme" ? hop : lineage)),
    ),
});

/** The logo: the 2019 logo it replaced upstream; Acme's rule, the press kit and through them the portal downstream. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(lineage.impact.line)).toBeInTheDocument();
    await expect(canvas.getByText("1 object you can't see also links here.")).toBeInTheDocument();
    for (const name of ["acme-logo-2019.svg", "acme-logo.svg", "Press kit", "Acme brand portal"]) await expect(await canvas.findByText(name)).toBeInTheDocument();
    await expect(canvas.getByText("This object", { selector: "span.ms-auto" })).toBeInTheDocument();
  },
});

/** Clicking a card shows it in a panel; Its lineage walks the catalog to it. */
export const OpenOne = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(await canvas.findByText("Press kit"));
    await expect(await canvas.findByText("acme/acme/collection/press-kit")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Its lineage" }));
    await expect(args.onOpen).toHaveBeenCalledWith("col_press");
    await userEvent.click(canvas.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(canvas.queryByRole("button", { name: "Its lineage" })).not.toBeInTheDocument());
  },
});

/** Double-clicking a card walks the catalog to it at once. */
export const DoubleClick = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.dblClick(await canvas.findByText("acme-logo-2019.svg"));
    await expect(args.onOpen).toHaveBeenCalledWith("ast_old_logo");
  },
});

/** A + brings the next hop in, and a - takes it away again. */
export const NextHop = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Show what uses Acme" }));
    await expect(await canvas.findByText("Acme press room")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Hide what uses Acme" }));
    await waitFor(() => expect(canvas.queryByText("Acme press room")).not.toBeInTheDocument());
  },
});

/** While the first hop loads. */
export const Loading = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get(URL, async () => {
        await delay("infinite");
        return HttpResponse.json(lineage);
      }),
    ),
});

/** The lineage couldn't be read. */
export const Failed = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get(URL, () => HttpResponse.json({ error: { code: "internal", message: "Lineage failed" } }, { status: 500 }))),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Lineage answered 500")).toBeInTheDocument();
  },
});

/** An object nothing links to: the card alone. */
export const Alone = meta.story({
  args: { id: "ast_film" },
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get(URL, () =>
        HttpResponse.json({
          root: "ast_film",
          nodes: [{ ...catalogItems.find((i) => i.id === "ast_film")!, up: 0, down: 0 }],
          edges: [],
          unseen: 0,
          impact: { things: 0, projects: 0, line: "Nothing uses launch-film.mp4 yet." },
        }),
      ),
    ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Nothing uses launch-film.mp4 yet.")).toBeInTheDocument();
    await expect(screen.queryByRole("button", { name: /^Show / })).not.toBeInTheDocument();
  },
});
