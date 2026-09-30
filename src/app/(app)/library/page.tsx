import { redirect } from "next/navigation";

/**
 * /library, the prototype's address for the library, is the library at /
 * with the same query (/library?q=winter is /?q=winter). The library stays
 * at /: it moves between its views in the page, which it can do only there.
 */
export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) params.append(k, x);
  redirect(params.size ? `/?${params}` : "/");
}
