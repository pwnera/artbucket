import type { Metadata } from "next";
import { Unsubscribe } from "@/components/sign-in";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Unsubscribe" };

/**
 * Where the weekly digest's unsubscribe link lands: one button, no sign-in.
 * Not on opening it: mail scanners open links, and would unsubscribe people.
 */
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  return <Unsubscribe token={(await params).token} />;
}
