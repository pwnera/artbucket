import preview from "#.storybook/preview";
import { useState } from "react";
import { delay, http, HttpResponse } from "msw";
import { expect, fn, screen, waitFor, within } from "storybook/test";
import { uploads } from "#.storybook/fixtures/library";
import { Button } from "@/components/ui/button";
import { putWithProgress, UploadTray, uploadStore, useUploads, type Upload } from "@/components/uploads";

/**
 * Upload progress (UploadTray): one overall bar and a row per file, with Cancel, Retry and Open as their handlers are
 * given. It stays until dismissed when anything failed. Floats in the corner, or `inline` on a guest's upload page.
 */
const meta = preview.meta({
  title: "App/Features/Library/Uploads",
  component: UploadTray,
  parameters: { layout: "fullscreen" },
  args: { uploads, onDismiss: fn(), onCancel: fn(), onRetry: fn(), onOpen: fn(), inline: false, missing: 0 },
  decorators: [(Story) => <div className="min-h-96 p-4">{Story()}</div>],
});

/** A batch under way: done, sending, waiting, already in the library, refused. */
export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    const tray = canvas.getByRole("region", { name: "Uploads" });
    await expect(within(tray).getByRole("status")).toHaveTextContent("Uploading 5 files · 3 done");
    await expect(within(tray).getByText(/^44% of 3.7 MB$/)).toBeInTheDocument();
    await userEvent.click(within(tray).getByRole("button", { name: "Cancel autumn-lookbook-02.jpg" }));
    await expect(args.onCancel).toHaveBeenCalledWith("u2");
    await userEvent.click(within(tray).getByRole("button", { name: "Retry huge-master-file.psd" }));
    await expect(args.onRetry).toHaveBeenCalledWith("u5");
  },
});

/** Folded: the bar alone, for a long batch. */
export const Folded = meta.story({
  play: async ({ canvas, userEvent }) => {
    const header = canvas.getByRole("button", { expanded: true });
    await userEvent.click(header);
    await expect(header).toHaveAttribute("aria-expanded", "false");
  },
});

/** Every file in: the summary, Open on each, and Dismiss. */
export const Done = meta.story({
  args: { uploads: uploads.slice(0, 1).concat({ ...uploads[1], status: "done", loaded: uploads[1].size, assetId: "ast_hero" }) },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("2 files uploaded");
    await userEvent.click(canvas.getByRole("button", { name: "Dismiss uploads" }));
    await expect(args.onDismiss).toHaveBeenCalled();
  },
});

/** One refused: it waits to be read, with its reason. */
export const Failed = meta.story({
  args: { uploads: [uploads[0], uploads[4]] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("1 uploaded, 1 failed");
    await expect(canvas.getByText("Files over 2 GB can't be uploaded here")).toBeInTheDocument();
  },
});

/** Landed where the view doesn't show them (a filter excludes them): Show goes there. */
export const NotInView = meta.story({
  args: { uploads: [uploads[0]], missing: 1, onShowMissing: fn() },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Show" }));
    await expect(args.onShowMissing).toHaveBeenCalled();
  },
});

/** On a guest's upload page: in the page's flow, with that page's words. */
export const Inline = meta.story({
  args: { inline: true, uploads: uploads.slice(0, 1), labels: { done: "Sent", finished: (files) => `${files} sent for review` } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("1 file sent for review");
  },
});

/** Long names, cut in the middle so the extension stays. */
export const LongNames = meta.story({
  args: {
    uploads: [
      { id: "l1", name: "acme-northwind-co-branded-retail-window-display-final-v12-print-ready.tif", size: 412_000_000, loaded: 98_000_000, status: "uploading" },
      { id: "l2", name: "a-very-long-folder-name/with-a-nested-path/and-a-file-name-that-goes-on.psd", size: 1_000, loaded: 0, status: "queued" },
    ],
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

// ---- the whole flow --------------------------------------------------------------------------------

/**
 * A real batch through the store and putWithProgress, as the library sends one: three at a time, each a PUT to
 * storage that MSW slows down; `broken.psd` is refused once, and Retry sends it again.
 */
function Uploader() {
  const [store] = useState(uploadStore);
  const rows = useUploads(store);
  const send = async (u: Upload) => {
    store.patch(u.id, { status: "uploading", error: undefined, loaded: 0 });
    try {
      await putWithProgress(`/storage/put/${u.name}`, new File(["x".repeat(u.size)], u.name), "application/octet-stream", (loaded) => store.patch(u.id, { loaded }));
      store.patch(u.id, { status: "done", loaded: u.size, assetId: `ast_${u.id}` });
    } catch (e) {
      store.patch(u.id, { status: "failed", error: (e as Error).message });
    }
  };
  const start = () => {
    const batch: Upload[] = ["lookbook-01.jpg", "lookbook-02.jpg", "broken.psd"].map((name, i) => ({ id: `f${i}`, name, size: 200_000, loaded: 0, status: "queued" }));
    store.set(batch);
    batch.forEach((u) => void send(u));
  };
  return (
    <>
      <Button onClick={start}>Upload three files</Button>
      <UploadTray uploads={rows} onDismiss={() => store.set([])} onRetry={(id) => void send(rows.find((r) => r.id === id)!)} onOpen={fn()} />
    </>
  );
}

export const Flow = meta.story({
  beforeEach: ({ msw }) => {
    let refused = false;
    msw.use(
      http.put("/storage/put/:name", async ({ params }) => {
        await delay(300);
        if (params.name === "broken.psd" && !refused) {
          refused = true;
          return new HttpResponse(null, { status: 500 });
        }
        return new HttpResponse(null, { status: 200 });
      }),
    );
  },
  render: () => <Uploader />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Upload three files" }));
    const tray = await screen.findByRole("region", { name: "Uploads" });
    await waitFor(() => expect(within(tray).getByRole("status")).toHaveTextContent("2 uploaded, 1 failed"), { timeout: 4000 });
    await expect(within(tray).getByText("Storage rejected the upload")).toBeInTheDocument();
    await userEvent.click(within(tray).getByRole("button", { name: "Retry broken.psd" }));
    await waitFor(() => expect(within(tray).getByRole("status")).toHaveTextContent("3 files uploaded"), { timeout: 4000 });
  },
});
