import preview from "#.storybook/preview";
import { http, HttpResponse } from "msw";
import { expect, screen, within } from "storybook/test";
import { inApp } from "#.storybook/fixtures/library";
import { ComponentPage, Components, ComponentSheet } from "@/components/components-page";

/** A story as a site would serve it: a frame of plain HTML, so nothing reaches the network. */
const frame = (label: string) =>
  `data:text/html,${encodeURIComponent(`<body style="display:grid;place-items:center;height:100vh;margin:0;font:14px sans-serif"><button style="padding:8px 16px;border-radius:6px;border:0;background:%232f62ff;color:white">${label}</button></body>`)}`;

const site = { id: "prt_sb", slug: "storybook", name: "Acme Storybook" };
const row = (id: string, name: string, title: string, over: object = {}) => ({
  id,
  slug: `ui-${name.toLowerCase()}`,
  name,
  title,
  version: 3,
  story: `ui-${name.toLowerCase()}--default`,
  stories: ["Default", "Disabled"],
  files: [],
  tags: [],
  path: "/",
  createdAt: "2026-10-12T09:00:00Z",
  createdBy: "Storybook deploy",
  status: "current" as const,
  site,
  versions: 3,
  address: `acme/acme/site:storybook/component:ui-${name.toLowerCase()}`,
  preview: frame(name),
  storybook: "https://storybook.acme.test/?path=/story/x",
  ...over,
});

const rows = [
  row("cmp_button", "Button", "UI/Button"),
  row("cmp_card", "Card", "UI/Card", { versions: 1, version: 1 }),
  row("cmp_logo", "Logo", "Brand/Logo", { preview: null }),
  row("cmp_hero", "Hero", "Marketing/Hero", { path: "/marketing", site: { id: "prt_mk", slug: "marketing", name: "Acme marketing" } }),
];

/**
 * Components (Components): what the project's Storybooks document, each at the version live now with its story beside
 * it, grouped by site; and a component's page (ComponentPage) with every version and the sites built with it.
 */
const meta = preview.meta({
  title: "App/Features/Library/Components page",
  component: Components,
  decorators: [inApp],
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/components" } } },
  args: { rows },
});

/** Two sites' components, each card a link to its page. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("link", { name: "Button" }, { timeout: 5000 })).toHaveAttribute("href", "/components/cmp_button");
    await expect(canvas.getByText("No preview for this one")).toBeInTheDocument();
  },
});

/** No Storybook deployed yet: how to deploy one. */
export const Empty = meta.story({ args: { rows: [] } });

/** They couldn't load. */
export const Failed = meta.story({ args: { rows: null } });

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

const detail = {
  id: "cmp_button",
  address: "acme/acme/site:storybook/component:ui-button",
  name: "Button",
  title: "UI/Button",
  site,
  path: "/",
  versions: [
    { ...row("cmp_button", "Button", "UI/Button"), usedBy: [{ id: "prt_mk", name: "Acme marketing", address: "acme/acme/site:marketing", project: "acme" }] },
    { ...row("cmp_button_2", "Button", "UI/Button", { version: 2, status: "superseded", createdAt: "2026-09-20T09:00:00Z", stories: ["Default"] }), usedBy: [] },
    { ...row("cmp_button_1", "Button", "UI/Button", { version: 1, status: "superseded", createdAt: "2026-08-02T09:00:00Z", preview: null, storybook: null, stories: [] }), usedBy: [] },
  ],
};

/** A component's page: its story live, its versions; an old one whose build is gone keeps only its record. */
export const Detail = meta.story({
  parameters: { nextjs: { navigation: { pathname: "/components/cmp_button" } } },
  render: () => <ComponentPage c={detail as never} />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: /@1/ }, { timeout: 5000 }));
    await expect(canvas.getByText("The build that held @1 is no longer kept, so only its record remains.")).toBeInTheDocument();
  },
});

/** A component opened from Explore: the same view in a panel over it, read from /api/v1/components/{id}. */
export const InExplore = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/components/:id", () => HttpResponse.json({ data: detail }))),
  render: () => <ComponentSheet id="cmp_button" onClose={() => {}} />,
  play: async () => {
    const panel = await screen.findByRole("dialog", { name: "Button" });
    await expect(within(panel).getByRole("link", { name: "Open its page" })).toHaveAttribute("href", "/components/cmp_button");
    await expect(within(panel).getByRole("heading", { name: /Versions/ })).toBeInTheDocument();
  },
});
