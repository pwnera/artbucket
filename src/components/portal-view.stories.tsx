import preview from "#.storybook/preview";
import { delay, http, HttpResponse } from "msw";
import { expect, screen, waitFor, within } from "storybook/test";
import { recorder } from "#.storybook/fixtures/brands";
import { renditions } from "#.storybook/fixtures/library";
import { assetsBody, refused, siteBody } from "#.storybook/fixtures/sites";
import type { Theme } from "@/components/portal-assets";
import { PortalView } from "@/components/portal-view";

const sent = recorder();
const door = (access: "password" | "members", theme: Theme = { logo: null, accent: "#2f62ff", background: null }) =>
  refused("password", "This portal asks for a password", { name: "Partner hub", access, theme });

/** The door's answer: the portal for the right password, a refusal for any other. */
const PASSWORD = "acme-partners";
const behindPassword = http.get("/api/v1/portal/:slug/site", async ({ request }) => {
  await delay(100);
  return request.headers.get("X-Portal-Password") === PASSWORD
    ? HttpResponse.json(siteBody("logo", { slug: "partners", name: "Partner hub" }))
    : HttpResponse.json(door("password"), { status: 401 });
});

/**
 * A brand portal as a visitor sees it (PortalView, /p/{slug} or its own domain): the brand's released pages in the
 * portal's look, or its Assets view; at a door, a password or a sign-in, and for either a way to ask for access;
 * closed, missing, or failing, said plainly. What the server rendered paints first (`initial`); a password stays in
 * the tab once it worked.
 */
const meta = preview.meta({
  title: "App/Features/Sites/Portal view",
  component: PortalView,
  parameters: { layout: "fullscreen" },
  args: { slug: "press", base: "/p/press", path: "logo", initial: { site: siteBody("logo"), query: "" }, privacy: "https://acme.test/privacy" },
  beforeEach: ({ msw }) => {
    sent.reset();
    // A password or key kept by an earlier story would open the door before it shows.
    sessionStorage.clear();
    localStorage.clear();
    msw.use(...renditions, http.get("/api/v1/me", () => HttpResponse.json({ error: { code: "unauthorized" } }, { status: 401 })));
  },
});

/** A page of the portal's brand, in the portal's header, with its tabs: Guidelines, Assets, What's new, Contact. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    const tabs = canvas.getByRole("navigation", { name: "What this portal shows" });
    await expect(tabs).toHaveTextContent(/Guidelines.*Assets.*What's new.*Contact/);
    await expect(canvas.getByRole("link", { name: "Guidelines" })).toHaveAttribute("aria-current", "page");
  },
});

/** Someone who may edit its brands, signed in on the app's host: the floating Edit leads to the guidelines. */
export const Editor = meta.story({
  args: { editor: { project: "acme", app: "https://app.artbucket.test" } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("link", { name: /Edit/ })).toHaveAttribute("href", expect.stringContaining("https://app.artbucket.test/"));
  },
});

/** The Assets view under the portal's header. */
const assetsView = { args: { path: "", initial: { assets: assetsBody(), q: "", collection: null, asset: null } } } as const;

/** A portal with no brand: its Assets view, every file with its downloads. */
export const Assets = meta.story({
  ...assetsView,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: /Acme press kit/ })).toBeInTheDocument();
    await expect(canvas.getAllByRole("list", { name: /^Download / }).length).toBeGreaterThan(0);
  },
});

/** Download: a preset of a file, as a link the browser saves, and said as it starts. */
export const Download = meta.story({
  ...assetsView,
  play: async ({ canvas, canvasElement, userEvent }) => {
    // The browser would save the file and leave the story: the click is heard, the download kept from starting.
    const stop = (e: Event) => e.preventDefault();
    canvasElement.ownerDocument.addEventListener("click", stop);
    const [first] = canvas.getAllByRole("list", { name: /^Download / });
    const web = within(first).getByRole("link", { name: "Web" });
    await expect(web).toHaveAttribute("download");
    await expect(web.getAttribute("href")).toMatch(/^\/a\/ast_\w+\/w_1200,f_webp/);
    await userEvent.click(web);
    await expect(await screen.findByText(/^Downloading /)).toBeInTheDocument();
    canvasElement.ownerDocument.removeEventListener("click", stop);
  },
});

