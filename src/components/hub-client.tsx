"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconChevronDown, IconFlag, IconGitFork, IconRobot, IconSearch, IconStar, IconStarFilled } from "@tabler/icons-react";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { groundFor, inkOn, type Rgb } from "@/lib/color";
import { REPORT_REASONS, type ReportReason } from "@/lib/hub";
import { send } from "@/lib/send";
import { cn } from "@/lib/utils";

/**
 * The BrandHub's interactive bits: its search, which `/` focuses from
 * anywhere as on GitHub, and the Use this brand menu, GitHub's Code button
 * for brands: the addresses an agent or a build reads it from.
 */

export function HubSearch({ action, defaultValue = "", className, big }: { action: string; defaultValue?: string; className?: string; big?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || t?.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form role="search" action={action} className={cn("relative", className)}>
      <IconSearch aria-hidden className={cn("text-muted-foreground absolute start-3 top-1/2 -translate-y-1/2", big ? "size-5" : "size-4")} />
      <Input
        ref={ref}
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="Search brands and owners"
        aria-label="Search brands and owners"
        className={cn("bg-background pe-9", big ? "h-12 ps-10 text-base" : "h-8 ps-9")}
      />
      <kbd aria-hidden className="text-muted-foreground bg-muted absolute end-2.5 top-1/2 -translate-y-1/2 rounded border px-1.5 font-mono text-[11px]">
        /
      </kbd>
    </form>
  );
}

const FORMATS = [
  ["css", "CSS"],
  ["tailwind", "Tailwind 4"],
  ["scss", "Sass"],
  ["json", "W3C tokens"],
  ["shadcn", "shadcn/ui"],
  ["ts", "TypeScript"],
] as const;

type Tab = "agent" | "json" | "tokens";

