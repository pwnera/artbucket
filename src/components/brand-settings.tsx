"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconBrandGithub, IconSettings, IconStar, IconTrash } from "@tabler/icons-react";
import type { HeadBrand } from "@/lib/brand-head";
import type { Source } from "@/components/builder/use-status";
import { Can } from "@/components/can";
import { Confirm } from "@/components/confirm";
import { InfoTip } from "@/components/info-tip";
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
  const [domain, setDomain] = useState(brand.domain ?? "");
  const [saved, setSaved] = useState<{ name: number; slug: number; domain: number }>({ name: 0, slug: 0, domain: 0 });
  const [busy, setBusy] = useState<string | null>(null);

  const patch = async (what: "name" | "slug" | "domain", body: Record<string, unknown>) => {
    setBusy(what);
    const done = (await send("PATCH", `/api/v1/brands/${b}`, body)) as { slug: string; domain?: string | null } | null;
    setBusy(null);
    if (!done) return;
    // The domain as the server keeps it: acme.com for https://www.acme.com/.
    if (what === "domain") setDomain(done.domain ?? "");
    setSaved((s) => ({ ...s, [what]: Date.now() }));
    // A new address: this page lives at it now.
    if (done.slug !== brand.slug) router.replace(brandPath(done.slug, "/settings"));
    router.refresh();
  };

  return (
    <div className="grid gap-4">
      <Group title="Name and address">
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
            <Label htmlFor="brand-slug">
              Address <InfoTip>Used in links, the API and on BrandHub. Old links stop working when it changes.</InfoTip>
            </Label>
            <Input id="brand-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} maxLength={60} className="font-mono" />
          </div>
          <span className="flex items-center gap-2">
            <SavedMark at={saved.slug} />
            <Button type="submit" variant="outline" pending={busy === "slug"} disabled={!slug.trim() || slug === brand.slug}>
              Change
            </Button>
          </span>
        </form>
        <form
          className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void patch("domain", { domain: domain.trim() || null });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="brand-domain">
              Domain <InfoTip>The brand&apos;s own website. Whoever proves they hold it may claim the brand&apos;s BrandHub listing.</InfoTip>
            </Label>
            <Input
              id="brand-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              maxLength={253}
              placeholder="acme.com"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              className="font-mono"
            />
          </div>
          <span className="flex items-center gap-2">
            <SavedMark at={saved.domain} />
            <Button type="submit" variant="outline" pending={busy === "domain"} disabled={domain.trim() === (brand.domain ?? "")}>
              Save
            </Button>
          </span>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <p className="flex items-center gap-1.5 text-sm">
            {brand.private ? "Private" : "Everyone in the project"}
            <InfoTip>A private brand is reached only by people given access to it, and admins: a draft kept from the rest of the project. Portals and BrandHub are apart.</InfoTip>
          </p>
          <Button
            variant="outline"
            size="sm"
            pending={busy === "private"}
            onClick={async () => {
              setBusy("private");
              const done = await send("PATCH", `/api/v1/brands/${b}`, { private: !brand.private });
              setBusy(null);
              if (!done) return;
              toast.success(brand.private ? `${brand.name} is the project's again` : `${brand.name} is private`);
              router.refresh();
            }}
          >
            {brand.private ? "Open to the project" : "Make private"}
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <p className="flex items-center gap-1.5 text-sm">
            {brand.default ? "Default brand" : "Not the default brand"}
            <InfoTip>Agents and the API read the default brand when no brand is named.</InfoTip>
          </p>
          {!brand.default && (
            <Button
              variant="outline"
              size="sm"
              pending={busy === "default"}
              onClick={async () => {
                setBusy("default");
                const done = await send("PATCH", `/api/v1/brands/${b}`, { default: true });
                setBusy(null);
                if (!done) return;
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
        <Group title="Repository" description="Brand as code, synced both ways.">
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
              {source.connect ? (
                // The integration made the link and its key: its page moves or disconnects it, and takes the key with it.
                <Button variant="outline" size="sm" asChild>
                  <a href={source.connect}>
                    <IconSettings aria-hidden /> Manage
                  </a>
                </Button>
              ) : (
                <Confirm
                  title="Disconnect the repository?"
                  says="The brand lives here alone again. The repository is left as it is."
                  action="Disconnect"
                  run={async () => {
                    if (!(await send("DELETE", `/api/v1/brands/${b}/source`))) return false;
                    router.refresh();
                    return true;
                  }}
                >
                  <Button variant="outline" size="sm">
                    Disconnect
                  </Button>
                </Confirm>
              )}
            </div>
          ) : source.connect ? (
            <Button variant="outline" size="sm" asChild className="justify-self-start">
              <a href={source.connect}>
                <IconBrandGithub aria-hidden /> Connect a repository
              </a>
            </Button>
          ) : (
            <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
              Not connected
              <InfoTip>
                <code className="font-mono">GET /api/v1/brands/{brand.slug}/files</code> exports its files as a folder; <code className="font-mono">.../files/import</code> brings one back.
              </InfoTip>
            </p>
          )}
        </Group>
      )}

      {!brand.default && (
        <Can do="brand.delete">
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
        </Can>
      )}
    </div>
  );
}
