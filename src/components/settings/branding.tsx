"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useId, useState, useTransition } from "react";
import { IconCheck, IconPhoto, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import { toast } from "sonner";
import { LibraryPicker } from "@/components/asset-picker";
import { BrandMark } from "@/components/brand";
import { ColorField } from "@/components/color-field";
import { Confirm } from "@/components/confirm";
import { CopyButton } from "@/components/copy-button";
import { IconButton } from "@/components/icon-button";
import { Hint } from "@/components/settings/email";
import { Group, useLeaveGuard } from "@/components/settings/panels";
import { Thumb } from "@/components/thumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_BRAND, type BrandingSettings } from "@/lib/branding";
import { APP_BG, contrast, grade } from "@/lib/color";
import { send } from "@/lib/send";
import { flash, useFlashNew } from "@/lib/motion";
import { Waiting } from "@/components/waiting";

type Source = "organization" | "environment" | "default";
export type BrandingSetting = { value: BrandingSettings; sources: Partial<Record<keyof BrandingSettings, Source>>; own: boolean };
type Dns<T extends string> = { type: T; name: string; value: string };
export type Domain = { host: string; verified: boolean; primary: boolean; record: Dns<"TXT">; cname: Dns<"CNAME"> | null; portal: string | null; url: string };

const asAssetId = (raw: string) => raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? null;
/** The product's own accent, what the picker shows until one is set. */
const OWN_ACCENT = "#6d4aff";

/**
 * What the organization calls the product and how it looks: the app, sign-in,
 * share links, portals (unless a portal says otherwise) and email. Only what
 * changes here becomes the organization's own; the rest keeps coming from the
 * server's configuration (BRAND_*), or the product's own. The page remounts
 * it from what the server has after each save.
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
  const [picking, setPicking] = useState<"logo" | "icon" | null>(null);
  const [busy, setBusy] = useState(false);
  // router.refresh() re-renders the root layout (accent, title, icon): pending until it lands, not a reload.
  const [refreshing, refresh] = useTransition();

  const logoId = logo.trim() ? asAssetId(logo) : null;
  const iconId = icon.trim() ? asAssetId(icon) : null;
  const bad = { logo: !!logo.trim() && !logoId, icon: !!icon.trim() && !iconId };
  const next: BrandingSettings = { name: name.trim(), tagline: tagline.trim() || null, logo: logoId, icon: iconId, accent, emailFooter: footer.trim() || null };
  const patch = Object.fromEntries(Object.entries(next).filter(([k, x]) => x !== v[k as keyof BrandingSettings]));
  const dirty = Object.keys(patch).length > 0 || bad.logo || bad.icon;
  useLeaveGuard(dirty);
  const env = (k: keyof BrandingSettings) => (setting.sources[k] === "environment" ? "from the server's configuration" : null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || bad.logo || bad.icon) return;
    setBusy(true);
    const saved = await send("PATCH", "/api/v1/settings/branding?context=organization", patch);
    setBusy(false);
    if (!saved) return;
    toast.success("Saved: everyone in the organization sees it now");
    refresh(() => router.refresh());
  }

  const preview = { ...DEFAULT_BRAND, name: name || DEFAULT_BRAND.name, accent, custom: true, logo: logoId && `/a/${logoId}/h_64,f_webp` };
  const image = (which: "logo" | "icon", label: string, placeholder: string) => {
    const { raw, set, asset } = which === "logo" ? { raw: logo, set: setLogo, asset: logoId } : { raw: icon, set: setIcon, asset: iconId };
    return (
      <div className="grid max-w-md gap-2">
        <Label htmlFor={`${id}-${which}`}>{label}</Label>
        <div className="flex items-center gap-2">
          <span className="bg-muted relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border">
            {asset ? <Thumb key={asset} src={`/a/${asset}/w_40,f_webp`} alt="" className="p-1" /> : <IconPhoto className="text-muted-foreground size-4" />}
          </span>
          <Input
            id={`${id}-${which}`}
            value={raw}
            onChange={(e) => set(e.target.value)}
            placeholder={placeholder}
            aria-invalid={bad[which] || undefined}
            aria-describedby={bad[which] ? `${id}-${which}-error` : undefined}
            className="flex-1"
          />
          <Button type="button" variant="outline" onClick={() => setPicking(which)}>
            Choose
          </Button>
        </div>
        {bad[which] ? (
          <p id={`${id}-${which}-error`} className="text-destructive text-xs">
            That isn&apos;t an asset: paste an asset&apos;s link or id, or choose one.
          </p>
        ) : (
          <Hint text={env(which)} />
        )}
      </div>
    );
  };

  return (
    <form onSubmit={save} className="space-y-6">
      <Group title="Name" info="What the product is called: page titles, the sign-in screen, email subjects.">
        <div className="grid max-w-md gap-2">
          <div className="flex items-center gap-3">
            <BrandMark brand={preview} />
            <Input id={`${id}-name`} aria-label="Product name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
          </div>
          <Hint text={env("name")} />
        </div>
        <div className="grid max-w-md gap-2">
          <Label htmlFor={`${id}-tagline`}>Tagline</Label>
          <Input id={`${id}-tagline`} value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={160} placeholder="Under the name on the sign-in screen" />
          <Hint text={env("tagline")} />
        </div>
      </Group>
      <Group title="Look" info="Images come from the library, and show while they stay approved.">
        {image("logo", "Logo", "The sidebar, sign-in, share links and email")}
        {image("icon", "Icon", "Square: the browser tab")}
        <div className="grid gap-2">
          <Label htmlFor={`${id}-accent`}>Accent</Label>
          <div className="flex flex-wrap items-center gap-2">
            <ColorField id={`${id}-accent`} label="Accent" value={accent ?? OWN_ACCENT} onChange={setAccent} />
            {accent ? (
              <IconButton variant="ghost" label="Back to the product's own accent" onClick={() => setAccent(null)}>
                <IconX />
              </IconButton>
            ) : (
              <span className="text-muted-foreground text-xs">The product&apos;s own</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Legibility color={accent ?? OWN_ACCENT} on={APP_BG.light} theme="light" />
            <Legibility color={accent ?? OWN_ACCENT} on={APP_BG.dark} theme="dark" />
          </div>
          <Hint text={env("accent")} />
        </div>
      </Group>
      <Group title="Email" info="Invitations, share links, portal access and password resets arrive with the logo and accent above. The sender's name and address are in Email.">
        <div className="grid max-w-md gap-2">
          <Label htmlFor={`${id}-footer`}>Footer</Label>
          <Textarea id={`${id}-footer`} rows={2} maxLength={500} value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="Acme Inc, 1 Main Street. Questions: brand@acme.com" />
          <Hint text={env("emailFooter")} />
        </div>
      </Group>
      <div className="flex gap-2">
        <Button type="submit" pending={busy || refreshing} disabled={!dirty || bad.logo || bad.icon}>
          Save
        </Button>
        {setting.own && (
          <Confirm
            title="Reset the branding?"
            says="Everyone goes back to the product's own name, look and email footer, or to the server's configuration where it sets them."
            action="Reset"
            run={async () => {
              const ok = await send("DELETE", "/api/v1/settings/branding?context=organization");
              if (!ok) return null;
              toast.success("Back to the default look");
              refresh(() => router.refresh());
              return ok;
            }}
          >
            <Button type="button" variant="ghost">
              Reset
            </Button>
          </Confirm>
        )}
      </div>
      {picking && (
        <LibraryPicker
          title={picking === "logo" ? "Choose the logo" : "Choose the icon"}
          description="Shown while it stays approved."
          filter={(a) => a.mime.startsWith("image/") && a.state === "active"}
          onClose={() => setPicking(null)}
          onPick={(a) => {
            (picking === "logo" ? setLogo : setIcon)(a.id);
            setPicking(null);
          }}
        />
      )}
    </form>
  );
}

/** How the accent reads as a button and focus ring in one theme: its contrast with that background, graded. */
function Legibility({ color, on, theme }: { color: string; on: string; theme: string }) {
  const ratio = contrast(color, on);
  const g = grade(ratio);
  return (
    <Badge variant={g === "fail" ? "destructive" : g === "AA large" ? "warning" : "success"} title={`${ratio.toFixed(1)}:1 against ${on}`}>
      {theme === "light" ? "Light" : "Dark"} theme: {g === "fail" ? "hard to see" : g} ({ratio.toFixed(1)}:1)
    </Badge>
  );
}

/** How long a pending domain is re-checked on its own, and how often. */
const RECHECK = { every: 30_000, for: 10 * 60_000 };

/**
 * The organization's own addresses. Each serves the whole app, the default
 * one being where links in email point, or one portal, which picks it in
 * Portals. Each is proved by a TXT record, and by pointing at the server;
 * while one isn't yet, it is checked again every 30s for 10 minutes, as DNS
 * takes minutes to spread.
 */
export function DomainsPanel({ domains }: { domains: Domain[] }) {
  const id = useId();
  const router = useRouter();
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const act = async (host: string, method: string, path: string, body: unknown, done: string) => {
    setBusy((b) => ({ ...b, [host]: true }));
    const ok = await send(method, path, body);
    setBusy((b) => ({ ...b, [host]: false }));
    if (!ok) return;
    toast.success(done);
    router.refresh();
  };

  const waiting = domains.filter((d) => !d.verified).map((d) => d.host).join(" ");
  // A domain just added lights up when the list brings it.
  useFlashNew(
    domains.map((d) => d.host),
    (host) => `[data-domain="${CSS.escape(host)}"]`,
  );
  // When the pending ones were last checked, and whether it has given up: said under each, so the wait is seen.
  // `gaveUp`: the pending set it stopped checking, so a domain added after starts it over.
  const [checked, setChecked] = useState<{ at: number | null; gaveUp: string | null }>({ at: null, gaveUp: null });
  useEffect(() => {
    if (!waiting) return;
    const until = Date.now() + RECHECK.for;
    const t = setInterval(async () => {
      if (Date.now() > until) {
        clearInterval(t);
        return setChecked((c) => ({ ...c, gaveUp: waiting }));
      }
      if (document.visibilityState !== "visible") return;
      for (const host of waiting.split(" ")) {
        // Not send(): a 422 only means "not yet", which is no error to toast, and no save to count.
        const res = await fetch(`/api/v1/domains/${encodeURIComponent(host)}/verify`, { method: "POST" }).catch(() => null);
        if (!res?.ok) continue;
        toast.success(`${host} is verified`);
        flash(`[data-domain="${CSS.escape(host)}"]`);
        router.refresh();
      }
      setChecked({ at: Date.now(), gaveUp: null });
    }, RECHECK.every);
    return () => clearInterval(t);
  }, [waiting, router]);

  return (
    <div className="space-y-6">
      <Group
        title="Domains"
        description="Point each at this server, add the TXT record, then check it."
        info="People sign in at any of them, and the default is where links in email point. A portal can take one instead, in Portals."
      >
        {domains.length > 0 && (
          <ul className="divide-y rounded-md border">
            {domains.map((d) => {
              const at = `/api/v1/domains/${encodeURIComponent(d.host)}`;
              const records: [string, string, string][] = [
                ...(d.cname ? ([["CNAME", d.cname.name, "the name"], ["Points to", d.cname.value, "the target"]] as [string, string, string][]) : []),
                ["TXT", d.record.name, "the TXT name"],
                ["Value", d.record.value, "the TXT value"],
              ];
              return (
                <li key={d.host} data-domain={d.host} className="grid gap-2 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-48 flex-1 truncate font-medium" title={d.host}>
                      {d.host}
                    </span>
                    {d.primary && <Badge>Default</Badge>}
                    {d.portal && <Badge variant="outline">Portal /p/{d.portal}</Badge>}
                    {d.verified ? (
                      <Badge variant="success">
                        <IconCheck className="animate-in zoom-in-50 duration-300" /> Verified
                      </Badge>
                    ) : (
                      <Button size="sm" variant="outline" pending={busy[d.host]} onClick={() => act(d.host, "POST", `${at}/verify`, undefined, `${d.host} is verified`)}>
                        Check now
                      </Button>
                    )}
                    {d.verified && !d.primary && !d.portal && (
                      <Button size="sm" variant="ghost" pending={busy[d.host]} onClick={() => act(d.host, "PATCH", at, { primary: true }, `Links in email point at ${d.host} now`)}>
                        Make default
                      </Button>
                    )}
                    <Confirm
                      title={`Stop answering at ${d.host}?`}
                      says={d.portal ? `The portal goes back to /p/${d.portal}.` : "People using it will have to use another address."}
                      action="Remove"
                      run={async () => {
                        const ok = await send("DELETE", at);
                        if (!ok) return null;
                        toast.success(`Removed ${d.host}`);
                        router.refresh();
                        return ok;
                      }}
                    >
                      <IconButton variant="ghost" label={`Remove ${d.host}`} className="text-muted-foreground hover:text-destructive">
                        <IconTrash />
                      </IconButton>
                    </Confirm>
                  </div>
                  {!d.verified && (
                    <div className="bg-muted/50 grid gap-2 rounded-md p-2.5 text-xs">
                      {/* One row per value, the copy button in its own column, so it doesn't move with the text. */}
                      <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                        {records.map(([label, value, what]) => (
                          <Fragment key={label}>
                            <dt className="text-muted-foreground">{label}</dt>
                            <dd className="font-mono break-all">{value}</dd>
                            <CopyButton text={value} label={`Copy ${what}`} what={what} />
                          </Fragment>
                        ))}
                      </dl>
                      {d.cname && (
                        <p className="text-muted-foreground">
                          Both are checked. At a zone&apos;s apex, use an ALIAS or flattened record.
                        </p>
                      )}
                      <Waiting what="Waiting for DNS, checked every 30 seconds" checkedAt={checked.at} stopped={checked.gaveUp === waiting} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <form
          className="flex max-w-md items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const host = String(new FormData(form).get("host") ?? "").trim();
            if (!host) return;
            setAdding(true);
            const ok = await send("POST", "/api/v1/domains", { host });
            setAdding(false);
            if (!ok) return;
            toast.success(`Added ${host}`, { description: "Add its DNS records, then check it." });
            form.reset();
            router.refresh();
          }}
        >
          <div className="grid flex-1 gap-2">
            <Label htmlFor={id}>Add a domain</Label>
            <Input id={id} name="host" placeholder="assets.example.com" autoCapitalize="none" autoComplete="off" spellCheck={false} inputMode="url" />
          </div>
          <Button type="submit" variant="outline" pending={adding}>
            <IconPlus /> Add
          </Button>
        </form>
      </Group>
    </div>
  );
}
