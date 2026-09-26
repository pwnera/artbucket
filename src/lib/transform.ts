/**
 * Rendition transforms are a pure function of the URL, so they are cacheable
 * forever and an agent can construct one without asking anything.
 *
 *   /a/{id}/w_800,f_webp
 *   /a/{id}/w_1200,h_630,fit_cover,q_82,f_jpeg
 *
 * Parsing is a strict whitelist with hard caps: this is a trust boundary where
 * an unbounded value turns into unbounded CPU and memory in sharp.
 */

export const FORMATS = ["jpeg", "png", "webp", "avif"] as const;
export type Format = (typeof FORMATS)[number];

export const FITS = ["cover", "contain", "inside", "outside", "fill"] as const;
export type Fit = (typeof FITS)[number];

export const MAX_DIMENSION = 8000;

/** Common sizes, as rendition specs (lib/transform.ts). */
export const PRESETS = [
  { name: "Thumbnail", spec: "w_320,h_320,fit_cover,f_webp" },
  { name: "Web", spec: "w_1200,f_webp" },
  { name: "Large", spec: "w_2400,q_85,f_jpeg" },
  { name: "Social square", spec: "w_1080,h_1080,fit_cover,f_jpeg" },
  { name: "Open Graph", spec: "w_1200,h_630,fit_cover,f_jpeg" },
  { name: "Story", spec: "w_1080,h_1920,fit_cover,f_jpeg" },
  { name: "PNG", spec: "f_png" },
  { name: "AVIF", spec: "w_1600,f_avif" },
] as const;

export type Transform = {
  w?: number;
  h?: number;
  f?: Format;
  q?: number;
  fit?: Fit;
};

export const CONTENT_TYPE: Record<Format, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

const int = (raw: string, min: number, max: number): number | null => {
  if (!/^\d{1,5}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
};

/** Returns null for anything malformed - callers should 400, never guess. */
export function parseTransform(spec: string): Transform | null {
  if (spec.length > 120) return null;

  const out: Transform = {};
  const seen = new Set<string>();

  for (const part of spec.split(",")) {
    const at = part.indexOf("_");
    if (at < 1) return null;

    const key = part.slice(0, at);
    const value = part.slice(at + 1);
    if (seen.has(key)) return null;
    seen.add(key);

    switch (key) {
      case "w":
      case "h": {
        const n = int(value, 1, MAX_DIMENSION);
        if (n === null) return null;
        out[key] = n;
        break;
      }
      case "q": {
        const n = int(value, 1, 100);
        if (n === null) return null;
        out.q = n;
        break;
      }
      case "f": {
        if (!(FORMATS as readonly string[]).includes(value)) return null;
        out.f = value as Format;
        break;
      }
      case "fit": {
        if (!(FITS as readonly string[]).includes(value)) return null;
        out.fit = value as Fit;
        break;
      }
      default:
        return null;
    }
  }

  if (!out.w && !out.h && !out.f && !out.q) return null;
  return out;
}

/**
 * Canonical string form. Keys are emitted in a fixed order so that
 * `f_webp,w_800` and `w_800,f_webp` resolve to the same cached object.
 */
export function serializeTransform(t: Transform): string {
  const parts: string[] = [];
  if (t.w) parts.push(`w_${t.w}`);
  if (t.h) parts.push(`h_${t.h}`);
  if (t.fit) parts.push(`fit_${t.fit}`);
  if (t.q) parts.push(`q_${t.q}`);
  if (t.f) parts.push(`f_${t.f}`);
  return parts.join(",");
}
