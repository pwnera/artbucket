import { redirect } from "next/navigation";

/** /catalog/{id}: the object, open in the catalog. */
export default async function ObjectRoute({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  redirect(`/catalog?o=${encodeURIComponent(id)}${tab ? `&tab=${tab}` : ""}`);
}
