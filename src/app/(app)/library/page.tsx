import { redirect } from "next/navigation";

/**
 * /library and /explore, Explore's old names, are the library at /assets
 * with the same query (/library?q=winter is /assets?q=winter).
 */
export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) params.append(k, x);
  redirect(params.size ? `/assets?${params}` : "/assets");
}
