"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconCalendarEvent, IconCertificate, IconCircleCheck, IconComponents, IconFlag, IconFolderUp, IconHistory, IconSearch, IconSend, IconTool } from "@/components/icons";
import { AssetLink, date, NotifyDialog, type Asset, type InsightsData, type Place } from "@/components/insights";
import { useMe } from "@/components/can";
import { AppHeader, PageHeader } from "@/components/page";
import { PlanGate } from "@/components/plan-gate";
import { has } from "@/components/settings/sections";
import { ShareDialog } from "@/components/share-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { send } from "@/lib/send";
import { toast } from "sonner";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ago, exact } from "@/lib/time";
import { InboxTabs } from "@/components/inbox-tabs";

/** GET /api/v1/fixes, as lib/schemas.ts Fixes has it. */
export type FixesData = {
  days: number;
  licenseDays: number;
  open: number;
  stale: InsightsData["stale"];
  gaps: InsightsData["gaps"];
  licenses: { asset: Asset; expires: string; days: number; replacement: Asset | null }[];
  components: { site: { id: string; name: string; slug: string }; path: string; component: { id: string; name: string; version: number }; current: { id: string; version: number }; since: string }[];
};

/** One thing to do, whatever it is: what, where, since when, its action, and once done, when. */
type Row = {
  key: string;
  icon: React.ReactNode;
  what: React.ReactNode;
  where: string;
  when: React.ReactNode;
  done: React.ReactNode | null;
  action: React.ReactNode;
};

const never = () => () => {};
/**
 * A day as `date` says it, in the reader's locale. The server's is nobody's, so
 * the server and the first paint say it in en-US and agree; once hydrated, it
 * says it the reader's way (public-grid's LocalDate, for a short day).
 */
