"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconHistory, IconWorldUpload } from "@tabler/icons-react";
import { ReleaseForm } from "@/components/builder/publish-dialog";
import type { Status } from "@/components/builder/use-status";
import { useCan } from "@/components/can";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Update } from "@/lib/history";
import { sendResult } from "@/lib/send";
import { brandPath, guidelinesPath } from "@/lib/site";
import { ago, exact } from "@/lib/time";

/**
 * A brand's Releases tab (the prototype's "Publish a release"): the releases
 * readers got, newest first, each with its note and what it changed, and the
 * form that publishes the next one at /brands/{slug}/releases/new.
 */


const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** What a release changed, in a line: "2 new rules, 1 rule changed, 3 pages edited". */
function changed({ rules, pages }: Update["changes"]) {
  const said = [
    rules.added.length && `${count(rules.added.length, "new rule")}`,
    rules.changed.length && `${count(rules.changed.length, "rule")} changed`,
    rules.removed.length && `${count(rules.removed.length, "rule")} removed`,
    pages.added.length && `${count(pages.added.length, "new page")}`,
    pages.changed.length && `${count(pages.changed.length, "page")} edited`,
    pages.removed.length && `${count(pages.removed.length, "page")} removed`,
  ].filter(Boolean);
  return said.length ? said.join(", ") : "Nothing readers would notice";
}

/** The Releases tab's list. `pending`: there are changes since the latest release. */
export function ReleaseList({ slug, updates, pending }: { slug: string; updates: Update[]; pending: boolean }) {
  const can = useCan();
  const edit = can("brand.edit");
  return (
    <div className="grid gap-4">
      {(pending || !updates.length) && (
        <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
          <p className="text-sm">
            {updates.length ? `There are changes since @${updates[0].version} that readers don't see yet.` : "Never released: portals and BrandHub show nothing of it yet."}
          </p>
          {edit && (
            <Button asChild size="sm">
              <Link href={brandPath(slug, "/releases/new")}>
                <IconWorldUpload aria-hidden /> Publish release
              </Link>
            </Button>
          )}
        </div>
      )}
      {updates.length > 0 && (
        <ol className="bg-card divide-y rounded-xl border">
          {updates.map((u, i) => (
            <li key={u.version} className="grid gap-1 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={i ? "secondary" : "default"}>@{u.version}</Badge>
                {i === 0 && <span className="text-muted-foreground text-xs">Latest: what readers see</span>}
                <span className="text-muted-foreground ms-auto text-xs" title={exact(u.publishedAt)}>
                  {u.publishedBy ? `${u.publishedBy}, ` : ""}
                  {ago(u.publishedAt)}
                </span>
              </div>
              {u.note && <p className="text-sm whitespace-pre-line">{u.note}</p>}
              <p className="text-muted-foreground text-xs">{changed(u.changes)}</p>
            </li>
          ))}
        </ol>
      )}
      {edit && (
        <Link href={guidelinesPath(slug, { panel: "history" })} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 justify-self-start text-sm">
          <IconHistory aria-hidden className="size-4" /> Every version, released or not
        </Link>
      )}
    </div>
  );
}

const transport = (method: string, url: string, body?: unknown) => sendResult(method, url, body, { quiet: true });

/**
 * Publish a release, as a page: the builder's release form (ReleaseForm)
 * with the brand's status read on the server. Cancel goes back to the
 * brand; Done, to its releases.
 */
export function NewRelease({ slug, name, status, comments }: { slug: string; name: string; status: Status | null; comments: number }) {
  const router = useRouter();
  return (
    <div className="bg-card rounded-xl border p-5">
      <ReleaseForm
        host={{
          brand: slug,
          name,
          transport,
          status,
          comments: { open: comments, review: guidelinesPath(slug) },
          released: () => router.refresh(),
        }}
        onClose={() => router.push(brandPath(slug))}
        onDone={() => router.push(brandPath(slug, "/releases"))}
      />
    </div>
  );
}
