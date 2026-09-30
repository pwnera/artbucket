"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
 * Drops the parameter, so a reload doesn't say it twice.
 */
export function GitReturn({ brand, release }: { brand: string; release?: string }) {
  const router = useRouter();
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("git") !== GIT_RETURN) return;
    url.searchParams.delete("git");
    window.history.replaceState(window.history.state, "", url);
    const id = toast.loading("Connecting the repository", { description: "The first sync takes a moment." });
    let stopped = false;
    const until = Date.now() + 30_000;
    void (async () => {
      let remote: string | null = null;
      while (!stopped && Date.now() < until) {
        const res = await fetch(`/api/v1/brands/${encodeURIComponent(brand)}/source`).catch(() => null);
        const source = res?.ok ? ((await res.json()).data?.source ?? null) : null;
        remote = source?.remote ?? remote;
        if (source?.syncedAt) {
          const status = release ? await fetch(`/api/v1/brands/${encodeURIComponent(brand)}/status`).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
          const unreleased = !!status && status.data.publish !== "current";
          toast.success(`In step with ${where(source.remote)}`, {
            id,
            description: unreleased
              ? "Readers don't see it yet: release it when it reads right. From now on, changes go both ways."
              : "Changes merged there come here, and edits here go there.",
            ...(unreleased && { action: { label: "Release", onClick: () => router.push(release!) }, duration: 20_000 }),
          });
          router.refresh();
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      // A pull request with its files waits to be merged; nothing more to wait for here.
      if (!stopped) toast.success(remote ? `Connected to ${where(remote)}` : "Connected", { id, description: "Its files are on their way: a commit, or a pull request to merge." });
    })();
    return () => {
      stopped = true;
    };
  }, [brand, release, router]);
  return null;
}
