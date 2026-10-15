import preview from "#.storybook/preview";
import { acme, longBrand, northwind } from "#.storybook/fixtures/brands";
import { http, HttpResponse } from "msw";
import { expect, fn, screen, waitFor } from "storybook/test";
import { BrandDialog } from "@/components/brand-switcher";

let sent: { method: string; url: string; body: unknown }[] = [];

/** Rename a brand or duplicate it, from the brand header's menu. */
const meta = preview.meta({
  title: "App/Features/Brands/Rename or duplicate",
  component: BrandDialog,
  args: { open: true, editing: { kind: "rename" as const, brand: northwind }, onClose: fn(), onDone: fn() },
  beforeEach: ({ msw }) => {
    sent = [];
    msw.use(
      http.all("/api/v1/brands*", async ({ request }) => {
        const body = (await request.json().catch(() => null)) as { name?: string } | null;
        sent.push({ method: request.method, url: new URL(request.url).pathname, body });
        const name = body?.name ?? "Acme";
        return HttpResponse.json({ data: { ...acme, id: "brd_new", slug: name.toLowerCase().replace(/\W+/g, "-"), name, default: false } });
      }),
    );
  },
});

/** Rename: the new name goes as a PATCH, and the brand comes back under its new address. */
export const Rename = meta.story({
  play: async ({ args, userEvent }) => {
    const name = await screen.findByLabelText("Name");
    await expect(screen.getByRole("dialog", { name: "Rename brand" })).toBeInTheDocument();
    await userEvent.clear(name);
    await userEvent.type(name, "Northwind Traders");
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    await waitFor(() => expect(sent).toContainEqual({ method: "PATCH", url: "/api/v1/brands/northwind", body: { name: "Northwind Traders" } }));
    await waitFor(() => expect(args.onDone).toHaveBeenCalledWith(expect.objectContaining({ slug: "northwind-traders" })));
  },
});

/** Duplicate copies its rules, pages and theme under a new name. */
export const Duplicate = meta.story({
  args: { editing: { kind: "copy", brand: acme } },
  play: async ({ args, userEvent }) => {
    await expect(await screen.findByRole("dialog", { name: "Duplicate Acme" })).toBeInTheDocument();
    await expect(screen.getByLabelText("Name")).toHaveValue("Acme copy");
    await userEvent.click(screen.getByRole("button", { name: "Create brand" }));
    await waitFor(() => expect(sent).toContainEqual({ method: "POST", url: "/api/v1/brands", body: { name: "Acme copy", from: "acme" } }));
    await waitFor(() => expect(args.onDone).toHaveBeenCalled());
  },
});

/** An empty name can't be sent. */
export const EmptyName = meta.story({
  play: async ({ userEvent }) => {
    await userEvent.clear(await screen.findByLabelText("Name"));
    await expect(screen.getByRole("button", { name: "Rename" })).toBeDisabled();
  },
});

/** A long name stays whole in the field. */
export const LongName = meta.story({
  args: { editing: { kind: "rename", brand: longBrand } },
  play: async () => expect(await screen.findByLabelText("Name")).toHaveValue(longBrand.name),
});
