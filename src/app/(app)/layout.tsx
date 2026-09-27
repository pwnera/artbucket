import { Fragment } from "react";
import { AccessProvider } from "@/components/can";
import { whoami } from "@/lib/sidebar";

/**
 * The app, for someone who may see some of it: what they may do reaches every
 * control (components/can.tsx). Everything under it is the workspace's, so a
 * switch to another workspace, or another organization, starts every page
 * over: no collection, count or recent from the one before survives.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await whoami();
  return (
    <AccessProvider me={me}>
      <Fragment key={me.workspace.id}>{children}</Fragment>
    </AccessProvider>
  );
}
