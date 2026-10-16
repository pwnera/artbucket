import { redirect } from "next/navigation";

/** Catalog search is the library's: /catalog/search?q= is /assets?q=. */
export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  redirect(q ? `/assets?q=${encodeURIComponent(q)}` : "/assets");
}
