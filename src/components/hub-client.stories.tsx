import preview from "#.storybook/preview";
import { assetFiles, freezeNow, recorder } from "#.storybook/fixtures/brands";
import { hubCards } from "#.storybook/fixtures/catalog";
import { failing } from "#.storybook/mocks";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { delay } from "msw";
import { expect, screen, waitFor, within } from "storybook/test";
import { Avatar, Owner, Preview, Pulls } from "@/components/hub";
import { HubSearch, HubToggle, ListingTrust, LogoWell, StartFrom, UseBrand, WhilePending } from "@/components/hub-client";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";

const HUB = "https://hub.artbucket.test/acme/acme";
const API = "/api/v1/hub/acme/acme";
const sent = recorder();

/** A listing's header as app/hub/[org]/[brand]/page.tsx draws it: who and what, then star, start from, and use. */
function ListingHeader({ claim }: { claim: React.ComponentProps<typeof ListingTrust>["claim"] }) {
  const b = hubCards[0];
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 items-center gap-2 text-xl">
          <Avatar name={b.owner} logo={b.logo} tint={b.tint} palette={b.palette} className="size-7 rounded-md text-3xl" />
          <span className="text-primary-ink">{b.org}</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-primary-ink font-semibold">{b.brand}</span>
        </div>
        <Owner verified={b.verified} />
        <div className="ms-auto flex flex-wrap items-center gap-1">
          <HubToggle kind="star" api={`${API}/star`} on={false} count={41} compact />
          <StartFrom from="acme/acme@12" name={b.name} app="https://app.artbucket.test" />
          <UseBrand url={HUB} name={b.name} />
        </div>
      </div>
      <Preview card={b} className="h-56 rounded-xl border" />
      <div className="flex items-center gap-4 text-sm">
        <Pulls n={b.pulls} />
        <ListingTrust org="acme" brand="acme" name={b.name} claim={claim} />
      </div>
    </div>
  );
}

/**
 * A listing's page on BrandHub: use the brand (the addresses an agent or a build reads), star it, start a brand of
 * one's own from it, report it, or claim it as its owner.
 */
const meta = preview.meta({
  title: "App/Features/Hub/Listing",
  component: ListingHeader,
  args: { claim: true as const },
  parameters: { nextjs: { navigation: { pathname: "/acme/acme" } } },
  beforeEach: ({ msw }) => {
    sent.reset();
    msw.use(assetFiles, sent.on("put", `${API}/star`, { starred: true }), sent.on("delete", `${API}/star`, { starred: false }), sent.on("post", `${API}/reports`), sent.on("post", `${API}/claims`, { proof: "acme.test" }));
    return freezeNow();
  },
});

/** Use this brand: its llms.txt for agents, its brand.json, or its tokens in the format a build wants, one to copy at a time. */
export const Playground = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Use this brand" }));
    const pop = within(await screen.findByRole("dialog"));
    await expect(pop.getByText(`${HUB}/llms.txt`)).toBeInTheDocument();
    await userEvent.click(pop.getByRole("tab", { name: "JSON" }));
    await expect(pop.getByText(`${HUB}/brand.json`)).toBeInTheDocument();
    await userEvent.click(pop.getByRole("tab", { name: "Tokens" }));
    await userEvent.click(pop.getByRole("radio", { name: "Tailwind 4" }));
    await expect(pop.getByText(`${HUB}/tokens?format=tailwind`)).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** Star it: pressed at once with the count, then saved; the page refreshes for the true count. */
export const Star = meta.story({
  play: async ({ canvas, userEvent }) => {
    const star = canvas.getByRole("button", { name: "Star, 41" });
    await expect(star).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(star);
    await expect(canvas.getByRole("button", { name: "Star, 42" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(sent.last("PUT")).toEqual({ path: `${API}/star`, body: null }));
    await waitFor(() => expect(getRouter().refresh).toHaveBeenCalled());
  },
});

/** Refused: the star and its count go back. */
export const StarRefused = meta.story({
  beforeEach: ({ msw }) => void msw.use(failing),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Star, 41" }));
    await waitFor(() => expect(canvas.getByRole("button", { name: "Star, 41" })).toHaveAttribute("aria-pressed", "false"));
  },
});

/** Signed out where the session reaches: Star and Follow lead to signing in. */
export const SignedOut = meta.story({
  render: () => (
    <div className="flex gap-2">
      <HubToggle kind="star" api={`${API}/star`} on={false} count={41} signIn="https://app.artbucket.test/login" variant="outline" />
      <HubToggle kind="follow" api="/api/v1/hub/acme/follow" on={false} signIn="https://app.artbucket.test/login" variant="outline" />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: /Star/ })).toHaveAttribute("href", "https://app.artbucket.test/login");
    await expect(canvas.getByRole("link", { name: "Follow" })).toBeInTheDocument();
  },
});

/** Following an organization, then not. */
export const Follow = meta.story({
  render: () => <HubToggle kind="follow" api="/api/v1/hub/acme/follow" on variant="outline" />,
  beforeEach: ({ msw }) => void msw.use(sent.on("delete", "/api/v1/hub/acme/follow", { following: false })),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Following" }));
    await expect(await canvas.findByRole("button", { name: "Follow" })).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(sent.last("DELETE")).toEqual({ path: "/api/v1/hub/acme/follow", body: null }));
  },
});

