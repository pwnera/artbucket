import { redirect } from "next/navigation";
import { brandPath } from "@/lib/site";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[]>> };

/** The brand's old Portals tab: its Sharing tab now, with the same query. */
export default async function BrandPortalsPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const q = new URLSearchParams(Object.entries(query).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((x) => [k, x]))).toString();
  redirect(brandPath(slug, "/sharing") + (q ? `?${q}` : ""));
}
