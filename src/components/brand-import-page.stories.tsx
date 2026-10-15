import preview from "#.storybook/preview";
import { applied, IMPORTER, importer, importView, plan } from "#.storybook/fixtures/brand-pages";
import { recorder } from "#.storybook/fixtures/brands";
import { inApp } from "#.storybook/fixtures/library";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { delay, http, HttpResponse } from "msw";
import { expect, screen, waitFor, within } from "storybook/test";
import { BrandImportPage } from "@/components/brand-import-page";

const sent = recorder();
const AT = `${IMPORTER}/imp_ready`;
/** What each edit answers: the import as it is now. */
const ready = importView("ready");

type View = ReturnType<typeof importView>;
/** The importer with the import at `view`, every write recorded and answered with `after`. */
const on = (view: View | null, after: View = ready) => [
  sent.on("patch", `${AT}/plan`, after),
  sent.on("post", `${AT}/apply`, importView("applying", { label: "Adding files", progress: { done: 120, total: 252 }, can: { ...after.can, discard: false } })),
  sent.on("post", `${AT}/undo`, importView("undoing", { label: "Removing files", progress: { done: 40, total: 240 }, applied })),
  sent.on("post", `${AT}/reread`, importView("processing", { stage: "books" })),
  sent.on("post", `${AT}/book`, after),
  sent.on("delete", AT, {}),
  ...importer(view),
];

/**
 * Gone from the page: a menu, a list or a dialog that closed. Given time: on this long page the headless browser's
 * exit animations can outlast waitFor's one second.
 */
const gone = (role: string) => waitFor(() => expect(screen.queryByRole(role)).not.toBeInTheDocument(), { timeout: 5000 });

/** The plan's brand card for `name`: the section holding its name field. */
const card = async (name: string) => within((await screen.findByDisplayValue(name)).closest("section")!);

/**
 * One brand import's page (/imports/{id}): where it is while it is read, then its plan, edited as it is reviewed
 * (each change PATCHed and the plan sent back), applied, and undone as a whole. Where the server has Intelligence's
 * importer (me.brandImport).
 */
const meta = preview.meta({
  title: "App/Features/Brands/Import",
  component: BrandImportPage,
  args: { id: "imp_ready" },
  parameters: { layout: "fullscreen", app: { me: { brandImport: IMPORTER } } },
  decorators: [inApp],
  beforeEach: () => {
    sent.reset();
  },
});

/** A plan to review: two brands, one into Acme, the other new; its collections, what was left out, and Apply. */
export const Playground = meta.story({
  beforeEach: ({ msw }) => void msw.use(...on(ready)),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("heading", { level: 1, name: "acme-brand-2026.zip" })).toBeInTheDocument();
    await expect(canvas.getByText("A plan to review. Nothing is added to the library until you apply it.")).toBeInTheDocument();
    await expect(canvas.getByText(/1 rule differs from Acme/)).toBeInTheDocument();
    await expect(canvas.getByText(/The PDF is protected by a password/)).toBeInTheDocument();
    await expect(canvas.getByText(/252 files \(44 MB\), 1 new brand, added to 1 existing brand/)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /Apply the plan/ })).toBeEnabled();
  },
});

/** Opening the import. */
export const Loading = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get(AT, async () => {
        await delay("infinite");
        return HttpResponse.json({});
      }),
    ),
});

/** No importer on this server. */
export const Off = meta.story({
  parameters: { app: { me: { brandImport: null } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Brand import is off on this server")).toBeInTheDocument();
  },
});

/** An import of another project, or one gone: the importer's reason. */
export const NotFound = meta.story({
  beforeEach: ({ msw }) => void msw.use(...on(null)),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("This import can't be opened")).toBeInTheDocument();
    await expect(canvas.getByText("There's no such import in this project.")).toBeInTheDocument();
  },
});

/** Closed during its upload: started again from New brand. */
export const Uploading = meta.story({ beforeEach: ({ msw }) => void msw.use(...on(importView("uploading", { can: { ...ready.can, discard: true } }))) });

