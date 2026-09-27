"use client";

import Link from "next/link";
import { useState } from "react";
import {
  IconActivity,
  IconArchive,
  IconArrowBackUp,
  IconBook,
  IconCheck,
  IconPlus,
  IconRobot,
  IconSparkles,
  IconStack2,
  IconTag,
  IconTrash,
  IconUser,
  IconX,
  type Icon,
} from "@tabler/icons-react";
import { call, curl, ForAgents } from "@/components/agent-access";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/brand";
import { brandHref } from "@/components/brand-switcher";
import { LibraryTabs, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ruleLabel } from "@/lib/rules";
import type { SidebarData } from "@/lib/sidebar";
import { ago, day, exact } from "@/lib/time";

type Item = {
  id: string;
  at: string;
  actor: string;
  agent: boolean;
  verb:
    | "added"
    | "suggested"
    | "approved"
    | "rejected"
    | "deleted"
    | "suggested_tags"
    | "archived"
    | "unarchived"
    | "made_current"
    | "edited_rules"
    | "restored_rules";
  label: string;
  assetId: string | null;
  brand: { slug: string; name: string; version: number } | null;
  detail: { tags?: string[]; note?: string; version?: number; rules?: string[]; summary?: string } | null;
};
export type Page = { data: Item[]; next: string | null };

const VERB: Record<Item["verb"], { icon: Icon; says: string }> = {
  added: { icon: IconPlus, says: "added" },
  suggested: { icon: IconSparkles, says: "suggested" },
  approved: { icon: IconCheck, says: "approved" },
  rejected: { icon: IconX, says: "rejected" },
  deleted: { icon: IconTrash, says: "deleted" },
  suggested_tags: { icon: IconTag, says: "suggested tags for" },
  archived: { icon: IconArchive, says: "archived" },
  unarchived: { icon: IconArrowBackUp, says: "unarchived" },
  made_current: { icon: IconStack2, says: "made current" },
  edited_rules: { icon: IconBook, says: "edited the guidelines of" },
  restored_rules: { icon: IconBook, says: "restored an earlier version of" },
};


/**
 * Who did what, PostHog style: every asset added, suggested, approved,
 * rejected or deleted, and every change to a brand's rules, newest first,
 * grouped by day. Agents are named by their key, so what each one did is
 * one glance away.
 */
export function ActivityFeed({ first, sidebar }: { first: Page; sidebar: SidebarData }) {
  const [items, setItems] = useState(first.data);
  const [next, setNext] = useState(first.next);
  const [busy, setBusy] = useState(false);
  const [who, setWho] = useState<"all" | "agents" | "people">("all");

  async function more() {
    if (!next) return;
    setBusy(true);
    const res = await fetch(`/api/v1/activity?before=${encodeURIComponent(next)}`);
    setBusy(false);
    if (!res.ok) return;
    const page: Page = await res.json();
    setItems((xs) => [...xs, ...page.data.filter((p) => !xs.some((x) => x.id === p.id))]);
    setNext(page.next);
  }

  const shown = items.filter((i) => who === "all" || (who === "agents") === i.agent);
  const days = new Map<string, Item[]>();
  for (const i of shown) days.set(day(i.at), [...(days.get(day(i.at)) ?? []), i]);

  return (
    <SidebarProvider>
      <AppSidebar
        me={sidebar.me}
        collections={sidebar.collections}
        brands={sidebar.brands}
        searches={sidebar.searches}
        reviewCount={sidebar.reviewCount}
      />
      <SidebarInset className="min-w-0">
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <span className="text-sm font-semibold">Library</span>
          <ForAgents
            className="ml-auto"
            about="The same feed for a script or an agent: who did what, newest first, one page at a time."
            reads={(origin) => [
              { label: "REST", text: curl(`${origin}/api/v1/activity`) },
              { label: "An agent's own proposals, and your decisions", text: call("my_proposals") },
            ]}
          />
          <ThemeToggle />
        </header>
        <div className="flex flex-1 flex-col gap-4 px-4 pb-10 md:px-6">
          <LibraryTabs at="activity" reviewCount={sidebar.reviewCount} />
          <PageHeader
            icon={<IconActivity />}
            title="Activity"
            description="Who did what, newest first. People go by their name, agents by the name of their key."
          >
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={who}
              onValueChange={(v) => v && setWho(v as typeof who)}
              aria-label="Show"
            >
              <ToggleGroupItem value="all" className="px-3">
                All
              </ToggleGroupItem>
              <ToggleGroupItem value="agents" className="px-3">
                Agents
              </ToggleGroupItem>
              <ToggleGroupItem value="people" className="px-3">
                People
              </ToggleGroupItem>
            </ToggleGroup>
          </PageHeader>

          {shown.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconActivity />
                </EmptyMedia>
                <EmptyTitle>Nothing yet</EmptyTitle>
                <EmptyDescription>
                  Uploads, suggestions, review decisions and brand rule changes show up here as they happen.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-6">
              {[...days].map(([when, list]) => (
                <section key={when} className="space-y-1">
                  <h2 className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase" suppressHydrationWarning>
                    {when}
                  </h2>
                  <ul className="divide-y rounded-lg border">
                    {list.map((i) => (
                      <Row key={i.id} item={i} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {next ? (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" disabled={busy} onClick={more}>
                Load older
              </Button>
            </div>
          ) : (
            shown.length > 0 && <p className="text-muted-foreground text-center text-sm">That&apos;s everything.</p>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function Row({ item: i }: { item: Item }) {
  const { icon: I, says } = VERB[i.verb];
  const agent = i.agent;
  const target = i.brand ? (
    <Link href={brandHref({ slug: i.brand.slug, default: false })} className="font-medium hover:underline">
      {i.label}
    </Link>
  ) : i.assetId && i.verb !== "deleted" ? (
    <Link href={`/?asset=${i.assetId}`} className="font-medium hover:underline">
      {i.label}
    </Link>
  ) : (
    <span className="font-medium">{i.label}</span>
  );
  return (
    <li className="flex items-start gap-3 px-3 py-2.5 text-sm">
      <span className="bg-muted text-muted-foreground mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full">
        <I className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="leading-6">
          <span className="inline-flex items-center gap-1 font-medium">
            {agent ? <IconRobot className="text-primary size-4" /> : <IconUser className="text-muted-foreground size-4" />}
            {i.actor === "web" ? "Web app" : i.actor}
          </span>{" "}
          <span className="text-muted-foreground">{says}</span> {target}
          {i.detail?.version && <span className="text-muted-foreground"> (version {i.detail.version})</span>}
        </p>
        {i.detail?.note && <p className="text-muted-foreground text-xs">&ldquo;{i.detail.note}&rdquo;</p>}
        {i.detail?.tags && (
          <div className="flex flex-wrap gap-1">
            {i.detail.tags.map((t) => (
              <Badge key={t} variant="outline" className="border-dashed font-normal">
                {t}
              </Badge>
            ))}
          </div>
        )}
        {i.detail?.rules && i.detail.rules.length > 0 && (
          <p className="text-muted-foreground text-xs">
            {i.detail.rules.slice(0, 4).map(ruleLabel).join(", ")}
            {i.detail.rules.length > 4 && ` and ${i.detail.rules.length - 4} more`} · version {i.brand?.version}
          </p>
        )}
      </div>
      <time dateTime={i.at} title={exact(i.at)} className="text-muted-foreground shrink-0 text-xs" suppressHydrationWarning>
        {ago(i.at)}
      </time>
    </li>
  );
}