function Day({ d }: { d: string }) {
  const local = useSyncExternalStore(never, () => true, () => false);
  return <>{local ? date(d) : new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</>;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const left = (days: number) => (days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`);
const Done = ({ children, at, by }: { children: React.ReactNode; at?: string; by?: string }) => (
  <span className="text-muted-foreground inline-flex items-center gap-1 text-xs" title={at && `${by ? `By ${by}, ` : ""}${exact(at)}`} suppressHydrationWarning>
    <IconCircleCheck aria-hidden className="text-success size-3.5" /> {children}
  </span>
);

/**
 * Fixes: what Insights and the library found that needs a hand, in one
 * list, each with the one thing to do about it. Places still showing a
 * replaced version (Notify, Insights' own dialog), searches that found
 * nothing (Request it, an upload link named after them), licenses about
 * to end (open the asset or what replaced it, or extend it in place) and sites built with an old
 * component (open the current one, then deploy the site with it). What
 * isn't done comes first; what is stays below, saying when, until it leaves
 * Insights' window. A server with an issue tracker (`issueUrl`,
 * FIX_ISSUE_URL) also offers to open an issue about a place or a search,
 * where the team works.
 */
export function Fixes({ data, collections, issueUrl = null }: { data: FixesData | null; collections: { id: string; name: string }[]; issueUrl?: string | null }) {
  const router = useRouter();
  const me = useMe();
  const [notifying, setNotifying] = useState<Place | null>(null);
  const [requesting, setRequesting] = useState<string | null>(null);
  const rows = data ? rowsOf(data, setNotifying, setRequesting, issueUrl, () => router.refresh()) : [];
  const todo = rows.filter((r) => !r.done);
  const done = rows.filter((r) => r.done);
  return (
    <>
      <AppHeader trail={[{ label: "Inbox", href: "/review" }, { label: "Fixes" }]} />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-6 pb-16 md:px-6">
        <PageHeader
          icon={<IconTool />}
          title="Fixes"
          aside={data && data.open > 0 ? <Badge variant="secondary">{data.open} to do</Badge> : undefined}
          description="What needs a hand: sites showing an old version or built with an old component, searches that found nothing, licenses about to end."
        />
        <InboxTabs current="fixes" />
        {me && !has(me, "fixes") ? (
          <PlanGate
            icon={<IconTool />}
            title="Fixes aren't in your plan"
            description="See which sites still show an old logo, which searches found nothing and which licenses are about to end, and tell whoever can fix each in a click."
          />
        ) : !data ? (
          <p className="text-muted-foreground text-sm">Fixes couldn&apos;t load. Try again in a moment.</p>
        ) : !rows.length ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconCircleCheck />
              </EmptyMedia>
              <EmptyTitle>Nothing to fix</EmptyTitle>
              <EmptyDescription>
                When a site still shows an old logo, a search finds nothing or a license is about to end, it shows up here with what to do about it.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <Section title="To do" rows={todo} empty="All done. Nice." />
            {done.length > 0 && <Section title="Done" rows={done} />}
            <p className="text-muted-foreground text-xs">
              Old versions and searches: last {data.days} days. Licenses: ending in the next {data.licenseDays} days. The charts are in{" "}
              <Link href="/insights" className="text-foreground underline underline-offset-2">
                Insights
              </Link>
              .
            </p>
          </>
        )}
      </div>
      <NotifyDialog
        place={notifying}
        onClose={() => setNotifying(null)}
        onSent={() => {
          setNotifying(null);
          router.refresh();
        }}
      />
      {/* A search asked for is an upload link named after its words: what comes back waits in Review. */}
      <ShareDialog
        open={requesting !== null}
        target={{ kind: "upload", name: requesting ?? undefined }}
        collections={collections}
        onClose={() => setRequesting(null)}
        onMade={() => router.refresh()}
      />
    </>
  );
}

function Section({ title, rows, empty }: { title: string; rows: Row[]; empty?: string }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-sm font-semibold">
        {title} <span className="text-muted-foreground font-normal tabular-nums">{rows.length}</span>
      </h2>
      {rows.length ? (
        <ul className="divide-y rounded-lg border">
          {rows.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm">
              <span aria-hidden className="text-muted-foreground [&_svg]:size-4">
                {r.icon}
              </span>
              <div className="min-w-0 flex-1 basis-56">
                <p className="break-words">{r.what}</p>
                <p className="text-muted-foreground text-xs">
                  {r.where} · {r.when}
                </p>
              </div>
              <div className="ms-auto shrink-0">{r.done ?? r.action}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground rounded-lg border px-4 py-3 text-sm">{empty}</p>
      )}
    </section>
  );
}

/**
 * A license renewed: its new last day, set on the row. Rights save whole, so
 * the asset's are read first and only the day changes.
 */
function Extend({ asset, until, onDone }: { asset: string; until: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(until.slice(0, 10));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const got = (await send("GET", `/api/v1/assets/${asset}`)) as { rights: Record<string, unknown> | null } | null;
    const ok = got && (await send("PATCH", `/api/v1/assets/${asset}`, { rights: { ...got.rights, expires: day } }));
    setBusy(false);
    if (!ok) return;
    setOpen(false);
    toast.success(`Usable until ${date(day)}`);
    onDone();
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="xs" variant="outline">
          <IconCalendarEvent /> Extend
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Extend the license" className="grid w-64 gap-2">
        <Label htmlFor={`extend-${asset}`}>New last day of use</Label>
        <Input id={`extend-${asset}`} type="date" value={day} min={until.slice(0, 10)} onChange={(e) => setDay(e.target.value)} />
        <Button size="sm" pending={busy} disabled={!day || day <= until.slice(0, 10)} onClick={() => void save()}>
          Extend
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** Open an issue about it, where the server's tracker takes it (`issueUrl` with the fix's kind and what it is about). */
const IssueLink = ({ at, about }: { at: string | null; about: Record<string, string> }) =>
  at && (
    <Button size="xs" variant="ghost" asChild>
      <a href={`${at}?${new URLSearchParams(about)}`}>
        <IconFlag /> Open an issue
      </a>
    </Button>
  );

/** Every fix as a row: licenses first (they run out), then places, then old components, then searches, each in the API's order. */
function rowsOf(data: FixesData, notify: (p: Place) => void, request: (q: string) => void, issueUrl: string | null, refresh: () => void): Row[] {
  const licenses: Row[] = data.licenses.map((l) => ({
    key: `license:${l.asset.id}`,
    icon: <IconCertificate />,
    what: (
      <>
        <AssetLink a={l.asset} />: its license ends {left(l.days)}
      </>
    ),
    where: "Library",
    when: (
      <>
        Last day <Day d={l.expires} />
      </>
    ),
    done: l.replacement && (
      <span className="inline-flex items-center gap-2">
        <Done>Replaced</Done>
        <Button size="xs" variant="ghost" asChild>
          <Link href={`/assets?asset=${l.replacement.id}`}>Open the replacement</Link>
        </Button>
      </span>
    ),
    action: (
      <span className="inline-flex items-center gap-1">
        <Button size="xs" variant="ghost" asChild>
          <Link href={`/assets?asset=${l.asset.id}`}>Open the asset</Link>
        </Button>
        <Extend asset={l.asset.id} until={l.expires} onDone={refresh} />
      </span>
    ),
  }));

  // One row a place, as Notify tells a place about every old version it shows at once. One that said no place has nobody to tell.
  const places = [...new Set(data.stale.flatMap((s) => s.referrer ?? s.client ?? []))].map((place): Row => {
    const rows = data.stale.filter((s) => (s.referrer ?? s.client) === place);
    const [{ referrer, client, owners }] = rows;
    const pending = [...new Map(rows.filter((s) => !s.notified).map((s) => [s.asset.id, s.asset])).values()];
    const told = rows.flatMap((s) => s.notified ?? []).sort((a, b) => a.at.localeCompare(b.at)).at(-1);
    const titles = [...new Map(rows.map((s) => [s.asset.id, s.asset])).values()];
    const first = rows.map((s) => s.first).sort()[0];
    return {
      key: `place:${place}`,
      icon: <IconHistory />,
      what: (
        <>
          Still shows an old version of{" "}
          {titles.map((a, i) => (
            <span key={a.id}>
              {i > 0 && ", "}
              <AssetLink a={a} />
            </span>
          ))}
        </>
      ),
      where: referrer ?? `Agent ${client}`,
      when: (
        <>
          Since <Day d={first} />, {plural(rows.reduce((t, s) => t + s.fetches, 0), "load")}
        </>
      ),
      done: !pending.length && told ? (
        <Done at={told.at} by={told.by}>
          Notified {ago(told.at)}
        </Done>
      ) : null,
      action: (
        <span className="inline-flex items-center gap-1">
          <IssueLink at={issueUrl} about={{ kind: "stale", place }} />
          <Button size="xs" variant="outline" onClick={() => notify({ referrer, client: referrer ? null : client, owners, assets: pending })}>
            <IconSend /> Notify
          </Button>
        </span>
      ),
    };
  });

  const gaps: Row[] = data.gaps.map((g) => ({
    key: `gap:${g.q}`,
    icon: <IconSearch />,
    what: (
      <>
        &ldquo;{g.q}&rdquo; found nothing
      </>
    ),
    where: `Searched ${plural(g.searches, "time")}`,
    when: (
      <>
        Since <Day d={g.first} />
      </>
    ),
    done: g.requested && (
      <Done at={g.requested.at} by={g.requested.by}>
        Requested {ago(g.requested.at)}
      </Done>
    ),
    action: (
      <span className="inline-flex items-center gap-1">
        <IssueLink at={issueUrl} about={{ kind: "gap", q: g.q }} />
        <Button size="xs" variant="outline" onClick={() => request(g.q)}>
          <IconFolderUp /> Request it
        </Button>
      </span>
    ),
  }));

  const components: Row[] = data.components.map((c) => ({
    key: `component:${c.site.id}:${c.path}:${c.component.id}`,
    icon: <IconComponents />,
    what: (
      <>
        Built with{" "}
        <Link href={`/components/${c.component.id}`} className="font-medium underline-offset-2 hover:underline">
          {c.component.name} @{c.component.version}
        </Link>
        : @{c.current.version} is current
      </>
    ),
    where: `${c.site.name}${c.path === "/" ? "" : c.path}`,
    when: (
      <>
        Since <Day d={c.since} />
      </>
    ),
    done: null,
    action: (
      <Button size="xs" variant="outline" asChild>
        <Link href={`/components/${c.current.id}`}>Open @{c.current.version}</Link>
      </Button>
    ),
  }));

  return [...licenses, ...places, ...components, ...gaps];
}
