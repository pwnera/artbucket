import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Me } from "@/components/account";
import { Welcome } from "@/components/sign-in";
import { can } from "@/lib/permissions";
import { get } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Welcome" };

/** Signed in, with access to nothing yet. */
export default async function WelcomePage() {
  const me = await get("me", (b: { data: Me }) => b.data, null);
  if (!me?.user) redirect("/login");
  if (can(me, "library.read")) redirect("/");
  return <Welcome me={me} />;
}
