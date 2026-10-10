import { redirect } from "next/navigation";

/**
 * /catalog?o={id}: the explorer's old address. The tree is the sidebar's now,
 * and each object has a page: /catalog/{id}. Without one, Explore.
 */
export default async function Catalog({ searchParams }: { searchParams: Promise<{ o?: string; tab?: string }> }) {
  const { o, tab } = await searchParams;
  redirect(o ? `/catalog/${encodeURIComponent(o)}${tab ? `?tab=${tab}` : ""}` : "/");
}
