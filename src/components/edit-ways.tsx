"use client";

import { CopyButton } from "@/components/copy-button";
import { IconBrandGit, IconCode, IconRobot } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DOCS_URL } from "@/lib/branding";

/** Where the ways lead on this server: its MCP address, and its Git integration's page for the brand, if it has one. */
export type Ways = { mcp: string; git: string | null };

/**
 * The three ways a brand's pages are edited, now that the guidelines builder
 * is retired (PRD part 2 SITE-12): by an agent over MCP, in Git (brand as
 * code), or ejected into a site of their own. Edit opens it over the pages
 * as readers see them.
 */
export function EditWays({ brand, ways, open, onOpenChange }: { brand: string; ways: Ways; open: boolean; onOpenChange: (open: boolean) => void }) {
  const prompt = `Add a do and don't section about the logo to the ${brand} brand's Logo page.`;
  const eject = `npx artbucket site eject ${brand}-guidelines --brand ${brand} --create`;
  const pull = `npx artbucket brand pull brand --brand ${brand}`;
  const command = (text: string, label: string) => (
    <span className="bg-muted flex min-w-0 items-center gap-1 rounded-md py-1 ps-2 pe-1">
      <code className="min-w-0 flex-1 truncate text-xs" title={text}>
        {text}
      </code>
      <CopyButton text={text} label={label} />
    </span>
  );
  const way = (icon: React.ReactNode, title: string, text: string, body: React.ReactNode, docs: string, more: string) => (
    <section className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
      <span className="bg-muted row-span-3 grid size-8 place-items-center rounded-lg">{icon}</span>
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="text-muted-foreground">{text}</p>
      </div>
      <div className="grid min-w-0 gap-1.5">{body}</div>
      <a href={docs} target="_blank" rel="noreferrer" className="text-primary justify-self-start text-sm underline-offset-4 hover:underline">
        {more}
      </a>
    </section>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit these pages</DialogTitle>
          <DialogDescription>The builder is read-only on this server. Rules, Theme and Release stay on the brand; its pages change one of three ways.</DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-5">
          {way(
            <IconRobot className="size-4" aria-hidden />,
            "With an agent",
            "Connect Claude or any MCP client to this server, then ask for the change.",
            <>
              {command(ways.mcp, "Copy the MCP address")}
              {command(prompt, "Copy the example")}
            </>,
            `${DOCS_URL}/developers/mcp`,
            "Connecting an agent",
          )}
          {way(
            <IconBrandGit className="size-4" aria-hidden />,
            "In Git",
            "Keep the brand as files in a repository, its pages as YAML, changed in pull requests.",
            ways.git ? (
              <Button asChild variant="outline" size="sm" className="justify-self-start">
                <a href={ways.git}>Connect a repository</a>
              </Button>
            ) : (
              command(pull, "Copy the command")
            ),
            `${DOCS_URL}/guides/brand-as-code`,
            "Brand as code",
          )}
          {way(
            <IconCode className="size-4" aria-hidden />,
            "Eject to code",
            "Make these pages a guidelines site of its own, built with the kit, in any framework.",
            command(eject, "Copy the command"),
            `${DOCS_URL}/developers/kit#eject-to-code`,
            "Eject to code",
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
