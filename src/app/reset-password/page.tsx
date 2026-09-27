import type { Metadata } from "next";
import { ResetPassword } from "@/components/sign-in";

export const metadata: Metadata = { title: "Choose a new password - Artbucket" };

/** better-auth sends the emailed link here, with `token`, or `error` when it no longer works. */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  return <ResetPassword token={token ?? null} invalid={!!error} />;
}
