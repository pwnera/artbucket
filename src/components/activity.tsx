"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import {
  IconActivity,
  IconArchive,
  IconArrowBackUp,
  IconBook,
  IconCheck,
  IconChevronRight,
  IconPlus,
  IconRobot,
  IconSparkles,
  IconStack2,
  IconTag,
  IconTrash,
  IconX,
  type Icon,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { call, curl, ForAgents } from "@/components/agent-access";
import { brandHref } from "@/components/brand-switcher";
import { useCan, useMe } from "@/components/can";
import { AppHeader, LibraryTabs, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useShell } from "@/components/shell";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ActivityVerb } from "@/lib/db/schema";
import { ruleLabel } from "@/lib/rules";
import { send } from "@/lib/send";
import { ago, day, exact } from "@/lib/time";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  at: string;
  actor: string;
  agent: boolean;
  // The schema's verbs, so a new one is a compile error in VERB below; the two rule verbs come from brand_versions.
  verb: ActivityVerb | "edited_rules" | "restored_rules" | "published";
  label: string;
  assetId: string | null;
  brand: { slug: string; name: string; version: number } | null;
  detail: { tags?: string[]; fields?: string[]; note?: string; version?: number; rules?: string[]; summary?: string } | null;
};
export type Page = { data: Item[]; next: string | null };

const VERB: Record<Item["verb"], { icon: Icon; says: string }> = {
  added: { icon: IconPlus, says: "added" },
  suggested: { icon: IconSparkles, says: "suggested" },
  approved: { icon: IconCheck, says: "approved" },
  rejected: { icon: IconX, says: "rejected" },
  deleted: { icon: IconTrash, says: "deleted" },
  restored: { icon: IconArrowBackUp, says: "restored" },
  suggested_tags: { icon: IconTag, says: "suggested tags for" },
  suggested_fields: { icon: IconTag, says: "suggested values for" },
  archived: { icon: IconArchive, says: "archived" },
  unarchived: { icon: IconArrowBackUp, says: "unarchived" },
  made_current: { icon: IconStack2, says: "made current" },
  edited_rules: { icon: IconBook, says: "edited the guidelines of" },
  restored_rules: { icon: IconBook, says: "restored an earlier version of" },
  published: { icon: IconBook, says: "published the guidelines of" },
};
// What an unknown verb from a newer server reads as, rather than a crash.
const SOMETHING = { icon: IconActivity, says: "changed" };

// ---- shared by every feed: pages, days, faces ---------------------------------

/** One page, as the API's own default: send() hands back `data` only, so a full page is what says there may be more. */
const PAGE = 50;

/** A feed's pages, older on demand, with its errors toasted like any request's. */
export function useFeed<T extends { id: string; at: string }>(path: string, first: { data: T[]; next: string | null }) {
  const [items, setItems] = useState(first.data);
  const [next, setNext] = useState(first.next);
  const [busy, setBusy] = useState(false);
  async function more() {
    if (!next || busy) return;
    setBusy(true);
    const page: T[] | null = await send("GET", `${path}?before=${encodeURIComponent(next)}&limit=${PAGE}`);
    setBusy(false);
    if (!page) return;
    setItems((xs) => [...xs, ...page.filter((p) => !xs.some((x) => x.id === p.id))]);
    setNext(page.length === PAGE ? page.at(-1)!.at : null);
  }
  return { items, setItems, next, busy, more };
}

const never = () => () => {};

/**
 * A feed under day headings that stay pinned below the page's header. The
 * server's zone is nobody's, so the server and the first paint group in UTC
 * and agree; once hydrated, it regroups in the reader's own zone.
 */
export function DayGroups<T extends { id: string; at: string }>({ items, children }: { items: T[]; children: (list: T[]) => React.ReactNode }) {
  const local = useSyncExternalStore(never, () => true, () => false);
  const days = new Map<string, T[]>();
  for (const i of items) {
    const d = day(i.at, undefined, local ? undefined : "UTC");
    days.set(d, [...(days.get(d) ?? []), i]);
  }
  return (
    <div className="space-y-6">
      {[...days].map(([when, list]) => (
        <section key={when} className="space-y-1">
          <h2
            className="bg-background/95 supports-[backdrop-filter]:bg-background/80 text-muted-foreground sticky top-14 z-[5] -mx-1 px-2 py-1.5 text-xs font-medium tracking-wide uppercase backdrop-blur"
            suppressHydrationWarning
          >
            {when}
          </h2>
          <ul className="divide-y rounded-lg border">{children(list)}</ul>
        </section>
      ))}
    </div>
  );
}

