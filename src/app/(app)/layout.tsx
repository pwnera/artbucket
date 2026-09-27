import { AccessProvider } from "@/components/can";
import { whoami } from "@/lib/sidebar";

/** The app, for someone who may see some of it: what they may do reaches every control (components/can.tsx). */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  return <AccessProvider me={await whoami()}>{children}</AccessProvider>;
}
