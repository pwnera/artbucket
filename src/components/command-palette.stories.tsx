import preview from "#.storybook/preview";
import { brands, me, NOW, rules, viewer, withMe } from "#.storybook/fixtures/brands";
import { assets, collections, inApp, renditions } from "#.storybook/fixtures/library";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { delay, http, HttpResponse } from "msw";
import { useState } from "react";
import { expect, fn, screen, waitFor } from "storybook/test";
import { IconPlus } from "@/components/icons";
import { CommandPalette } from "@/components/command-palette";
import { SidebarProvider } from "@/components/ui/sidebar";

const RECENTS = "artbucket:recents:prj_acme";
const recents = [
  { kind: "brand", id: "brd_acme", label: "Acme", href: "/brands/acme", at: NOW.getTime() - 60_000 },
  { kind: "collection", id: "col_campaign", label: "Autumn campaign", href: "/?collection=col_campaign", at: NOW.getTime() - 120_000 },
];
const pages = [
  { slug: "logo", title: "Logo", hidden: false, parent: null },
  { slug: "colors", title: "Colors", hidden: false, parent: null },
  { slug: "drafts", title: "Draft voice notes", hidden: true, parent: null },
];

/** What ⌘K reads: assets as the library's search finds them, each brand's rules and guideline pages. */
const api = [
  ...renditions,
  http.get("/api/v1/assets", ({ request }) => {
    const q = new URL(request.url).searchParams.get("q")?.toLowerCase() ?? "";
    return HttpResponse.json({ data: assets.filter((a) => `${a.filename} ${a.metadata?.title ?? ""}`.toLowerCase().includes(q)).slice(0, 8) });
  }),
  http.get("/api/v1/brand/rules", ({ request }) => HttpResponse.json({ data: new URL(request.url).searchParams.get("brand") === "acme" ? rules : [] })),
  http.get("/api/v1/brands/:slug/pages", ({ params }) => HttpResponse.json({ data: params.slug === "acme" ? pages : [] })),
];

/** Open as a story starts, closed by Escape or a choice, as the shell holds it. */
function Palette(props: React.ComponentProps<typeof CommandPalette>) {
  const [open, setOpen] = useState(props.open);
  return (
    <CommandPalette
      {...props}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        props.onOpenChange(o);
      }}
    />
  );
}

/** Closed before axe runs: open, the page behind is hidden, and its skip link is still focusable there. */
const close = async (userEvent: { keyboard: (k: string) => Promise<void> }) => {
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
};

/**
 * ⌘K: find anything (assets, brand pages and rules, collections, saved searches, brands, settings), go anywhere, or
 * do the common things. Empty, it opens on what you had lately; everything else waits for a query.
 */
const meta = preview.meta({
  title: "App/Features/Shell/Command palette",
  component: CommandPalette,
  args: {
    open: true,
    onOpenChange: fn(),
    collections,
    brands,
    searches: [{ id: "srch_logos", name: "Approved logos", query: "tags=logo" }],
    onUpload: fn(),
    onNewCollection: fn(),
    onShortcuts: fn(),
  },
  parameters: { nextjs: { navigation: { pathname: "/brands/acme" } } },
  decorators: [
    withMe(me),
    // It closes the phone's sheet as it opens, so it reads the sidebar's state.
    (Story) => (
      <SidebarProvider className="min-h-0">
        <Story />
      </SidebarProvider>
    ),
  ],
  render: (args) => <Palette {...args} />,
  beforeEach: ({ msw }) => {
    msw.use(...api);
    const kept = localStorage.getItem(RECENTS);
    localStorage.setItem(RECENTS, JSON.stringify(recents));
    return () => (kept === null ? localStorage.removeItem(RECENTS) : localStorage.setItem(RECENTS, kept));
  },
});

/** Nothing typed: what you had lately, then the actions, help and places. */
export const Playground = meta.story({
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog", { name: "Jump to" });
    await expect(dialog).toBeInTheDocument();
    await expect(screen.getByRole("option", { name: "Autumn campaign" })).toBeInTheDocument();
    await expect(screen.getByRole("option", { name: "New brand" })).toBeInTheDocument();
    await expect(screen.queryByRole("option", { name: /Explore for/ })).not.toBeInTheDocument();
    await close(userEvent);
  },
});

