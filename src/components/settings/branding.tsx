"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { IconCheck, IconCopy, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import { toast } from "sonner";
import { BrandMark } from "@/components/brand";
import { copy } from "@/components/brand-values";
import { send } from "@/components/collections";
import { IconButton } from "@/components/icon-button";
import { Group } from "@/components/settings/panels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_BRAND, type BrandingSettings } from "@/lib/branding";

type Source = "organization" | "environment" | "default";
export type BrandingSetting = { value: BrandingSettings; sources: Partial<Record<keyof BrandingSettings, Source>>; own: boolean };
type Dns<T extends string> = { type: T; name: string; value: string };
export type Domain = { host: string; verified: boolean; record: Dns<"TXT">; cname: Dns<"CNAME"> | null; portal: string | null; url: string };

const asAssetId = (raw: string) => raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? null;

/**
 * What the organization calls the product and how it looks: the app, sign-in,
 * share links, portals (unless a portal says otherwise) and email. Only what
 * changes here becomes the organization's own; the rest keeps coming from the
 * server's configuration (BRAND_*), or the product's own.
 */
export function BrandingPanel({ setting }: { setting: BrandingSetting }) {
  const id = useId();
  const router = useRouter();
  const v = setting.value;
  const [name, setName] = useState(v.name);
  const [tagline, setTagline] = useState(v.tagline ?? "");
  const [logo, setLogo] = useState(v.logo ?? "");
  const [icon, setIcon] = useState(v.icon ?? "");
  const [accent, setAccent] = useState(v.accent);
  const [footer, setFooter] = useState(v.emailFooter ?? "");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const logoId = logo.trim() ? asAssetId(logo) : null;
    const iconId = icon.trim() ? asAssetId(icon) : null;
    if ((logo.trim() && !logoId) || (icon.trim() && !iconId)) return toast.error("Logo and icon are images of the library: paste an asset's link, or its id");
    const next: BrandingSettings = { name: name.trim(), tagline: tagline.trim() || null, logo: logoId, icon: iconId, accent, emailFooter: footer.trim() || null };
    const patch = Object.fromEntries(Object.entries(next).filter(([k, x]) => x !== v[k as keyof BrandingSettings]));
    if (!Object.keys(patch).length) return toast("Nothing changed");
    setBusy(true);
    const saved = await send("PATCH", "/api/v1/settings/branding?context=organization", patch);
    setBusy(false);
    if (!saved) return;
    toast.success("Saved: everyone in the organization sees it now");
    // The whole page is in the brand: the sidebar, the title, the accent.
    window.location.reload();
  }

  const preview = { ...DEFAULT_BRAND, name: name || DEFAULT_BRAND.name, accent, custom: true };
  return (
    <form onSubmit={save} className="space-y-6">
      <Group title="Name" description="What the product is called: page titles, the sign-in screen, email subjects.">
        <div className="flex max-w-md items-center gap-3">
          <BrandMark brand={preview} />
          <Input id={`${id}-name`} aria-label="Product name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
        </div>
        <div className="grid max-w-md gap-2">
          <Label htmlFor={`${id}-tagline`}>Tagline</Label>
          <Input id={`${id}-tagline`} value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={160} placeholder="Under the name on the sign-in screen" />
        </div>
      </Group>
      <Group title="Look" description="Images come from the library, and show while they stay approved. Paste an asset's link, or its id.">
        <div className="grid max-w-md gap-2">
          <Label htmlFor={`${id}-logo`}>Logo</Label>
          <Input id={`${id}-logo`} value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="The sidebar, sign-in, share links and email" />
        </div>
        <div className="grid max-w-md gap-2">
          <Label htmlFor={`${id}-icon`}>Icon</Label>
          <Input id={`${id}-icon`} value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="Square: the browser tab" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-accent`}>Accent</Label>
          <div className="flex items-center gap-2">
            <Input id={`${id}-accent`} type="color" value={accent ?? "#6d4aff"} onChange={(e) => setAccent(e.target.value)} className="h-9 w-14 p-1" />
            <span className="text-muted-foreground font-mono text-xs">{accent ?? "The product's own"}</span>
            {accent && (
              <IconButton variant="ghost" label="Reset the accent" onClick={() => setAccent(null)}>
                <IconX />
              </IconButton>
            )}
          </div>
        </div>
      </Group>
      <Group title="Email" description="Invitations, share links, portal access and password resets arrive with the logo and accent above. The sender's name and address are in Email.">
        <div className="grid max-w-md gap-2">
          <Label htmlFor={`${id}-footer`}>Footer</Label>
          <Textarea id={`${id}-footer`} rows={2} maxLength={500} value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="Acme Inc, 1 Main Street. Questions: brand@acme.com" />
        </div>
      </Group>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          Save
        </Button>
        {setting.own && (
          <Button
            type="button"
            variant="ghost"
            onClick={async () => {
              if (!(await send("DELETE", "/api/v1/settings/branding?context=organization"))) return;
              toast.success("Back to the default look");
              router.refresh();
              window.location.reload();
            }}
          >
            Reset
          </Button>
        )}
      </div>
    </form>
  );
}

/**
 * The organization's own addresses: for the whole app, where its people sign
 * in and every emailed link points, and its portals' (managed on the portal).
 */
export function DomainsPanel({ domains }: { domains: Domain[] }) {
  const id = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const app = domains.filter((d) => !d.portal);
  const portals = domains.filter((d) => d.portal);
  return (
    <div className="space-y-6">
      <Group
        title="The app"
        description="An address of your own for everything: people sign in there, links in email point there, and it wears your brand. Point it at this server, add the TXT record, then check it."
      >
        {app.length > 0 && (
          <ul className="divide-y rounded-md border">
            {app.map((d) => (
              <li key={d.host} className="grid gap-2 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{d.host}</span>
                  {d.verified ? (
                    <Badge variant="outline" className="text-emerald-600">
                      <IconCheck /> Verified
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        const ok = await send("POST", `/api/v1/domains/${encodeURIComponent(d.host)}/verify`);
                        setBusy(false);
                        if (!ok) return;
                        toast.success(`${d.host} is verified`);
                        router.refresh();
                      }}
                    >
                      Check now
                    </Button>
                  )}
                  <IconButton
                    variant="ghost"
                    label={`Remove ${d.host}`}
                    onClick={async () => {
                      if (!confirm(`Stop answering at ${d.host}? People using it will have to use ${new URL(window.location.href).host}.`)) return;
                      if (await send("DELETE", `/api/v1/domains/${encodeURIComponent(d.host)}`)) router.refresh();
                    }}
                  >
                    <IconTrash />
                  </IconButton>
                </div>
                {!d.verified && (
                  <div className="bg-muted/50 grid gap-1 rounded-md p-2.5 font-mono text-xs">
                    {d.cname && (
                      <p className="flex items-center gap-2 break-all">
                        <span className="text-muted-foreground w-10 shrink-0 font-sans">CNAME</span>
                        {d.cname.name} → {d.cname.value}
                        <IconButton variant="ghost" label="Copy the target" onClick={() => copy(d.cname!.value, "the target")}>
                          <IconCopy />
                        </IconButton>
                      </p>
                    )}
                    {[d.record.name, d.record.value].map((x, i) => (
                      <p key={x} className="flex items-center gap-2 break-all">
                        <span className="text-muted-foreground w-10 shrink-0 font-sans">{i ? "Value" : "TXT"}</span>
                        {x}
                        <IconButton variant="ghost" label={i ? "Copy the value" : "Copy the name"} onClick={() => copy(x, i ? "the value" : "the name")}>
                          <IconCopy />
                        </IconButton>
                      </p>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex max-w-md items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const host = String(new FormData(form).get("host") ?? "").trim();
            if (!host) return;
            if (!(await send("POST", "/api/v1/domains", { host }))) return;
            form.reset();
            router.refresh();
          }}
        >
          <div className="grid flex-1 gap-2">
            <Label htmlFor={id}>Add a domain</Label>
            <Input id={id} name="host" placeholder="assets.example.com" />
          </div>
          <Button type="submit" variant="outline">
            <IconPlus /> Add
          </Button>
        </form>
      </Group>
      {portals.length > 0 && (
        <Group title="Portals" description="Each is set on its portal, in Portals.">
          <ul className="divide-y rounded-md border text-sm">
            {portals.map((d) => (
              <li key={d.host} className="flex items-center gap-2 p-3">
                <span className="min-w-0 flex-1 truncate">{d.host}</span>
                <span className="text-muted-foreground text-xs">/p/{d.portal}</span>
                <Badge variant="outline">{d.verified ? "Verified" : "Not verified"}</Badge>
              </li>
            ))}
          </ul>
        </Group>
      )}
    </div>
  );
}
