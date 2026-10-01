"use client";

import { IconBrandGit } from "@tabler/icons-react";
import type { Source } from "@/components/builder/use-status";
import { CopyButton } from "@/components/copy-button";
import { ExternalLink } from "@/components/external-link";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** "github.com/acme/brand", as a repository's address reads. */
export const repoName = (remote: string) => remote.replace(/^https?:\/\//, "").replace(/\.git$/, "");

/** Whether the brand here and its repository say the same, in words: the trigger's label and its tooltip. */
export const repoLabel = (s: NonNullable<Source["source"]>) => (s.pending ? `Changes here not yet in ${repoName(s.remote)}` : `In step with ${repoName(s.remote)}`);

/** The repository the brand is kept in too: where, at which commit, whether the edits made here have reached it. */
export function RepositoryDetails({ source: s, manage }: { source: NonNullable<Source["source"]>; manage: string | null }) {
  return (
    <>
      <p className="font-medium">Kept in a repository</p>
      <ExternalLink href={s.remote} className="truncate underline underline-offset-2">
        {repoName(s.remote)}
      </ExternalLink>
      <p className="text-muted-foreground text-xs">
        {s.branch}
        {s.path ? `, in ${s.path}/` : ""}
        {s.commit ? `, at ${s.commit.slice(0, 7)}` : ""}
      </p>
      <p className="text-muted-foreground text-xs">
        {s.pending
          ? "Edits made here since the last sync go to the repository next: as a commit, or a pull request to review."
          : "The brand here and its files say the same. Changes merged there come here, and edits here go there."}
      </p>
      {manage && (
        <a href={manage} className="text-xs underline underline-offset-2">
          Manage the connection
        </a>
      )}
    </>
  );
}

/** The dot on a Git button while edits made here wait to reach the repository. */
export const PendingDot = ({ className = "-top-0.5 -end-0.5" }: { className?: string }) => (
  <span className={cn("bg-warning ring-background absolute size-2 rounded-full ring-2", className)}>
    <span className="sr-only">(changes to sync)</span>
  </span>
);

/**
 * Brand as code in a brand's header: the repository it is kept in, a popover
 * of where and whether in step; else Connect Git, where the server has a Git
 * integration and this person may connect one; else, for an editor, how to
 * keep it in Git with the CLI. `compact`: the icon alone, its words its tooltip.
 */
export function GitSource({ source, slug, editor, compact }: { source: Source | null; slug: string; editor: boolean; compact?: boolean }) {
  if (!source) return null;
  const s = source.source;
  if (!s && source.connect)
    return (
      <Button asChild size="sm" variant="outline" title={compact ? "Connect Git" : "Keep this brand in a Git repository"}>
        <a href={source.connect}>
          <IconBrandGit aria-hidden /> <span className={compact ? "sr-only" : undefined}>Connect Git</span>
        </a>
      </Button>
    );
  if (!s && !editor) return null;
  const pull = `artbucket brand pull brand --brand ${slug} --assets`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="relative" title={s ? repoLabel(s) : "Keep this brand in Git"}>
          <IconBrandGit aria-hidden />
          <span className={cn(compact ? "sr-only" : "max-w-40 truncate")}>{s ? repoName(s.remote).split("/").slice(1).join("/") || repoName(s.remote) : "Git"}</span>
          {s?.pending && <PendingDot />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-80 gap-2 p-3 text-sm">
        {s ? (
          <RepositoryDetails source={s} manage={source.connect} />
        ) : (
          <>
            <p className="font-medium">Keep this brand in Git</p>
            <p className="text-muted-foreground text-xs">Its rules, pages and theme as YAML beside its files, reviewed in pull requests. Pull it with the CLI, then push what the repository changes.</p>
            <div className="bg-muted/60 flex items-center gap-1 rounded-md border ps-2.5">
              <code className="w-0 min-w-0 flex-1 truncate py-1.5 text-xs">{pull}</code>
              <CopyButton text={pull} label="Copy the command" what="the command" />
            </div>
            <ExternalLink href="https://docs.artbucket.io/guides/brand-as-code" className="text-xs underline underline-offset-2">
              Brand as code
            </ExternalLink>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
