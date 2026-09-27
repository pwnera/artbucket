import { redirect } from "next/navigation";

/** Team moved into Settings. */
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  redirect(tab === "sharing" ? "/settings/workspace/sharing" : tab === "audit" ? "/settings/organization/audit" : "/settings/organization/people");
}
