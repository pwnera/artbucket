import preview from "#.storybook/preview";
import { expect, screen, waitFor } from "storybook/test";
import { PORTAL } from "@/components/site/story-site";
import { TermsGate } from "@/components/site/terms";

/** Forget earlier acceptances, so the gate asks again. */
const forget = () => {
  for (const k of Object.keys(localStorage)) if (k.startsWith("terms:")) localStorage.removeItem(k);
};

/**
 * A portal's terms, before a reader's first download: a click on any download link waits until they accept, then
 * goes on. Accepted once, kept in the browser; new terms ask again.
 */
const meta = preview.meta({
  title: "Brand site/Parts/Terms",
  component: TermsGate,
  args: { portal: "blender", terms: PORTAL.site.terms! },
  beforeEach: () => {
    forget();
    return forget;
  },
  render: (args) => (
    <>
      <a href="data:text/plain,Blender" download="blender-logo.txt" className="underline">
        Download the logo
      </a>
      <TermsGate {...args} />
    </>
  ),
});

/** A download asks first; Cancel lets it go no further. */
export const Playground = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("link", { name: "Download the logo" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Before you download" });
    await expect(screen.getByRole("region", { name: "Terms of use" })).toHaveTextContent("Credit Blender");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  },
});

/** Accepted: the download goes, and the next one doesn't ask. */
export const Accepted = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("link", { name: "Download the logo" }));
    await userEvent.click(await screen.findByRole("button", { name: "Accept and download" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await expect(Object.keys(localStorage).some((k) => k.startsWith("terms:blender:"))).toBe(true);
  },
});
