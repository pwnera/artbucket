import { redirect } from "next/navigation";

/**
 * /assets/{id}, an asset's own address in the prototype, opens it over the
 * library (/?asset={id}), where it steps to the next one and closes back to
 * the view it came from.
 */
export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/?asset=${encodeURIComponent((await params).id)}`);
}