// Tokens only, so every tint follows the theme and a white label's accent.
const TINTS = [
  "bg-primary/15 text-primary-ink",
  "bg-success/15 text-success",
  "bg-warning/15 text-warning",
  "bg-foreground/10 text-foreground",
  "bg-muted-foreground/20 text-foreground",
  "bg-primary/25 text-foreground",
];

/** Someone's initials on a tint of their own: the same person gets the same color on every list. */
export function Initials({ name, seed = name, className }: { name: string; seed?: string; className?: string }) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const letters = name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={cn("text-2xs flex size-7 shrink-0 items-center justify-center rounded-full font-semibold", TINTS[h % TINTS.length], className)}
    >
      {letters}
    </span>
  );
}

// ---- activity -----------------------------------------------------------------

type Who = "all" | "agents" | "people";

/** Runs of one actor doing one thing to assets, no notes between: "Claude suggested 12 assets", one row. */
function bursts(list: Item[]) {
  const out: Item[][] = [];
  for (const i of list) {
    const run = out.at(-1);
    const head = run?.[0];
    const joins = head && !head.brand && !i.brand && !head.detail?.note && !i.detail?.note;
    if (joins && head.actor === i.actor && head.agent === i.agent && head.verb === i.verb) run!.push(i);
    else out.push([i]);
  }
  return out;
}

/**
 * Who did what, PostHog style: every asset added, suggested, approved,
 * rejected, deleted or restored, and every change to a brand's rules, newest
 * first, grouped by day. Agents are named by their key, so what each one did
 * is one glance away. The filter is in the URL (`?who=`).
 */
export function ActivityFeed({ first }: { first: Page }) {
  const { reviewCount } = useShell();
  const can = useCan();
  const me = useMe();
  const params = useSearchParams();
  const { items, setItems, next, busy, more } = useFeed("/api/v1/activity", first);
  const [restoring, setRestoring] = useState<string | null>(null);
  // Deletes restore for 30 days; past that the button would only fail. Fixed at mount, so renders agree.
  const [cutoff] = useState(() => Date.now() - 30 * 86_400_000);
  const raw = params.get("who");
  const who: Who = raw === "agents" || raw === "people" ? raw : "all";

  function filter(v: Who) {
    const q = new URLSearchParams(params);
    if (v === "all") q.delete("who");
    else q.set("who", v);
    // Next keeps useSearchParams in step with the native history: no server round trip.
    window.history.replaceState(null, "", q.size ? `?${q}` : window.location.pathname);
  }

  const restorable = (i: Item) =>
    i.verb === "deleted" &&
    !!i.assetId &&
    can("asset.delete") &&
    new Date(i.at).getTime() > cutoff &&
    !items.some((x) => x.verb === "restored" && x.assetId === i.assetId && x.at > i.at);

  async function restore(i: Item) {
    setRestoring(i.id);
    const back = await send("POST", `/api/v1/assets/${i.assetId}/restore`);
    setRestoring(null);
    if (!back) return;
    toast.success(`Restored ${i.label}`);
    // What the server just recorded, shown now rather than on the next load.
    const row: Item = { ...i, id: `restored-${i.id}`, at: new Date().toISOString(), actor: me?.user?.name || "You", agent: false, verb: "restored", detail: null };
    setItems((xs) => [row, ...xs]);
  }

  const shown = items.filter((i) => who === "all" || (who === "agents") === i.agent);
  const row = { restorable, restore, restoring };

  return (
    <>
      <AppHeader trail={[{ label: "Assets", href: "/" }, { label: "Activity" }]}>
        <ForAgents
          about="The same feed for a script or an agent: who did what, newest first, one page at a time."
          reads={(origin) => [
            { label: "REST", text: curl(`${origin}/api/v1/activity`) },
            { label: "An agent's own proposals, and your decisions", text: call("my_proposals") },
          ]}
        />
      </AppHeader>
      <div className="flex flex-1 flex-col gap-4 px-4 pb-10 md:px-6">
        <LibraryTabs at="activity" reviewCount={reviewCount} />
        <PageHeader
          icon={<IconActivity />}
          title="Activity"
          description="Who did what, newest first. People go by their name, agents by the name of their key."
        >
          <ToggleGroup type="single" variant="outline" size="sm" value={who} onValueChange={(v) => v && filter(v as Who)} aria-label="Show">
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

        {items.length === 0 ? (
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
        ) : shown.length === 0 ? (
          // Only what is loaded is filtered: say so, rather than "nothing ever".
          <Empty size="sm" className="border">
            <EmptyHeader>
              <EmptyTitle>
                No {who === "agents" ? "agent activity" : "activity by people"} in the latest {items.length} events
              </EmptyTitle>
              <EmptyDescription>{next ? "There may be some further back." : "That's everything there is."}</EmptyDescription>
            </EmptyHeader>
            {next && (
              <Button variant="outline" size="sm" pending={busy} onClick={more}>
                Load older
              </Button>
            )}
          </Empty>
        ) : (
          <DayGroups items={shown}>
            {(list) => bursts(list).map((run) => (run.length > 1 ? <Burst key={run[0]!.id} run={run} {...row} /> : <Row key={run[0]!.id} item={run[0]!} {...row} />))}
          </DayGroups>
        )}

        {shown.length > 0 &&
          (next ? (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" pending={busy} onClick={more}>
                Load older
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground text-center text-sm">That&apos;s everything.</p>
          ))}
      </div>
    </>
  );
}

