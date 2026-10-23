import { z } from "zod";

/** The open-source project every server runs, whoever hosts it: where the fetcher's user agent points. */
export const PROJECT_URL = "https://github.com/pwnera/artbucket";

/** The product's documentation, for every server: Help's Docs. */
export const DOCS_URL = "https://docs.artbucket.io";

/** Where "Powered by Artbucket" on a portal points: the product's home page. */
export const POWERED_BY_URL = "https://artbucket.io/";

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
  /**
   * A brand of the organization whose released color.primary is the accent
   * instead: each release recolors the app, and with nothing else set the
   * product keeps its own name and marks, in that color. Until the brand has
   * a release with one, `accent` stands.
   */
  accentFrom: z.uuid().nullable(),
  /** A line at the foot of every email: an address, a support contact. */
  emailFooter: z.string().trim().max(500).nullable(),
});
export type BrandingSettings = z.infer<typeof BrandingSettings>;

export const PRODUCT = "Artbucket";

export const DEFAULT_BRANDING: BrandingSettings = { name: PRODUCT, tagline: null, logo: null, icon: null, accent: null, accentFrom: null, emailFooter: null };

/** Anything but the accent's source differs from the product's own look: its marks give way (Brand.custom). */
export const customized = (v: BrandingSettings) =>
  (Object.keys(DEFAULT_BRANDING) as (keyof BrandingSettings)[]).some((k) => k !== "accentFrom" && v[k] !== DEFAULT_BRANDING[k]);

/** A release's color.primary, for every context: what `accentFrom` reads. */
export function primaryOf(rules: { key: string; context: string | null; value: unknown }[]) {
  const v = rules.find((r) => r.key === "color.primary" && r.context === null)?.value;
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
}

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

export const DEFAULT_BRAND: Brand = { name: DEFAULT_BRANDING.name, tagline: null, logo: null, icon: null, accent: null, emailFooter: null, custom: false };

/** A file name's worth of the product name: "Acme Assets" to "acme-assets". */
export const fileSlug = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "assets";

// ---- email ----------------------------------------------------------------------

/** A paragraph, or one that links somewhere: the weekly digest's items. */
export type Line = string | { text: string; url: string };

/** An email before it is branded: `{product}` in it becomes the product's name. */
export type Draft = {
  to: string;
  subject: string;
  lines: Line[];
  action?: { label: string; url: string };
  /** A one-time code, set large under the lines. */
  code?: string;
  /** Where to stop getting this kind of email, linked small under the message. */
  unsubscribe?: string;
  /** A message in parts (the weekly digest): a title over its dates, counts across, then a list per part, the lines after them. */
  heading?: { title: string; sub?: string };
  stats?: { value: string; label: string }[];
  sections?: Section[];
};

/** A part of a message: its title, a row per item (a link, what it is beside it, a note under it), and the rest behind a link. */
export type Section = { title: string; rows: { text: string; url?: string | null; meta?: string; note?: string }[]; more?: { text: string; url: string } };

const MUTED = "#6b6b76";
const LINE = "#e4e4ea";

