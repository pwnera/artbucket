import { redirect } from "next/navigation";
import { InsightsFrame } from "@/components/insights";
import { can } from "@/lib/permissions";
import { whoami } from "@/lib/sidebar";
import { insights } from "./data";

/**
 * Insights' header and tabs, which stay while a tab changes: each tab streams
 * its body in under them, behind its own Suspense placeholder. ../loading.tsx
 * is for coming to Insights.
 */
export default async function InsightsLayout({ children }: { children: React.ReactNode }) {
  // Together: the API checks access itself, and a redirect drops what came back.
  const [me, data] = await Promise.all([whoami(), insights()]);
  if (!can(me, "insights.read")) redirect("/");
  return (
    <InsightsFrame refused={data?.checks.refused}>
      {/* Counting turned off (Settings, Features): what is here stops growing, and says why. */}
      {me.off.includes("insights") && (
        <p className="text-muted-foreground mb-4 rounded-md border px-3 py-2 text-sm">
          Usage isn&apos;t counted in {me.project.name}: usage insights are turned off in Settings, Features. What was counted before stays here.
        </p>
      )}
      {children}
    </InsightsFrame>
  );
}
