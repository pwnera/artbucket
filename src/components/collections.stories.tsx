import preview from "#.storybook/preview";
import { http, HttpResponse } from "msw";
import { expect, fn, screen, waitFor, within } from "storybook/test";
import { as, collections, fields } from "#.storybook/fixtures/library";
import { CollectionDialog, CollectionIcon } from "@/components/collections";
import { COLLECTION_ICONS } from "@/lib/collection-icons";

let saved: unknown[] = [];

/**
 * New or edit a collection (CollectionDialog): its name, its icon, private or not, and the values its assets inherit.
 * Typed edits ask before a stray Esc throws them away.
 */
const meta = preview.meta({
  title: "App/Features/Library/Collection dialog",
  component: CollectionDialog,
  decorators: [as],
  args: { fields, open: true, onClose: fn(), onSaved: fn() },
  beforeEach: ({ msw }) => {
    saved = [];
    msw.use(
      http.post("/api/v1/collections", async ({ request }) => {
        const body = await request.json();
        saved.push(body);
        return HttpResponse.json({ data: { id: "col_new", count: 0, ...(body as object) } });
      }),
      http.patch("/api/v1/collections/:id", async ({ request }) => {
        const body = await request.json();
        saved.push(body);
        return HttpResponse.json({ data: { ...collections[0], ...(body as object) } });
      }),
      http.delete("/api/v1/collections/:id", () => HttpResponse.json({ data: {} })),
    );
  },
});

/** New: a name, an icon and a region, posted together. */
export const New = meta.story({
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole("dialog", { name: "New collection" });
    await userEvent.type(within(dialog).getByLabelText("Name"), "Holiday 2026");
    await userEvent.click(within(dialog).getByRole("radio", { name: "sparkles" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(saved).toEqual([{ name: "Holiday 2026", icon: "sparkles", private: false, fields: {} }]));
    await expect(args.onSaved).toHaveBeenCalled();
  },
});

/** Edit: what it is now, Delete beside Save. */
export const Edit = meta.story({
  args: { collection: collections[0] },
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog", { name: "Edit collection" });
    await expect(within(dialog).getByLabelText("Name")).toHaveValue("Autumn campaign");
    await userEvent.click(within(dialog).getByRole("switch", { name: /Private/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved[0]).toMatchObject({ name: "Autumn campaign", icon: "leaf", private: true }));
  },
});

/** Delete, asked first: its assets stay in the library. */
export const Delete = meta.story({
  args: { collection: collections[1] },
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole("dialog", { name: "Edit collection" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Delete Logos?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(args.onSaved).toHaveBeenCalledWith(null));
  },
});

/** A project without fields: name, icon and private alone. */
export const NoFields = meta.story({ args: { fields: [] } });

/** An editor who may not delete collections. */
export const Editor = meta.story({ parameters: { app: { scope: "write" } }, args: { collection: collections[2] } });

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

/** Every icon a collection can take, a folder when it has none. */
export const Icons = meta.story({
  render: () => (
    <ul className="grid grid-cols-10 gap-3">
      {[...COLLECTION_ICONS, null].map((i) => (
        <li key={i ?? "none"} className="flex flex-col items-center gap-1 text-xs">
          <CollectionIcon icon={i} className="size-5" />
          {i ?? "none"}
        </li>
      ))}
    </ul>
  ),
});
