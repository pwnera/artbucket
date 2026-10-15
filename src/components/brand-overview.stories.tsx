import preview from "#.storybook/preview";
import { acme, assetFiles, emptyStatus, freezeNow, longBrand, me, northwind, release, rules, status, viewer, withMe } from "#.storybook/fixtures/brands";
import { expect } from "storybook/test";
import { BrandOverview, ScoreRing } from "@/components/brand-overview";

const card = { brand: { name: "Acme", rules, signed: null, terms: null }, live: 12 };
const signals = { days: 30, pulls: 1284, views: 5310, adoption: { release: { number: 12 }, share: 72 } };

const meta = preview.meta({
  title: "App/Features/Brands/Overview",
  component: BrandOverview,
  args: {
    brand: acme,
    rules,
    status,
    release,
    changes: ["1 new rule", "1 rule changed"],
    signals,
    card,
    comments: 2,
    links: { release: "/brands/acme/releases/new", review: "/brands/acme/guidelines?comments=1" },
  },
  parameters: { layout: "fullscreen" },
  decorators: [withMe(me)],
  beforeEach: ({ msw }) => {
    msw.use(assetFiles);
    return freezeNow();
  },
});

/** Acme: released, one edit behind, on a portal and BrandHub. The team's strip, the card readers see, and its health. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    const team = canvas.getByRole("list", { name: "For the team" });
    await expect(team).toHaveTextContent("Unreleased changes");
    await expect(canvas.getByRole("link", { name: "2 open comments" })).toHaveAttribute("href", "/brands/acme/guidelines?comments=1");
    await expect(canvas.getByRole("link", { name: "Share it on a portal" })).toHaveAttribute("href", "/brands/acme/sharing");
    await expect(canvas.getByRole("heading", { name: "What readers see" })).toBeInTheDocument();
    await expect(canvas.getByText("1 new rule · 1 rule changed · 2 days ago")).toBeInTheDocument();
    await expect(canvas.getByRole("img", { name: "Score 86 of 100" })).toBeInTheDocument();
  },
});

/** Northwind, a new brand: nothing released, nothing in the card, the first fix named. */
export const Empty = meta.story({
  args: {
    brand: northwind,
    rules: [],
    status: emptyStatus,
    release: null,
    changes: null,
    signals: { days: 30, pulls: 0, views: 0, adoption: null },
    card: { brand: { name: "Northwind", rules: [], signed: null, terms: null }, live: null },
    comments: 0,
    links: { release: "/brands/northwind/releases/new" },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Never released")).toBeInTheDocument();
    await expect(canvas.getByText("No line yet: add one in its voice rules.")).toBeInTheDocument();
    await expect(canvas.getByText("Nothing yet: add colors, type and logos in the rules.")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Add the main color" })).toHaveAttribute("href", "/brands/northwind/rules");
  },
});

/** Up to date with the live release: the strip says so, without Release. */
export const UpToDate = meta.story({
  args: { status: { ...status, publish: "current" as const } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Up to date with @12")).toBeInTheDocument();
  },
});

/** A viewer: no Release, no comments or insights they may not read. */
export const Viewer = meta.story({
  args: { links: {}, comments: null, signals: null },
  decorators: [withMe(viewer)],
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("link", { name: "Release" })).not.toBeInTheDocument();
    await expect(canvas.queryByText("All insights")).not.toBeInTheDocument();
  },
});

/** Started from another brand on BrandHub: its lineage. */
export const StartedFromBrandHub = meta.story({
  args: { brand: { ...acme, from: "unclaimed/acme" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("unclaimed/acme")).toBeInTheDocument();
  },
});

/** Status and signals couldn't be read: the card alone. */
export const NoStatus = meta.story({ args: { status: null, signals: null } });

export const LongName = meta.story({ args: { brand: longBrand } });

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

/** The score's ring, at any size. */
export const Ring = meta.story({
  render: () => <ScoreRing score={86} size={110} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("img", { name: "Score 86 of 100" })).toBeInTheDocument();
  },
});