/** Typing finds assets as the library's search does, settled for a beat; when nothing else matched, Enter opens the best one. */
export const FindAnAsset = meta.story({
  play: async ({ userEvent }) => {
    await userEvent.type(await screen.findByRole("combobox"), "hero");
    const hero = await screen.findByRole("option", { name: /Autumn campaign hero/ });
    await waitFor(() => expect(hero).toHaveAttribute("aria-selected", "true"));
    await userEvent.keyboard("{Enter}");
    await expect(getRouter().push).toHaveBeenCalledWith("/?asset=ast_hero");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** Arrow keys move through what matched; the library's own search is always last. */
export const ArrowsAndEnter = meta.story({
  play: async ({ userEvent }) => {
    await userEvent.type(await screen.findByRole("combobox"), "audit log");
    const audit = await screen.findByRole("option", { name: "Audit log" });
    const all = screen.getByRole("option", { name: "Explore for “audit log”" });
    // The list loops: up from the first is the last, the library's search.
    await userEvent.keyboard("{Home}{ArrowUp}");
    await expect(all).toHaveAttribute("aria-selected", "true");
    // Down from the last is the first again: what matched best.
    await userEvent.keyboard("{ArrowDown}");
    await expect(all).toHaveAttribute("aria-selected", "false");
    await expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    await expect(audit).toBeInTheDocument();
    await userEvent.keyboard("{ArrowUp}{Enter}");
    await expect(getRouter().push).toHaveBeenCalledWith("/?q=audit%20log");
  },
});

/** A brand's rules and guideline pages, each opening where it lives. Hidden pages only for editors. */
export const RulesAndPages = meta.story({
  play: async ({ userEvent }) => {
    await userEvent.type(await screen.findByRole("combobox"), "logo");
    await expect(await screen.findByRole("group", { name: "Brand pages" })).toBeInTheDocument();
    await expect(await screen.findByRole("group", { name: "Brand rules" })).toBeInTheDocument();
    await userEvent.clear(screen.getByRole("combobox"));
    await userEvent.type(screen.getByRole("combobox"), "voice notes");
    await expect(await screen.findByRole("option", { name: /Draft voice notes/ })).toBeInTheDocument();
    await close(userEvent);
  },
});

/** While assets load: a spinner in place of the glass, and rows of placeholders. */
export const Loading = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get("/api/v1/assets", async () => {
        await delay("infinite");
        return HttpResponse.json({ data: [] });
      }),
    ),
  play: async ({ userEvent }) => {
    await userEvent.type(await screen.findByRole("combobox"), "hero");
    await expect(await screen.findByRole("progressbar", { name: "Searching assets" })).toBeInTheDocument();
    await close(userEvent);
  },
});

/** Nothing matches: only the library's full search, which is the empty state too. */
export const NothingFound = meta.story({
  play: async ({ userEvent }) => {
    await userEvent.type(await screen.findByRole("combobox"), "qwxz");
    const all = await screen.findByRole("option", { name: "Explore for “qwxz”" });
    await waitFor(() => expect(screen.getAllByRole("option")).toEqual([all]));
    await close(userEvent);
  },
});

/** Actions run here: Upload files is the page's own, handed in by the shell. */
export const RunAnAction = meta.story({
  play: async ({ args, userEvent }) => {
    await userEvent.type(await screen.findByRole("combobox"), "upload");
    await userEvent.click(await screen.findByRole("option", { name: "Upload files" }));
    await expect(args.onUpload).toHaveBeenCalledOnce();
  },
});

/** The page's own commands come first; with nothing typed, only those marked top. */
export const PageCommands = meta.story({
  args: {
    commands: () => [
      { id: "add-rule", label: "Add a rule", group: "This brand", icon: <IconPlus />, shortcut: ["mod", "Enter"], top: true, run: fn() },
      { id: "add-page", label: "Add a guideline page", group: "This brand", run: fn() },
    ],
  },
  play: async ({ userEvent }) => {
    await expect(await screen.findByRole("option", { name: /Add a rule/ })).toBeInTheDocument();
    await expect(screen.queryByRole("option", { name: "Add a guideline page" })).not.toBeInTheDocument();
    await close(userEvent);
  },
});

/** A viewer: places and finding, never New brand, New site or Invite people. */
export const Viewer = meta.story({
  decorators: [withMe(viewer)],
  args: { onNewCollection: undefined, onUpload: undefined },
  play: async ({ userEvent }) => {
    await screen.findByRole("dialog");
    await expect(screen.queryByRole("option", { name: "New brand" })).not.toBeInTheDocument();
    await expect(screen.queryByRole("option", { name: "Invite people" })).not.toBeInTheDocument();
    await expect(screen.getByRole("option", { name: /^Explore/ })).toBeInTheDocument();
    await close(userEvent);
  },
});

/** Long names truncate on one line. */
export const LongNames = meta.story({
  args: { collections: [{ ...collections[0], name: "Acme International Holdings Partner Programme for Resellers, autumn edition" }] },
  play: async ({ userEvent }) => {
    await userEvent.type(await screen.findByRole("combobox"), "programme");
    await expect((await screen.findAllByRole("option", { name: /Acme International Holdings/ }))[0]).toBeInTheDocument();
    await close(userEvent);
  },
});

/** On a phone it fills the width, without the keys' legend. */
export const Phone = meta.story({
  globals: { viewport: { value: "phone" } },
  play: async ({ userEvent }) => {
    await screen.findByRole("dialog");
    await close(userEvent);
  },
});

/** From anywhere in the app, ⌘K (Ctrl+K) opens it over the page; the shell holds it. */
export const FromTheShell = meta.story({
  decorators: [inApp],
  parameters: { layout: "fullscreen" },
  render: () => <div className="p-6">Acme&apos;s Overview</div>,
  play: async ({ userEvent }) => {
    await userEvent.keyboard("{Meta>}k{/Meta}");
    await expect(await screen.findByRole("dialog", { name: "Jump to" })).toBeInTheDocument();
    await close(userEvent);
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.type(await screen.findByRole("combobox"), "templates");
    await waitFor(() => expect(screen.getByRole("option", { name: "Templates" })).toHaveAttribute("aria-selected", "true"));
    await userEvent.keyboard("{Enter}");
    await expect(getRouter().push).toHaveBeenCalledWith("/templates");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});
