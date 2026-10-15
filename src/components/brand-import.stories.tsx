import preview from "#.storybook/preview";
import { IMPORTER, importStart } from "#.storybook/fixtures/brand-pages";
import { delay, http, HttpResponse } from "msw";
import { expect, fn, waitFor } from "storybook/test";
import { BrandImport } from "@/components/brand-import";

/** What the upload sent: the start's body, each part's number and size, and whether it was completed. */
let started: unknown;
let parts: { n: number; bytes: number }[];
let completed: boolean;

const start = (over: Partial<typeof importStart> = {}) => http.get(IMPORTER, () => HttpResponse.json({ data: { ...importStart, ...over } }));

/** The importer taking an upload: a start answering three parts of 4 bytes, parts and complete answered as `part` says. */
const upload = (part: () => Promise<Response> | Response = () => new HttpResponse(null, { status: 200 })) => [
  http.post(IMPORTER, async ({ request }) => {
    started = await request.json();
    return HttpResponse.json({ data: { id: "imp_new", partSize: 4, parts: 3 } });
  }),
  http.put(`${IMPORTER}/imp_new/parts/:n`, async ({ params, request }) => {
    const res = await part();
    if (res.ok) parts.push({ n: Number(params.n), bytes: (await request.arrayBuffer()).byteLength });
    return res;
  }),
  http.post(`${IMPORTER}/imp_new/complete`, () => {
    completed = true;
    return HttpResponse.json({ data: {} });
  }),
];

/** A file dragged onto `zone` and dropped, as the browser sends it. */
const drop = (zone: Element, f: File) => {
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(f);
  for (const type of ["dragover", "drop"]) zone.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }));
};

/** A brand's archive of 10 bytes: three parts of 4, 4 and 2. */
const zip = () => new File(["0123456789"], "acme-autumn.zip", { type: "application/zip" });

/**
 * Brand import, the step of New brand where the server has it (me.brandImport): a zip of the brand's files, or its
 * guidelines PDF, uploaded in parts and read in the background into a plan reviewed on the import's own page.
 */
const meta = preview.meta({
  title: "App/Features/Brands/Brand import",
  component: BrandImport,
  args: { url: IMPORTER, onBusy: fn(), onStarted: fn() },
  decorators: [(Story) => <div className="max-w-2xl">{Story()}</div>],
  beforeEach: ({ msw }) => {
    started = undefined;
    parts = [];
    completed = false;
    msw.use(start(), ...upload());
  },
});

/** Ready for a file: what the project may import, this month's reading left, and its latest imports. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Choose a .zip or a PDF")).toBeInTheDocument();
    await expect(canvas.getByText("or drop it here. Up to 2 GB and 10,000 files.")).toBeInTheDocument();
    await expect(canvas.getByText("8,760 of 10,000 files left to read this month.")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: /acme-brand-2026.zip Plan ready/ })).toHaveAttribute("href", "/imports/imp_ready");
    await expect(canvas.getByRole("button", { name: "Upload and read" })).toBeDisabled();
  },
});

/** Asking what the project can import. */
export const Loading = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get(IMPORTER, async () => {
        await delay("infinite");
        return HttpResponse.json({});
      }),
    ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Checking what this project can import…")).toBeInTheDocument();
  },
});

/** The importer doesn't answer: Try again asks once more. */
export const Unreachable = meta.story({
  beforeEach: ({ msw }) => {
    let tries = 0;
    msw.use(http.get(IMPORTER, () => (++tries === 1 ? HttpResponse.json({ error: { message: "Down" } }, { status: 503 }) : HttpResponse.json({ data: importStart }))));
  },
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText("Brand import can't be reached")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await expect(await canvas.findByText("Choose a .zip or a PDF")).toBeInTheDocument();
  },
});

/** The importer's own word instead (a plan that doesn't include it, the month's reading used up), with its way on. */
export const Notice = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(start({ notice: { title: "Brand import is on Team and Business", text: "Bring in a whole archive at once, read into brands and collections.", href: "/billing", label: "See plans" } as never })),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("link", { name: "See plans" })).toHaveAttribute("href", "/billing");
  },
});

