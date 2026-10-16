import { redirect } from "next/navigation";

/** Theme is the Look tab now; old links land on it. */
export default async function OldThemePage({ params }: { params: Promise<{ slug: string }> }) {
  redirect(`/brands/${encodeURIComponent((await params).slug)}/look`);
}
