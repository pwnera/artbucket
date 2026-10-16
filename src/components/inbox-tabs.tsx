"use client";

import { useCan, useMe } from "@/components/can";
import { TabNav } from "@/components/hub";
import { useImportSignal } from "@/components/import-signal";
import { useShell } from "@/components/shell";

export type InboxTab = "review" | "fixes" | "imports" | "requests";

/** Where Inbox's tabs lead: the sidebar's Inbox goes to the first one this person has. */
export const INBOX: Record<InboxTab, string> = { review: "/review", fixes: "/fixes", imports: "/imports", requests: "/requests" };

/** The Inbox's pages this person may see, each with what waits on them there. */
export function useInbox(counts?: { review: number; fixes: number }) {
  const can = useCan();
  const me = useMe();
  const shell = useShell();
  const review = counts?.review ?? shell.reviewCount;
  const fixes = counts?.fixes ?? shell.fixesCount;
  const imports = useImportSignal(me?.brandImport && can("import.read") ? me.brandImport.replace(/\/+$/, "") : null);
  const tabs: { id: InboxTab; label: string; count: number }[] = [
    // What waits is a call to act only for whoever may approve it: a viewer sees the queue, not a count to clear.
    { id: "review" as const, label: "Review", count: can("asset.review") ? review : 0 },
    ...(can("insights.read") ? [{ id: "fixes" as const, label: "Fixes", count: fixes }] : []),
    // What visitors asked of the project's sites: access, an asset, a review, a question.
    ...(can("portal.manage") && !me?.off.includes("portals") ? [{ id: "requests" as const, label: "Requests", count: shell.requestsCount }] : []),
    ...(me?.brandImport && can("import.read") ? [{ id: "imports" as const, label: "Imports", count: (imports?.running ?? 0) + (imports?.waiting ?? 0) + (imports?.stopped ?? 0) }] : []),
  ];
  return { tabs, total: tabs.reduce((n, t) => n + t.count, 0) };
}

/** Review, Fixes, Requests and Imports as one Inbox: its tabs, under a page's title. */
export function InboxTabs({ current }: { current: InboxTab }) {
  const { tabs } = useInbox();
  if (tabs.length < 2) return null;
  return (
    <div className="border-b">
      <TabNav label="Inbox" items={tabs.map((t) => ({ href: INBOX[t.id], label: t.label, count: t.count || undefined, current: t.id === current }))} />
    </div>
  );
}
