import preview from "#.storybook/preview";
import { http, HttpResponse } from "msw";
import { expect, fn, screen, waitFor } from "storybook/test";
import { SiteSearch } from "@/components/site/search";
import { bookView, PORTAL, StorySite } from "@/components/site/story-site";
import { fixtureUrl } from "@/lib/fixtures/brand-book";

const view = bookView("blender", "color");

/**
 * Search, opened with "/" anywhere outside a field. In the app it looks through what the view carries (pages,
 * this page's sections, the rules it shows); on a portal it asks the portal, which adds its assets. Arrows move
 * through the results, Enter opens one, Esc closes.
 */
const meta = preview.meta({
  title: "Brand site/Parts/Search",
  component: SiteSearch,
  args: { open: true, onOpenChange: fn(), go: fn() },
  decorators: [(Story) => <StorySite view={view}>{Story()}</StorySite>],
});

/** Typing filters what the view holds; Enter goes to the first result. */
export const Playground = meta.story({
  play: async ({ args, userEvent }) => {
    const box = await screen.findByRole("combobox", { name: "Search" });
    await expect(screen.getByText(/every one must match/)).toBeInTheDocument();
    await userEvent.type(box, "orange");
    await expect((await screen.findAllByRole("option", { name: /Blender orange/ }))[0]).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    await expect(args.go).toHaveBeenCalledWith(expect.stringMatching(/^\?page=/));
    await expect(args.onOpenChange).toHaveBeenCalledWith(false);
  },
});

/** Nothing matches: it says so, with the words asked. */
export const NothingFound = meta.story({
  play: async ({ userEvent }) => {
    await userEvent.type(await screen.findByRole("combobox", { name: "Search" }), "zebra");
    await expect(await screen.findByRole("status")).toHaveTextContent("Nothing found for");
  },
});

/** On a portal the portal answers, with assets too; a result goes to its path under the portal's base. */
export const OnAPortal = meta.story({
  args: { portal: PORTAL, base: "/p/blender" },
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get("/api/v1/portal/blender/search", () =>
        HttpResponse.json({
          data: {
            hits: [{ kind: "page", page: "logo", title: "Logo", snippet: "The mark and the wordmark.", brand: "blender", path: "/logo" }],
            assets: [{ ...view.media["00000000-0000-4000-8000-000000000001"], thumbnail: fixtureUrl("00000000-0000-4000-8000-000000000001") }],
          },
        }),
      ),
    ),
  play: async ({ args, userEvent }) => {
    await userEvent.type(await screen.findByRole("combobox", { name: "Search" }), "logo");
    await userEvent.click(await screen.findByRole("option", { name: "The mark" }));
    await waitFor(() => expect(args.go).toHaveBeenCalledWith("/p/blender?view=assets&asset=00000000-0000-4000-8000-000000000001"));
  },
});
