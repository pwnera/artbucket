import preview from "#.storybook/preview";
import { acme, brands, me, northwind, ownTemplates, release, viewer, withMe } from "#.storybook/fixtures/brands";
import { inApp, picture } from "#.storybook/fixtures/library";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { http, HttpResponse } from "msw";
import { expect, screen, spyOn, waitFor } from "storybook/test";
import type { BrandHub } from "@/components/brands";
import { Templates } from "@/components/templates";

const HUB = "https://hub.artbucket.test/acme/acme";
const hub: BrandHub = { visibility: "public", url: HUB, published: { number: 12, publishedAt: release.publishedAt }, portal: null, chosen: true, portals: null, verified: "acme.test" };
/** The share card, drawn as the API or BrandHub would: a 1200x630 picture. */
const card = () => new HttpResponse(picture("og-card", 1200, 630), { headers: { "Content-Type": "image/svg+xml" } });

const meta = preview.meta({
  title: "App/Features/Brands/Templates",
  component: Templates,
  args: { brands: brands.slice(0, 2), brand: acme, release, hub: null, own: ownTemplates, origin: "" },
  decorators: [withMe(me), inApp],
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/templates" } } },
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/brand/cards/og", card), http.get(`${HUB}/og.png`, card)),
});

/** A released brand on a server without BrandHub: its share card (its URL needs a key), slides and documents, and its own templates. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Share card" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Download .potx" })).toHaveAttribute("href", "/api/v1/brand/office?brand=acme&format=potx");
    await expect(canvas.getByRole("link", { name: "Download .dotx" })).toHaveAttribute("href", "/api/v1/brand/office?brand=acme&format=dotx");
    await expect(canvas.getByText("Release 12, ready to open in PowerPoint or Word. Each new release makes new ones.")).toBeInTheDocument();
    await expect(canvas.queryByRole("heading", { name: "Press kit" })).not.toBeInTheDocument();
  },
});

/** Use the share card: a title, a line above it and a theme, tried live once typing stops, then its tag copied. */
export const UseTheShareCard = meta.story({
  args: { hub },
  beforeEach: () => {
    const write = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    return () => write.mockRestore();
  },
  play: async ({ canvas, userEvent }) => {
    const title = canvas.getByLabelText("Title");
    await userEvent.clear(title);
    await userEvent.type(title, "Spring launch");
    await userEvent.type(canvas.getByLabelText("Above it"), "News");
    await userEvent.click(canvas.getByRole("radio", { name: "Dark" }));
    const img = await canvas.findByRole("img", { name: "Acme's share card, titled Spring launch" });
    await waitFor(() => expect(img).toHaveAttribute("src", `${HUB}/og.png?title=Spring+launch&eyebrow=News&theme=dark`));
    await userEvent.click(canvas.getByRole("button", { name: "Copy the og:image tag" }));
    await expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`<meta property="og:image" content="${HUB}/og.png?title=Spring+launch&amp;eyebrow=News&amp;theme=dark" />`);
    // A public brand's press kit, from its BrandHub page.
    await expect(canvas.getByRole("link", { name: "Download the press kit" })).toHaveAttribute("href", `${HUB}/press-kit.zip`);
  },
});

/** The brand's own Office files: one follows the brand, one won't everywhere (and says why), one couldn't be read and has nothing to download. */
export const OwnTemplates = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Follows the brand\. 1 image updated to the current version on download\./)).toBeInTheDocument();
    await expect(canvas.getByText(/2 colors set by hand \(#ff0000, #00a3e0\); 1 font set by hand \(Comic Sans MS\); 2 images not in the library/)).toBeInTheDocument();
    await expect(canvas.getByText(/It isn't an Office file Artbucket can read/)).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: /^Download \.potx\s*: Sales deck$/ })).toHaveAttribute("href", "/api/v1/brand/office/templates/tpl_deck?brand=acme");
    await expect(canvas.queryByRole("link", { name: /Download \.xltx/ })).not.toBeInTheDocument();
  },
});

/** None of its own yet: where to put one. */
export const NoOwnTemplates = meta.story({
  args: { own: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Rules" })).toHaveAttribute("href", "/brands/acme/rules");
  },
});

/** Picking another brand loads its templates. */
export const PickABrand = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Brand" }));
    await userEvent.click(await screen.findByRole("option", { name: northwind.name }));
    await expect(getRouter().push).toHaveBeenCalledWith("/templates?brand=northwind");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  },
});

/** On BrandHub but not released there yet: the way to put the press kit on it. */
export const NotOnBrandHub = meta.story({
  args: { hub: { ...hub, visibility: "private", published: null } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Put it on BrandHub" })).toHaveAttribute("href", "/brands/acme/sharing");
  },
});

/** Not released yet: nothing to make templates from, and the way to release. */
export const NotReleased = meta.story({
  args: { brand: northwind, release: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Release Northwind first")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Release Northwind" })).toBeInTheDocument();
  },
});

/** A viewer on a brand not released: told to wait, no button they couldn't use. */
export const NotReleasedViewer = meta.story({
  args: { brand: northwind, release: null },
  decorators: [withMe(viewer)],
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("link", { name: "Release Northwind" })).not.toBeInTheDocument();
  },
});

/** No brand at all. */
export const NoBrand = meta.story({
  args: { brands: [], brand: null, release: null, own: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No brand yet")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "New brand" })).toHaveAttribute("href", "/brands?new=brand");
  },
});

export const Phone = meta.story({ args: { hub }, globals: { viewport: { value: "phone" } } });
