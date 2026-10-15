import preview from "#.storybook/preview";
import { expect } from "storybook/test";
import { ExternalLink } from "@/components/external-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const meta = preview.meta({
  title: "App/Patterns/External link",
  component: ExternalLink,
  args: { children: "See it on BrandHub", href: "https://hub.artbucket.test/acme/acme", className: "text-primary-ink text-sm underline-offset-4 hover:underline" },
});

/** A new tab, the icon after its words, and "opens in a new tab" for a screen reader. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    const link = canvas.getByRole("link", { name: "See it on BrandHub (opens in a new tab)" });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noreferrer");
  },
});

/** Wrapped by a button or a badge (`asChild`), it stays one link. */
export const AsButtonAndBadge = meta.story({
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button asChild variant="outline" size="sm">
        <ExternalLink href="https://docs.artbucket.test">Docs</ExternalLink>
      </Button>
      <Badge asChild variant="secondary">
        <ExternalLink href="https://github.com/acme/brand">acme/brand</ExternalLink>
      </Badge>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("link")).toHaveLength(2);
  },
});

/** In a sentence: sized to its words. */
export const InText = meta.story({
  render: () => (
    <p className="max-w-sm text-sm">
      Portals answer at their own address, as{" "}
      <ExternalLink href="https://acme.artbucket.test" className="text-primary-ink underline underline-offset-4">
        acme.artbucket.page
      </ExternalLink>{" "}
      does, with every page the brand published.
    </p>
  ),
});
