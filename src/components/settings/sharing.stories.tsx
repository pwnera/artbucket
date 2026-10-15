import preview from "#.storybook/preview";
import { expect, screen, waitFor } from "storybook/test";
import { me, recorder, withMe } from "#.storybook/fixtures/brands";
import { shareLink } from "#.storybook/fixtures/library";
import { Sharing } from "@/components/settings/access";

const sent = recorder();
const collections = [
  { id: "col_press", name: "Press kit" },
  { id: "col_launch", name: "Spring launch 2026" },
];
const shares = [
  shareLink(),
  shareLink({ id: "shr_upload", kind: "upload", name: "Agency uploads", target: { type: "collection", id: "col_launch", label: "Spring launch 2026" }, password: true, expiresAt: null }),
  shareLink({ id: "shr_old", name: "Retail partners 2025", expired: true }),
];

const meta = preview.meta({
  title: "App/Features/Settings/Share links",
  component: Sharing,
  args: { shares, collections },
  decorators: [withMe(me)],
  beforeEach: () => sent.reset(),
});

/** A collection shown, uploads collected behind a password, and one expired (nothing to email). */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Expired")).toBeInTheDocument();
    await expect(canvas.getAllByRole("button", { name: "Email it to people" })).toHaveLength(2);
  },
});

/** None yet: what links are for. */
export const Empty = meta.story({ args: { shares: [] } });

/** Revoking asks, then deletes the link. */
export const Revoke = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("delete", "/api/v1/shares/:id", {})),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Revoke Agency uploads" }));
    await userEvent.click(await screen.findByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(sent.last("DELETE")).toEqual({ path: "/api/v1/shares/shr_upload", body: null }));
    await expect(await screen.findByText("Revoked: the link no longer works")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(), { timeout: 5000 });
  },
});

/** Refused: the dialog stays, with the API's message, to try again. */
export const RevokeFails = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("delete", "/api/v1/shares/:id", { code: "forbidden", message: "Only who made it, or an admin, can revoke it" }, 422)),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Revoke Agency uploads" }));
    await userEvent.click(await screen.findByRole("button", { name: "Revoke" }));
    await expect(await screen.findByText("Only who made it, or an admin, can revoke it")).toBeInTheDocument();
    await expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(), { timeout: 5000 });
  },
});

/** Without email on the server: no Email it, only the link to copy. */
export const NoEmail = meta.story({
  decorators: [withMe({ ...me, email: false })],
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Email it to people" })).not.toBeInTheDocument();
  },
});

export const LongNames = meta.story({
  args: { shares: [shareLink({ name: "Spring launch 2026 press photography for regional retail partners in EMEA and APAC" })] },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
