"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { IconUsers } from "@tabler/icons-react";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/brand";
import { PageHeader } from "@/components/page";
import { Audit, People, Sharing, type AuditPage, type Members } from "@/components/settings/access";
import type { ShareLink } from "@/components/share-dialog";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SidebarData } from "@/lib/sidebar";

/**
 * Who is in and who is invited: the organization's people and the
 * invitations waiting, the links for people without an account (to send
 * files in, or to look), and the audit log. Each tab shows to whoever may
 * use it; the tab is in the URL (`?tab=`).
 */
export function Team({
  sidebar,
  tab,
  members,
  shares,
  audit,
  inviting,
}: {
  sidebar: SidebarData;
  tab: string;
  members: Members | null;
  shares: ShareLink[] | null;
  audit: AuditPage | null;
  inviting: boolean;
}) {
  const me = sidebar.me;
  const router = useRouter();
  const params = useSearchParams();
  const tabs = [members && "people", shares && "sharing", audit && "audit"].filter(Boolean) as string[];
  const open = tabs.includes(tab) ? tab : tabs[0];
  return (
    <SidebarProvider>
      <AppSidebar me={me} collections={sidebar.collections} brands={sidebar.brands} searches={sidebar.searches} reviewCount={sidebar.reviewCount} />
      <SidebarInset className="min-w-0">
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <span className="text-sm font-semibold">Team</span>
          <ThemeToggle className="ml-auto" />
        </header>
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-6 pb-16 md:px-6">
          <PageHeader
            icon={<IconUsers />}
            title={`Team · ${me.workspace.organization.name}`}
            description="Everyone in the organization and the invitations waiting, links for people without an account, and who changed what."
          />
          <Tabs
            value={open}
            onValueChange={(t) => {
              const q = new URLSearchParams(params);
              q.set("tab", t);
              q.delete("invite");
              router.replace(`/team?${q}`, { scroll: false });
            }}
          >
            <TabsList>
              {members && <TabsTrigger value="people">People and invitations</TabsTrigger>}
              {shares && <TabsTrigger value="sharing">Share and upload links</TabsTrigger>}
              {audit && <TabsTrigger value="audit">Audit log</TabsTrigger>}
            </TabsList>
            {members && (
              <TabsContent value="people" className="pt-4">
                <People me={me} members={members} collections={sidebar.collections} inviting={inviting} />
              </TabsContent>
            )}
            {shares && (
              <TabsContent value="sharing" className="pt-4">
                <Sharing shares={shares} collections={sidebar.collections} />
              </TabsContent>
            )}
            {audit && (
              <TabsContent value="audit" className="pt-4">
                <Audit first={audit} />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
