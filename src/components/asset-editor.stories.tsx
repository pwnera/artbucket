import preview from "#.storybook/preview";
import { delay, http, HttpResponse } from "msw";
import { useState } from "react";
import { expect, fireEvent, fn, screen, userEvent, waitFor, within } from "storybook/test";
import { freezeNow } from "#.storybook/fixtures/brands";
import { as, assets, asset as make, byId, collections, fields, inApp, library, NOW, versions } from "#.storybook/fixtures/library";
import { fontUrl } from "#.storybook/fixtures/patterns";
import { AssetEditor, AssetEditorSkeleton } from "@/components/asset-editor";
import { AssetViewer } from "@/components/asset-viewer";
import type { Asset } from "@/components/gallery";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { rightsReasons } from "@/lib/rights";

/** Every PATCH a story's editor sent, oldest first: cleared before each story. */
const sent: Record<string, unknown>[] = [];
/** The assets as the server holds them for this story: each PATCH lands here, so the next answer has it. */
let store = new Map<string, Asset>();

const TEXT = ["title", "description", "creator", "copyright"];

/** PATCH /api/v1/assets/{id}: kept, then answered with the asset as it now is (text goes into its metadata). */
const patch = http.patch("/api/v1/assets/:id", async ({ params, request }) => {
  const body = (await request.json()) as Record<string, unknown>;
  sent.push(body);
  await delay(100);
  const was = store.get(String(params.id)) ?? byId(String(params.id));
  const metadata = { ...was.metadata, ...Object.fromEntries(Object.entries(body).filter(([k]) => TEXT.includes(k))) };
  const rest = Object.fromEntries(Object.entries(body).filter(([k]) => !TEXT.includes(k) && k !== "fields"));
  const now = { ...was, ...rest, metadata, fields: { ...was.fields, ...(body.fields as object) }, updatedAt: new Date(NOW).toISOString() } as Asset;
  if (now.status !== was.status) now.state = now.status as Asset["state"];
  store.set(now.id, now);
  return HttpResponse.json({ data: now });
});

/** The last PATCH, once it has gone. */
const lastSent = () => waitFor(() => (sent.length ? sent.at(-1)! : Promise.reject(new Error("Nothing sent yet"))));

/** An approved asset with suggestions waiting on it: two tags and a value an agent read off it. */
const suggested = make({
  id: "ast_suggested",
  filename: "lisbon-tram.jpg",
  metadata: { title: "Lisbon tram at dusk" },
  tags: ["city"],
  proposedTags: ["tram", "dusk"],
  proposedFields: { region: "EMEA" },
});

/** Turned down, with the reason the agent reads. */
const rejected = { ...byId("ast_ai"), status: "rejected", state: "rejected", reviewNote: "Off brand: the light is too cold for autumn" } as Asset;

/** A tagging agent at work on it right now. */
const working = make({ id: "ast_working", filename: "store-front.jpg", working: { label: "suggesting tags", by: "Tagger", until: "2026-10-15T10:05:00Z" } });

/** Rights with somewhere it may run, and Content Credentials read from the file. */
const licensed = {
  ...byId("ast_expiring"),
  metadata: { title: "Runner on the river path", creator: "Northwind Stock", copyright: "Northwind Stock GmbH", camera: "Canon EOS R5", capturedAt: "2026-04-12T07:40:00Z" },
  origin: "licensed",
  generator: "Canon EOS R5",
  c2pa: { signedBy: "Northwind Stock", generator: null, softwareAgent: "Adobe Lightroom", actions: ["c2pa.edited", "c2pa.cropped"] },
} as Asset;

const all = [...assets, suggested, rejected, working, licensed];

/**
 * The editor as the library opens it (AssetViewer around AssetEditor), on `asset` among the library's: its preview,
 * and its properties edited in place. A save goes out when a property is left, only that property, and lands here as
 * the asset's next state, so an approval, a rejection or a typed title shows as the app would show it.
 */
