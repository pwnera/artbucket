import preview from "#.storybook/preview";
import { expect } from "storybook/test";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

/** A bordered surface for one thing: a collection, a plan, a setting with its own actions. */
const meta = preview.meta({
  title: "App/Primitives/Card",
  component: Card,
  args: { className: "max-w-sm" },
});

export const Default = meta.story({
  render: (args) => (
    <Card {...args}>
      <CardHeader>
        <CardTitle>Spring campaign</CardTitle>
        <CardDescription>48 assets, 3 waiting for review</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm">
            Open
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">Shared with two agencies until 30 November.</CardContent>
      <CardFooter className="gap-2">
        <Button size="sm">Review</Button>
        <Button size="sm" variant="outline">
          Share
        </Button>
      </CardFooter>
    </Card>
  ),
  play: async ({ canvas }) => {
    // The action sits beside the title, not under it.
    const title = canvas.getByText("Spring campaign").getBoundingClientRect();
    const open = canvas.getByRole("button", { name: "Open" }).getBoundingClientRect();
    await expect(open.left).toBeGreaterThan(title.right);
  },
});

/** Header and content only: no action, no footer. */
export const Simple = meta.story({
  render: (args) => (
    <Card {...args}>
      <CardHeader>
        <CardTitle>Storage</CardTitle>
        <CardDescription>12.4 GB of 50 GB used</CardDescription>
      </CardHeader>
    </Card>
  ),
});

/** A long title wraps under the action instead of running beneath it. */
export const LongText = meta.story({
  render: (args) => (
    <Card {...args}>
      <CardHeader>
        <CardTitle>Northwind autumn launch, press kit and partner assets for the retail rollout</CardTitle>
        <CardDescription>Everything the agencies need, cleared for web and print until the end of the season.</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm">
            Open
          </Button>
        </CardAction>
      </CardHeader>
    </Card>
  ),
});

export const Phone = Default.extend({ globals: { viewport: { value: "phone" } } });

export const Dark = Default.extend({ globals: { theme: "dark" } });
