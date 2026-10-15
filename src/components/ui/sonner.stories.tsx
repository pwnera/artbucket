import preview from "#.storybook/preview";
import { toast } from "sonner";
import { expect, fn, screen, waitFor } from "storybook/test";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

/**
 * What just happened, for a few seconds, at the bottom center: a save, a failure, an Undo. The Toaster is mounted
 * once (in the app's layout, and in every story); anything calls `toast()`. Never for something the person must read
 * or act on: that stays on the page.
 */
const meta = preview.meta({
  title: "App/Primitives/Sonner",
  component: Toaster,
  // Toasts are global: each story starts with none.
  beforeEach: () => {
    toast.dismiss();
  },
});

const onUndo = fn();

/** The grouped story's pair. */
export const Toast = meta.story({
  render: () => (
    <div className="flex gap-2">
      <Button onClick={() => toast.success("Released: everyone sees version 36 now")}>Success</Button>
      <Button variant="outline" onClick={() => toast.error("That logo was replaced: use version 4")}>
        Error
      </Button>
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Success" }));
    await expect(await screen.findByText("Released: everyone sees version 36 now")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Error" }));
    const error = await screen.findByText("That logo was replaced: use version 4");
    // Every toast can be closed by hand.
    const toastEl = error.closest("[data-sonner-toast]") as HTMLElement;
    await userEvent.click(toastEl.querySelector("button[data-close-button]")!);
    await waitFor(() => expect(screen.queryByText("That logo was replaced: use version 4")).not.toBeInTheDocument());
  },
});

/** An action on the toast: Undo for what was done without asking. */
export const Action = meta.story({
  beforeEach: () => void onUndo.mockClear(),
  render: () => (
    <Button variant="outline" onClick={() => toast("Archived 3 assets", { action: { label: "Undo", onClick: onUndo } })}>
      Archive
    </Button>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Archive" }));
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await expect(onUndo).toHaveBeenCalledOnce();
  },
});

/** A promise: a spinner while it runs, then what came of it. */
export const Promise_ = meta.story({
  name: "Promise",
  render: () => (
    <div className="flex gap-2">
      <Button
        onClick={() =>
          toast.promise(new Promise((r) => setTimeout(r, 300)), { loading: "Releasing", success: "Released: everyone sees version 37 now", error: "Couldn't release" })
        }
      >
        Release
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.promise(new Promise((_, no) => setTimeout(() => no(new Error("offline")), 300)), {
            loading: "Uploading",
            success: "Uploaded",
            error: (e: Error) => `Couldn't upload: ${e.message}`,
          })
        }
      >
        Upload
      </Button>
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Release" }));
    await expect(await screen.findByText("Releasing")).toBeInTheDocument();
    await expect(await screen.findByText("Released: everyone sees version 37 now")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Upload" }));
    await expect(await screen.findByText("Couldn't upload: offline")).toBeInTheDocument();
  },
});

/** Every kind, with its icon. */
export const Kinds = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => toast("Link copied")}>
        Default
      </Button>
      <Button variant="outline" onClick={() => toast.info("Acme's brand was released by Dana")}>
        Info
      </Button>
      <Button variant="outline" onClick={() => toast.warning("2 assets expire this week")}>
        Warning
      </Button>
      <Button variant="outline" onClick={() => toast.success("Saved", { description: "Readers see it on the next release." })}>
        With description
      </Button>
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "With description" }));
    await expect(await screen.findByText("Readers see it on the next release.")).toBeInTheDocument();
  },
});

export const Dark = Kinds.extend({ globals: { theme: "dark" } });
