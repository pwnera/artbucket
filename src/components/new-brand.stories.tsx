import preview from "#.storybook/preview";
import { IMPORTER, importer } from "#.storybook/fixtures/brand-pages";
import { me, recorder, withMe } from "#.storybook/fixtures/brands";
import { http, HttpResponse } from "msw";
import { expect, fn, screen, waitFor, within } from "storybook/test";
import { NewBrand } from "@/components/new-brand";

const sent = recorder();
const made = { id: "brd_kids", slug: "acme-kids", name: "Acme Kids", default: false, rules: 0 };

/** GET /api/v1/brand-json?domain=acme.test: two brands in its brand.json, Acme picked, a field left out. */
const found = {
  domain: "acme.test",
  pick: "acme",
  brands: [
    { id: "acme", name: "Acme", domain: "acme.test", tagline: "Tools for every job", colors: ["#2f62ff", "#0b1020", "#ff5b1f"], fonts: ["Inter"], logos: 2, rules: 9, dropped: ["tone.examples"] },
    { id: "kids", name: "Acme Kids", domain: "kids.acme.test", tagline: null, colors: ["#f59e0b"], fonts: [], logos: 1, rules: 3, dropped: [] },
  ],
};

/** The dialog, as a step shows it: everything in it is portaled. */
const dialog = () => screen.findByRole("dialog");

/**
 * New brand: made here (blank, from a domain's brand.json or from a showcase template), by an AI agent given one
 * prompt, from a Git repository, or imported from a zip or a guidelines PDF where the server reads them. Each card is
 * a radio: arrow keys move between them, Continue goes on.
 */
const meta = preview.meta({
  title: "App/Features/Brands/New brand",
  component: NewBrand,
  args: { open: true, onClose: fn(), onDone: fn() },
  decorators: [withMe(me)],
  beforeEach: ({ msw }) => {
    sent.reset();
    msw.use(sent.on("post", "/api/v1/brands", made), http.get("/api/v1/brand-json", () => HttpResponse.json({ data: found })));
  },
});

/** The first step: how to set it up, picked with the arrow keys as radios are. */
export const Playground = meta.story({
  play: async ({ args, userEvent }) => {
    const d = within(await dialog());
    const builder = d.getByRole("radio", { name: "Start here" });
    await expect(builder).toBeChecked();
    await expect(builder).toHaveAccessibleDescription("Blank, from your domain or from a template, then filled in on its Rules tab.");
    builder.focus();
    await userEvent.keyboard("{ArrowRight>}");
    await waitFor(() => expect(d.getByRole("radio", { name: "Start with an AI agent" })).toBeChecked());
    await userEvent.keyboard("{/ArrowRight}");
    await userEvent.click(d.getByRole("button", { name: "Cancel" }));
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
});

/** Blank: a name is all it takes. POST /api/v1/brands with the name, then the new brand. */
export const FromScratch = meta.story({
  play: async ({ args, userEvent }) => {
    await userEvent.click(within(await dialog()).getByRole("button", { name: "Continue" }));
    const d = within(await screen.findByRole("dialog", { name: "New brand" }));
    await expect(d.getByRole("radio", { name: "Blank" })).toBeChecked();
    await userEvent.type(d.getByRole("textbox", { name: "Name" }), "Acme Kids");
    await userEvent.click(d.getByRole("button", { name: "Create brand" }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: "/api/v1/brands", body: { name: "Acme Kids" } }));
    await waitFor(() => expect(args.onDone).toHaveBeenCalledWith(made));
  },
});

/** Create is off until there is a name: spaces don't count. */
export const NeedsAName = meta.story({
  play: async ({ userEvent }) => {
    await userEvent.click(within(await dialog()).getByRole("button", { name: "Continue" }));
    const d = within(await screen.findByRole("dialog", { name: "New brand" }));
    await expect(d.getByRole("button", { name: "Create brand" })).toBeDisabled();
    await userEvent.type(d.getByRole("textbox", { name: "Name" }), "   ");
    await expect(d.getByRole("button", { name: "Create brand" })).toBeDisabled();
    await userEvent.type(d.getByRole("textbox", { name: "Name" }), "Acme");
    await expect(d.getByRole("button", { name: "Create brand" })).toBeEnabled();
  },
});

