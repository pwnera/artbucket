import preview from "#.storybook/preview";
import Link, { useLinkStatus } from "next/link";
import { expect, mocked } from "storybook/test";
import { IconBrandGit, IconPencil } from "@/components/icons";
import { LeavingLink, LinkIcon, LinkSpinner } from "@/components/link-pending";

const meta = preview.meta({
  title: "App/Patterns/Link pending",
  component: LinkIcon,
  args: { icon: <IconPencil aria-hidden /> },
  argTypes: { icon: { control: false } },
  render: (args) => (
    <Link href="/brand/acme/edit" className="inline-flex items-center gap-1.5 text-sm">
      <LinkIcon {...args} /> Edit
    </Link>
  ),
});

/** At rest: the link's own icon. */
export const Playground = meta.story({
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("[data-slot=spinner]")).toBeNull();
  },
});

/** Its page on the way (next/link's useLinkStatus): a spinner in the icon's box, so nothing moves. */
export const Pending = meta.story({
  beforeEach: () => void mocked(useLinkStatus).mockReturnValue({ pending: true }),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("[data-slot=spinner]")).toBeTruthy();
  },
});

/** A tab's link: a small spinner after its words while its page comes. */
export const TabSpinner = meta.story({
  beforeEach: () => void mocked(useLinkStatus).mockReturnValue({ pending: true }),
  render: () => (
    <Link href="/brand/acme/rules" className="inline-flex items-center gap-1.5 text-sm">
      Rules <LinkSpinner />
    </Link>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("[data-slot=spinner]")).toBeTruthy();
  },
});

/** Leaving the app (connect a repository): its icon spins from the click until the next page takes over. */
export const Leaving = meta.story({
  render: () => (
    <LeavingLink href="https://github.com/apps/acme-brand/installations/new" icon={<IconBrandGit aria-hidden />} className="inline-flex items-center gap-1.5 text-sm">
      Connect a repository
    </LeavingLink>
  ),
  play: async ({ canvas, userEvent }) => {
    const link = canvas.getByRole("link", { name: "Connect a repository" });
    await expect(link).not.toHaveAttribute("aria-busy");
    // The story stays put: stopped after the link has heard the click, as the page going would follow it.
    const stay = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("click", stay);
    await userEvent.click(link);
    window.removeEventListener("click", stay);
    await expect(link).toHaveAttribute("aria-busy", "true");
  },
});
