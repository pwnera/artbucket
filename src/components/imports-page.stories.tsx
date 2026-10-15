import preview from "#.storybook/preview";
import { freezeNow, NOW, recorder } from "#.storybook/fixtures/brands";
import { inApp } from "#.storybook/fixtures/library";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { delay, http, HttpResponse } from "msw";
import { expect, screen, waitFor, within } from "storybook/test";
import type { ImportRow } from "@/components/brand-import";
import { ImportsPage } from "@/components/imports-page";

const BASE = "/brand-import";
const at = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const all = { open: true, edit: true, apply: true, undo: true, discard: true };
const ada = { id: "usr_ada", name: "Ada Lovelace" };

const row = (r: Partial<ImportRow> & Pick<ImportRow, "id" | "filename" | "status">): ImportRow => ({
  bytes: 48_200_000,
  label: null,
  progress: null,
  error: null,
  startedBy: ada,
  at: at(1),
  brands: [],
  proposed: [],
  counts: null,
  appliedBy: null,
  appliedAt: null,
  undoneAt: null,
  undoing: false,
  tagging: null,
  archive: true,
  can: all,
  ...r,
});

/** One import at each stage it can be in: being read, a plan waiting, applied, stopped half applied, stopped before, undone. */
const reading = row({ id: "imp_reading", filename: "acme-brand-book.pdf", status: "processing", label: "Reading pages", progress: { done: 12, total: 40 }, bytes: 8_400_000, at: at(0.01) });
const ready = row({ id: "imp_ready", filename: "northwind-2026.zip", status: "ready", proposed: ["Northwind", "Northwind Kids"], startedBy: { id: "usr_grace", name: "Grace Hopper" } });
const applied = row({ id: "imp_applied", filename: "acme-logos.zip", status: "applied", brands: [{ slug: "acme", name: "Acme", created: false }], counts: { assets: 214, deduped: 12, left: 0, failed: 0 }, appliedBy: ada, appliedAt: at(3), at: at(3) });
const stopped = row({
  id: "imp_stopped",
  filename: "acme-photos-2025.zip",
  status: "failed",
  error: "The connection to the bucket dropped",
  brands: [{ slug: "acme-photo", name: "Acme Photo", created: true }],
  counts: { assets: 80, deduped: 0, left: 120, failed: 0 },
  appliedBy: ada,
  appliedAt: at(5),
  at: at(5),
});
const broken = row({ id: "imp_broken", filename: "old-site.zip", status: "failed", error: "It isn't a zip Artbucket can read", at: at(9) });
const undone = row({ id: "imp_undone", filename: "test-import.zip", status: "undone", undoneAt: at(20), at: at(21), brands: [{ slug: "test", name: "Test", created: true }], counts: { assets: 3, deduped: 0, left: 0, failed: 0 }, appliedAt: at(21) });
const imports = [reading, ready, applied, stopped, broken, undone];

type Page = { imports: ImportRow[]; total: number; can: { run: boolean; apply: boolean; manage: boolean } };
const page = (rows: ImportRow[], over: Partial<Page> = {}): Page => ({ imports: rows, total: rows.length, can: { run: true, apply: true, manage: true }, ...over });

const sent = recorder();

/**
 * Brand import's API as the page reads it: the list (GET with `limit`, narrowed by `filter`, `mine` and `q`), what
 * New brand starts from (GET without), and an upload in parts. `rows` answers the list until a write changes it.
 */
const importsApi = (rows: () => Page) => [
  http.get(BASE, async ({ request }) => {
    const u = new URL(request.url);
    sent.calls.push({ method: "GET", path: u.pathname + u.search, body: null });
    await delay(50);
    if (!u.searchParams.has("limit")) return HttpResponse.json({ data: { notice: null, project: "Acme", max: 2 * 1024 ** 3, maxFiles: 10_000, partSize: 8 * 1024 ** 2, cap: 10_000, used: 1_250, brandRoom: null, imports: [] } });
    const p = rows();
    const q = u.searchParams.get("q")?.toLowerCase();
    const filter = u.searchParams.get("filter");
    const shown = p.imports.filter(
      (i) =>
        (!q || i.filename.includes(q) || i.startedBy.name?.toLowerCase().includes(q)) &&
        (!filter || (filter === "needs" ? i.status === "ready" : filter === "running" ? ["processing", "applying"].includes(i.status) : ["applied", "undone"].includes(i.status))) &&
        (!u.searchParams.has("mine") || i.startedBy.id === "usr_ada"),
    );
    const offset = Number(u.searchParams.get("offset"));
    return HttpResponse.json({ data: { ...p, imports: shown.slice(offset, offset + Number(u.searchParams.get("limit"))), total: shown.length } });
  }),
];