type RowActions = { restorable: (i: Item) => boolean; restore: (i: Item) => void; restoring: string | null };

const actorName = (i: Item) => (i.actor === "web" ? "Web app" : i.actor);

/** Who, with what they did as a badge on their face. */
function Face({ item: i }: { item: Item }) {
  const { icon: I } = VERB[i.verb] ?? SOMETHING;
  return (
    <span className="relative mt-0.5 flex shrink-0">
      <Initials name={actorName(i)} />
      <span className="bg-background text-muted-foreground absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full border">
        <I className="size-2.5" />
      </span>
    </span>
  );
}

function Actor({ item: i }: { item: Item }) {
  return (
    <span className="inline-flex items-center gap-1 font-medium">
      {i.agent && <IconRobot className="text-primary-ink size-4" aria-label="Agent" />}
      {actorName(i)}
    </span>
  );
}

function Target({ item: i }: { item: Item }) {
  if (i.brand) {
    return (
      <Link href={brandHref({ slug: i.brand.slug, default: false })} className="font-medium hover:underline">
        {i.label}
      </Link>
    );
  }
  if (i.assetId && i.verb !== "deleted") {
    return (
      <Link href={`/?asset=${i.assetId}`} className="font-medium hover:underline">
        {i.label}
      </Link>
    );
  }
  return <span className="font-medium">{i.label}</span>;
}

/** The note, tags and rules an item carries. */
function Detail({ item: i }: { item: Item }) {
  return (
    <>
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
    </>
  );
}

function When({ at }: { at: string }) {
  return (
    <time dateTime={at} title={exact(at)} className="text-muted-foreground shrink-0 text-xs leading-6" suppressHydrationWarning>
      {ago(at)}
    </time>
  );
}

function Restore({ item: i, restore, restoring }: { item: Item } & Pick<RowActions, "restore" | "restoring">) {
  return (
    <Button variant="ghost" size="xs" className="text-muted-foreground -my-1" pending={restoring === i.id} onClick={() => restore(i)} aria-label={`Restore ${i.label}`}>
      <IconArrowBackUp /> Restore
    </Button>
  );
}

function Row({ item: i, restorable, restore, restoring }: { item: Item } & RowActions) {
  const { says } = VERB[i.verb] ?? SOMETHING;
  return (
    <li className="flex items-start gap-3 px-3 py-2.5 text-sm">
      <Face item={i} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="leading-6">
          <Actor item={i} /> <span className="text-muted-foreground">{says}</span> <Target item={i} />
          {i.detail?.version && <span className="text-muted-foreground"> (version {i.detail.version})</span>}
        </p>
        <Detail item={i} />
      </div>
      {restorable(i) && <Restore item={i} restore={restore} restoring={restoring} />}
      <When at={i.at} />
    </li>
  );
}

/** Several items in one row, each still there, with its tags, behind the fold. */
function Burst({ run, restorable, restore, restoring }: { run: Item[] } & RowActions) {
  const head = run[0]!;
  const { says } = VERB[head.verb] ?? SOMETHING;
  return (
    <li className="flex items-start gap-3 px-3 py-2.5 text-sm">
      <Face item={head} />
      <details className="group min-w-0 flex-1">
        <summary className="flex list-none items-start gap-1 leading-6 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <Actor item={head} /> <span className="text-muted-foreground">{says}</span> <span className="font-medium">{run.length} assets</span>
          </span>
          <IconChevronRight className="text-muted-foreground mt-1 size-4 shrink-0 transition-transform group-open:rotate-90" />
        </summary>
        <ul className="mt-2 space-y-2 border-l pl-3">
          {run.map((i) => (
            <li key={i.id} className="flex items-start gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="leading-6">
                  <Target item={i} />
                  {i.detail?.version && <span className="text-muted-foreground"> (version {i.detail.version})</span>}
                </p>
                <Detail item={i} />
              </div>
              {restorable(i) && <Restore item={i} restore={restore} restoring={restoring} />}
              <When at={i.at} />
            </li>
          ))}
        </ul>
      </details>
      <When at={head.at} />
    </li>
  );
}
