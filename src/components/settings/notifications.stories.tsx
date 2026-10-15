import preview from "#.storybook/preview";
import { expect, screen, waitFor } from "storybook/test";
import { recorder } from "#.storybook/fixtures/brands";
import { NotificationsPanel } from "@/components/settings/panels";

const sent = recorder();

const meta = preview.meta({
  title: "App/Features/Settings/Notifications",
  component: NotificationsPanel,
  args: { weekly: true },
  beforeEach: () => sent.reset(),
});

/** The weekly digest, on: switching it off saves at once. */
export const Playground = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("patch", "/api/v1/me/digest", { weekly: false })),
  play: async ({ canvas, userEvent }) => {
    const toggle = canvas.getByRole("switch", { name: "Email me the weekly digest" });
    await userEvent.click(toggle);
    await waitFor(() => expect(sent.last("PATCH")).toEqual({ path: "/api/v1/me/digest", body: { weekly: false } }));
    await expect(await screen.findByText("No more weekly digest")).toBeInTheDocument();
    await expect(toggle).not.toBeChecked();
  },
});

/** Refused: the API's message, and the switch stays where it was. */
export const SaveFails = meta.story({
  args: { weekly: false },
  beforeEach: ({ msw }) => void msw.use(sent.on("patch", "/api/v1/me/digest", { code: "invalid", message: "Email is off on this server" }, 422)),
  play: async ({ canvas, userEvent }) => {
    const toggle = canvas.getByRole("switch", { name: "Email me the weekly digest" });
    await userEvent.click(toggle);
    await expect(await screen.findByText("Email is off on this server")).toBeInTheDocument();
    await expect(toggle).not.toBeChecked();
  },
});