/** No room for another brand on this plan: said before the upload, not after. */
export const NoRoomForABrand = meta.story({
  beforeEach: ({ msw }) => void msw.use(start({ brandRoom: "Your plan has room for no more brands: what this import proposes goes into brands you have." as never, imports: [] })),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/Your plan has room for no more brands/)).toBeInTheDocument();
    await expect(canvas.queryByText("Recent imports")).not.toBeInTheDocument();
  },
});

/** Dropped on the zone: the file named, ready to upload. */
export const DropAFile = meta.story({
  play: async ({ canvas }) => {
    const zone = (await canvas.findByText("Choose a .zip or a PDF")).closest("label")!;
    const pdf = new File(["%PDF-1.7"], "acme-guidelines.pdf", { type: "application/pdf" });
    drop(zone, pdf);
    await expect(await canvas.findByText("acme-guidelines.pdf")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Upload and read" })).toBeEnabled();
  },
});

/** Anything but a zip or a PDF is refused where it was dropped. */
export const WrongKindOfFile = meta.story({
  play: async ({ canvas }) => {
    const zone = (await canvas.findByText("Choose a .zip or a PDF")).closest("label")!;
    drop(zone, new File(["x"], "logo.ai", { type: "application/postscript" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Pick a .zip of your brand's files, or its guidelines as a PDF.");
    await expect(canvas.getByRole("button", { name: "Upload and read" })).toBeDisabled();
  },
});

/** Past what the importer takes: its size and the limit. */
export const TooBig = meta.story({
  beforeEach: ({ msw }) => void msw.use(start({ max: 1024 ** 2 })),
  play: async ({ canvas, userEvent }) => {
    await userEvent.upload(await canvas.findByLabelText(/Choose a .zip or a PDF/), new File([new Uint8Array(2 * 1024 ** 2)], "acme-archive.zip", { type: "application/zip" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("acme-archive.zip is 2.0 MB: 1.0 MB at most.");
  },
});

/**
 * Uploaded in parts, three at a time: POST the name and size, PUT each part, POST complete, then the import's page.
 * The dialog may not close while it runs (`onBusy`).
 */
export const Upload = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.upload(await canvas.findByLabelText(/Choose a .zip or a PDF/), zip());
    await expect(canvas.getByText("acme-autumn.zip")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Upload and read" }));
    await waitFor(() => expect(args.onStarted).toHaveBeenCalledWith("imp_new"));
    await expect(started).toEqual({ filename: "acme-autumn.zip", size: 10 });
    await expect(parts.sort((a, b) => a.n - b.n)).toEqual([
      { n: 1, bytes: 4 },
      { n: 2, bytes: 4 },
      { n: 3, bytes: 2 },
    ]);
    await expect(completed).toBe(true);
    await expect(args.onBusy).toHaveBeenCalledWith(true);
  },
});

/** While the parts go up: how far, and to keep it open. */
export const Uploading = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      ...upload(async () => {
        await delay("infinite");
        return new HttpResponse(null);
      }),
    ),
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.upload(await canvas.findByLabelText(/Choose a .zip or a PDF/), zip());
    await userEvent.click(canvas.getByRole("button", { name: "Upload and read" }));
    await expect(await canvas.findByText("Uploading acme-autumn.zip")).toBeInTheDocument();
    await expect(canvas.getByRole("progressbar", { name: "Uploaded" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Upload and read" })).toBeDisabled();
    await waitFor(() => expect(args.onBusy).toHaveBeenLastCalledWith(true));
  },
});

/** A part refused three times: the upload stops with the importer's words, and Try again starts it over. */
export const UploadFails = meta.story({
  beforeEach: ({ msw }) => void msw.use(...upload(() => HttpResponse.json({ error: { code: "full", message: "The importer's storage is full" } }, { status: 507 }))),
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.upload(await canvas.findByLabelText(/Choose a .zip or a PDF/), zip());
    await userEvent.click(canvas.getByRole("button", { name: "Upload and read" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("The importer's storage is full");
    await expect(canvas.getByText("The upload stopped")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Try again" })).toBeEnabled();
    await waitFor(() => expect(args.onBusy).toHaveBeenLastCalledWith(false));
    await expect(args.onStarted).not.toHaveBeenCalled();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

export const Dark = meta.story({ globals: { theme: "dark" } });