/** A showcase template names the brand until you do, and its logos and fonts are brought in as it is made. */
export const FromATemplate = meta.story({
  play: async ({ userEvent }) => {
    await userEvent.click(within(await dialog()).getByRole("button", { name: "Continue" }));
    const d = within(await screen.findByRole("dialog", { name: "New brand" }));
    await userEvent.click(d.getByRole("radio", { name: "Rust" }));
    await expect(d.getByRole("textbox", { name: "Name" })).toHaveValue("Rust");
    // A name of your own stays when another template is picked.
    await userEvent.clear(d.getByRole("textbox", { name: "Name" }));
    await userEvent.type(d.getByRole("textbox", { name: "Name" }), "Acme Open");
    await userEvent.click(d.getByRole("radio", { name: "Blender" }));
    await expect(d.getByRole("textbox", { name: "Name" })).toHaveValue("Acme Open");
    await userEvent.click(d.getByRole("button", { name: "Create brand" }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: "/api/v1/brands", body: { name: "Acme Open", template: "blender" } }));
  },
});

/** From a domain: its brand.json looked up, a brand picked from what it holds, then made from it. */
export const FromADomain = meta.story({
  play: async ({ userEvent }) => {
    await userEvent.click(within(await dialog()).getByRole("button", { name: "Continue" }));
    const d = within(await screen.findByRole("dialog", { name: "New brand" }));
    await userEvent.click(d.getByRole("radio", { name: "From a domain" }));
    await expect(d.getByRole("button", { name: "Look it up" })).toBeDisabled();
    await userEvent.type(d.getByRole("textbox", { name: "Domain" }), "acme.test{Enter}");
    const brands = await d.findByRole("radiogroup", { name: "Brand found" });
    await expect(within(brands).getByRole("radio", { name: "Acme" })).toBeChecked();
    await expect(within(brands).getByRole("radio", { name: "Acme" })).toHaveAccessibleDescription(/Left out: tone.examples/);
    await expect(d.getByRole("textbox", { name: "Name" })).toHaveValue("Acme");
    await userEvent.click(within(brands).getByRole("radio", { name: "Acme Kids" }));
    await expect(d.getByRole("textbox", { name: "Name" })).toHaveValue("Acme Kids");
    await userEvent.click(d.getByRole("button", { name: "Create brand" }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: "/api/v1/brands", body: { name: "Acme Kids", domain: "acme.test", brand: "kids" } }));
  },
});

/** A domain with no brand.json: the reason, said where it was asked, and Create stays off. */
export const DomainNotFound = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(http.get("/api/v1/brand-json", () => HttpResponse.json({ error: { code: "not_found", message: "No brand.json at northwind.test" } }, { status: 404 }))),
  play: async ({ userEvent }) => {
    await userEvent.click(within(await dialog()).getByRole("button", { name: "Continue" }));
    const d = within(await screen.findByRole("dialog", { name: "New brand" }));
    await userEvent.click(d.getByRole("radio", { name: "From a domain" }));
    await userEvent.type(d.getByRole("textbox", { name: "Domain" }), "northwind.test");
    await userEvent.click(d.getByRole("button", { name: "Look it up" }));
    await expect(await d.findByRole("alert")).toHaveTextContent("No brand.json at northwind.test");
    await userEvent.type(d.getByRole("textbox", { name: "Name" }), "Northwind");
    await expect(d.getByRole("button", { name: "Create brand" })).toBeDisabled();
  },
});

/** The API refuses: its words in a toast, and the dialog stays with what was typed. */
export const CreateFails = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("post", "/api/v1/brands", { code: "conflict", message: "A brand is named Acme already" }, 409)),
  play: async ({ args, userEvent }) => {
    await userEvent.click(within(await dialog()).getByRole("button", { name: "Continue" }));
    const d = within(await screen.findByRole("dialog", { name: "New brand" }));
    await userEvent.type(d.getByRole("textbox", { name: "Name" }), "Acme");
    await userEvent.click(d.getByRole("button", { name: "Create brand" }));
    await expect(await screen.findByText("A brand is named Acme already")).toBeInTheDocument();
    await expect(d.getByRole("textbox", { name: "Name" })).toHaveValue("Acme");
    await expect(args.onDone).not.toHaveBeenCalled();
  },
});

/** Where the server has the Git integration: kept in a repository too, picked next, synced both ways. */
export const KeepItInGit = meta.story({
  play: async ({ userEvent }) => {
    await userEvent.click(within(await dialog()).getByRole("button", { name: "Continue" }));
    const d = within(await screen.findByRole("dialog", { name: "New brand" }));
    await userEvent.type(d.getByRole("textbox", { name: "Name" }), "Acme");
    await userEvent.click(d.getByRole("checkbox", { name: /Keep it in a Git repository too/ }));
    await expect(d.getByRole("button", { name: "Create and pick a repository" })).toBeEnabled();
  },
});

