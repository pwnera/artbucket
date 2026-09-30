import { z } from "zod";

/** The open-source project every server runs, whoever hosts it: where "Made with Artbucket" and the fetcher's user agent point. */
export const PROJECT_URL = "https://github.com/pwnera/artbucket";

/**
 * White-labeling: what an organization calls the product and how it looks,
 * everywhere its people and guests see it: the app, the sign-in screen, share
 * links, portals (whose own theme overrides it), and email. One source of
 * truth, kept as the `branding` setting (lib/settings.ts), so a server can be
 * branded once in the environment (BRAND_*) and each organization can take
 * it over in Settings.
 *
 * Relative imports only: `pnpm test` runs this under plain Node.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "A color is #RRGGBB");

export const BrandingSettings = z.object({
  /** What the product is called: page titles, the sign-in screen, email. */
  name: z.string().trim().min(1).max(60),
  /** Under the name on the sign-in screen. */
  tagline: z.string().trim().max(160).nullable(),
  /** An approved image of the organization's library: the sidebar, sign-in, share links, email. */
  logo: z.uuid().nullable(),
  /** An approved image, square: the browser tab. */
  icon: z.uuid().nullable(),
  /** Buttons, links, focus rings. */
  accent: hex.nullable(),
  /** A line at the foot of every email: an address, a support contact. */
  emailFooter: z.string().trim().max(500).nullable(),
});
export type BrandingSettings = z.infer<typeof BrandingSettings>;

export const PRODUCT = "Artbucket";

export const DEFAULT_BRANDING: BrandingSettings = { name: PRODUCT, tagline: null, logo: null, icon: null, accent: null, emailFooter: null };

type Env = Record<string, string | undefined>;

/** BRAND_NAME, BRAND_TAGLINE, BRAND_ACCENT: the whole server's, under every organization's own. */
export function brandingFromEnv(env: Env): BrandingSettings | null {
  const out: Record<string, unknown> = {};
  if (env.BRAND_NAME?.trim()) out.name = env.BRAND_NAME.trim();
  if (env.BRAND_TAGLINE?.trim()) out.tagline = env.BRAND_TAGLINE.trim();
  if (env.BRAND_ACCENT?.trim()) out.accent = env.BRAND_ACCENT.trim();
  // Only what the environment says: resolve() merges property by property, so the rest stays the default's.
  return Object.keys(out).length ? (BrandingSettings.partial().parse(out) as BrandingSettings) : null;
}

/** What pages and email use: the settings, with logo and icon as URLs (null when not servable). */
export type Brand = {
  name: string;
  tagline: string | null;
  logo: string | null;
  icon: string | null;
  accent: string | null;
  emailFooter: string | null;
  /** Anything differs from the product's own look: hide its marks. */
  custom: boolean;
};

export const DEFAULT_BRAND: Brand = { ...DEFAULT_BRANDING, logo: null, icon: null, custom: false };

/** A file name's worth of the product name: "Acme Assets" to "acme-assets". */
export const fileSlug = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "assets";

// ---- email ----------------------------------------------------------------------

/** An email before it is branded: `{product}` in it becomes the product's name. */
export type Draft = { to: string; subject: string; lines: string[]; action?: { label: string; url: string }; /** A one-time code, set large under the lines. */ code?: string };

const escape = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const ink = (hexColor: string) => {
  const n = parseInt(hexColor.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? "#111111" : "#ffffff";
};

/**
 * One plain layout for every message, in the organization's brand: its logo
 * on top (an absolute URL: mail clients load it from outside), its accent on
 * the button, its footer below.
 */
export function render(d: Draft, brand: Pick<Brand, "name" | "accent" | "emailFooter"> & { logo: string | null }) {
  const fill = (s: string) => s.replaceAll("{product}", brand.name);
  const lines = d.lines.map(fill);
  const action = d.action && { label: fill(d.action.label), url: d.action.url };
  const accent = brand.accent ?? "#6D4AFF";
  const text = [...lines, ...(d.code ? ["", d.code] : []), ...(action ? ["", `${action.label}: ${action.url}`] : []), ...(brand.emailFooter ? ["", "--", brand.emailFooter] : [])].join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111111">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e4e4ea;border-radius:12px;padding:32px">
${brand.logo ? `<p style="margin:0 0 24px"><img src="${escape(brand.logo)}" alt="${escape(brand.name)}" height="32" style="height:32px;width:auto"></p>` : ""}
${lines.map((l) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.5">${escape(l)}</p>`).join("\n")}
${d.code ? `<p style="margin:8px 0 0;font-family:ui-monospace,Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:8px">${escape(d.code)}</p>` : ""}
${action ? `<p style="margin:24px 0 0"><a href="${escape(action.url)}" style="display:inline-block;background:${accent};color:${ink(accent)};text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px">${escape(action.label)}</a></p>` : ""}
</div>
${brand.emailFooter ? `<p style="max-width:480px;margin:16px auto 0;font-size:12px;color:#6b6b76;text-align:center">${escape(brand.emailFooter)}</p>` : ""}
</body></html>`;
  return { to: d.to, subject: fill(d.subject), text, html };
}
