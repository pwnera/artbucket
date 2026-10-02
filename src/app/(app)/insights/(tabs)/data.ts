import { cache } from "react";
import type { InsightsData } from "@/components/insights";
import { get } from "@/lib/sidebar";

/** GET /api/v1/insights, read once a request: the layout counts its refused checks, the tab shows it. */
export const insights = cache(() => get("insights", (b: { data: InsightsData }) => b.data, null));
