import preview from "#.storybook/preview";
import { expect, screen, waitFor } from "storybook/test";
import { assetFiles, me, recorder, viewer, withMe } from "#.storybook/fixtures/brands";
import { BrandingPanel, type BrandingSetting } from "@/components/settings/branding";

const sent = recorder();
const LOGO = "3f1c2a9e-7b4d-4e21-9a0c-5d8e6f7a1b2c";
const own: BrandingSetting = {
  value: { name: "Acme Assets", tagline: "Everything Acme, in one place", logo: LOGO, icon: null, accent: "#2f62ff", accentFrom: null, emailFooter: "Acme Inc, 1 Main Street." },
  sources: { name: "organization", tagline: "organization", logo: "organization", accent: "organization", emailFooter: "organization", icon: "environment" },
  own: true,
};
const plain: BrandingSetting = {
  value: { name: "Artbucket", tagline: null, logo: null, icon: null, accent: null, accentFrom: null, emailFooter: null },
  sources: {},
  own: false,
};
const brands = [
  { id: "brd_acme", name: "Acme" },
  { id: "brd_northwind", name: "Northwind" },
];

const meta = preview.meta({
  title: "App/Features/Settings/Branding",
  component: BrandingPanel,
  args: { setting: own, brands },
  decorators: [withMe(me)],
  beforeEach: ({ msw }) => {
    sent.reset();
    msw.use(assetFiles);
  },
});

/** The organization's own name, logo, accent and footer; the icon from the server's configuration. */
export const Playground = meta.story({});

/** The product's own look: nothing set, nothing to reset. */
export const Default = meta.story({
  args: { setting: plain },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("The product's own")).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
  },
});

/** A new accent, graded for legibility in both themes as it is typed, sent alone on Save. */
export const Accent = meta.story({
  args: { setting: plain },
  beforeEach: ({ msw }) => void msw.use(sent.on("patch", "/api/v1/settings/:key", {})),
  play: async ({ canvas, userEvent }) => {
    const hex = canvas.getByRole("textbox", { name: "Accent, hex" });
    await userEvent.clear(hex);
    await userEvent.type(hex, "#ff5b1f");
    await expect(canvas.getByRole("button", { name: "Back to the product's own accent" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent.last("PATCH")).toEqual({ path: "/api/v1/settings/branding?context=organization", body: { accent: "#ff5b1f" } }));
    await expect(await screen.findByText("Saved: everyone in the organization sees it now")).toBeInTheDocument();
  },
});

/** Follow a brand: each of its releases sets the accent. */
export const FollowBrand = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("patch", "/api/v1/settings/:key", {})),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Follow a brand" }));
    await userEvent.click(await screen.findByRole("option", { name: "Acme" }));
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ accentFrom: "brd_acme" }));
  },
});

/** Following a brand of another project: kept, and named as such. */
export const FollowsElsewhere = meta.story({ args: { setting: { ...own, value: { ...own.value, accentFrom: "brd_elsewhere" } } } });

/** A logo that isn't an asset's link or id: said under it, and Save waits. */
export const BadLogo = meta.story({
  play: async ({ canvas, userEvent }) => {
    const logo = canvas.getByLabelText("Logo");
    await userEvent.clear(logo);
    await userEvent.type(logo, "https://example.test/logo.png");
    await expect(canvas.getByText(/That isn't an asset/)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
  },
});

/** The server refused the save: its message, and the edits stay. */
export const SaveFails = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("patch", "/api/v1/settings/:key", { code: "invalid", message: "That logo isn't approved" }, 422)),
  play: async ({ canvas, userEvent }) => {
    const name = canvas.getByRole("textbox", { name: "Product name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Acme Library");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ name: "Acme Library" }));
    await expect(await screen.findByText("That logo isn't approved")).toBeInTheDocument();
    await expect(name).toHaveValue("Acme Library");
  },
});

/** Reset asks, then drops the organization's own look. */
export const Reset = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("delete", "/api/v1/settings/:key", {})),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Reset" }));
    await userEvent.click(await screen.findByRole("button", { name: "Reset" }));
    await waitFor(() => expect(sent.last("DELETE")?.path).toBe("/api/v1/settings/branding?context=organization"));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(), { timeout: 5000 });
  },
});

/** Not an organization admin: read-only, and why. */
export const Viewer = meta.story({
  decorators: [withMe(viewer)],
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Only the organization's admins can change this.")).toBeInTheDocument();
    await expect(canvas.getByRole("textbox", { name: "Product name" })).toBeDisabled();
    await expect(canvas.getByRole("combobox", { name: "Follow a brand" })).toBeDisabled();
  },
});

export const LongNames = meta.story({
  args: {
    setting: { ...own, value: { ...own.value, name: "Acme International Holdings Brand Library", tagline: "Every logo, typeface, photo and guideline of every Acme brand, for partners and agencies" } },
    brands: [{ id: "brd_long", name: "Acme International Holdings Partner Programme for Resellers" }],
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
