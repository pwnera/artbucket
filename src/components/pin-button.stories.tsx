import preview from "#.storybook/preview";
import { expect } from "storybook/test";
import { PinButton } from "@/components/pin-button";

const pin = { id: "col_logos", type: "collection" as const, label: "Acme logos", href: "/assets?collection=col_logos" };

const meta = preview.meta({
  title: "App/Patterns/Pin button",
  component: PinButton,
  args: { pin, size: "icon-sm" as const },
  argTypes: { size: { control: "select", options: ["icon-xs", "icon-sm", "icon"] } },
  // Pins are kept per browser: each story starts with none (no organization outside the app, so "none").
  beforeEach: () => {
    localStorage.removeItem("artbucket:pinned:none");
    return () => localStorage.removeItem("artbucket:pinned:none");
  },
});

/** A press toggles it, and its name says what the next press does. */
export const Playground = meta.story({
  play: async ({ canvas, userEvent }) => {
    const button = canvas.getByRole("button", { name: "Pin Acme logos to the sidebar" });
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(button);
    await expect(canvas.getByRole("button", { name: "Unpin Acme logos" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Unpin Acme logos" }));
    await expect(canvas.getByRole("button", { name: "Pin Acme logos to the sidebar" })).toBeInTheDocument();
  },
});

/** Already pinned: the filled pin, in the accent. */
export const Pinned = meta.story({
  beforeEach: () => localStorage.setItem("artbucket:pinned:none", JSON.stringify([pin])),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Unpin Acme logos" })).toHaveAttribute("aria-pressed", "true");
  },
});

/** The catalog's object header, a size up. */
export const Large = meta.story({ args: { size: "icon" } });