function Library({ asset, fields, collections, onClose, onSaved, onReviewed }: React.ComponentProps<typeof AssetEditor>) {
  const [items, setItems] = useState(() => (all.some((a) => a.id === asset.id) ? all.map((a) => (a.id === asset.id ? asset : a)) : [asset, ...all]));
  const [open, setOpen] = useState<string | null>(asset.id);
  const shown = items.find((a) => a.id === open) ?? versions.find((v) => v.id === open) ?? null;
  return (
    <AssetViewer
      asset={shown}
      loading={false}
      assets={items}
      hasMore={false}
      onLoadMore={async () => {}}
      onStep={setOpen}
      fields={fields}
      collections={collections}
      onClose={() => {
        onClose();
        setOpen(null);
      }}
      onSaved={onSaved}
      onReviewed={(a) => {
        onReviewed(a);
        setItems((xs) => xs.map((x) => (x.id === a.id ? a : x)));
      }}
      onOpen={setOpen}
    />
  );
}

/** Open a fold of the panel (Rights, Provenance, Versions) and look inside it. */
const openFold = async (title: string) => {
  const dialog = await screen.findByRole("dialog");
  const summary = within(dialog).getByText(title, { selector: "summary, summary *" });
  const details = summary.closest("details")!;
  if (!details.open) await userEvent.click(summary);
  return within(details);
};

const meta = preview.meta({
  title: "App/Features/Library/Asset editor",
  component: AssetEditor,
  decorators: [as],
  parameters: { layout: "fullscreen" },
  args: { asset: byId("ast_hero"), fields, collections, onSaved: fn(), onReviewed: fn(), onClose: fn(), onOpen: fn() },
  argTypes: { asset: { control: "select", options: all.map((a) => a.id), mapping: Object.fromEntries(all.map((a) => [a.id, a])) } },
  beforeEach: ({ msw }) => {
    sent.splice(0);
    store = new Map();
    // Folds and the one-time hint remember themselves per viewer: each story starts from none of it.
    for (const k of Object.keys(localStorage)) if (k.startsWith("artbucket:")) localStorage.removeItem(k);
    msw.use(patch, ...library(all));
    // "Edited 3 days ago", a date that has passed: said of 15 October 2026, the fixtures' today.
    return freezeNow();
  },
  render: (args) => <Library key={args.asset.id} {...args} />,
});

/**
 * An approved photo, editable: the title is the heading, edited in place, and each property saves as it is left.
 * Enter in the title ends it; the PATCH carries the title alone.
 */
export const Playground = meta.story({
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    const title = within(dialog).getByRole("textbox", { name: "Title" });
    await expect(title).toHaveValue("Autumn campaign hero");
    await userEvent.clear(title);
    await userEvent.type(title, "Autumn hero, Lisbon{Enter}");
    await expect(await lastSent()).toEqual({ title: "Autumn hero, Lisbon" });
    await expect(await within(dialog).findByText("Saved")).toBeInTheDocument();
  },
});

/** The description saves on its own when left, and only it: a teammate's change to another property stays theirs. */
export const Description = meta.story({
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("textbox", { name: "Description" }));
    await userEvent.keyboard("Shot in Lisbon for the autumn launch.");
    await userEvent.tab();
    await expect(await lastSent()).toEqual({ description: "Shot in Lisbon for the autumn launch." });
  },
});

/** Tags pick from the library's, or add a new one; each change saves the whole list at once. */
export const Tags = meta.story({
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Tags" }));
    await userEvent.keyboard("lisbon");
    await userEvent.click(await screen.findByRole("option", { name: "Add “lisbon”" }));
    await waitFor(() => expect(sent.at(-1)).toEqual({ tags: ["campaign", "autumn", "hero", "outdoor", "lisbon"] }));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove outdoor" }));
    await waitFor(() => expect(sent.at(-1)).toEqual({ tags: ["campaign", "autumn", "hero", "lisbon"] }));
  },
});

/** A custom field (Region, a select) saves as it is picked, under `fields`. */
export const Fields = meta.story({
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Region" }));
    await userEvent.click(await screen.findByRole("option", { name: "APAC" }));
    await expect(await lastSent()).toEqual({ fields: { region: "APAC" } });
  },
});

