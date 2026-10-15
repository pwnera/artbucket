import { redirect } from "next/navigation";

/**
 * /assets, what people type for the sidebar's Assets, is the library's Assets
 * view (/?browse) with the same query (/assets?q=winter is /?browse&q=winter).
 */
export default async function AssetsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (k !== "browse") for (const x of [v].flat()) params.append(k, x);
  redirect(params.size ? `/?browse&${params}` : "/?browse");
}