/** Being read: its stages, the current one with its count, what the archive held. */
export const Reading = meta.story({
  beforeEach: ({ msw }) => void msw.use(...on(
    importView("processing", {
      stage: "books",
      label: "Reading acme-brand-book.pdf",
      progress: { done: 12, total: 40 },
      stats: { files: 412, kept: 252, duplicates: 96, variants: 40, junk: 24 },
    }),
  )),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Reading acme-brand-book.pdf")).toBeInTheDocument();
    await expect(canvas.getByRole("progressbar", { name: "Read" })).toHaveAttribute("aria-valuenow", "30");
    await expect(canvas.getByText(/412 files in the archive: 252 to look at, 136 duplicates or other formats and 24 system files left out/)).toBeInTheDocument();
  },
});

/** The plan's brands and folders, edited in place: each change PATCHed as one edit, and the plan sent back. */
export const EditThePlan = meta.story({
  beforeEach: ({ msw }) => void msw.use(...on(ready)),
  play: async ({ userEvent }) => {
    const acme = await card("Acme");
    const name = acme.getByRole("textbox", { name: "Brand name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Acme Group");
    await userEvent.tab();
    await waitFor(() => expect(sent.last("PATCH")).toEqual({ path: `${AT}/plan`, body: { edits: [{ type: "brand", id: "b_acme", name: "Acme Group" }] } }));
    await userEvent.click(acme.getByRole("checkbox", { name: "Include Body" }));
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ edits: [{ type: "rule", brand: "b_acme", key: "font.body", context: null, include: true }] }));
    // Into Acme: its own blue kept rather than the book's.
    await userEvent.click(acme.getByRole("checkbox", { name: /Replace the brand's current #2F62FF/ }));
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ edits: [{ type: "rule", brand: "b_acme", key: "color.primary", context: null, take: false }] }));
    await userEvent.click(acme.getByRole("checkbox", { name: "Photography" }));
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ edits: [{ type: "page", brand: "b_acme", slug: "photography", include: true }] }));
    // The overview is every brand's first page.
    await expect(acme.getByRole("checkbox", { name: "Overview" })).toBeDisabled();
  },
});

/** Where a brand goes: a new brand, or into one the project has. */
export const WhereItGoes = meta.story({
  beforeEach: ({ msw }) => void msw.use(...on(ready)),
  play: async ({ userEvent }) => {
    const kids = await card("Acme Kids");
    await userEvent.click(kids.getByRole("combobox", { name: "Where it goes" }));
    await userEvent.click(await screen.findByRole("option", { name: "Into Northwind" }));
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ edits: [{ type: "brand", id: "b_kids", target: "northwind" }] }));
    await gone("listbox");
    await userEvent.click(kids.getByRole("checkbox", { name: "Import this brand" }));
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ edits: [{ type: "brand", id: "b_kids", include: false }] }));
  },
});

/** A brand that isn't one: a category of another, or the same brand, merged. */
export const NotABrand = meta.story({
  beforeEach: ({ msw }) => void msw.use(...on(ready)),
  play: async ({ userEvent }) => {
    const kids = await card("Acme Kids");
    await userEvent.click(kids.getByRole("button", { name: /Not a brand\?/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "It's a category of Acme" }));
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ edits: [{ type: "demote", id: "b_kids", into: "b_acme" }] }));
    await gone("menu");
  },
});

/** Its guidelines: another PDF of the archive read instead, or one that couldn't be read tried again. */
export const TheGuidelines = meta.story({
  beforeEach: ({ msw }) => void msw.use(...on(ready)),
  play: async ({ canvas, userEvent }) => {
    const acme = await card("Acme");
    await userEvent.click(acme.getByRole("button", { name: /Use another guideline/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /acme-brand-book-2019.pdf/ }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: `${AT}/book`, body: { brand: "b_acme", idx: 2 } }));
    await gone("menu");
    await userEvent.click(canvas.getByRole("button", { name: "Read it again" }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: `${AT}/reread`, body: null }));
  },
});

