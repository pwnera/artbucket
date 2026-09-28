"use client";

import { useRef, useState } from "react";
import { IconCopy, IconDownload, IconPhotoScan } from "@tabler/icons-react";
import { IconButton } from "@/components/icon-button";
import { toast } from "sonner";
import { useCan } from "@/components/can";
import { send } from "@/components/collections";
import type { Asset } from "@/components/gallery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { withSignature } from "@/lib/asset-url";
import { FITS, FORMATS, MAX_DIMENSION, PRESETS, type Fit, type Format } from "@/lib/transform";

export { PRESETS };

export const extOf = (spec: string) => spec.match(/f_(\w+)/)?.[1]?.replace("jpeg", "jpg");
export const stem = (filename: string) => filename.replace(/\.[^.]+$/, "");

/** Who a copied link works for: people with access, anyone for a while (signed), or anyone (a public asset). */
const REACH = [
  { value: "team", label: "People with access" },
  { value: "86400", label: "Anyone, for a day" },
  { value: "604800", label: "Anyone, for a week" },
  { value: "2592000", label: "Anyone, for 30 days" },
] as const;

/**
 * Copy a link to, or download, the asset at a preset or a custom size. Files
 * are private: a copied link works for people with access, unless it is
 * signed for anyone for a while (one signature serves every size), or the
 * asset is public. Downloads here go through the session.
 */
export function Renditions({ asset }: { asset: Asset }) {
  const can = useCan();
  const signable = !asset.public && asset.status === "active" && can("asset.share", asset);
  const [reach, setReach] = useState<string>("team");
  const sigs = useRef(new Map<string, string>());
  /** The URL to copy for this reach; null when it couldn't be signed. */
  const linkFor = async (url: string) => {
    if (asset.public || reach === "team") return url;
    let s = sigs.current.get(reach);
    if (!s) {
      const made = await send("POST", `/api/v1/assets/${asset.id}/signed-url`, { expiresIn: Number(reach) });
      s = made ? (new URL(made.url).searchParams.get("s") ?? undefined) : undefined;
      if (!s) return null;
      sigs.current.set(reach, s);
    }
    return withSignature(url, s);
  };
  const [w, setW] = useState("");
  const [h, setH] = useState("");
  const [f, setF] = useState<Format>("webp");
  const [fit, setFit] = useState<Fit>("inside");

  const custom = [w && `w_${w}`, h && `h_${h}`, w && h && `fit_${fit}`, `f_${f}`].filter(Boolean).join(",");
  const dims = (n: string) => n === "" || (/^\d+$/.test(n) && +n >= 1 && +n <= MAX_DIMENSION);
  const valid = dims(w) && dims(h);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton label="Sizes and formats">
          <IconPhotoScan />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-96 p-0">
        <div className="flex items-center gap-2 px-3 pt-3 pb-1 text-xs">
          <span className="text-muted-foreground shrink-0">Copied links work for</span>
          {asset.public ? (
            <span className="font-medium">Anyone: it is public</span>
          ) : signable ? (
            <Select value={reach} onValueChange={setReach}>
              <SelectTrigger size="sm" className="h-7 flex-1 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REACH.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="font-medium">People with access</span>
          )}
        </div>
        <ul className="max-h-72 overflow-y-auto p-1">
          <Row label="Original" hint="As stored, with edits written in" url={`/a/${asset.id}?download`} filename={asset.filename} link={linkFor} />
          {PRESETS.map((p) => (
            <Row
              key={p.name}
              label={p.name}
              hint={p.spec}
              url={`/a/${asset.id}/${p.spec}`}
              filename={`${stem(asset.filename)}-${p.name.toLowerCase().replace(/\s+/g, "-")}.${extOf(p.spec)}`}
              link={linkFor}
            />
          ))}
        </ul>
        <Separator />
        <div className="grid gap-3 p-3">
          <p className="text-sm font-medium">Custom</p>
          <div className="grid grid-cols-4 gap-2">
            <div className="grid gap-1">
              <Label htmlFor="r-w" className="text-muted-foreground text-xs">
                Width
              </Label>
              <Input id="r-w" inputMode="numeric" value={w} onChange={(e) => setW(e.target.value)} placeholder="auto" className="h-8" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="r-h" className="text-muted-foreground text-xs">
                Height
              </Label>
              <Input id="r-h" inputMode="numeric" value={h} onChange={(e) => setH(e.target.value)} placeholder="auto" className="h-8" />
            </div>
            <div className="grid gap-1">
              <Label className="text-muted-foreground text-xs">Fit</Label>
              <Select value={fit} onValueChange={(v) => setFit(v as Fit)} disabled={!(w && h)}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FITS.map((x) => (
                    <SelectItem key={x} value={x}>
                      {x}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-muted-foreground text-xs">Format</Label>
              <Select value={f} onValueChange={(v) => setF(v as Format)}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMATS.map((x) => (
                    <SelectItem key={x} value={x}>
                      {x}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {valid ? (
            <ul className="-mx-2">
              <Row
                label={custom}
                url={`/a/${asset.id}/${custom}`}
                filename={`${stem(asset.filename)}-${w || "auto"}x${h || "auto"}.${extOf(custom)}`}
                link={linkFor}
                mono
              />
            </ul>
          ) : (
            <p className="text-destructive text-xs">Sizes are whole numbers from 1 to {MAX_DIMENSION}.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Row({
  label,
  hint,
  url,
  filename,
  link,
  mono,
}: {
  label: string;
  hint?: string;
  url: string;
  filename: string;
  /** The URL to copy, signed when the link is for anyone. */
  link: (url: string) => Promise<string | null>;
  mono?: boolean;
}) {
  const copy = async () => {
    const shared = await link(url);
    if (!shared) return;
    const href = new URL(shared, location.origin).href;
    try {
      await navigator.clipboard.writeText(href);
      toast.success(`Copied ${label} link`);
    } catch {
      // Clipboard can be denied (permissions, embedded frames): show the link instead.
      toast.error("Couldn't copy the link", { description: href });
    }
  };
  return (
    <li className="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <p className={mono ? "truncate font-mono text-xs" : "truncate text-sm"}>{label}</p>
        {hint && <p className="text-muted-foreground truncate font-mono text-xs">{hint}</p>}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" onClick={copy} aria-label={`Copy ${label} link`}>
            <IconCopy />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Copy link</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" asChild>
            <a href={url} download={filename} aria-label={`Download ${label}`}>
              <IconDownload />
            </a>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Download</TooltipContent>
      </Tooltip>
    </li>
  );
}
