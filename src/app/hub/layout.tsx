import Link from "next/link";
import { notFound } from "next/navigation";
import { AppIcon } from "@/components/brand";
import { HubSearch } from "@/components/hub-client";
import { Button } from "@/components/ui/button";
import { hubBase, hubOn, hubViewer } from "@/lib/core/hub";
import { env } from "@/lib/env";

/**
 * BrandHub (lib/core/hub.ts): for anyone, signed in or not. Someone signed
 * in sees their private brands too: on the app's host (/hub), and on the
 * hub's own when the two share a domain the session cookie is set for
 * (lib/hub.ts cookieDomain); a hub on a host of its own elsewhere shows
 * public brands only.
 */
export default async function HubLayout({ children }: { children: React.ReactNode }) {
  if (!hubOn()) notFound();
  const [base, viewer] = await Promise.all([hubBase(), hubViewer()]);
  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col">
      <header className="bg-background/85 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link href={base || "/"} className="flex shrink-0 items-center gap-2.5" aria-label="BrandHub home">
            <AppIcon className="size-7" />
            <span className="font-display text-lg font-semibold tracking-tight">BrandHub</span>
          </Link>
          <HubSearch action={base || "/"} className="hidden w-full max-w-sm md:block" />
          <nav className="ms-auto flex shrink-0 items-center gap-1">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <a href={`${base}/llms.txt`}>For agents</a>
            </Button>
            {!viewer && (
              <Button asChild variant="ghost" size="sm">
                <a href={`${env.APP_URL}/login?next=${encodeURIComponent("/hub")}`}>Sign in</a>
              </Button>
            )}
            <Button asChild size="sm">
              <a href={`${env.APP_URL}/brands`}>{viewer ? "Your brands" : "Share your brand"}</a>
            </Button>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="text-muted-foreground border-t">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-xs">
          <span className="flex items-center gap-2">
            <AppIcon className="size-4" /> BrandHub by Artbucket
          </span>
          <span>Brands are listed by their owners or their communities. A green check names a domain or GitHub account the owner proved it holds.</span>
          <a href={`${base}/llms.txt`} className="hover:text-foreground ms-auto underline-offset-2 hover:underline">
            llms.txt
          </a>
          <a href={`${base}/index.json`} className="hover:text-foreground underline-offset-2 hover:underline">
            index.json
          </a>
        </div>
      </footer>
    </div>
  );
}