/** A part, as a mail client draws it: a table, the one layout every client keeps. */
function sectionHtml(s: Section) {
  const rows = s.rows
    .map((r, i) => {
      const rule = i ? `;border-top:1px solid ${LINE}` : "";
      const name = r.url ? `<a href="${escape(r.url)}" style="color:#111111;text-decoration:none;font-weight:600">${escape(r.text)}</a>` : `<span style="font-weight:600">${escape(r.text)}</span>`;
      const note = r.note ? `<div style="margin-top:2px;font-size:13px;color:${MUTED}">${escape(r.note)}</div>` : "";
      return `<tr><td valign="top" style="padding:12px 16px;font-size:14px;line-height:1.4${rule}">${name}${note}</td><td align="right" valign="top" style="padding:12px 16px;font-size:13px;line-height:1.4;color:${MUTED};white-space:nowrap${rule}">${r.meta ? escape(r.meta) : ""}</td></tr>`;
    })
    .join("");
  const more = s.more ? `<p style="margin:8px 0 0;font-size:13px"><a href="${escape(s.more.url)}" style="color:${MUTED}">${escape(s.more.text)}</a></p>` : "";
  return `<p style="margin:28px 0 8px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${MUTED}">${escape(s.title)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;border:1px solid ${LINE};border-radius:10px">${rows}</table>${more}`;
}

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
  const lines = d.lines.map((l) => (typeof l === "string" ? { text: fill(l), url: null } : { text: fill(l.text), url: l.url }));
  const action = d.action && { label: fill(d.action.label), url: d.action.url };
  const accent = brand.accent ?? "#6D4AFF";
  const sections = (d.sections ?? []).map((s) => ({ ...s, title: fill(s.title), rows: s.rows.map((r) => ({ ...r, text: fill(r.text) })) }));
  const text = [
    ...(d.heading ? [fill(d.heading.title), ...(d.heading.sub ? [d.heading.sub] : []), ""] : []),
    ...(d.stats?.length ? [d.stats.map((s) => `${s.value} ${s.label}`).join(" · "), ""] : []),
    ...sections.flatMap((s) => [
      s.title.toUpperCase(),
      ...s.rows.map((r) => [r.text, r.meta, r.note].filter(Boolean).join(", ") + (r.url ? ` ${r.url}` : "")),
      ...(s.more ? [`${s.more.text} ${s.more.url}`] : []),
      "",
    ]),
    ...lines.map((l) => (l.url ? `${l.text} ${l.url}` : l.text)),
    ...(d.code ? ["", d.code] : []),
    ...(action ? ["", `${action.label}: ${action.url}`] : []),
    ...(brand.emailFooter ? ["", "--", brand.emailFooter] : []),
    ...(d.unsubscribe ? ["", `Unsubscribe: ${d.unsubscribe}`] : []),
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111111">
<div style="max-width:${sections.length ? 560 : 480}px;margin:0 auto;background:#fff;border:1px solid #e4e4ea;${sections.length ? `border-top:4px solid ${accent};` : ""}border-radius:12px;padding:32px">
${brand.logo ? `<p style="margin:0 0 24px"><img src="${escape(brand.logo)}" alt="${escape(brand.name)}" height="32" style="height:32px;width:auto"></p>` : ""}
${d.heading ? `<h1 style="margin:0;font-size:24px;line-height:1.2;font-weight:700;letter-spacing:-.01em">${escape(fill(d.heading.title))}</h1>${d.heading.sub ? `<p style="margin:4px 0 0;font-size:14px;color:${MUTED}">${escape(d.heading.sub)}</p>` : ""}` : ""}
${d.stats?.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;border-collapse:separate;border-spacing:0"><tr>${d.stats.map((s) => `<td valign="top" width="${Math.floor(100 / d.stats!.length)}%" style="padding:12px 14px;background:#f5f5f7;border-radius:10px"><div style="font-size:22px;line-height:1.1;font-weight:700">${escape(s.value)}</div><div style="margin-top:2px;font-size:12px;color:${MUTED}">${escape(s.label)}</div></td>`).join('<td style="width:8px"></td>')}</tr></table>` : ""}
${sections.map(sectionHtml).join("\n")}
${sections.length ? `<div style="height:28px"></div>` : ""}
${lines.map((l) => `<p style="margin:0 0 16px;${sections.length ? `font-size:13px;line-height:1.5;color:${MUTED}` : "font-size:15px;line-height:1.5"}">${l.url ? `<a href="${escape(l.url)}" style="color:#111111">${escape(l.text)}</a>` : escape(l.text)}</p>`).join("\n")}
${d.code ? `<p style="margin:8px 0 0;font-family:ui-monospace,Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:8px">${escape(d.code)}</p>` : ""}
${action ? `<p style="margin:24px 0 0"><a href="${escape(action.url)}" style="display:inline-block;background:${accent};color:${ink(accent)};text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px">${escape(action.label)}</a></p>` : ""}
</div>
${brand.emailFooter ? `<p style="max-width:${sections.length ? 560 : 480}px;margin:16px auto 0;font-size:12px;color:#6b6b76;text-align:center">${escape(brand.emailFooter)}</p>` : ""}
${d.unsubscribe ? `<p style="max-width:${sections.length ? 560 : 480}px;margin:16px auto 0;font-size:12px;text-align:center"><a href="${escape(d.unsubscribe)}" style="color:#6b6b76">Unsubscribe</a></p>` : ""}
</body></html>`;
  return { to: d.to, subject: fill(d.subject), text, html };
}
