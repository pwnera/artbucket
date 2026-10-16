import { redirect } from "next/navigation";

/** Team is Settings' People now: its old address, ?tab= and ?invite included, lands there. */
export default async function TeamPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const q = new URLSearchParams(await searchParams).toString().replace(/=(?=&|$)/g, "");
  redirect(`/settings/project/people${q ? `?${q}` : ""}`);
}
