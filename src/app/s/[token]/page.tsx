import type { Metadata } from "next";
import { SharedView } from "@/components/shared-view";

export const metadata: Metadata = { title: "Shared - Artbucket", robots: { index: false, follow: false } };

/** A share link's page, for people without an account. Everything it shows comes from /api/v1/shared/{token}. */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  return <SharedView token={(await params).token} />;
}