/**
 * The project's brand imports (/imports): each one's archive, where it is, who started it, its brands and what can
 * be done with it now. Only where the server offers brand import (me.brandImport) and to whoever may see imports.
 */
const meta = preview.meta({
  title: "App/Features/Library/Imports",
  component: ImportsPage,
  decorators: [inApp],
  parameters: { layout: "fullscreen", app: { me: { brandImport: BASE } }, nextjs: { navigation: { pathname: "/imports" } } },
  beforeEach: ({ msw }) => {
    sent.reset();
    msw.use(...importsApi(() => page(imports)));
    return freezeNow();
  },
});

const table = (canvas: ReturnType<typeof within>) => within(canvas.getByRole("table"));

/** One import at every stage, each with what may be done with it now. A row opens its import. */
export const Playground = meta.story({
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("table");
    const t = table(canvas);
    await expect(t.getAllByRole("row")).toHaveLength(imports.length + 1);
    await expect(t.getByText("Reading pages")).toBeInTheDocument();
    await expect(t.getByText("12 / 40")).toBeInTheDocument();
    await expect(t.getByRole("group", { name: "Actions for northwind-2026.zip" })).toContainElement(t.getByRole("button", { name: "Approve: apply its plan without opening it" }));
    await expect(within(t.getByRole("group", { name: "Actions for acme-photos-2025.zip" })).getByRole("button", { name: "Carry on applying, from where it stopped" })).toBeInTheDocument();
    await expect(within(t.getByRole("group", { name: "Actions for old-site.zip" })).getByRole("button", { name: "Discard its plan and its files" })).toBeInTheDocument();
    await expect(t.getByText("Taken back")).toBeInTheDocument();
    // The row opens its import, from the keyboard too.
    t.getAllByRole("row")[2].focus();
    await userEvent.keyboard("{Enter}");
    await expect(getRouter().push).toHaveBeenCalledWith("/imports/imp_ready");
  },
});

/** Narrowed by status, to one's own, and by name: each asks the server again. */
export const Filters = meta.story({
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("table");
    await userEvent.click(canvas.getByRole("radio", { name: "Waiting for review" }));
    await waitFor(() => expect(table(canvas).getAllByRole("row")).toHaveLength(2));
    await expect(sent.calls.at(-1)?.path).toContain("filter=needs");
    await userEvent.click(canvas.getByRole("radio", { name: "Mine" }));
    await expect(await canvas.findByText("No import matches these filters.")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("radio", { name: "All" }));
    await userEvent.click(canvas.getByRole("radio", { name: "Everyone" }));
    await userEvent.type(canvas.getByRole("textbox", { name: "Find an import by its archive or who started it" }), "photos");
    await waitFor(() => expect(table(canvas).getAllByRole("row")).toHaveLength(2));
    await expect(sent.calls.at(-1)?.path).toContain("q=photos");
  },
});

/** Start one: the archive picked, uploaded in parts with its progress, then on to the import's own page. */
export const StartAnImport = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.post(BASE, async () => HttpResponse.json({ data: { id: "imp_new", partSize: 1024, parts: 3 } })),
      http.put(`${BASE}/:id/parts/:n`, async () => {
        await delay(100);
        return new HttpResponse(null, { status: 204 });
      }),
      http.post(`${BASE}/:id/complete`, () => HttpResponse.json({ data: {} })),
    ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Import your brand" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Import your brand" }));
    await expect(await dialog.findByText("8,750 of 10,000 files left to read this month.", { exact: false })).toBeInTheDocument();
    const file = new File([new Uint8Array(3000)], "acme-brand.zip", { type: "application/zip" });
    await userEvent.upload(dialog.getByLabelText(/Choose a .zip or a PDF/), file);
    await expect(dialog.getByText("acme-brand.zip")).toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Upload and read" }));
    await expect(await dialog.findByText("Uploading acme-brand.zip")).toBeInTheDocument();
    await expect(dialog.getByRole("progressbar")).toBeInTheDocument();
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/imports/imp_new"));
  },
});