/** The addresses a listing answers at, one to copy at a time. */
export function UseBrand({ url, name }: { url: string; name: string }) {
  const [tab, setTab] = useState<Tab>("agent");
  const [format, setFormat] = useState<(typeof FORMATS)[number][0]>("css");
  const shown = tab === "agent" ? `${url}/llms.txt` : tab === "json" ? `${url}/brand.json` : `${url}/tokens?format=${format}`;
  const hint = {
    agent: `Point any agent at it: ${name}'s rules, logos and type, in words.`,
    json: "Every rule and its files, for a build or a script.",
    tokens: "Design tokens, with @font-face for its fonts.",
  }[tab];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" className="ms-1">
          <IconRobot aria-hidden /> Use this brand <IconChevronDown aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(26rem,calc(100vw-2rem))] p-0">
        <div role="tablist" aria-label="How to use it" className="flex border-b px-2">
          {(
            [
              ["agent", "Agents"],
              ["json", "JSON"],
              ["tokens", "Tokens"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className="text-muted-foreground aria-selected:border-primary aria-selected:text-foreground -mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 p-3">
          <p className="text-muted-foreground text-xs">{hint}</p>
          {tab === "tokens" && (
            <div className="flex flex-wrap gap-1">
              {FORMATS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={format === id}
                  onClick={() => setFormat(id)}
                  className="aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:border-primary rounded-full border px-2.5 py-0.5 text-xs"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="bg-muted/60 flex min-w-0 items-center gap-1 rounded-md border ps-2.5">
            <code className="min-w-0 flex-1 truncate py-1.5 text-xs">{shown}</code>
            <CopyButton text={shown} label="Copy the address" what="the address" />
          </div>
          <p className="text-muted-foreground text-xs">Public, no key. Add @ and a release number after the name to pin one.</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Report a listing, or claim it (lib/core/hub-trust.ts). Anyone reports,
 * signed in or not. A community listing can be claimed by its brand's
 * owner: `claim` is true when this person may, here, else where to go to
 * (signing in, or the app's own address, where the session is).
 */
export function ListingTrust({ org, brand, name, claim }: { org: string; brand: string; name: string; claim: true | { href: string; label: string } | null }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"report" | "claim">("report");
  const [reason, setReason] = useState<ReportReason>("impersonation");
  const [busy, setBusy] = useState(false);
  const at = `/api/v1/hub/${encodeURIComponent(org)}/${encodeURIComponent(brand)}`;
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || undefined;
    setBusy(true);
    const got =
      tab === "report"
        ? await send("POST", `${at}/reports`, { reason, note: text("note"), contact: text("contact") })
        : await send("POST", `${at}/claims`, { note: text("note") });
    setBusy(false);
    if (!got) return;
    toast.success(tab === "report" ? "Thanks: the listing's owner will see your report" : "Claim sent", {
      description: tab === "claim" ? `It names ${got.proof} as yours. The listing's owner and this server's operator will be in touch.` : undefined,
    });
    setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs underline-offset-2 hover:underline">
          <IconFlag aria-hidden className="size-3.5" /> {claim ? "Report or claim this listing" : "Report this listing"}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{tab === "report" ? `Report ${name}` : `Claim ${name}`}</DialogTitle>
            <DialogDescription>
              {tab === "report"
                ? "The listing's owner and this server's operator see it. Nothing about it is public."
                : "Say this is your brand. The claim names the domain or GitHub account your organization proved, and your email, for the listing's owner and this server's operator: they hand it over or take it down."}
            </DialogDescription>
          </DialogHeader>
          {claim && (
            <div role="tablist" aria-label="Report or claim" className="flex border-b">
              {(["report", "claim"] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  type="button"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className="text-muted-foreground aria-selected:border-primary aria-selected:text-foreground -mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium"
                >
                  {t === "report" ? "Report" : "It's my brand"}
                </button>
              ))}
            </div>
          )}
          {tab === "report" ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor={`${id}-reason`}>What is wrong</Label>
                <Select value={reason} onValueChange={(v) => setReason(v as ReportReason)}>
                  <SelectTrigger id={`${id}-reason`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(REPORT_REASONS) as ReportReason[]).map((r) => (
                      <SelectItem key={r} value={r}>
                        {REPORT_REASONS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${id}-note`}>Details</Label>
                <Textarea id={`${id}-note`} name="note" maxLength={2000} rows={3} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${id}-contact`}>How to reach you (optional)</Label>
                <Input id={`${id}-contact`} name="contact" maxLength={200} autoComplete="email" />
              </div>
            </>
          ) : claim === true ? (
            <div className="grid gap-2">
              <Label htmlFor={`${id}-claim`}>Who you are to {name}</Label>
              <Textarea id={`${id}-claim`} name="note" maxLength={2000} rows={3} placeholder="And whether you want the listing handed over or taken down" />
            </div>
          ) : (
            <p className="text-sm">
              <a href={claim!.href} className="text-primary-ink underline underline-offset-2">
                {claim!.label}
              </a>{" "}
              to claim it, as an admin of an organization that proved a domain or a GitHub account.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {(tab === "report" || claim === true) && (
              <Button type="submit" pending={busy}>
                {tab === "report" ? "Send report" : "Send claim"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Follow a listing, or stop: it shows in the Following tab of the hub's front page. */
export function FollowButton({ org, brand, following, count }: { org: string; brand: string; following: boolean; count?: number }) {
  const router = useRouter();
  const [on, setOn] = useState(following);
  // The count moves with the star, before the server answers; the refresh brings the true one.
  const [n, setN] = useState(count ?? 0);
  const [seen, setSeen] = useState(count);
  if (count !== seen) {
    setSeen(count);
    setN(count ?? 0);
  }
  const busy = useRef(false);
  const toggle = async () => {
    if (busy.current) return;
    busy.current = true;
    const next = !on;
    setOn(next);
    setN((x) => Math.max(0, x + (next ? 1 : -1)));
    const got = await send(next ? "PUT" : "DELETE", `/api/v1/hub/${encodeURIComponent(org)}/${encodeURIComponent(brand)}/follow`);
    busy.current = false;
    if (!got) {
      setOn(!next);
      setN((x) => Math.max(0, x + (next ? -1 : 1)));
      return;
    }
    setOn(got.following);
    router.refresh();
  };
  return (
    <Button variant="ghost" size="sm" onClick={toggle} aria-pressed={on}>
      {on ? <IconStarFilled key="on" aria-hidden className="text-warning animate-in zoom-in-50 spin-in-[-72deg] duration-300" /> : <IconStar key="off" aria-hidden />}{" "}
      {on ? "Following" : "Follow"}
      {count !== undefined && n > 0 && (
        <span key={n} className="text-muted-foreground animate-in fade-in-0 tabular-nums duration-150">
          · {n.toLocaleString("en")}
        </span>
      )}
    </Button>
  );
}

/**
 * Start from this brand (lib/core/hub.ts startFrom): a new brand in the
 * workspace the person has open, from this release's rules, pages, theme and
 * files, then on to it in the app.
 */
export function StartFrom({ from, name, app }: { from: string; name: string; app: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(name);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const made = await send("POST", "/api/v1/brands", { name: title.trim(), from });
    setBusy(false);
    if (!made) return;
    toast.success(`Created ${made.name}`);
    // The app, which may be on another host than the hub's: a full load.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    location.assign(`${app}/brands/${encodeURIComponent(made.slug)}`);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <IconGitFork aria-hidden /> Start from this brand
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Start from {name}</DialogTitle>
            <DialogDescription>
              A new brand in your workspace from {from}: its rules, pages, theme and files, copied, to make your own. It remembers where it came from.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input id={`${id}-name`} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" pending={busy} disabled={!title.trim()}>
              Create brand
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A loaded mark's opaque pixels, sampled 256 wide or tall in its own
 * proportions, so a wordmark's thin strokes and a small symbol beside it
 * count; null when it has a ground of its own (nearly every pixel opaque) or
 * can't be read (another origin), so it keeps the ground it has.
 */
function markPixels(img: HTMLImageElement) {
  try {
    const k = 256 / Math.max(img.naturalWidth, img.naturalHeight, 1);
    const [w, h] = [Math.max(1, Math.round(img.naturalWidth * k)), Math.max(1, Math.round(img.naturalHeight * k))];
    const c = document.createElement("canvas");
    [c.width, c.height] = [w, h];
    const x = c.getContext("2d", { willReadFrequently: true });
    if (!x) return null;
    x.drawImage(img, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    const px: Rgb[] = [];
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) px.push([d[i], d[i + 1], d[i + 2]]);
    return px.length > 0.9 * w * h ? null : px;
  } catch {
    return null;
  }
}

/** Any CSS color (a theme's oklab too) as hex, through a pixel. */
function cssHex(color: string) {
  const x = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!x) return null;
  x.fillStyle = color;
  x.fillRect(0, 0, 1, 1);
  const [r, g, b] = x.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * A logo on a transparency checker (components/brand-card.tsx): the theme's
 * while the logo reads on it, else a dark or a light one (lib/color.ts
 * groundFor), so a white logo shows on the light theme and a black one on
 * the dark.
 */
export function LogoWell({ src, alt }: { src: string; alt: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [ground, setGround] = useState<string | null>(null);
  useEffect(() => {
    const img = ref.current;
    const well = img?.parentElement;
    if (!img || !well) return;
    const pick = () => {
      const px = markPixels(img);
      const theme = cssHex(getComputedStyle(well).backgroundColor);
      if (!px || !theme) return;
      // 2, not the cards' 3: an orange mark stays on the theme's checker, a white one leaves it.
      const g = groundFor(px, theme, [], 2);
      if (g !== theme) setGround(g);
    };
    if (img.complete) pick();
    else img.addEventListener("load", pick, { once: true });
    return () => img.removeEventListener("load", pick);
  }, [src]);
  return (
    <div className="bg-checker h-36 p-6 transition-colors duration-300" style={ground ? ({ backgroundColor: ground, "--checker": inkOn(ground) } as React.CSSProperties) : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a signed rendition, already sized */}
      <img ref={ref} src={src} alt={alt} className="size-full object-contain" loading="lazy" />
    </div>
  );
}

/**
 * A brand's mark on its ground (components/hub.tsx Mark): the server's
 * ground, swapped once the mark loads for one of the brand's colors it reads
 * on (lib/color.ts groundFor), so a white wordmark doesn't vanish on a pale
 * wash. A mark with a ground of its own (nearly every pixel opaque) keeps it.
 */
export function TileGround({ logo, ground, groundHex, palette, className, img: imgClass, children }: { logo: string; ground: string; groundHex: string; palette: string[]; className?: string; img: string; children?: React.ReactNode }) {
  const ref = useRef<HTMLImageElement>(null);
  const [bg, setBg] = useState(ground);
  const key = palette.join();
  useEffect(() => {
    const img = ref.current;
    if (!img) return;
    const pick = () => {
      const px = markPixels(img);
      if (!px) return;
      const g = groundFor(px, groundHex, key ? key.split(",") : []);
      if (g !== groundHex) setBg(g);
    };
    if (img.complete) pick();
    else img.addEventListener("load", pick, { once: true });
    return () => img.removeEventListener("load", pick);
  }, [groundHex, key]);
  return (
    <span className={cn("relative grid transition-colors duration-300", className)} style={{ background: bg }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a signed rendition, already sized */}
      <img ref={ref} src={logo} alt="" className={imgClass} loading="lazy" />
      {children}
    </span>
  );
}
