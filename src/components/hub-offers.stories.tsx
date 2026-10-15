import preview from "#.storybook/preview";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { http, HttpResponse } from "msw";
import { expect, screen, waitFor, within } from "storybook/test";
import { OfferBanners, OffersGroup, type HubOffer } from "@/components/hub-offers";

const offer: HubOffer = {
  id: "off_acme",
  org: "unclaimed",
  owner: "Unclaimed brands",
  brand: "acme",
  name: "Acme",
  domain: "acme.test",
  proof: "acme.test",
  url: "https://hub.artbucket.test/unclaimed/acme",
};
const offers: HubOffer[] = [
  offer,
  { ...offer, id: "off_long", brand: "acme-international", name: "Acme International Holdings Partner Programme for Resellers", domain: "shop.acme.test" },
];

const at = "/api/v1/hub/offers/unclaimed/acme";
let took: string | null = null;

const meta = preview.meta({
  title: "App/Features/Brands/Hub offers",
  component: OfferBanners,
  args: { offers: [offer] },
  beforeEach: () => {
    took = null;
  },
});

/** Across the Brands page, for an organization admin: a listing on BrandHub names a domain the organization proved. */
export const Playground = meta.story({});

/** Make it yours: a brand of your own from the listing, then its page. */
export const MakeItYours = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.post(at, ({ request }) => {
        took = request.method;
        return HttpResponse.json({ data: { slug: "acme-2" } });
      }),
    ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Make it yours" }));
    await expect(await screen.findByText("Acme is yours")).toBeInTheDocument();
    await expect(took).toBe("POST");
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/brands/acme-2"));
  },
});

/** Making it yours refused: the API's words in a toast, and the banner stays. */
export const MakeItYoursFails = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.post(at, () => HttpResponse.json({ error: { code: "invalid", message: "That domain is no longer verified" } }, { status: 422 }))),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Make it yours" }));
    await expect(await screen.findByText("That domain is no longer verified")).toBeInTheDocument();
    await expect(getRouter().push).not.toHaveBeenCalled();
    await expect(canvas.getByRole("button", { name: "Make it yours" })).toBeEnabled();
  },
});

/** Not ours: asked first, then offered no more. */
export const NotOurs = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.delete(at, ({ request }) => {
        took = request.method;
        return HttpResponse.json({ data: {} });
      }),
    ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Not ours" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Turn down Acme?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Not ours" }));
    await expect(await screen.findByText("unclaimed/acme won't be offered again")).toBeInTheDocument();
    await expect(took).toBe("DELETE");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  },
});

/** Several listings, a long name among them. */
export const Several = meta.story({ args: { offers } });

/** None: nothing on the page. */
export const Empty = meta.story({
  args: { offers: [] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("ul")).toBeNull();
  },
});

export const Phone = meta.story({ args: { offers }, globals: { viewport: { value: "phone" } } });

/** Settings, BrandHub: the same listings with who listed them and what the organization proved. */
export const InSettings = meta.story({
  render: () => <OffersGroup offers={offers} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Acme, listed by Unclaimed brands, names acme.test: you proved acme.test")).toBeInTheDocument();
  },
});

/** Settings, BrandHub, with none to offer. */
export const InSettingsEmpty = meta.story({
  render: () => <OffersGroup offers={[]} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/no other organization's listing names a domain you proved/)).toBeInTheDocument();
  },
});
