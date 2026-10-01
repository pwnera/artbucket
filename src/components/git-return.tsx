"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/page";
import { GIT_RETURN } from "@/lib/git";

/** What a remote reads as, to a person: github.com/acme/brand. */
const where = (remote: string) => remote.replace(/^https?:\/\//, "").replace(/\.git$/, "");

/**
 * Back from the server's Git integration (GIT_CONNECT_URL), which sends a
 * person to the brand's Overview (or, before, the builder) with
 * ?git=connected: a toast while the first sync lands (the brand's source
 * says when, by its syncedAt), then the page drawn again from what it
 * brought in. `release`, where the person may release: once in step, the
 * toast offers Release while readers don't see the brand as it stands.
 * Drops the parameter, so a reload doesn't say it twice. `waiting`: a brand
 * still coming in from its repository (BrandImporting) is waited for without
 * the parameter too, quietly, and drawn again once it lands.
 */
export function GitReturn({ brand, release, waiting }: { brand: string; release?: string; waiting?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    const url = new URL(window.location.href);
    const back = url.searchParams.get("git") === GIT_RETURN;
    if (!back && !waiting) return;
    url.searchParams.delete("git");
    window.history.replaceState(window.history.state, "", url);
    const id = back ? toast.loading("Connecting the repository", { description: "The first sync takes a moment." }) : undefined;
    let stopped = false;
    const until = Date.now() + (waiting ? 300_000 : 30_000);
    void (async () => {
      let remote: string | null = null;
      while (!stopped && Date.now() < until) {
        const res = await fetch(`/api/v1/brands/${encodeURIComponent(brand)}/source`).catch(() => null);
        const source = res?.ok ? ((await res.json()).data?.source ?? null) : null;
        remote = source?.remote ?? remote;
        if (source?.syncedAt) {
          if (!back) return router.replace(`${url.pathname}${url.search}`, { scroll: false });
          const status = release ? await fetch(`/api/v1/brands/${encodeURIComponent(brand)}/status`).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
          const unreleased = !!status && status.data.publish !== "current";
          toast.success(`In step with ${where(source.remote)}`, {
            id,
            description: unreleased
              ? "Not released yet. Changes now sync both ways."
              : "Changes now sync both ways.",
            ...(unreleased && { action: { label: "Release", onClick: () => router.push(release!) }, duration: 20_000 }),
          });
          router.replace(`${url.pathname}${url.search}`, { scroll: false });
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      // A pull request with its files waits to be merged; nothing more to wait for here.
      if (!stopped && back) toast.success(remote ? `Connected to ${where(remote)}` : "Connected", { id, description: "Its files follow as a commit or a pull request." });
    })();
    return () => {
      stopped = true;
    };
  }, [brand, release, waiting, router]);
  return null;
}

/**
 * A brand being brought in from its repository, before its first sync lands:
 * its name and where it comes from, no tabs (there is nothing behind them
 * yet). GitReturn draws the page again once it is in; past a minute, it says
 * where to look.
 */
export function BrandImporting({ name, remote }: { name: string; remote: string }) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLate(true), 60_000);
    return () => clearTimeout(t);
  }, []);
  return (
    <>
      <AppHeader trail={[{ label: "Brands", href: "/brands" }, { label: name }]} />
      <div role="status" className="grid flex-1 place-content-center justify-items-center gap-3 p-8 text-center">
        <IconLoader2 aria-hidden className="text-muted-foreground size-6 animate-spin" />
        <h1 className="font-display text-xl font-semibold tracking-tight">Loading {name}</h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          {late ? (
            <>
              Still not in. The check on the latest commit in{" "}
              <a href={remote} target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-4">
                {where(remote)}
              </a>{" "}
              says why.
            </>
          ) : (
            <>From {where(remote)}</>
          )}
        </p>
      </div>
    </>
  );
}
