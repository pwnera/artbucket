"use client";

import Link from "next/link";
import { IconExternalLink, IconLock, IconPlus, IconUsers, IconWorld } from "@tabler/icons-react";
import type { Status } from "@/components/builder/use-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Portal = NonNullable<Status["portals"]>[number];

const ACCESS: Record<Portal["access"], { label: string; icon: React.ReactNode }> = {
  public: { label: "Anyone with the address", icon: <IconWorld aria-hidden /> },
  password: { label: "With a password", icon: <IconLock aria-hidden /> },
  members: { label: "People in this workspace", icon: <IconUsers aria-hidden /> },
};

/**
 * A brand's Portals tab: the portals showing it, who gets in and where they
 * are, the one BrandHub links as its guidelines marked. Portals are set up
 * on the Portals page, which Manage opens on this brand's.
 */
export function BrandPortals({ slug, portals, hub }: { slug: string; portals: Portal[]; hub: Status["hub"] }) {
  const linked = hub?.portal?.slug;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">Where people outside the team read the brand and take its files.</p>
        <div className="flex gap-2">
          {portals.length > 0 && (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/portals?${new URLSearchParams({ brand: slug })}`}>Manage</Link>
            </Button>
          )}
          <Button size="sm" asChild>
            <Link href={`/portals?${new URLSearchParams({ new: slug })}`}>
              <IconPlus aria-hidden /> New portal
            </Link>
          </Button>
        </div>
      </div>
      {portals.length === 0 ? (
        <p className="bg-card text-muted-foreground rounded-xl border p-4 text-sm">No portal shows this brand yet.</p>
      ) : (
        <ul className="bg-card divide-y rounded-xl border">
          {portals.map((p) => (
            <li key={p.slug} className="flex flex-wrap items-center gap-3 p-4">
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {p.name}
                  {p.slug === linked && <Badge variant="secondary">BrandHub links it</Badge>}
                </span>
                <a href={p.url} target="_blank" rel="noreferrer" className="text-muted-foreground inline-flex items-center gap-1 truncate text-sm hover:underline">
                  {p.url.replace(/^https?:\/\//, "")} <IconExternalLink aria-hidden className="size-3.5 shrink-0" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </div>
              <Badge variant="outline">
                {ACCESS[p.access].icon} {ACCESS[p.access].label}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
