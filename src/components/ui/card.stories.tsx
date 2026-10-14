import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

const meta = { title: "App/Card", component: Card } satisfies Meta<typeof Card>;
export default meta;

export const Default: StoryObj<typeof meta> = {
  render: () => (
    <Card className="max-w-sm">
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
};
