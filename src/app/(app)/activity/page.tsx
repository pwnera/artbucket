import { redirect } from "next/navigation";

/** /activity: Activity is Insights' now. */
export default function ActivityPage() {
  redirect("/insights/activity");
}
