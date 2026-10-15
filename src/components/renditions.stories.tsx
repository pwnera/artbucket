import preview from "#.storybook/preview";
import { http, HttpResponse } from "msw";
import { expect, screen, waitFor, within } from "storybook/test";
import { as, byId } from "#.storybook/fixtures/library";
import { describeSpec, Renditions } from "@/components/renditions";

let signed: unknown[] = [];

/**
 * Sizes and formats (Renditions): copy a link to, or download, the asset at a preset or a custom size. A copied link
 * works for people with access, follows the asset to its current version unless asked not to, or is signed for
 * anyone for a while by someone who may share it.
 */
const meta = preview.meta({
  title: "App/Features/Library/Renditions",
  component: Renditions,
  decorators: [as, (Story) => <div className="flex min-h-[38rem] items-end justify-end p-4">{Story()}</div>],
  args: { asset: byId("ast_hero") },
  beforeEach: ({ msw }) => {
    signed = [];
    msw.use(
      http.post("/api/v1/assets/:id/signed-url", async ({ request }) => {
        signed.push(await request.json());
        return HttpResponse.json({ data: { url: "https://acme.artbucket.io/a/ast_hero?s=sig123" } });
      }),
    );
  },
});

const openIt = async (canvas: { getByRole: (r: string, o: object) => HTMLElement }, userEvent: { click: (e: Element) => Promise<void> }) => {
  await userEvent.click(canvas.getByRole("button", { name: "Sizes and formats" }));
  return screen.findByRole("dialog", { name: "Sizes and formats" });
};

/** The presets by what they are for, each with its real size for this image. */
export const Playground = meta.story({
  play: async ({ canvas, userEvent }) => {
    const pop = await openIt(canvas, userEvent);
    await expect(within(pop).getByText("1200 × 630 JPEG")).toBeInTheDocument();
    await expect(within(pop).getByRole("link", { name: "Download Social square" })).toHaveAttribute("download", "autumn-campaign-hero-social-square.jpg");
    await expect(within(pop).getByText("Links follow new versions")).toBeInTheDocument();
  },
});

/** A custom size: checked as typed, and a row for it once it is valid. */
export const Custom = meta.story({
  play: async ({ canvas, userEvent }) => {
    const pop = await openIt(canvas, userEvent);
    await userEvent.type(within(pop).getByLabelText("Width"), "0");
    await expect(within(pop).getByRole("alert")).toHaveTextContent("Sizes are whole numbers from 1 to");
    await userEvent.clear(within(pop).getByLabelText("Width"));
    await userEvent.type(within(pop).getByLabelText("Width"), "512");
    await expect(within(pop).getByText("w_512,f_webp")).toBeInTheDocument();
    await expect(within(pop).getByText("512 × 341 WEBP")).toBeInTheDocument();
  },
});

/** Copied for anyone, for a week: one signed URL serves every size. */
export const SignedForAnyone = meta.story({
  play: async ({ canvas, userEvent }) => {
    const pop = await openIt(canvas, userEvent);
    await userEvent.click(within(pop).getByRole("combobox", { name: "Who copied links work for" }));
    await userEvent.click(await screen.findByRole("option", { name: "Anyone, for a week" }));
    await userEvent.click(await within(pop).findByRole("button", { name: "Copy Web link" }));
    await waitFor(() => expect(signed).toEqual([{ expiresIn: 604800 }]));
  },
});

/** A public asset: links work for anyone already. */
export const Public = meta.story({
  args: { asset: byId("ast_logo") },
  play: async ({ canvas, userEvent }) => {
    const pop = await openIt(canvas, userEvent);
    await expect(within(pop).getByText("Anyone: it is public")).toBeInTheDocument();
  },
});

/** A viewer: links for people with access, nothing to sign. */
export const Viewer = meta.story({
  parameters: { app: { scope: "read" } },
  play: async ({ canvas, userEvent }) => {
    const pop = await openIt(canvas, userEvent);
    await expect(within(pop).queryByRole("combobox", { name: "Who copied links work for" })).not.toBeInTheDocument();
    await expect(within(pop).getByText("People with access")).toBeInTheDocument();
  },
});

/** How a spec reads: the real size when the image is known, "up to" when it is smaller than asked. */
export const Describe = meta.story({
  render: () => (
    <ul className="text-sm">
      {["w_1200,f_webp", "w_8000,f_png", "w_1080,h_1080,fit_cover,f_jpeg", "h_300"].map((s) => (
        <li key={s}>
          <code>{s}</code>: {describeSpec(s, { width: 4096, height: 2731, mime: "image/jpeg" })}
        </li>
      ))}
    </ul>
  ),
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
