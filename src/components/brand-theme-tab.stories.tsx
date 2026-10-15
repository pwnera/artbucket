import preview from "#.storybook/preview";
import { me, rules, withMe } from "#.storybook/fixtures/brands";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { http, HttpResponse } from "msw";
import { expect, screen, waitFor } from "storybook/test";
import { BrandThemeTab } from "@/components/brand-theme-tab";
import { deriveTheme, LOOKS } from "@/lib/brand-theme";

/** Acme's theme as GET .../view?edit=1 has it: drawn from its rules, nothing set by hand. */
const theme = { ...deriveTheme(rules), settings: {} };
let body: unknown;

const meta = preview.meta({
  title: "App/Features/Brands/Theme tab",
  component: BrandThemeTab,
  args: { slug: "acme", theme, behind: false, released: true },
  decorators: [withMe(me)],
  beforeEach: ({ msw }) => {
    body = undefined;
    msw.use(http.get("/api/v1/brand/rules", () => HttpResponse.json({ data: rules })));
  },
});

/** The Theme tab, released and up to date: the editor alone. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("link", { name: "Release" })).not.toBeInTheDocument();
  },
});

/** A change not yet released: portals wear the last release's theme, so the tab says so and offers Release. */
export const Behind = meta.story({
  args: { behind: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Unreleased changes. Portals and BrandHub show the last release's theme/)).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Release" })).toHaveAttribute("href", "/brands/acme/releases/new");
  },
});

/** Never released (Northwind). */
export const NeverReleased = meta.story({
  args: { slug: "northwind", released: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Not released yet. Release the brand to put this theme on its portals.")).toBeInTheDocument();
  },
});

/** Picking a style saves its layout as a draft, then the page reads the theme again. */
export const PickAStyle = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.patch("/api/v1/brands/acme/theme", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: {} });
      }),
    ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("radio", { name: /Documentation/ }));
    await waitFor(() => expect(body).toEqual(LOOKS.documentation.patch));
    await waitFor(() => expect(getRouter().refresh).toHaveBeenCalled());
  },
});

/** The save refused: the API's words in a toast, and the style picked before stays. */
export const SaveFails = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.patch("/api/v1/brands/acme/theme", () => HttpResponse.json({ error: { code: "invalid", message: "That look needs a heading face" } }, { status: 422 }))),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("radio", { name: /Documentation/ }));
    await expect(await screen.findByText("That look needs a heading face")).toBeInTheDocument();
    await expect(getRouter().refresh).not.toHaveBeenCalled();
  },
});

export const Phone = meta.story({ args: { behind: true }, globals: { viewport: { value: "phone" } } });
