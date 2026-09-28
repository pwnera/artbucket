import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Me } from "@/components/account";
import { SignInPage, Unreachable } from "@/components/sign-in";
import { getBody } from "@/lib/sidebar";

export const dynamic = "force-dynamic";

/** Who is looking, once for the title and the page: null when the API didn't answer at all. */
const readMe = cache(() => getBody<{ data?: Me }>("me"));

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await readMe())?.data?.auth.signUp ? "Set up" : "Sign in" };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Sign in, or on a fresh install make the first account. Someone signed in
 * goes home. `error` is single sign-on coming back without an account
 * (lib/auth.ts onAPIError).
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; error?: string | string[] }> }) {
  const me = (await readMe())?.data;
  // The API is down, not the visitor signed out: a sign-in form would say otherwise.
  if (!me) return <Unreachable />;
  const params = await searchParams;
  const asked = one(params.next);
  // Only paths here: never send someone on to another site after signing in.
  const next = asked?.startsWith("/") && !asked.startsWith("//") && !asked.startsWith("/\\") ? asked : undefined;
  if (me.user) redirect(next ?? "/");
  return <SignInPage auth={me.auth} next={next} error={!!one(params.error)} />;
}