/** A version of the logo given another file of the brand's, the choices read when the list opens. */
export const LogoFiles = meta.story({
  beforeEach: ({ msw }) => void msw.use(...on(ready)),
  play: async ({ userEvent }) => {
    const acme = await card("Acme");
    await expect(acme.getByText("Cut from the brand book, page 7")).toBeInTheDocument();
    await userEvent.click(acme.getByRole("combobox", { name: "File for Mark" }));
    await userEvent.click(await screen.findByRole("option", { name: "acme-mark.png" }));
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ edits: [{ type: "logo", brand: "b_acme", key: "logo.mark", context: null, idx: 5 }] }));
    await gone("listbox");
  },
});

/** A collection's files on demand, each one left out or in; a whole collection, and what the plan left out. */
export const Collections = meta.story({
  beforeEach: ({ msw }) => void msw.use(...on(ready)),
  play: async ({ canvas, userEvent }) => {
    const toggle = await canvas.findByRole("button", { name: /186 files/ });
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(await canvas.findByRole("checkbox", { name: "Include team-offsite.jpg" })).toBeChecked();
    await expect(canvas.getByText("The first 3 of 186 shown.")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("checkbox", { name: "Include team-offsite.jpg" }));
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ edits: [{ type: "files", idxs: [11], include: false }] }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "Include Kids artwork" }));
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ edits: [{ type: "collection", id: "c_kids", include: true }] }));
    await userEvent.click(canvas.getByRole("checkbox", { name: /Also import the 6 files left out of the plan/ }));
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ edits: [{ type: "leftovers", include: true }] }));
  },
});

/** Apply starts it in the background, as you: the page follows it. */
export const Apply = meta.story({
  beforeEach: ({ msw }) => void msw.use(...on(ready)),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: /Apply the plan/ }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: `${AT}/apply`, body: null }));
    await expect(await canvas.findByText("Applying the plan")).toBeInTheDocument();
    await expect(canvas.getByRole("progressbar", { name: "Applied" })).toBeInTheDocument();
  },
});

/** Discard asks first: the plan and the archive go, the library is untouched. */
export const Discard = meta.story({
  beforeEach: ({ msw }) => void msw.use(...on(ready)),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Discard" }));
    const ask = await screen.findByRole("alertdialog", { name: "Discard this import?" });
    await userEvent.click(within(ask).getByRole("button", { name: "Cancel" }));
    await gone("alertdialog");
    await expect(sent.last("DELETE")).toBeUndefined();
    await userEvent.click(canvas.getByRole("button", { name: "Discard" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(sent.last("DELETE")).toEqual({ path: AT, body: null }));
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/brands"));
  },
});

/** A plan that makes more brands than the plan has room for: what to do about it. */
export const NoRoom = meta.story({
  beforeEach: ({ msw }) => void msw.use(...on(importView("ready", { plan: { ...plan, room: { needed: 1, left: 0 } } }))),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/your plan has room for no more/)).toBeInTheDocument();
  },
});

/** A Contributor's plan: prepared here, applied by an Editor. */
export const WaitingForAnEditor = meta.story({
  beforeEach: ({ msw }) => void msw.use(...on(importView("ready", { waiting: true, can: { ...ready.can, apply: false } }))),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Waiting for an Editor to apply it")).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: /Apply the plan/ })).not.toBeInTheDocument();
  },
});

/** Someone who may see the import, not its plan. */
export const PlanNotOpen = meta.story({
  beforeEach: ({ msw }) => void msw.use(...on(importView("ready", { plan: null, can: { apply: false, undo: false, discard: false, edit: false, open: false } }))),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("A plan waits for review")).toBeInTheDocument();
  },
});

/** Being applied: the stage, and how many files are in. */
export const Applying = meta.story({ beforeEach: ({ msw }) => void msw.use(...on(importView("applying", { label: "Adding files", progress: { done: 120, total: 252 }, can: { ...ready.can, discard: false } }))) });