/** The rights it runs under, folded: where it may run (territories, channels), its dates, and a new expiry. */
export const Rights = meta.story({
  args: { asset: byId("ast_expiring") },
  play: async () => {
    const rights = await openFold("Rights");
    await expect(rights.getByRole("button", { name: "Remove Germany (DE)" })).toBeInTheDocument();
    await expect(rights.getByRole("button", { name: "Remove web" })).toBeInTheDocument();
    const expires = rights.getByLabelText("Expiry");
    await userEvent.clear(expires);
    await userEvent.type(expires, "2027-03-31");
    await userEvent.tab();
    await expect(await lastSent()).toEqual({
      rights: {
        license: "Northwind Stock, editorial and web",
        territories: ["DE", "FR"],
        channels: ["web"],
        embargo: null,
        expires: "2027-03-31",
        modelRelease: "released",
        downloadable: null,
      },
    });
  },
});

/** A last day already past says what saving it does: its public and shared links come down. */
export const RightsExpiredDate = meta.story({
  args: { asset: byId("ast_expiring") },
  play: async () => {
    const rights = await openFold("Rights");
    const expires = rights.getByLabelText("Expiry");
    await userEvent.clear(expires);
    await userEvent.type(expires, "2026-09-30");
    await expect(rights.getByText(/This date has passed/)).toBeInTheDocument();
    await expect(expires).toHaveAccessibleDescription(/This date has passed/);
  },
});

/** Licensed stock: credit, copyright, the camera and Content Credentials read from the file. */
export const Provenance = meta.story({
  args: { asset: licensed },
  play: async () => {
    const provenance = await openFold("Provenance");
    await expect(provenance.getByText("Content Credentials")).toBeInTheDocument();
    await expect(provenance.getByRole("textbox", { name: "Made with" })).toHaveValue("Canon EOS R5");
  },
});

/** Made from: a pick from the library (LibraryPicker), saved as the asset's parent. */
export const MadeFrom = meta.story({
  play: async () => {
    const provenance = await openFold("Provenance");
    await userEvent.click(provenance.getAllByRole("button", { name: "Pick" })[0]);
    const picker = await screen.findByRole("dialog", { name: "What was it made from?" });
    await userEvent.click(await within(picker).findByRole("button", { name: "acme-mark.png" }));
    await expect(await lastSent()).toEqual({ parentAssetId: "ast_mark" });
  },
});

/** Its versions, folded: v1 and v2 before, v3 current; a row opens that version in place. */
export const Versions = meta.story({
  play: async () => {
    const versions = await openFold("Versions");
    await expect(await versions.findByText("v1")).toBeInTheDocument();
    await expect(versions.getByText("Current")).toBeInTheDocument();
    await expect(versions.getByRole("button", { name: "Make current" })).toBeInTheDocument();
  },
});

/** Where it is used (rules, pages, portals, fetches) for whoever reads Insights, and the brand rules that point at it. */
export const UsedIn = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get("/api/v1/brand/rules", () =>
        HttpResponse.json({ data: [{ id: "rul_logo", brand: "acme", key: "logo.primary", label: "Primary logo", context: null }, { id: "rul_logo_dark", brand: "acme", key: "logo.primary", label: "Primary logo", context: "dark-background" }] }),
      ),
    ),
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    await expect(await within(dialog).findByText("1,300 fetches")).toBeInTheDocument();
    await userEvent.click(await within(dialog).findByRole("button", { name: /Used in 2 brand rules/ }));
    await expect(await screen.findAllByRole("link", { name: /Primary logo/ })).toHaveLength(2);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Brand rules that use it" })).not.toBeInTheDocument());
  },
});

/** Renditions: the sizes and formats to hand out, from the preview's footer. */
export const Renditions = meta.story({
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Sizes and formats" }));
    await expect(await screen.findByRole("dialog", { name: "Sizes and formats" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
  },
});

/** Who sees it: made private, it saves at once and the people with access show under it. */
export const Private = meta.story({
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("combobox", { name: /Who sees it/ }));
    await userEvent.click(await screen.findByRole("option", { name: "Only people added" }));
    await expect(await lastSent()).toEqual({ private: true });
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    await expect(within(dialog).getByText(/Nobody else in the project finds it/)).toBeInTheDocument();
  },
});

/** Suggested by an agent: what came with it (its tags, the model and prompt), and Approve or Reject. */
export const Suggested = meta.story({ args: { asset: byId("ast_ai") } });

