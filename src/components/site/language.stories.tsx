import preview from "#.storybook/preview";
import { expect, fn, screen, waitFor } from "storybook/test";
import { LanguageSwitch } from "@/components/site/language";
import { bookView, StorySite } from "@/components/site/story-site";

const rtl = bookView("rtl", "overview");

/** The reader's language, from the theme's list: a pick puts `?lang=` in the address. Nothing shows with fewer than two. */
const meta = preview.meta({
  title: "Brand site/Parts/Language",
  component: LanguageSwitch,
  args: { view: rtl, onNavigate: fn() },
  decorators: [(Story) => <StorySite view={rtl}>{Story()}</StorySite>],
});

/** Waha is written in Arabic and read in English too: each name is marked as its own language. */
export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Language" }));
    await userEvent.click(await screen.findByRole("option", { name: "English" }));
    await expect(args.onNavigate).toHaveBeenCalledWith(expect.stringContaining("lang=en"));
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  },
});

/** Read in English: the Arabic, the book's first language, takes ?lang= away again. */
export const InEnglish = meta.story({
  args: { view: bookView("rtl", "overview", "en") },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Language" }));
    await userEvent.click(await screen.findByRole("option", { name: "العربية" }));
    await expect(args.onNavigate).toHaveBeenCalledWith(expect.not.stringContaining("lang="));
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  },
});

/** One language (Blender): nothing to switch. */
export const OneLanguage = meta.story({
  args: { view: bookView("blender") },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("combobox")).not.toBeInTheDocument();
  },
});
