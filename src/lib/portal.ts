import { z } from "zod";

/**
 * Brand portals: a curated, themed front door onto chosen collections, for
 * people outside the team (lib/core/portals.ts). What a portal offers to
 * download, how it is themed, and the names it goes by.
 *
 * Relative imports only: `pnpm test` runs this under plain Node.
 */

/**
 * What a visitor downloads instead of the raw original: renditions made for a
 * purpose (lib/transform.ts). `original` is the file as uploaded, with its
 * metadata written in; a portal offers it only when told to.
 */
export const PORTAL_PRESETS = {
  web: { label: "Web", hint: "JPEG, 1920 px wide", spec: "w_1920,q_85,f_jpeg" },
  social: { label: "Social", hint: "JPEG, 1080 px square", spec: "w_1080,h_1080,fit_cover,f_jpeg" },
  story: { label: "Story", hint: "JPEG, 1080 × 1920", spec: "w_1080,h_1920,fit_cover,f_jpeg" },
  print: { label: "Print", hint: "JPEG, full size", spec: "w_8000,q_95,f_jpeg" },
  png: { label: "PNG", hint: "Full size, keeps transparency", spec: "f_png" },
  original: { label: "Original", hint: "The file as uploaded", spec: null },
} as const;
export type PortalPreset = keyof typeof PORTAL_PRESETS;
export const PRESET_IDS = Object.keys(PORTAL_PRESETS) as [PortalPreset, ...PortalPreset[]];
export const DEFAULT_PRESETS: PortalPreset[] = ["web", "print", "social"];

export type Download = { preset: PortalPreset; label: string; hint: string; url: string; filename: string };

/**
 * The downloads a portal offers for one asset. Images get the portal's
 * presets; anything else (a PDF, a video, a font) is only useful as itself,
 * so it gets its original whatever the presets say.
 */
export function downloadsFor(asset: { id: string; filename: string; mime: string }, presets: PortalPreset[], base: string): Download[] {
  const at = `${base}/a/${asset.id}`;
  const stem = asset.filename.replace(/\.[^.]+$/, "");
  const { label, hint } = PORTAL_PRESETS.original;
  const original: Download = { preset: "original", label, hint, url: `${at}?download`, filename: asset.filename };
  if (!asset.mime.startsWith("image/")) return [original];
  const out = presets.flatMap((p): Download[] => {
    const { label, hint, spec } = PORTAL_PRESETS[p];
    if (!spec) return [original];
    const ext = spec.match(/f_(\w+)/)?.[1] === "png" ? "png" : "jpg";
    return [{ preset: p, label, hint, url: `${at}/${spec}`, filename: `${stem}-${p}.${ext}` }];
  });
  return out.length ? out : [original];
}

/** Lowercase letters, digits and dashes: the portal's address, /p/{slug}. */
export const PORTAL_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

export const PORTAL_ACCESS = ["public", "password", "members"] as const;
export type PortalAccess = (typeof PORTAL_ACCESS)[number];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "A color is #RRGGBB");

/** How a portal looks: its logo (an asset of the library), accent and background. Null: the app's own. */
export const PortalTheme = z.object({
  logo: z.uuid().nullable().default(null).describe("An approved image asset, shown in the header"),
  accent: hex.nullable().default(null).describe("Buttons and links"),
  background: hex.nullable().default(null).describe("The page behind everything"),
});
export type PortalTheme = z.infer<typeof PortalTheme>;

/**
 * A host name as a portal or the app may be served at: lowercased, without a
 * port or a trailing dot, at least two labels. Null for anything else.
 */
export function hostname(raw: string): string | null {
  const h = raw.trim().toLowerCase().replace(/\.$/, "").replace(/:\d+$/, "");
  if (h.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h)) return null;
  return h;
}

/** Where a domain's owner proves it: a TXT record at this name holding the token. */
export const challengeName = (host: string) => `_artbucket-challenge.${host}`;
