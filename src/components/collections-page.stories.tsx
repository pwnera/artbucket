import preview from "#.storybook/preview";
import { http, HttpResponse } from "msw";
import { expect, screen, waitFor } from "storybook/test";
import { collections, fields, inApp, library } from "#.storybook/fixtures/library";
import { CollectionsPage } from "@/components/collections-page";

/** Collections (/collections): each one opening in Explore, New and Edit opening the shell's dialog. */
const meta = preview.meta({
  title: "App/Features/Library/Collections page",
  component: CollectionsPage,
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/collections" } } },
  decorators: [inApp],
  beforeEach: ({ msw }) => void msw.use(...library()),
});

/** An editor's list: each row links to Explore, the catalog, a pin, and Edit. */
export const Default = meta.story({
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("link", { name: "Autumn campaign" })).toHaveAttribute("href", "/?collection=col_campaign");
    await expect(canvas.getByLabelText("Private")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Edit Logos" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit collection" });
    await expect(dialog).toBeInTheDocument();
  },
});

/** New collection opens the same dialog, empty; Create posts it. */
export const Create = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get("/api/v1/fields", () => HttpResponse.json({ data: fields })),
      http.post("/api/v1/collections", async ({ request }) => HttpResponse.json({ data: { id: "col_new", count: 0, fields: {}, ...((await request.json()) as object) } })),
    ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "New collection" }));
    const dialog = await screen.findByRole("dialog", { name: "New collection" });
    await userEvent.type(await screen.findByLabelText("Name"), "Holiday 2026");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  },
});

/** A project with none yet. */
export const Empty = meta.story({
  parameters: { app: { sidebar: { collections: [] } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No collections yet.")).toBeInTheDocument();
  },
});

/** A viewer: the list to open, no New, no Edit. */
export const Viewer = meta.story({
  parameters: { app: { scope: "read" } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "New collection" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: /^Edit / })).not.toBeInTheDocument();
  },
});

/** Many collections, one with a long name. */
export const Many = meta.story({
  parameters: {
    app: {
      sidebar: {
        collections: [
        ...collections,
        { id: "col_long", name: "Acme and Northwind co-branded retail window displays for the spring and summer seasons", icon: "building-store", fields: {}, count: 1_204 },
        ...Array.from({ length: 12 }, (_, i) => ({ id: `col_${i}`, name: `Market ${i + 1}`, icon: null, fields: {}, count: i * 7 })),
        ],
      },
    },
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
