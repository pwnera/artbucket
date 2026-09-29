import { cookies } from "next/headers";
import { Fragment } from "react";
import { AccessProvider } from "@/components/can";
import { Shell } from "@/components/shell";
import { sidebarData } from "@/lib/sidebar";

/**
 * The app, for someone who may see some of it: what they may do reaches every
 * control (components/can.tsx). Everything under it is the workspace's, so a
 * switch to another workspace, or another organization, starts every page
 * over: no collection, count or recent from the one before survives.
 *
 * The frame (sidebar, ⌘K) is mounted here once, so pages swap beside it.
 * It opens collapsed when the person last left it collapsed, and as wide as
 * they last dragged it (ui/sidebar.tsx writes both cookies).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebar, jar] = await Promise.all([sidebarData(), cookies()]);
  return (
    <AccessProvider me={sidebar.me}>
      <Fragment key={sidebar.me.workspace.id}>
        <Shell sidebar={sidebar} defaultOpen={jar.get("sidebar_state")?.value !== "false"} defaultWidth={Number(jar.get("sidebar_width")?.value) || null}>
          {children}
        </Shell>
      </Fragment>
    </AccessProvider>
  );
}