/** Approve takes the asset and its suggested tags, then moves on to the next asset waiting for review. */
export const Approve = meta.story({
  args: { asset: byId("ast_ai") },
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /^Approve with suggestions/ }));
    await expect(await lastSent()).toEqual({ status: "active", tags: ["autumn", "moodboard"], proposedTags: [] });
    // The toast, with Undo: sonner redraws it as it lands, so asked for until it holds.
    await waitFor(() => expect(screen.getByText("Approved", { selector: "[data-title]" })).toBeVisible());
    // On to the next one waiting: the tram, with suggested tags.
    await expect(await within(dialog).findByRole("textbox", { name: "Title" })).toHaveValue("Lisbon tram at dusk");
  },
});

/** A, from anywhere in the dialog but a field, approves as the button does. */
export const ApproveWithKey = meta.story({
  args: { asset: byId("ast_ai") },
  play: async () => {
    await screen.findByRole("dialog");
    await userEvent.keyboard("a");
    await expect(await lastSent()).toMatchObject({ status: "active" });
  },
});

/** Reject asks why; the reason is kept for the agent that suggested it. */
export const Reject = meta.story({
  args: { asset: byId("ast_ai") },
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /^Reject…/ }));
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Reason for rejecting" }), "Off brand: the light is too cold");
    await userEvent.click(within(dialog).getByRole("button", { name: /^Reject/ }));
    await expect(await lastSent()).toEqual({ status: "rejected", reviewNote: "Off brand: the light is too cold" });
    await expect(await screen.findByText("Rejected. Campaign agent can read why.")).toBeInTheDocument();
  },
});

/** A required field left empty stops the approval, and says which. */
export const ApproveMissingRequired = meta.story({
  args: { asset: byId("ast_ai"), fields: fields.map((d) => (d.key === "campaign_code" ? { ...d, required: true } : d)) },
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /^Approve/ }));
    await expect(await within(dialog).findByText("Fill in Campaign code first.")).toBeInTheDocument();
    await expect(within(dialog).getByRole("textbox", { name: /Campaign code/ })).toHaveFocus();
    await expect(sent).toHaveLength(0);
  },
});

/** Turned down: out of the library, with the reason the agent reads. */
export const Rejected = meta.story({ args: { asset: rejected } });

/** Suggestions on an approved asset, taken or dropped one at a time. */
export const Suggestions = meta.story({
  args: { asset: suggested },
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Accept tag tram" }));
    await expect(await lastSent()).toEqual({ tags: ["city", "tram"], proposedTags: ["dusk"] });
    await userEvent.click(within(dialog).getByRole("button", { name: "Accept Region" }));
    await waitFor(() => expect(sent.at(-1)).toEqual({ fields: { region: "EMEA" }, proposedFields: {} }));
  },
});

/** An agent at work on it: said where its suggestions will land. */
export const AgentWorking = meta.story({
  args: { asset: working },
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    await expect(within(dialog).getByText(/is suggesting tags/)).toBeInTheDocument();
  },
});

/** Replaced: a warning first, and a way to its replacement. */
export const Replaced = meta.story({
  args: { asset: byId("ast_old_logo") },
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "its replacement" }));
    await expect(await within(dialog).findByRole("textbox", { name: "Title" })).toHaveValue("Acme logo, full color");
  },
});

/** A refused save says why on the property, and puts back what the server has. */
export const SaveRefused = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.patch("/api/v1/assets/:id", () =>
        HttpResponse.json({ error: { code: "invalid", message: "Invalid", detail: { properties: { title: { errors: ["Too long for a title"] } } } } }, { status: 422 }),
      ),
    ),
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    const title = within(dialog).getByRole("textbox", { name: "Title" });
    await userEvent.type(title, " and more{Enter}");
    await expect(await within(dialog).findByText("Too long for a title")).toBeInTheDocument();
    const back = within(dialog).getByRole("textbox", { name: "Title" });
    await waitFor(() => expect(back).toHaveValue("Autumn campaign hero"));
    await expect(back).toHaveAccessibleDescription("Too long for a title");
  },
});

/** Offline: what is typed stays, and closing asks before it is lost. */
export const UnsavedOnLeaving = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.patch("/api/v1/assets/:id", () => HttpResponse.error())),
  play: async ({ args }) => {
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("textbox", { name: "Description" }));
    await userEvent.keyboard("Not saved yet");
    await userEvent.tab();
    await expect(await screen.findByText("Couldn't reach the server")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    const ask = await screen.findByRole("alertdialog", { name: "Discard changes?" });
    await userEvent.click(within(ask).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(args.onClose).toHaveBeenCalled();
  },
});