/** Applied: what it made and the way to each brand, what is tagged later, what failed, and Undo, asked first. */
export const Applied = meta.story({
  beforeEach: ({ msw }) => void msw.use(...on(
    importView("applied", {
      applied,
      appliedAt: "2026-10-14T18:00:00Z",
      appliedBy: { id: "usr_ada", name: "Ada Lovelace" },
      undoUntil: "2026-11-13T18:00:00Z",
      can: { apply: true, undo: true, discard: false, edit: false, open: true },
    }),
  )),
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText("Your brand is in")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: /Acme Kids/ })).toHaveAttribute("href", "/brands/acme-kids");
    await expect(canvas.getByRole("link", { name: /Acme \(updated\)/ })).toHaveAttribute("href", "/brands/acme");
    await expect(canvas.getByText(/Intelligence is tagging 200 files in the background/)).toBeInTheDocument();
    await userEvent.click(canvas.getByText("1 file couldn't be added"));
    await userEvent.click(canvas.getByRole("button", { name: "Try them again" }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: `${AT}/apply`, body: null }));
  },
});

/** Undo asks first, then runs in the background. */
export const Undo = meta.story({
  beforeEach: ({ msw }) => void msw.use(...on(importView("applied", { applied, appliedAt: "2026-10-14T18:00:00Z", undoUntil: "2026-11-13T18:00:00Z", can: { apply: false, undo: true, discard: false, edit: false, open: true } }))),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: /Undo import/ }));
    const ask = await screen.findByRole("alertdialog", { name: "Undo this import?" });
    await userEvent.click(within(ask).getByRole("button", { name: "Undo import" }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: `${AT}/undo`, body: null }));
    await gone("alertdialog");
    await expect(await canvas.findByText("Undoing the import")).toBeInTheDocument();
  },
});

/** Applied more than 30 days ago: no Undo any more. */
export const AppliedLongAgo = meta.story({
  beforeEach: ({ msw }) => void msw.use(...on(importView("applied", { applied: { ...applied, failed: [], warnings: [], tagging: null }, appliedAt: "2026-08-01T09:00:00Z", undoPast: true, can: { ...ready.can, undo: false, discard: false } }))),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("It was applied more than 30 days ago: it can no longer be undone.")).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: /Undo import/ })).not.toBeInTheDocument();
  },
});

/** Undone: what it added is gone, and what an undo kept, with why. */
export const Undone = meta.story({
  beforeEach: ({ msw }) => void msw.use(...on(
    importView("undone", {
      applied: { ...applied, undo: { at: "2026-10-15T09:00:00Z", removed: 240, kept: [{ what: "Acme logo", why: "edited since the import" }] } },
      can: { ...ready.can, discard: false, apply: false },
    }),
  )),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("This import was undone")).toBeInTheDocument();
    await expect(canvas.getByText("2 things left as it was")).toBeInTheDocument();
  },
});

/** The archive couldn't be read: the reason, and nothing to carry on. */
export const CouldNotBeRead = meta.story({
  beforeEach: ({ msw }) => void msw.use(...on(importView("failed", { error: "The archive is damaged", can: { ...ready.can, discard: true } }))),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("The archive is damaged")).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Carry on applying" })).not.toBeInTheDocument();
  },
});

/** Stopped while being applied: Carry on picks it up where it stopped. */
export const StoppedApplying = meta.story({
  beforeEach: ({ msw }) => void msw.use(...on(importView("failed", { error: "The library stopped answering", applied: { ...applied, tagging: null } }))),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Carry on applying" }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: `${AT}/apply`, body: null }));
  },
});

/** Stopped while being undone: carrying on is the undo's. */
export const StoppedUndoing = meta.story({
  beforeEach: ({ msw }) => void msw.use(...on(importView("failed", { error: "The library stopped answering", applied: { ...applied, undoing: true } }))),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Carry on undoing" }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: `${AT}/undo`, body: null }));
  },
});

/** Expired: nobody applied it in time. */
export const Expired = meta.story({ beforeEach: ({ msw }) => void msw.use(...on(importView("expired", { can: { ...ready.can, discard: false } }))) });

export const Phone = meta.story({ beforeEach: ({ msw }) => void msw.use(...on(ready)), globals: { viewport: { value: "phone" } } });

export const Dark = meta.story({ beforeEach: ({ msw }) => void msw.use(...on(ready)), globals: { theme: "dark" } });
