"use client";

import { useRouter } from "next/navigation";
import { IconUserQuestion } from "@/components/icons";
import { InboxTabs } from "@/components/inbox-tabs";
import { AppHeader, PageHeader } from "@/components/page";
import { RequestList } from "@/components/portals";

/** The Inbox's Requests: every site's, each naming its site, answered in place; the sidebar's count follows. */
export function RequestsPage() {
  const router = useRouter();
  return (
    <>
      <AppHeader trail={[{ label: "Inbox", href: "/review" }, { label: "Requests" }]} />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-6 pb-16 md:px-6">
        <PageHeader
          icon={<IconUserQuestion />}
          title="Requests"
          description="What visitors asked of your sites: access at the door, and assets, reviews and questions from a page. Approved access lasts 90 days or until the site closes."
        />
        <InboxTabs current="requests" />
        <RequestList onChanged={() => router.refresh()} />
      </div>
    </>
  );
}
