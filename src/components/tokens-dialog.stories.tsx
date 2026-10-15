import preview from "#.storybook/preview";
import { acme, longBrand, northwind } from "#.storybook/fixtures/brands";
import { delay, http, HttpResponse } from "msw";
import { expect, fn, screen, spyOn, waitFor, within } from "storybook/test";
import { TokensDialog } from "@/components/tokens-dialog";

/** What GET /api/v1/brand/tokens answers, per format: a few lines of each, as lib/tokens.ts writes them. */
const FILES: Record<string, string> = {
  css: `/* Acme, release 12 */\n:root {\n  --color-primary: #2f62ff;\n  --color-ink: #0b1020;\n  --color-accent: #ff5b1f;\n  --font-heading: "Inter";\n  --font-size-body: 16px;\n}`,
  tailwind: `@theme {\n  --color-primary: #2f62ff;\n  --color-accent: #ff5b1f;\n  --font-heading: "Inter";\n}`,
  json: `{\n  "color": {\n    "primary": { "$type": "color", "$value": "#2f62ff" }\n  }\n}`,
};
let asked: string[] = [];

const meta = preview.meta({
  title: "App/Features/Brands/Tokens dialog",
  component: TokensDialog,
  args: { brand: acme, open: true, onOpenChange: fn() },
  argTypes: { context: { control: "select", options: [undefined, "dark", "print"] } },
  beforeEach: ({ msw }) => {
    asked = [];
    msw.use(
      http.get("/api/v1/brand/tokens", ({ request }) => {
        const u = new URL(request.url);
        asked.push(u.search);
        const format = u.searchParams.get("format") ?? "css";
        return new HttpResponse(FILES[format] ?? FILES.css, { headers: { "Content-Type": "text/plain" } });
      }),
    );
  },
});

/** Opened from a brand's header: CSS variables first, the file as the API serves it, highlighted. */
export const Playground = meta.story({
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "Design tokens" });
    await expect(within(dialog).getByText("acme.tokens.css")).toBeInTheDocument();
    await expect(await within(dialog).findByText("#2f62ff")).toBeInTheDocument();
    // The default brand needs no ?brand=.
    await expect(asked).toEqual(["?format=css"]);
    await expect(within(dialog).getByRole("button", { name: "CSS variables" })).toHaveAttribute("aria-current", "true");
  },
});

/** Another format: picked from the list, fetched once, named for the brand. */
export const Formats = meta.story({
  args: { brand: northwind },
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog", { name: "Design tokens" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Tailwind CSS 4" }));
    await expect(within(dialog).getByText("northwind.theme.css")).toBeInTheDocument();
    await expect(await within(dialog).findByText("@theme")).toBeInTheDocument();
    await expect(within(dialog).getByRole("link", { name: "Download" })).toHaveAttribute("href", "/api/v1/brand/tokens?format=tailwind&brand=northwind");
    await userEvent.click(within(dialog).getByRole("button", { name: "Design Tokens JSON" }));
    await expect(await within(dialog).findByText('"$value"')).toBeInTheDocument();
  },
});

/** Copy puts the file itself on the clipboard; Copy a link, its address. */
export const Copy = meta.story({
  beforeEach: () => {
    const write = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    return () => write.mockRestore();
  },
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog", { name: "Design tokens" });
    await within(dialog).findByText("#2f62ff");
    await userEvent.click(within(dialog).getByRole("button", { name: "Copy acme.tokens.css" }));
    await expect(navigator.clipboard.writeText).toHaveBeenCalledWith(FILES.css);
    await expect(await within(dialog).findByText("Copied")).toBeInTheDocument();
  },
});

/** In a context (dark): its own file and address. */
export const InAContext = meta.story({
  args: { context: "dark", brand: longBrand },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "Design tokens" });
    await expect(within(dialog).getByText("acme-international-holdings-partner-programme-dark.tokens.css")).toBeInTheDocument();
    await waitFor(() => expect(asked).toEqual(["?format=css&brand=acme-international-holdings-partner-programme&context=dark"]));
  },
});

/** While the file comes: lines of code, not a word, and nothing to copy yet. */
export const Loading = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get("/api/v1/brand/tokens", async () => {
        await delay("infinite");
        return new HttpResponse(null);
      }),
    ),
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "Design tokens" });
    await expect(within(dialog).getByRole("status", { name: "Loading" })).toBeInTheDocument();
    await expect(within(dialog).getByRole("button", { name: "Copy acme.tokens.css" })).toBeDisabled();
  },
});

/** The API refused: say so, and Retry fetches it again. */
export const Failed = meta.story({
  beforeEach: ({ msw }) => {
    let tries = 0;
    msw.use(http.get("/api/v1/brand/tokens", () => (++tries === 1 ? HttpResponse.json({ error: { code: "not_found", message: "No release" } }, { status: 404 }) : new HttpResponse(FILES.css))));
  },
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog", { name: "Design tokens" });
    await expect(await within(dialog).findByText("Couldn't load this format.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
    await expect(await within(dialog).findByText("#2f62ff")).toBeInTheDocument();
  },
});

/** On a phone the formats are a select above the file. */
export const Phone = meta.story({
  globals: { viewport: { value: "phone" } },
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog", { name: "Design tokens" });
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Format" }));
    await userEvent.click(await screen.findByRole("option", { name: "TypeScript" }));
    await expect(await within(dialog).findByText("acme.tokens.ts")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  },
});
