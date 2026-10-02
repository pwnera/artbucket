"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconWorldCheck } from "@tabler/icons-react";
import { ExternalLink } from "@/components/external-link";
import { Group } from "@/components/settings/panels";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/confirm";
import { send } from "@/lib/send";
import { brandPath } from "@/lib/site";

/** GET /api/v1/hub/offers: a listing whose domain the organization proved, and its own organization didn't. */
export type HubOffer = { id: string; org: string; owner: string; brand: string; name: string; domain: string; proof: string; url: string };

/**
 * Make it yours (POST /api/v1/hub/offers/{org}/{brand}: a brand of your own
 * from it, public on BrandHub, the listing leading there) or Not ours
 * (DELETE: offered no more).
 */
function OfferActions({ offer, size = "sm" }: { offer: HubOffer; size?: "sm" | "xs" }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"take" | "refuse" | null>(null);
  const at = `/api/v1/hub/offers/${encodeURIComponent(offer.org)}/${encodeURIComponent(offer.brand)}`;
  const take = async () => {
    setBusy("take");
    const made = (await send("POST", at)) as { slug: string } | null;
    setBusy(null);
    if (!made) return;
    toast.success(`${offer.name} is yours`, { description: "Public on BrandHub, where its old address now leads." });
    router.push(brandPath(made.slug));
    router.refresh();
  };
  const refuse = async () => {
    setBusy("refuse");
    const ok = await send("DELETE", at);
    setBusy(null);
    if (!ok) return false;
    toast.success(`${offer.org}/${offer.brand} won't be offered again`);
    router.refresh();
    return true;
  };
  return (
    <span className="flex shrink-0 gap-1">
      <Button size={size} pending={busy === "take"} disabled={!!busy} onClick={() => void take()}>
        Make it yours
      </Button>
      {/* For good, beside the button that takes it: asked first. */}
      <Confirm
        title={`Turn down ${offer.name}?`}
        says={`${offer.org}/${offer.brand} won't be offered to you again, and this can't be undone here.`}
        action="Not ours"
        run={refuse}
      >
        <Button size={size} variant="ghost" disabled={!!busy}>
          Not ours
        </Button>
      </Confirm>
    </span>
  );
}

/** Across the Brands page, for an organization admin: each listing its verified domains claim. */
export function OfferBanners({ offers }: { offers: HubOffer[] }) {
  if (!offers.length) return null;
  return (
    <ul className="grid gap-2">
      {offers.map((o) => (
        <li key={o.id} role="status" className="bg-primary/5 border-primary/30 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm">
          <IconWorldCheck aria-hidden className="text-primary size-5 shrink-0" />
          <p className="min-w-0 flex-1">
            <ExternalLink href={o.url} className="font-medium hover:underline">
              {o.name}
            </ExternalLink>{" "}
            on BrandHub has your domain {o.domain}: make it yours.
          </p>
          <OfferActions offer={o} />
        </li>
      ))}
    </ul>
  );
}

/** Settings, BrandHub: the listings the organization's verified domains claim. */
export function OffersGroup({ offers }: { offers: HubOffer[] }) {
  return (
    <Group
      title="Listings with your domain"
      description="Public listings of other organizations that name a domain you proved, when theirs never proved it. Making one yours starts a brand of your own from it, public on BrandHub, and its old address leads to yours; its organization keeps its brand, off BrandHub, and is told."
    >
      {offers.length ? (
        <ul className="divide-y rounded-md border">
          {offers.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <div className="grid min-w-48 flex-1 gap-0.5">
                <ExternalLink href={o.url} className="font-medium hover:underline">
                  {o.org}/{o.brand}
                </ExternalLink>
                <span className="text-muted-foreground text-xs">
                  {o.name}, listed by {o.owner}, names {o.domain}: you proved {o.proof}
                </span>
              </div>
              <OfferActions offer={o} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">None: no other organization&apos;s listing names a domain you proved.</p>
      )}
    </Group>
  );
}
