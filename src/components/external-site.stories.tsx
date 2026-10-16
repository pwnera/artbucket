import preview from "#.storybook/preview";
import { freezeNow, recorder } from "#.storybook/fixtures/brands";
import { inApp } from "#.storybook/fixtures/library";
import { external, sitesApi } from "#.storybook/fixtures/sites";
import { expect, screen, waitFor } from "storybook/test";
import { ExternalSitePage } from "@/components/site-deployments";

const sent = recorder();

/** An external site's page (/sites/{id}): its name, address and description, as the catalog shows them, then its scans. */
const meta = preview.meta({
  title: "App/Features/Sites/External site",
  component: ExternalSitePage,
  args: { site: { ...external, externalUrl: "https://shop.acme.test", intro: null } },
  decorators: [inApp],
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: `/sites/${external.id}` } } },
  beforeEach: ({ msw }) => {
    sent.reset();
    msw.use(...sitesApi(), sent.on("patch", "/api/v1/sites/:id", { ...external, name: "Acme store", externalUrl: "https://store.acme.test", intro: "The online store, run by the web team." }));
    return freezeNow();
  },
});

/** Renamed, moved and described: saved as one, and the page says the new name. */
export const Playground = meta.story({
  play: async ({ canvas, userEvent }) => {
    const name = canvas.getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Acme store");
    const url = canvas.getByLabelText("Address");
    await userEvent.clear(url);
    await userEvent.type(url, "https://store.acme.test");
    await userEvent.type(canvas.getByLabelText("Description"), "The online store, run by the web team.");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ name: "Acme store", url: "https://store.acme.test", intro: "The online store, run by the web team." }));
    await expect(await screen.findByRole("heading", { name: "Acme store" })).toBeInTheDocument();
    await expect(canvas.getByText("Recorded from its CI")).toBeInTheDocument();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
