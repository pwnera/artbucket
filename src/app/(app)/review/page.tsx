import type { Metadata } from "next";
import { library } from "@/lib/library-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Review" };

/** Review: what agents, contributors and upload links sent in, waiting on a person. The library's, as a page of its own. */
export default async function ReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) params.append(k, x);
  return library(params, true);
}
