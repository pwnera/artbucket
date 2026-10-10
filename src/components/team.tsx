"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { IconUsers } from "@tabler/icons-react";
import { useCan, useMe } from "@/components/can";
import { AppHeader, PageHeader } from "@/components/page";
import { Audit, People, Sharing, type AuditPage, type Members } from "@/components/settings/access";
import type { ShareLink } from "@/components/share-dialog";
import { Button } from "@/components/ui/button";
import { useShell } from "@/components/shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const LABEL: Record<string, string> = { people: "People", sharing: "Links", audit: "Audit log" };

/**
 * Who is in and who is invited: the organization's people and the
 * invitations waiting, the links for people without an account (to send
 * files in, or to look), and the audit log. Each tab shows to whoever may
 * use it; the tab is in the URL (`?tab=`), and switches without a trip to
 * the server, since every tab's data is already here.
 */
export function Team({
  tab,
  members,
  shares,
  audit,
}: {
  tab: string;
  members: Members | null;
  shares: ShareLink[] | null;
  audit: AuditPage | null;
}) {
  const me = useMe()!;
  const can = useCan();
  const { collections } = useShell();
  const params = useSearchParams();
  const tabs = [members && "people", shares && "sharing", audit && "audit"].filter(Boolean) as string[];
  const asked = params.get("tab") ?? tab;
  const open = tabs.includes(asked) ? asked : tabs[0]!;
  const count = (n: number) => <span className="text-muted-foreground font-normal tabular-nums">{n}</span>;
  return (
    <>
      <AppHeader trail={[{ label: "Team", href: "/team" }, { label: LABEL[open]! }]} />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-6 pb-16 md:px-6">
        <PageHeader
          icon={<IconUsers />}
          title={`Team · ${me.project.organization.name}`}
          description="People, share links and the audit log."
        >
          {can("member.manage") && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
              <Link href="/settings/project/members">Project members in Settings</Link>
            </Button>
          )}
        </PageHeader>
        <Tabs
          value={open}
          onValueChange={(t) => {
            const q = new URLSearchParams(params);
            q.set("tab", t);
            q.delete("invite");
            // Next keeps useSearchParams in step with the native history: the tab switches now, and the URL stays shareable.
            window.history.replaceState(null, "", `/team?${q}`);
          }}
        >
          {/* Three tabs and their counts don't fit a phone: they scroll sideways instead. */}
          <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
            <TabsList>
              {members && (
                <TabsTrigger value="people">
                  People {count(members.data.length)}
                </TabsTrigger>
              )}
              {shares && (
                <TabsTrigger value="sharing">
                  Links {count(shares.length)}
                </TabsTrigger>
              )}
              {audit && <TabsTrigger value="audit">Audit log</TabsTrigger>}
            </TabsList>
          </div>
          {members && (
            <TabsContent value="people" className="pt-4">
              {/* The live URL, not the server's: tabs remount People, and close() has dropped ?invite by then. */}
              <People me={me} members={members} collections={collections} inviting={params.has("invite")} />
            </TabsContent>
          )}
          {shares && (
            <TabsContent value="sharing" className="pt-4">
              <Sharing shares={shares} collections={collections} />
            </TabsContent>
          )}
          {audit && (
            <TabsContent value="audit" className="pt-4">
              <Audit first={audit} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </>
  );
}