/** ← and → (or K and J) step through the library's assets; the buttons on the preview do the same. */
export const KeyboardSteps = meta.story({
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    await userEvent.keyboard("{ArrowRight}");
    await expect(await within(dialog).findByRole("textbox", { name: "Title" })).toHaveValue("Acme logo, full color");
    await userEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    await waitFor(() => expect(within(dialog).getByRole("textbox", { name: "Title" })).toHaveValue(""));
    await expect(within(dialog).getByRole("textbox", { name: "Title" })).toHaveAttribute("placeholder", "star.svg");
    await userEvent.click(within(dialog).getByRole("button", { name: "Previous" }));
    await userEvent.keyboard("k");
    await expect(await within(dialog).findByRole("textbox", { name: "Title" })).toHaveValue("Autumn campaign hero");
    await expect(within(dialog).queryByRole("button", { name: "Previous" })).not.toBeInTheDocument();
  },
});

/** The header's menu: copy, share, archive, public, delete. */
export const Menu = meta.story({
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "More" }));
    const menu = await screen.findByRole("menu");
    await expect(within(menu).getByRole("menuitem", { name: /Archive/ })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  },
});

/** A viewer: the asset to look at and download, its values as text, nothing to edit. */
export const ReadOnly = meta.story({
  parameters: { app: { scope: "read" } },
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    await expect(within(dialog).queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument();
    await expect(within(dialog).getByText("View only")).toBeInTheDocument();
    await expect(within(dialog).getByText("campaign")).toBeInTheDocument();
  },
});

/** On a phone: the preview above, the panel scrolling under its sticky header, the close in it. */
export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

// ---- each kind of asset -----------------------------------------------------------------

/** An SVG: the vector itself, Copy SVG beside the download, a background to see it on. */
export const Svg = meta.story({
  args: { asset: byId("ast_logo") },
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    await expect(within(dialog).getByRole("button", { name: "Copy SVG" })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("radio", { name: "Black" }));
    await expect(within(dialog).getByRole("radio", { name: "Black" })).toHaveAttribute("aria-checked", "true");
  },
});

/** A one-ink icon: big, then at the sizes it runs at, in the text's color. */
export const Icon = meta.story({ args: { asset: byId("ast_icon_star") } });

/** A clip: the player, its still until it plays. */
export const Video = meta.story({ args: { asset: byId("ast_reel") } });

/** A font: the playground, your words in it. */
export const Font = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(http.get("/a/ast_font", async () => new HttpResponse(await (await fetch(fontUrl)).arrayBuffer(), { headers: { "Content-Type": "font/woff2" } }))),
  args: { asset: byId("ast_font") },
});

/** A PDF: its first page as the picture. */
export const Pdf = meta.story({ args: { asset: byId("ast_guide") } });

/** A Lottie animation, played. */
export const Lottie = meta.story({ args: { asset: byId("ast_loader") } });

/** A Figma link, kept as the link and embedded; a skeleton until Figma paints. */
export const FigmaLink = meta.story({ args: { asset: byId("ast_figma") } });

/** A file with no preview: said, with the way to open it. */
export const NoPreview = meta.story({
  args: { asset: byId("ast_press") },
  play: async () => {
    await expect(await screen.findByText("No preview")).toBeInTheDocument();
  },
});

/** A long file name and title: they wrap, the panel never widens. */
export const LongNames = meta.story({ args: { asset: byId("ast_long") } });

/** Archived: links off, and the way back. */
export const Archived = meta.story({ args: { asset: byId("ast_archived") } });

/** The dialog while the asset a link names is on its way. */
export const Skeleton = meta.story({
  render: () => (
    <Dialog open>
      <DialogContent className="gap-0 p-0 sm:max-w-5xl md:h-[min(760px,calc(100dvh-2rem))] md:grid-cols-[minmax(0,1fr)_380px]">
        <AssetEditorSkeleton />
      </DialogContent>
    </Dialog>
  ),
});

export const Dark = Suggested.extend({ globals: { theme: "dark" } });