/** Behind a password: a wrong one is said and selected to retype; the right one opens the portal. */
export const Password = meta.story({
  args: { slug: "partners", base: "/p/partners", path: "", initial: { site: door("password"), query: "" } },
  beforeEach: ({ msw }) => void msw.use(behindPassword),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("heading", { name: "Partner hub" })).toBeInTheDocument();
    const field = canvas.getByLabelText("Password");
    await userEvent.type(field, "wrong");
    await userEvent.click(canvas.getByRole("button", { name: "Open" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("That password isn't right.");
    await expect(canvas.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
    await userEvent.clear(canvas.getByLabelText("Password"));
    await userEvent.type(canvas.getByLabelText("Password"), PASSWORD);
    await userEvent.click(canvas.getByRole("button", { name: "Open" }));
    await expect(await canvas.findByRole("navigation", { name: "What this portal shows" })).toBeInTheDocument();
    await expect(sessionStorage.getItem("portal:partners:password")).toBe(PASSWORD);
  },
});

/** Too many tries: the door stays, saying why, and the field is not marked wrong. */
export const RateLimited = meta.story({
  args: { slug: "partners", base: "/p/partners", path: "", initial: { site: door("password"), query: "" } },
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get("/api/v1/portal/:slug/site", () =>
        HttpResponse.json(refused("rate_limited", "Too many tries. Wait a minute, then try again."), { status: 429 }),
      ),
    ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Password"), "guess");
    await userEvent.click(canvas.getByRole("button", { name: "Open" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Too many tries. Wait a minute, then try again.");
  },
});

/** For the team: sign in if you are one of them, or ask. */
export const Members = meta.story({
  args: { slug: "team", base: "/p/team", path: "", initial: { site: door("members"), query: "" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Sign in if you are one of them, or ask for access/)).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?next=%2Fp%2Fteam");
    await expect(canvas.getByRole("button", { name: "Ask for access" })).toBeInTheDocument();
  },
});

/** Signed in, but not on this team: signing in again won't help, so asking comes first, their email filled in. */
export const SignedInNotOnTeam = meta.story({
  args: { slug: "team", base: "/p/team", path: "", initial: { site: door("members"), query: "" } },
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/me", () => HttpResponse.json({ data: { user: { email: "lena@northwind.test" } } }))),
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText(/Signed in as lena@northwind\.test, which isn't on this team/)).toBeInTheDocument();
    await expect(canvas.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Ask for access" }));
    await expect(canvas.getByLabelText("Email")).toHaveValue("lena@northwind.test");
  },
});

/** Ask for access: who they are and what for, sent to the team, then thanked. */
export const AskForAccess = meta.story({
  args: { slug: "partners", base: "/p/partners", path: "", initial: { site: door("password"), query: "" } },
  beforeEach: ({ msw }) => void msw.use(sent.on("post", "/api/v1/portal/:slug/requests")),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Ask for access" }));
    await userEvent.type(canvas.getByLabelText("Email"), "lena@northwind.test");
    await userEvent.type(canvas.getByLabelText("Name"), "Lena Park");
    await userEvent.type(canvas.getByLabelText("Who you are, and what it's for"), "Northwind's retail team, for the spring displays.");
    await userEvent.click(canvas.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(sent.last("POST")).toEqual({
        path: "/api/v1/portal/partners/requests",
        body: { email: "lena@northwind.test", name: "Lena Park", note: "Northwind's retail team, for the spring displays." },
      }),
    );
    await expect(await canvas.findByRole("status")).toHaveTextContent("Thanks: you'll hear back by email.");
  },
});

/** On the portal's own domain, where signing in can't work: asking is the way in. */
export const MembersOnOwnDomain = meta.story({
  args: { slug: "team", base: "", path: "", ownDomain: true, initial: { site: door("members", { logo: null, accent: null, background: "#0b1020" }), query: "" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/This portal is for the team behind it\. Ask for access/)).toBeInTheDocument();
    await expect(canvas.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
  },
});

/** Closed (taken offline, or past its date). */
export const Closed = meta.story({
  args: { initial: { site: refused("gone", "This portal has closed"), query: "" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "This portal has closed" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  },
});

/** No portal at this address. */
export const NotFound = meta.story({
  args: { initial: { site: refused("not_found", "There is no portal here"), query: "" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "There is no portal here" })).toBeInTheDocument();
  },
});

/** A passing failure on our side: said, with Try again, which opens it once it answers. */
export const Failed = meta.story({
  args: { initial: { site: refused("internal", "Something went wrong on our side. Try again in a moment."), query: "" } },
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/portal/:slug/site", () => HttpResponse.json(siteBody("logo")))),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("heading", { name: "This portal didn't open" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await expect(await canvas.findByRole("navigation", { name: "What this portal shows" })).toBeInTheDocument();
  },
});

/** Opening, shaped like the site so nothing jumps when it lands. */
export const Loading = meta.story({
  args: { initial: null },
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/portal/:slug/site", () => new Promise<Response>(() => {}))),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status", { name: "Opening the portal" })).toBeInTheDocument();
  },
});

export const Phone = meta.story({ args: { path: "voice", initial: { site: siteBody("voice"), query: "" } }, globals: { viewport: { value: "phone" } } });

export const PasswordPhone = meta.story({
  args: { slug: "partners", base: "/p/partners", path: "", initial: { site: door("password"), query: "" } },
  globals: { viewport: { value: "phone" } },
});

export const PasswordDark = meta.story({
  args: { slug: "partners", base: "/p/partners", path: "", initial: { site: door("password"), query: "" } },
  globals: { theme: "dark" },
});
