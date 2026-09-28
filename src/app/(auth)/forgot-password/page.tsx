import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Me } from "@/components/account";
import { ForgotPassword } from "@/components/sign-in";
import { getBody } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reset your password" };

/** Ask for a reset link, when this server can send one. Someone signed in changes it in their profile. */
export default async function ForgotPasswordPage() {
  // getBody, not get: the API not answering is the "can't email yet" card, not the error page.
  const me = (await getBody<{ data?: Me }>("me"))?.data;
  if (me?.user) redirect("/settings/account/profile");
  return <ForgotPassword canSend={!!me?.auth.passwordReset} />;
}
