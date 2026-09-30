import { redirect } from "next/navigation";

/**
 * /review, the prototype's address for the review queue, is the library's
 * Review view (/?review=true) with the same query: the library draws every
 * view of itself, from /.
 */
export default async function ReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const params = new URLSearchParams({ review: "true" });
  for (const [k, v] of Object.entries(await searchParams)) if (k !== "review") for (const x of [v].flat()) params.append(k, x);
  redirect(`/?${params}`);
}