/** Rights open, in the dark: the fields, chips and date notes. */
export const DarkRights = Rights.extend({ globals: { theme: "dark" } });

/**
 * As artbucket.io frames it on /ai: an image an agent made, waiting for review, its Provenance open (generated, the
 * model, the prompt). The image model is a made-up one, not ours.
 */
export const ProvenanceOnArtbucket = meta.story({
  args: { asset: { ...byId("ast_ai"), generator: "Example Image Model" } as Asset },
  globals: { fixture: "artbucket" },
  // fireEvent, not userEvent (openFold): framed by artbucket.io, the story's document isn't focused.
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    const fold = within(dialog).getByText("Provenance", { selector: "summary, summary *" }).closest("details")!;
    if (!fold.open) fireEvent.click(fold.querySelector("summary")!);
    const provenance = within(fold);
    await expect(await provenance.findByRole("textbox", { name: "Made with" })).toHaveValue("Example Image Model");
    // The fold at the top of the panel, as someone who opened it would read it: the panel scrolls, not the dialog.
    // What loads above it after (its uses, its access) would push it down, so it is kept there for a few seconds.
    let panel = fold.parentElement;
    while (panel && getComputedStyle(panel).overflowY !== "auto") panel = panel.parentElement;
    if (panel) {
      const box = panel;
      const pin = () => box.scrollTo({ top: box.scrollTop + fold.getBoundingClientRect().top - box.getBoundingClientRect().top - 16 });
      pin();
      const watch = new ResizeObserver(pin);
      for (const c of box.children) watch.observe(c);
      setTimeout(() => watch.disconnect(), 5000);
    }
    await expect(dialog).not.toHaveTextContent(/acme/i);
  },
});

/** A fold at the top of the asset's panel, as someone who opened it reads it: the panel scrolls, never the page framing it. */
const foldToTop = (title: string) => {
  const fold = within(screen.getByRole("dialog")).getByText(title, { selector: "summary, summary *" }).closest("details")!;
  let panel = fold.parentElement;
  while (panel && getComputedStyle(panel).overflowY !== "auto") panel = panel.parentElement;
  panel?.scrollTo({ top: fold.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop - 16 });
};

/** POST /api/v1/check, answered by the core's own rules (lib/rights.ts) on the asset's rights, on the fixtures' today. */
const check = http.post("/api/v1/check", async ({ request }) => {
  const use = (await request.json()) as { asset: string; channel?: string; territory?: string; date?: string };
  const reasons = rightsReasons(all.find((a) => a.id === use.asset)?.rights ?? null, { ...use, date: use.date ?? "2026-10-16" });
  return HttpResponse.json({ allowed: !reasons.some((r) => r.blocking), reasons, suggest: [] });
});

/** In the app, as artbucket.io's solution pages frame it: a licensed photo opened from Assets, its Rights open. */
export const RightsInTheApp = meta.story({
  args: { asset: licensed },
  decorators: [inApp],
  parameters: { nextjs: { navigation: { pathname: "/assets" } } },
  play: async () => {
    const rights = await openFold("Rights");
    await expect(rights.getByRole("button", { name: "Remove Germany (DE)" })).toBeInTheDocument();
    foldToTop("Rights");
    (document.activeElement as HTMLElement | null)?.blur();
  },
});

/**
 * In the app: Can I use this? asked for social in the United States, refused by the core's own rules, each reason said.
 * The use is set as a change, not typed: a framed story's document isn't focused, so typed keys never reach it.
 */
export const CheckInTheApp = meta.story({
  args: { asset: licensed },
  decorators: [inApp],
  parameters: { nextjs: { navigation: { pathname: "/assets" } } },
  beforeEach: ({ msw }) => void msw.use(check),
  play: async () => {
    const fold = await openFold("Can I use this?");
    await fireEvent.change(fold.getByLabelText("Where"), { target: { value: "social" } });
    await fireEvent.change(fold.getByLabelText("Territory"), { target: { value: "US" } });
    await userEvent.click(fold.getByRole("button", { name: "Check" }));
    await expect(await fold.findByText("Not for this use")).toBeInTheDocument();
    await expect(fold.getByText("Not licensed in US: DE, FR only")).toBeInTheDocument();
    foldToTop("Can I use this?");
    (document.activeElement as HTMLElement | null)?.blur();
  },
});