/** A file that isn't a zip or a PDF is refused before anything is sent. */
export const WrongFile = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Import your brand" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Import your brand" }));
    // Typed as a zip, so the picker's accept lets it through, but named as what it is.
    await userEvent.upload(await dialog.findByLabelText(/Choose a .zip or a PDF/), new File(["x"], "logo.png", { type: "application/zip" }));
    await expect(dialog.getByText("Pick a .zip of your brand's files, or its guidelines as a PDF.")).toBeInTheDocument();
    await expect(dialog.getByRole("button", { name: "Upload and read" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** Retry one that stopped half applied: it carries on from where it stopped, and the list shows its progress. */
export const RetryStopped = meta.story({
  beforeEach: ({ msw }) => {
    let rows = imports;
    msw.use(
      ...importsApi(() => page(rows)),
      http.post(`${BASE}/:id/apply`, async ({ params }) => {
        sent.calls.push({ method: "POST", path: `${BASE}/${params.id}/apply`, body: null });
        rows = imports.map((i) => (i.id === params.id ? { ...i, status: "applying", label: null, progress: { done: 80, total: 200 } } : i));
        return HttpResponse.json({ data: {} });
      }),
    );
  },
  play: async ({ canvas, userEvent }) => {
    const group = within(await canvas.findByRole("group", { name: "Actions for acme-photos-2025.zip" }));
    const line = within(table(canvas).getByText("acme-photos-2025.zip").closest("tr")!);
    await expect(line.getByText("Stopped")).toBeInTheDocument();
    await userEvent.click(group.getByRole("button", { name: "Carry on applying, from where it stopped" }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: `${BASE}/imp_stopped/apply`, body: null }));
    await expect(await line.findByText("80 / 200")).toBeInTheDocument();
    await expect(line.getByText("Applying")).toBeInTheDocument();
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
});

/** Approve a plan without opening it: asked first, since nobody reviews it. */
export const ApproveWithConfirm = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("post", `${BASE}/:id/apply`)),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Approve: apply its plan without opening it" }));
    const confirm = within(await screen.findByRole("alertdialog", { name: "Apply northwind-2026.zip without opening its plan?" }));
    await expect(confirm.getByText(/It makes Northwind, Northwind Kids/)).toBeInTheDocument();
    await userEvent.click(confirm.getByRole("button", { name: "Approve and apply" }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: `${BASE}/imp_ready/apply`, body: null }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  },
});

/** Discard one that never applied: its plan and files go, and can't come back. */
export const DiscardWithConfirm = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("delete", `${BASE}/:id`)),
  play: async ({ canvas, userEvent }) => {
    const group = within(await canvas.findByRole("group", { name: "Actions for old-site.zip" }));
    await userEvent.click(group.getByRole("button", { name: "Discard its plan and its files" }));
    const confirm = within(await screen.findByRole("alertdialog", { name: "Discard old-site.zip?" }));
    await userEvent.click(confirm.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(sent.last("DELETE")).toEqual({ path: `${BASE}/imp_broken`, body: null }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  },
});

/** Fifty at a time, then more on asking. */
export const ShowMore = meta.story({
  beforeEach: ({ msw }) => void msw.use(...importsApi(() => page(Array.from({ length: 60 }, (_, n) => row({ id: `imp_${n}`, filename: `archive-${n + 1}.zip`, status: "applied", appliedAt: at(n) }))))),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Show 10 more" }));
    await expect(await canvas.findByText("archive-60.zip")).toBeInTheDocument();
  },
});

/** None yet: what an import does. */
export const Empty = meta.story({
  beforeEach: ({ msw }) => void msw.use(...importsApi(() => page([]))),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/No imports yet\./)).toBeInTheDocument();
  },
});

/** A viewer: the history, with nothing to start and only Open on each row. */
export const AsViewer = meta.story({
  parameters: { app: { scope: "read", me: { brandImport: BASE } } },
  beforeEach: ({ msw }) => void msw.use(...importsApi(() => page(imports.map((i) => ({ ...i, can: { open: true, edit: false, apply: false, undo: false, discard: false } })), { can: { run: false, apply: false, manage: false } }))),
  play: async ({ canvas }) => {
    await canvas.findByRole("table");
    await expect(canvas.queryByRole("button", { name: "Import your brand" })).not.toBeInTheDocument();
    for (const g of canvas.getAllByRole("group", { name: /^Actions for/ })) await expect(within(g).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Open the import"]);
  },
});

/** A server without brand import: said, with what turns it on. */
export const Off = meta.story({
  parameters: { app: { me: { brandImport: null } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Brand import is off here")).toBeInTheDocument();
  },
});

/** While the first page comes. */
export const Loading = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get(BASE, () => delay("infinite"))),
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

export const Dark = meta.story({ globals: { theme: "dark" } });
