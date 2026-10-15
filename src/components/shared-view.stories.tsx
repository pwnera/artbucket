import preview from "#.storybook/preview";
import { delay, http, HttpResponse } from "msw";
import { expect, waitFor } from "storybook/test";
import { renditions } from "#.storybook/fixtures/library";
import { acmeBrand, refused, shared } from "#.storybook/fixtures/sites";
import { SharedView } from "@/components/shared-view";

const PASSWORD = "northwind-2026";
const locked = refused("password", "This link asks for a password", { name: "Press kit for Northwind", brand: acmeBrand });
let handedIn: unknown[] = [];

/**
 * A share link's page (SharedView, /s/{token}), for someone without an account: a collection's approved files, one
 * asset as a delivery, or a drop zone to send files in for review. In the sharing organization's look; a password,
 * once it worked, is kept for the tab. Expired, revoked or failing, it says which.
 */
const meta = preview.meta({
  title: "App/Features/Sites/Shared view",
  component: SharedView,
  parameters: { layout: "fullscreen" },
  args: { token: "k3x9q2", initial: shared(), privacy: "https://acme.test/privacy" },
  beforeEach: ({ msw }) => {
    handedIn = [];
    // A password kept by an earlier story would open the link before its door shows.
    sessionStorage.clear();
    msw.use(...renditions);
  },
});

/** A collection: its files, who shared it, and until when the link works. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Shared from Acme Inc · Acme")).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { level: 1, name: "Press kit for Northwind" })).toBeInTheDocument();
    await expect(canvas.getByText("6 files")).toBeInTheDocument();
    await expect(canvas.getByText(/This link works until/)).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: /Privacy/ })).toHaveAttribute("href", "https://acme.test/privacy");
  },
});

/** One asset: the file first, then what it is and its download. */
export const SingleAsset = meta.story({
  args: { initial: shared({ name: null, target: { type: "asset", label: "Autumn campaign hero" } }, ["ast_hero"]) },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: /Download/ })).toHaveAttribute("download");
    await expect(canvas.getByRole("link", { name: /Open original/ })).toBeInTheDocument();
  },
});

/** Shown, not handed out (its Rights say Shown only): no download, no original. */
export const ShownOnly = meta.story({
  args: { initial: shared({ name: null, target: { type: "asset", label: "Acme Sans Bold" } }, ["ast_font"]) },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("link", { name: /Download/ })).not.toBeInTheDocument();
  },
});

/** Nothing approved in the collection yet. */
export const Empty = meta.story({
  args: { initial: shared({}, []) },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Nothing here yet")).toBeInTheDocument();
  },
});

/** More than a page: Show more loads the next, from where the list ends. */
export const ShowMore = meta.story({
  args: { initial: shared({}, ["ast_hero", "ast_logo"], 4) },
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get("/api/v1/shared/:token", ({ request }) =>
        new URL(request.url).searchParams.get("offset") === "2" ? HttpResponse.json(shared({}, ["ast_mark", "ast_reel"], 4)) : HttpResponse.json({}, { status: 500 }),
      ),
    ),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("2 of 4")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Show more" }));
    await waitFor(() => expect(canvas.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument());
    await expect(canvas.getAllByRole("button", { name: /^Look at / })).toHaveLength(4);
  },
});

/** Behind a password: a wrong one is said and selected to retype; the right one opens the link and is kept. */
export const Password = meta.story({
  args: { initial: locked },
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get("/api/v1/shared/:token", async ({ request }) => {
        await delay(100);
        return request.headers.get("X-Share-Password") === PASSWORD ? HttpResponse.json(shared()) : HttpResponse.json(locked, { status: 401 });
      }),
    ),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("heading", { name: "Press kit for Northwind" })).toBeInTheDocument();
    await userEvent.type(canvas.getByLabelText("Password"), "northwind");
    await userEvent.click(canvas.getByRole("button", { name: "Open" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("That password isn't right.");
    await userEvent.clear(canvas.getByLabelText("Password"));
    await userEvent.type(canvas.getByLabelText("Password"), PASSWORD);
    await userEvent.click(canvas.getByRole("button", { name: "Open" }));
    await expect(await canvas.findByText("6 files")).toBeInTheDocument();
    await expect(sessionStorage.getItem("share:k3x9q2:password")).toBe(PASSWORD);
  },
});

/** Past its date. */
export const Expired = meta.story({
  args: { initial: refused("gone", "This link has expired") },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "This link has expired" })).toBeInTheDocument();
    await expect(canvas.getByText("Ask whoever sent it for a new one.")).toBeInTheDocument();
  },
});

/** Revoked, or never a link here. */
export const Revoked = meta.story({
  args: { initial: refused("not_found", "No such link") },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "This link doesn't work" })).toBeInTheDocument();
  },
});

/** A passing failure: Try again opens it once it answers. */
export const Failed = meta.story({
  args: { initial: refused("internal", "Something went wrong on our side. Try again in a moment.") },
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/shared/:token", () => HttpResponse.json(shared()))),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await expect(await canvas.findByText("6 files")).toBeInTheDocument();
  },
});

/** While it opens. */
export const Loading = meta.story({
  args: { initial: null },
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/shared/:token", () => new Promise<Response>(() => {}))),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status", { name: "Opening the link" })).toBeInTheDocument();
  },
});

/** A link to send files in: chosen (or dropped anywhere on the page), uploaded, handed in for review, thanked. */
export const Upload = meta.story({
  args: { initial: shared({ kind: "upload", name: "Spring photos", target: { type: "collection", label: "Autumn campaign" } }, []) },
  beforeEach: ({ msw }) =>
    void msw.use(
      http.post("/api/v1/shared/:token/uploads", () => HttpResponse.json({ token: "stg_1", uploadUrl: "/storage/stg_1" })),
      http.put("/storage/:id", () => new HttpResponse(null, { status: 200 })),
      http.post("/api/v1/shared/:token/assets", async ({ request }) => {
        handedIn.push(await request.json());
        return HttpResponse.json({ data: {} });
      }),
    ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(canvas.getByRole("heading", { name: "Send files for Spring photos" })).toBeInTheDocument();
    const input = canvasElement.querySelector<HTMLInputElement>('input[type="file"]')!;
    await userEvent.upload(input, new File(["jpeg"], "lisbon-01.jpg", { type: "image/jpeg" }));
    await expect(await canvas.findByText("Thank you: 1 file sent for review")).toBeInTheDocument();
    await expect(handedIn).toEqual([{ token: "stg_1", filename: "lisbon-01.jpg", mime: "image/jpeg" }]);
  },
});

/** An upload refused (too large, or a type the project won't take): said on the file, with Retry. */
export const UploadRefused = meta.story({
  args: Upload.input.args,
  beforeEach: ({ msw }) =>
    void msw.use(http.post("/api/v1/shared/:token/uploads", () => HttpResponse.json({ error: { message: "This link takes images only" } }, { status: 422 }))),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.upload(canvasElement.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["%PDF"], "brief.pdf", { type: "application/pdf" }));
    await expect(await canvas.findByText("This link takes images only")).toBeInTheDocument();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

export const PasswordPhone = meta.story({ args: { initial: locked }, globals: { viewport: { value: "phone" } } });

export const Dark = meta.story({ globals: { theme: "dark" } });