/** From a Git repository, with the integration: bring one in that has a brand.yaml, or start one kept there. */
export const FromARepository = meta.story({
  play: async ({ userEvent }) => {
    const first = within(await dialog());
    await userEvent.click(first.getByRole("radio", { name: "From a Git repository" }));
    await userEvent.click(first.getByRole("button", { name: "Continue" }));
    const d = within(await screen.findByRole("dialog", { name: "From a Git repository" }));
    await expect(d.getByRole("link", { name: /Bring in a brand from a repository/ })).toHaveAttribute("href", me.git!);
    await userEvent.click(d.getByRole("button", { name: /Start a new brand, kept in a repository/ }));
    const next = within(await screen.findByRole("dialog", { name: "New brand" }));
    await expect(next.getByRole("checkbox", { name: /Keep it in a Git repository too/ })).toBeChecked();
  },
});

/** Without the integration: made here, then pushed from the repository with the CLI, the commands naming it. */
export const FromARepositoryWithTheCli = meta.story({
  decorators: [withMe({ ...me, git: null })],
  play: async ({ args, userEvent }) => {
    const first = within(await dialog());
    await userEvent.click(first.getByRole("radio", { name: "From a Git repository" }));
    await userEvent.click(first.getByRole("button", { name: "Continue" }));
    const d = within(await screen.findByRole("dialog", { name: "From a Git repository" }));
    await userEvent.type(d.getByRole("textbox", { name: "Brand name" }), "Acme Kids");
    await userEvent.click(d.getByRole("button", { name: "Make it" }));
    await expect(await d.findByText(/brand push path\/to\/your-repo\/brand --brand acme-kids/)).toBeInTheDocument();
    await expect(sent.last("POST")).toEqual({ path: "/api/v1/brands", body: { name: "Acme Kids" } });
    // Made: Back would leave a brand behind, so only Done.
    await expect(d.getByRole("button", { name: "Back" })).toBeDisabled();
    await userEvent.click(d.getByRole("button", { name: "Done" }));
    await expect(args.onDone).toHaveBeenCalledWith(made);
  },
});

/** With an AI agent: connect it, then paste one prompt that names the brand and its website. */
export const WithAnAgent = meta.story({
  play: async ({ args, userEvent }) => {
    const first = within(await dialog());
    await userEvent.click(first.getByRole("radio", { name: "Start with an AI agent" }));
    await userEvent.click(first.getByRole("button", { name: "Continue" }));
    const d = within(await screen.findByRole("dialog", { name: "Let an agent build it" }));
    await userEvent.type(d.getByRole("textbox", { name: "Brand name" }), "Northwind");
    await userEvent.type(d.getByRole("textbox", { name: "Website" }), "https://northwind.test");
    await expect(d.getByText(/Build the brand guidelines for Northwind in artbucket. The brand's website: https:\/\/northwind.test/)).toBeInTheDocument();
    await userEvent.click(d.getByRole("tab", { name: /Cursor/ }));
    await expect(d.getByRole("tab", { name: /Cursor/ })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(d.getByRole("button", { name: "Done" }));
    await expect(args.onClose).toHaveBeenCalled();
  },
});

/** Where the server imports brands: a fourth way, a zip or a guidelines PDF uploaded and read into a plan. */
export const ImportYourBrand = meta.story({
  decorators: [withMe({ ...me, brandImport: IMPORTER })],
  beforeEach: ({ msw }) => void msw.use(...importer(null)),
  play: async ({ userEvent }) => {
    const first = within(await dialog());
    await userEvent.click(first.getByRole("radio", { name: "Import your brand" }));
    await userEvent.click(first.getByRole("button", { name: "Continue" }));
    const d = within(await screen.findByRole("dialog", { name: "Import your brand" }));
    await expect(await d.findByText("Choose a .zip or a PDF")).toBeInTheDocument();
    await expect(d.getByRole("button", { name: "Upload and read" })).toBeDisabled();
  },
});

/** Typed, then Esc twice (the first leaves the field): asked before what was typed is lost. */
export const DiscardAsks = meta.story({
  play: async ({ args, userEvent }) => {
    await userEvent.click(within(await dialog()).getByRole("button", { name: "Continue" }));
    await userEvent.type(await screen.findByRole("textbox", { name: "Name" }), "Acme Kids");
    await userEvent.keyboard("{Escape}{Escape}");
    const ask = await screen.findByRole("alertdialog", { name: "Discard changes?" });
    await userEvent.click(within(ask).getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await expect(args.onClose).not.toHaveBeenCalled();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

export const Dark = meta.story({ globals: { theme: "dark" } });
