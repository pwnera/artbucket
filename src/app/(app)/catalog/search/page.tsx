import { redirect } from "next/navigation";

/** Catalog search is Explore's: /catalog/search?q= is /?q=. */
export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  redirect(q ? `/?q=${encodeURIComponent(q)}` : "/");
}