/** Report it: what is wrong, details and a way back, seen only by its owner and the operator. */
export const Report = meta.story({
  args: { claim: null },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Report this listing" }));
    const d = within(await screen.findByRole("dialog", { name: "Report Acme" }));
    await userEvent.click(d.getByRole("combobox", { name: "What is wrong" }));
    await userEvent.click(await screen.findByRole("option", { name: "Its rules or files are wrong or out of date" }));
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    await userEvent.type(d.getByRole("textbox", { name: "Details" }), "The logo is the 2019 one.");
    await userEvent.type(d.getByRole("textbox", { name: "How to reach you (optional)" }), "sam@acme.test");
    await userEvent.click(d.getByRole("button", { name: "Send report" }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: `${API}/reports`, body: { reason: "inaccurate", note: "The logo is the 2019 one.", contact: "sam@acme.test" } }));
    await expect(await screen.findByText("Thanks: the listing's owner will see your report")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** Claim it, as an admin of an organization that proved its domain: the claim names the proof. */
export const Claim = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Report or claim this listing" }));
    const d = within(await screen.findByRole("dialog"));
    await userEvent.click(d.getByRole("tab", { name: "It's my brand" }));
    await expect(d.getByRole("heading", { name: "Claim Acme" })).toBeInTheDocument();
    await userEvent.type(d.getByRole("textbox", { name: "Who you are to Acme" }), "I run Acme's brand team. Please hand it over.");
    await userEvent.click(d.getByRole("button", { name: "Send claim" }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: `${API}/claims`, body: { note: "I run Acme's brand team. Please hand it over." } }));
    await expect(await screen.findByText("Claim sent")).toBeInTheDocument();
    await expect(screen.getByText(/It names acme\.test as yours/)).toBeInTheDocument();
  },
});

/** Not able to claim here (signed out, or on another host): where to go to, and only Report to send. */
export const ClaimElsewhere = meta.story({
  args: { claim: { href: "https://app.artbucket.test/login?next=/hub/acme/acme", label: "Sign in" } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Report or claim this listing" }));
    const d = within(await screen.findByRole("dialog"));
    await userEvent.click(d.getByRole("tab", { name: "It's my brand" }));
    await expect(d.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "https://app.artbucket.test/login?next=/hub/acme/acme");
    await expect(d.queryByRole("button", { name: "Send claim" })).not.toBeInTheDocument();
    await userEvent.click(d.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/**
 * Start from this brand: a copy in the person's project, named first. Refused here (the name is taken), so the
 * dialog stays with the reason; done, it goes on to the app (a full load, not run here).
 */
export const StartFromRefused = meta.story({
  beforeEach: ({ msw }) => void msw.use(failing),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Start from this brand" }));
    const d = within(await screen.findByRole("dialog", { name: "Start from Acme" }));
    const name = d.getByRole("textbox", { name: "Name" });
    await expect(name).toHaveValue("Acme");
    await userEvent.clear(name);
    await expect(d.getByRole("button", { name: "Create brand" })).toBeDisabled();
    await userEvent.type(name, "Acme for partners");
    await userEvent.click(d.getByRole("button", { name: "Create brand" }));
    await expect(await screen.findByText("That name is taken")).toBeInTheDocument();
    await expect(screen.getByRole("dialog", { name: "Start from Acme" })).toBeInTheDocument();
    await userEvent.click(d.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** The Brand Agent Score's form, while the crawl runs: what it is doing, said as a status. */
export const ScorePending = meta.story({
  render: () => (
    <form
      action={async () => {
        await delay(400);
      }}
      className="grid max-w-md gap-3"
    >
      <div className="flex gap-2">
        <Input name="domain" defaultValue="acme.test" aria-label="Domain" />
        <SubmitButton>Check</SubmitButton>
      </div>
      <WhilePending>Looking where an agent looks: llms.txt, rules, logo, tokens, MCP. A few seconds.</WhilePending>
    </form>
  ),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.queryByRole("status")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Check" }));
    await expect(await canvas.findByRole("status")).toHaveTextContent(/Looking where an agent looks/);
    await waitFor(() => expect(canvas.queryByRole("status")).not.toBeInTheDocument());
  },
});

/** A logo on its checker: a white mark moves to a dark ground so it shows, in either theme. */
export const LogoOnItsGround = meta.story({
  render: () => (
    <div className="grid max-w-md gap-4">
      <LogoWell src={`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><rect x="20" y="20" width="200" height="40" rx="8" fill="#ffffff"/></svg>')}`} alt="Acme logo, white" />
      <LogoWell src={`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><rect x="20" y="20" width="200" height="40" rx="8" fill="#2f62ff"/></svg>')}`} alt="Acme logo, blue" />
    </div>
  ),
  play: async ({ canvas }) => {
    const white = canvas.getByRole("img", { name: "Acme logo, white" }).parentElement!;
    await waitFor(() => expect(white.style.backgroundColor).not.toBe(""));
    await expect(canvas.getByRole("img", { name: "Acme logo, blue" }).parentElement!.style.backgroundColor).toBe("");
  },
});

/** The search box takes `/` from anywhere on the page, as GitHub's does, but not while typing elsewhere. */
export const SlashToSearch = meta.story({
  render: () => (
    <div className="grid max-w-md gap-3">
      <Input aria-label="Somewhere else" />
      <HubSearch action="/hub" />
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    const other = canvas.getByRole("textbox", { name: "Somewhere else" });
    await userEvent.click(other);
    await userEvent.keyboard("/");
    await expect(other).toHaveValue("/");
    other.blur();
    await userEvent.keyboard("/");
    await expect(canvas.getByRole("searchbox", { name: "Search brands and owners" })).toHaveFocus();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

export const Dark = meta.story({ globals: { theme: "dark" } });
