"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/catalog";
import { IconComponents, IconExternalLink } from "@/components/icons";
import { AppHeader, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { ComponentDetail } from "@/lib/core/components";
import { ago, exact } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * Components: what the project's Storybooks document (GET /api/v1/components),
 * each at its current version with its story live beside it, framed from the
 * site's own address, and a component's page with every version, its preview
 * while its build is kept, and the sites built with it.
 */

type Detail = Omit<ComponentDetail, "versions"> & { versions: (Omit<ComponentDetail["versions"][number], "createdAt"> & { createdAt: string })[] };

/** A story, alone, as Storybook draws it: never interactive in a card, so the card stays a link. */
function Story({ src, title, className }: { src: string | null; title: string; className?: string }) {
  if (!src) return <div className={cn("bg-muted text-muted-foreground flex items-center justify-center text-xs", className)}>No preview for this one</div>;
  return <iframe src={src} title={title} loading="lazy" sandbox="allow-scripts allow-same-origin" className={cn("bg-background w-full border-0", className)} />;
}

/** A story's id from its name, as Storybook makes it from the export: "Logo Use" is ui-button--logo-use. */
const storyId = (slug: string, name: string) => `${slug}--${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

export function ComponentPage({ c }: { c: Detail }) {
  return (
    <>
      <AppHeader trail={[{ label: "Components", href: "/assets?in=component" }, { label: c.name }]} />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 pb-16 md:px-6">
        <ComponentView c={c} />
      </div>
    </>
  );
}

/**
 * One component in a panel over Explore (`?component=`), as an asset opens in
 * the viewer: the same view as its page, read from /api/v1/components/{id}.
 */
export function ComponentSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [shown, setShown] = useState<{ id: string; c: Detail | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    const ac = new AbortController();
    fetch(`/api/v1/components/${encodeURIComponent(id)}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : { data: null }))
      .then((b: { data: Detail | null }) => setShown({ id, c: b.data }))
      .catch(() => {});
    return () => ac.abort();
  }, [id]);
  const c = shown?.id === id ? shown.c : undefined;
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-4 pt-10 sm:max-w-4xl md:p-6 md:pt-10">
        <SheetTitle className="sr-only">{c?.name ?? "Component"}</SheetTitle>
        <SheetDescription className="sr-only">Its versions, its stories and what is built with it.</SheetDescription>
        {c === undefined ? (
          <Skeleton className="h-96 w-full" />
        ) : c ? (
          <div className="flex flex-col gap-6">
            <ComponentView c={c} wide={false} />
            <Button variant="outline" size="sm" className="self-start" asChild>
              <Link href={`/components/${c.id}`}>Open its page</Link>
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">This component can&apos;t be opened. It may be gone, or out of your reach.</p>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** A component: its stories at the version picked, every version, and what is built with each. `wide`: versions beside the story. */
function ComponentView({ c, wide = true }: { c: Detail; wide?: boolean }) {
  const current = c.versions.find((v) => v.status === "current") ?? c.versions[0];
  const [picked, setPicked] = useState(current?.id);
  const v = c.versions.find((x) => x.id === picked) ?? current;
  const [story, setStory] = useState<string | null>(null);
  const src = v?.preview && story ? v.preview.replace(/id=[^&]+/, `id=${encodeURIComponent(storyId(v.slug, story))}`) : (v?.preview ?? null);
  return (
    <>
      <PageHeader
        icon={<IconComponents />}
        title={c.name}
        description={`${c.title}, documented by ${c.site?.name ?? "its site"}${c.path === "/" ? "" : ` at ${c.path}`}.`}
        aside={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/catalog?o=${v?.id ?? c.id}&tab=lineage`}>Lineage</Link>
            </Button>
            {v?.storybook && (
              <Button size="sm" asChild>
                <a href={v.storybook} target="_blank" rel="noreferrer">
                  Open in Storybook <IconExternalLink />
                </a>
              </Button>
            )}
          </div>
        }
      />
      {v && (
        <div className={cn("grid gap-6", wide && "lg:grid-cols-[1fr_20rem]")}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">@{v.version}</Badge>
              <StatusBadge status={v.status} />
              {v.stories.map((s) => (
                <Button key={s} size="xs" variant={(story ?? v.stories[0]) === s ? "secondary" : "ghost"} onClick={() => setStory(s)}>
                  {s}
                </Button>
              ))}
            </div>
            <div className="overflow-hidden rounded-lg border">
              <Story key={src ?? v.id} src={src} title={`${c.name} @${v.version}`} className="h-[28rem]" />
            </div>
            {!v.preview && <p className="text-muted-foreground text-xs">The build that held @{v.version} is no longer kept, so only its record remains.</p>}
          </div>
          <section className="space-y-2">
            <h2 className="font-display text-sm font-semibold">
              Versions <span className="text-muted-foreground font-normal tabular-nums">{c.versions.length}</span>
            </h2>
            <ol className="divide-y rounded-lg border">
              {c.versions.map((x) => (
                <li key={x.id}>
                  {/* eslint-disable-next-line no-restricted-syntax -- A raw button: the version's three lines together are the hit target. */}
                  <button
                    type="button"
                    onClick={() => {
                      setPicked(x.id);
                      setStory(null);
                    }}
                    className={cn("hover:bg-muted/50 w-full space-y-1 px-3 py-2.5 text-start text-sm", x.id === v.id && "bg-muted")}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-medium tabular-nums">@{x.version}</span>
                      <StatusBadge status={x.status} />
                      <span className="text-muted-foreground ms-auto text-xs" title={exact(x.createdAt)} suppressHydrationWarning>
                        {ago(x.createdAt)}
                      </span>
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {x.createdBy}
                      {x.stories.length ? ` · ${x.stories.length} ${x.stories.length === 1 ? "story" : "stories"}` : ""}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {x.usedBy.length ? `Built into ${x.usedBy.map((u) => u.name).join(", ")}` : "Nothing built with it"}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </>
  );
}
