"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useMe } from "@/components/can";
import { Audit, People, Sharing, type AuditPage, type Members } from "@/components/settings/access";
import type { ShareLink } from "@/components/share-dialog";
import { useShell } from "@/components/shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Settings' People: this project's members, the organization's people and
 * the invitations waiting, the links for people without an account (to send
 * files in, or to look), and the audit log. Each tab shows to whoever may
 * use it; the tab is in the URL (`?tab=`), and switches without a trip to
 * the server, since every tab's data is already here. `?invite` opens
 * Invite people.
 */
export function Team({
  tab,
  project,
  members,
  shares,
  audit,
}: {
  tab: string;
  /** This project's members (GET /api/v1/members?in=project). */
  project: Members | null;
  members: Members | null;
  shares: ShareLink[] | null;
  audit: AuditPage | null;
}) {
  const me = useMe()!;
  const { collections, brands } = useShell();
  const params = useSearchParams();
  const pathname = usePathname();
  const tabs = [project && "project", members && "people", shares && "sharing", audit && "audit"].filter(Boolean) as string[];
  const asked = params.get("tab") ?? tab;
  const open = tabs.includes(asked) ? asked : tabs[0]!;
  const count = (n: number) => <span className="text-muted-foreground font-normal tabular-nums">{n}</span>;
  if (!tabs.length) return null;
  return (
    <Tabs
      value={open}
      onValueChange={(t) => {
        const q = new URLSearchParams(params);
        q.set("tab", t);
        q.delete("invite");
        // Next keeps useSearchParams in step with the native history: the tab switches now, and the URL stays shareable.
        window.history.replaceState(null, "", `${pathname}?${q}`);
      }}
    >
      {/* Four tabs and their counts don't fit a phone: they scroll sideways instead. */}
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <TabsList>
          {project && (
            <TabsTrigger value="project">
              {me.project.name} {count(project.data.length)}
            </TabsTrigger>
          )}
          {members && (
            <TabsTrigger value="people">
              Everyone {count(members.data.length)}
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
      {project && (
        <TabsContent value="project" className="pt-4">
          <People me={me} members={project} collections={collections} brands={brands} view="project" />
        </TabsContent>
      )}
      {members && (
        <TabsContent value="people" className="pt-4">
          {/* The live URL, not the server's: tabs remount People, and close() has dropped ?invite by then. */}
          <People me={me} members={members} collections={collections} brands={brands} inviting={params.has("invite")} />
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
  );
}
