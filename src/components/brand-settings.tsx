"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconBrandGithub, IconStar, IconTrash } from "@tabler/icons-react";
import type { HeadBrand } from "@/lib/brand-head";
import type { Source } from "@/components/builder/use-status";
import { Confirm } from "@/components/confirm";
import { Group, SavedMark } from "@/components/settings/panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ago } from "@/lib/hub";
import { send } from "@/lib/send";
import { brandPath } from "@/lib/site";

/**
 * A brand's Settings tab: its name and address, whether it is the default,
 * the repository its files also live in, and deleting it (who sees it on
 * BrandHub is on its Sharing tab). The same calls the Brands page and the
 * sidebar's brand menu make: PATCH and DELETE /api/v1/brands/{slug}, DELETE
 * .../source.
 */
export function BrandSettings({ brand, source }: { brand: HeadBrand; source: Source | null }) {
  const router = useRouter();
  const b = encodeURIComponent(brand.slug);
  const [name, setName] = useState(brand.name);
  const [slug, setSlug] = useState(brand.slug);
  const [saved, setSaved] = useState<{ name: number; slug: number }>({ name: 0, slug: 0 });
  const [busy, setBusy] = useState<string | null>(null);

  const patch = async (what: "name" | "slug", body: Record<string, unknown>) => {
    setBusy(what);
    const done = (await send("PATCH", `/api/v1/brands/${b}`, body)) as { slug: string } | null;
    setBusy(null);
    if (!done) return;
    setSaved((s) => ({ ...s, [what]: Date.now() }));
    // A new address: this page lives at it now.
    if (done.slug !== brand.slug) router.replace(brandPath(done.slug, "/settings"));
    router.refresh();
  };

  return (
    <div className="grid gap-4">
      <Group title="Name and address" description="The name shows everywhere. The address names it in links, the API and on BrandHub: old links stop working when it changes.">
        <form
          className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void patch("name", { name });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="brand-name">Name</Label>
            <Input id="brand-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          <span className="flex items-center gap-2">
            <SavedMark at={saved.name} />
            <Button type="submit" variant="outline" pending={busy === "name"} disabled={!name.trim() || name === brand.name}>
              Rename
            </Button>
          </span>
        </form>
        <form
          className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void patch("slug", { slug });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="brand-slug">Address</Label>
            <Input id="brand-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} maxLength={60} className="font-mono" />
          </div>
          <span className="flex items-center gap-2">
            <SavedMark at={saved.slug} />
            <Button type="submit" variant="outline" pending={busy === "slug"} disabled={!slug.trim() || slug === brand.slug}>
              Change
            </Button>
          </span>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <p className="text-sm">
            {brand.default ? "The default brand: the API and agents read it when no brand is named." : "Agents and the API read the default brand when no brand is named."}
          </p>
          {!brand.default && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!(await send("PATCH", `/api/v1/brands/${b}`, { default: true }))) return;
                toast.success(`${brand.name} is the default brand`);
                router.refresh();
              }}
            >
              <IconStar aria-hidden /> Make default
            </Button>
          )}
        </div>
      </Group>

      {source && (
        <Group title="Repository" description="Brand as code: its files also live in a repository, and changes go both ways.">
          {source.source ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="grid gap-0.5 text-sm">
                <span className="flex items-center gap-1.5 font-medium">
                  <IconBrandGithub aria-hidden className="size-4" /> {source.source.remote}
                </span>
                <span className="text-muted-foreground">
                  {source.source.branch}, {source.source.path || "the root"}, {source.source.files} files
                  {source.source.syncedAt ? `, synced ${ago(source.source.syncedAt)}` : ""}
                  {source.source.pending ? ", with changes to bring in" : ""}
                </span>
              </p>
              <Confirm
                title="Disconnect the repository?"
                says="The brand lives here alone again. The repository is left as it is."
                action="Disconnect"
                run={async () => {
                  const res = await fetch(`/api/v1/brands/${b}/source`, { method: "DELETE" });
                  if (!res.ok) return false;
                  router.refresh();
                  return true;
                }}
              >
                <Button variant="outline" size="sm">
                  Disconnect
                </Button>
              </Confirm>
            </div>
          ) : source.connect ? (
            <Button variant="outline" size="sm" asChild className="justify-self-start">
              <a href={source.connect}>
                <IconBrandGithub aria-hidden /> Connect a repository
              </a>
            </Button>
          ) : (
            <p className="text-muted-foreground text-sm">
              Its files live here alone. <code className="font-mono text-xs">GET /api/v1/brands/{brand.slug}/files</code> exports them as a folder, and{" "}
              <code className="font-mono text-xs">.../files/import</code> brings a folder back.
            </p>
          )}
        </Group>
      )}

      {!brand.default && (
        <Group tone="danger" title="Delete this brand" description="Its rules, pages and history go with it. Portals showing it stop showing it.">
          <Confirm
            title={`Delete ${brand.name}?`}
            says="Its rules, pages and history are deleted. This can't be undone."
            action="Delete brand"
            run={async () => {
              if (!(await send("DELETE", `/api/v1/brands/${b}`))) return false;
              toast.success(`Deleted ${brand.name}`);
              router.push("/brands");
              router.refresh();
              return true;
            }}
          >
            <Button variant="destructive" size="sm" className="justify-self-start">
              <IconTrash aria-hidden /> Delete brand
            </Button>
          </Confirm>
        </Group>
      )}
    </div>
  );
}
