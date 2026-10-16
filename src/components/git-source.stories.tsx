import preview from "#.storybook/preview";
import { fixture, swapApi } from "#.storybook/fixtures/artbucket";
import { acme, assetFiles, freezeNow, me, release, rules, source, status, withMe } from "#.storybook/fixtures/brands";
import { inApp } from "#.storybook/fixtures/library";
import { useSelectedLayoutSegments } from "@storybook/nextjs-vite/navigation.mock";
import { http, HttpResponse } from "msw";
import { expect, fireEvent, mocked, screen, spyOn, waitFor } from "storybook/test";
import { BrandPageHeader } from "@/components/brand-header";
import { BrandOverview } from "@/components/brand-overview";
import { GitSource } from "@/components/git-source";

const inStep = { ...source, source: { ...source.source!, pending: false } };

const meta = preview.meta({
  title: "App/Features/Brands/Git source",
  component: GitSource,
  args: { source: inStep, slug: "acme", editor: true, compact: false },
  parameters: { layout: "centered" },
});

/** Kept in a repository and in step: the repository's name, a popover of where and at which commit. */
export const Playground = meta.story({
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: "acme/brand" });
    await expect(trigger).toHaveAttribute("title", "In step with github.com/acme/brand");
    await userEvent.click(trigger);
    await expect(await screen.findByText("Kept in a repository")).toBeInTheDocument();
    await expect(screen.getByText("main, in brand/, at 4f9c2a1")).toBeInTheDocument();
    await expect(screen.getByText("Synced both ways.")).toBeInTheDocument();
    await expect(screen.getByRole("link", { name: "Manage the connection" })).toHaveAttribute("href", source.connect);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("Kept in a repository")).not.toBeInTheDocument());
  },
});

/** Edits made here wait to reach the repository: a dot on the button, and the popover says they go next. */
export const Pending = meta.story({
  args: { source },
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: /brand \(changes to sync\)/ });
    await expect(trigger).toHaveAttribute("title", "Changes here not yet in github.com/acme/brand");
    await userEvent.click(trigger);
    await expect(await screen.findByText("Edits made here go next, as a commit or a pull request.")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("Kept in a repository")).not.toBeInTheDocument());
  },
});

/** Not connected, on a server with a Git integration: Connect Git leaves for it. */
export const NotConnected = meta.story({
  args: { source: { source: null, connect: source.connect } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Connect Git" })).toHaveAttribute("href", source.connect);
  },
});

/** Not connected, no Git integration, for an editor: how to keep it in Git with the CLI. */
export const WithTheCli = meta.story({
  args: { source: { source: null, connect: null } },
  beforeEach: () => {
    const clip = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    return () => clip.mockRestore();
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Git" }));
    await userEvent.click(await screen.findByRole("button", { name: "Copy the command" }));
    await expect(navigator.clipboard.writeText).toHaveBeenCalledWith("artbucket brand pull brand --brand acme --assets");
    // The trigger again: Escape would first close the copy button's tooltip.
    await userEvent.click(canvas.getByRole("button", { name: "Git" }));
    await waitFor(() => expect(screen.queryByText("Keep this brand in Git")).not.toBeInTheDocument());
  },
});

/** A viewer, with nothing connected: nothing to show. */
export const ViewerNotConnected = meta.story({
  args: { source: { source: null, connect: null }, editor: false },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("button, a")).toBeNull();
  },
});

/** In the compact header: the icon alone, its words for screen readers. */
export const Compact = meta.story({
  args: { source, compact: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /brand/ })).toBeInTheDocument();
  },
});

/** Still reading the source: nothing yet. */
export const Loading = meta.story({ args: { source: null } });

/**
 * As artbucket.io frames it on /brand-as-code (`globals=fixture:artbucket;sidebar:open`): a brand's page in the app,
 * kept in a repository, with an edit made here on its way back. Its header's Git button, opened.
 */
export const OnArtbucket = meta.story({
  decorators: [withMe(me), inApp],
  globals: { fixture: "artbucket", sidebar: "open" },
  parameters: { layout: "fullscreen" },
  beforeEach: (ctx) => {
    mocked(useSelectedLayoutSegments).mockReturnValue([]);
    ctx.msw.use(assetFiles, http.get("/api/v1/brands/:slug/source", () => HttpResponse.json({ data: source })));
    const unswap = swapApi(ctx);
    const unfreeze = freezeNow();
    return () => {
      unswap?.();
      unfreeze?.();
    };
  },
  render: (_, { globals }) => {
    const head = fixture(globals, { brand: acme, origin: "https://app.artbucket.test", rules, status, release });
    const card = fixture(globals, { brand: { name: "Acme", rules, signed: null, terms: null }, live: 12 });
    return (
      <>
        <BrandPageHeader {...head} importing={false} />
        <BrandOverview
          {...head}
          changes={["1 new rule", "1 rule changed"]}
          signals={{ days: 30, pulls: 1284, views: 5310, adoption: { release: { number: 12 }, share: 72 } }}
          card={card}
          comments={2}
          links={fixture(globals, { release: "/brands/acme/releases/new", review: "/brands/acme/guidelines?comments=1" })}
        />
      </>
    );
  },
  // fireEvent, not userEvent: framed by artbucket.io, the story's document isn't focused, and userEvent's pointer
  // never lands there.
  // On a phone's width the header has no Git button, and the page is shown as it is.
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("heading", { level: 1, name: "Artbucket" })).toBeInTheDocument();
    await expect(canvas.getByRole("main")).not.toHaveTextContent(/acme/i);
    const git = await canvas.findByRole("button", { name: /artbucket\/brand \(changes to sync\)/ }).catch(() => null);
    if (!git) return;
    fireEvent.click(git);
    await expect(await screen.findByText("Edits made here go next, as a commit or a pull request.")).toBeInTheDocument();
    // No focus ring left on what the popover moved focus to; it stays open.
    (document.activeElement as HTMLElement | null)?.blur();
  },
});
