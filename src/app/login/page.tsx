import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Me } from "@/components/account";
import { SignInPage } from "@/components/sign-in";
import { get } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in - Artbucket" };

/** Sign in, or on a fresh install make the first account. Someone signed in goes home. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const me = await get("me", (b: { data: Me }) => b.data, null);
  if (me?.user) redirect("/");
  const { next } = await searchParams;
  const auth = me?.auth ?? { signUp: false, oidc: null, anonymous: null, passwordReset: false };
  // Only paths here: never send someone on to another site after signing in.
  return <SignInPage auth={auth} next={next?.startsWith("/") && !next.startsWith("//") ? next : undefined} />;
}
