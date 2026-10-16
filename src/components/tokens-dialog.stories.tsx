import preview from "#.storybook/preview";
import { acme, longBrand, northwind, rules } from "#.storybook/fixtures/brands";
import { delay, http, HttpResponse } from "msw";
import { expect, screen, spyOn, waitFor, within } from "storybook/test";
import { TokensView } from "@/components/tokens-dialog";
import { TOKEN_FORMATS, type TokenFormatId } from "@/lib/tokens";

/** What GET /api/v1/brand/tokens answers, per format: a few lines of each, as lib/tokens.ts writes them. */
const FILES: Record<string, string> = {
  css: `/* Acme, release 12 */\n:root {\n  --color-primary: #2f62ff;\n  --color-ink: #0b1020;\n  --color-accent: #ff5b1f;\n  --font-heading: "Inter";\n  --font-size-body: 16px;\n}`,
  tailwind: `@theme {\n  --color-primary: #2f62ff;\n  --color-accent: #ff5b1f;\n  --font-heading: "Inter";\n}`,
  json: `{\n  "color": {\n    "primary": { "$type": "color", "$value": "#2f62ff" }\n  }\n}`,
};
let asked: string[] = [];

const meta = preview.meta({
  title: "App/Features/Brands/Tokens",
  component: TokensView,
  args: { brand: acme, className: "h-[28rem]" },
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

/** On a brand's Sharing tab: CSS variables first, the file as the API serves it, highlighted. */
export const Playground = meta.story({
  play: async () => {
    const dialog = await screen.findByRole("navigation", { name: "Formats" }).then((n) => n.parentElement!);
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
    const dialog = await screen.findByRole("navigation", { name: "Formats" }).then((n) => n.parentElement!);
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
    const dialog = await screen.findByRole("navigation", { name: "Formats" }).then((n) => n.parentElement!);
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
    const dialog = await screen.findByRole("navigation", { name: "Formats" }).then((n) => n.parentElement!);
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
    const dialog = await screen.findByRole("navigation", { name: "Formats" }).then((n) => n.parentElement!);
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
    const dialog = await screen.findByRole("navigation", { name: "Formats" }).then((n) => n.parentElement!);
    await expect(await within(dialog).findByText("Couldn't load this format.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
    await expect(await within(dialog).findByText("#2f62ff")).toBeInTheDocument();
  },
});

/** On a phone the formats are a select above the file. */
export const Phone = meta.story({
  globals: { viewport: { value: "phone" } },
  play: async ({ userEvent }) => {
    // The list of formats folds into a select on a phone.
    const dialog = document.body;
    await userEvent.click(await within(dialog).findByRole("combobox", { name: "Format" }));
    await userEvent.click(await screen.findByRole("option", { name: "TypeScript" }));
    await expect(await within(dialog).findByText("acme.tokens.ts")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  },
});

/**
 * Every format written by lib/tokens.ts itself from Acme's rules, as GET /api/v1/brand/tokens would (the default of each
 * rule, no context), for artbucket.io's product teams page: any format picked shows what the API answers for it.
 */
export const EveryFormat = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get("/api/v1/brand/tokens", ({ request }) => {
        const id = (new URL(request.url).searchParams.get("format") ?? "css") as TokenFormatId;
        const f = TOKEN_FORMATS[id] ?? TOKEN_FORMATS.css;
        const text = f.render(rules.filter((r) => r.context === null), { origin: "https://app.acme.test", title: "acme design tokens, from Artbucket." });
        return new HttpResponse(text, { headers: { "Content-Type": f.mime } });
      }),
    ),
  play: async () => {
    const dialog = await screen.findByRole("navigation", { name: "Formats" }).then((n) => n.parentElement!);
    await expect(await within(dialog).findByText("#2f62ff")).toBeInTheDocument();
  },
});
