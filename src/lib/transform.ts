/**
 * Rendition transforms are a pure function of the URL, so they are cacheable
 * forever and an agent can construct one without asking anything.
 *
 *   /a/{id}/w_800,f_webp
 *   /a/{id}/w_1200,h_630,fit_cover,q_80,f_jpeg
 *
 * Parsing is a strict whitelist with hard caps: this is a trust boundary where
 * an unbounded value turns into unbounded CPU and memory in sharp. Each URL
 * that parses is also a rendition made and stored, so values snap to a few
 * steps: a side up to the next size in SIZES, quality to a multiple of 5, and
 * fit only where it changes anything (both sides given). Every size the app
 * asks for is a step, and so are the common screen, icon and social sizes.
 */

export const FORMATS = ["jpeg", "png", "webp", "avif"] as const;
export type Format = (typeof FORMATS)[number];

export const FITS = ["cover", "contain", "inside", "outside", "fill"] as const;
export type Fit = (typeof FITS)[number];

export const MAX_DIMENSION = 8000;

/** The sizes a side snaps up to. */
export const SIZES = [
  16, 24, 32, 40, 48, 56, 64, 72, 80, 96, 112, 128, 144, 160, 180, 192, 200, 224, 240, 256, 260, 300, 320, 360, 384, 400, 480, 500,
  512, 520, 540, 600, 630, 640, 720, 750, 768, 800, 828, 900, 960, 1000, 1024, 1080, 1200, 1280, 1350, 1440, 1500, 1600, 1920,
  2000, 2048, 2400, 2560, 3000, 3200, 3840, 4000, 4096, 5000, 6000, 7680, MAX_DIMENSION,
] as const;

/** The largest side people outside the workspace get of a file they may see but not take (lib/rights.ts isDownloadable): a portal's preview. */
export const SHOWN_MAX = 1600;

/** A transform within SHOWN_MAX: a side asked larger, or not asked, is SHOWN_MAX, which the default fit (inside) keeps the aspect within. */
export const shownSize = (t: Transform): Transform => ({ ...t, w: Math.min(t.w ?? SHOWN_MAX, SHOWN_MAX), h: Math.min(t.h ?? SHOWN_MAX, SHOWN_MAX) });

/** A side, up to the next step: never smaller than asked. */
export const snapSize = (n: number) => SIZES.find((s) => s >= n) ?? MAX_DIMENSION;

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

/**
 * What pages of this app draw (a width step in WebP, at most SHOWN_MAX high
 * when shownSize bounds it) or one of `presets` names: a few per file, so
 * anyone a URL lets in may have one made (lib/core/renditions.ts). Anything
 * else they ask for counts toward OUTSIDE_RENDITIONS.
 */
export function isStock(t: Transform, presets: readonly (string | null)[]) {
  if (t.f === "webp" && !t.fit && !t.q && (!t.h || t.h === SHOWN_MAX)) return true;
  const spec = serializeTransform(t);
  return presets.some((p) => p !== null && serializeTransform(parseTransform(p) ?? {}) === spec);
}

/** The largest side an AVIF or a drawn SVG gets for people outside the workspace: neither stops at a render's time limit. */
export const OUTSIDE_MAX = 4096;

/** The sides asked, at most `max`; a side not asked stays unasked. */
export const capSides = (t: Transform, max: number): Transform => ({
  ...t,
  ...(t.w && { w: Math.min(t.w, max) }),
  ...(t.h && { h: Math.min(t.h, max) }),
});

/** Renditions of one file, past the stock ones, that people outside its workspace may have made while the bucket keeps them. */
export const OUTSIDE_RENDITIONS = 16;

/** "Web" for a preset's spec, the spec itself otherwise, "Original" for none. */
export const renditionLabel = (spec: string | null) =>
  spec === null ? "Original" : (PRESETS.find((p) => p.spec === spec)?.name ?? spec);

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
        out[key] = snapSize(n);
        break;
      }
      case "q": {
        const n = int(value, 1, 100);
        if (n === null) return null;
        out.q = Math.max(5, Math.round(n / 5) * 5);
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
  // One side keeps the aspect ratio whatever the fit; inside is the default, so it names nothing new.
  if (!(out.w && out.h) || out.fit === "inside") delete out.fit;
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

/** sharp's encoder options: the quality asked, else 82. A PNG gets one only when asked: any quality makes sharp quantize it to a palette. */
export const encodeOptions = (t: Transform, format: Format) => (format === "png" && !t.q ? {} : { quality: t.q ?? 82 });

/** An SVG: drawn at the size asked rather than rasterized at its own and scaled. */
export const isVector = (mime: string | null | undefined) => mime === "image/svg+xml";

type Source = { width?: number | null; height?: number | null; mime: string };

/**
 * How much larger than its own size a vector source is drawn, so the sides a
 * spec asks for bind as they would on a raster that big: never smaller (a
 * thin side would round away), and never past MAX_DIMENSION on its longest
 * side. 1 for a raster, which is never enlarged.
 */
export function drawScale(t: Transform, size: Source): number {
  const [W, H] = [size.width, size.height];
  if (!isVector(size.mime) || !W || !H || (!t.w && !t.h)) return 1;
  const [sx, sy] = [t.w ? t.w / W : 0, t.h ? t.h / H : 0];
  const fit = t.fit ?? "inside";
  // Inside and contain stop at the side that binds first; cover, outside and fill fill the box.
  const s = t.w && t.h && (fit === "inside" || fit === "contain") ? Math.min(sx, sy) : Math.max(sx, sy);
  return Math.max(1, Math.min(s, MAX_DIMENSION / Math.max(W, H)));
}

/**
 * The transform that renders the same pixels, so one stored rendition serves
 * every URL that asks for them. Only for a raster at fit inside, which never
 * enlarges: a side at least the image's longest never binds, whichever way
 * EXIF turns it, so it drops. `w_8000` on a 2000px image is the image at its
 * own size. A vector is drawn at the size asked, so every side binds.
 */
export function effective(t: Transform, size: Source): Transform {
  if (isVector(size.mime) || (t.fit && t.fit !== "inside") || !size.width || !size.height) return t;
  const longest = Math.max(size.width, size.height);
  const out = { ...t };
  if (out.w && out.w >= longest) delete out.w;
  if (out.h && out.h >= longest) delete out.h;
  if (!out.w && !out.h) delete out.fit;
  return out;
}

/**
 * What a spec gives for an image of `size`, for saying "1200 × 630" rather
 * than a URL grammar. An estimate: the server never enlarges a raster, so
 * `capped` means the image is smaller than asked and it comes out up to that
 * size, and EXIF orientation 5 to 8 (when known) turns the image on its side
 * first. A vector is drawn at the size asked (drawScale), capped only by
 * MAX_DIMENSION.
 */
export function outputSize(
  t: Transform,
  size: Source,
  orientation?: number,
): { width: number; height: number; capped: boolean } | null {
  let [W, H] = [size.width, size.height];
  if (!W || !H) return null;
  if (isVector(size.mime)) {
    const k = drawScale(t, size);
    [W, H] = [Math.max(1, Math.round(W * k)), Math.max(1, Math.round(H * k))];
  } else if (orientation && orientation >= 5 && orientation <= 8) [W, H] = [H, W];
  if (!t.w && !t.h) return { width: W, height: H, capped: false };
  const fit = t.fit ?? "inside";
  let width: number;
  let height: number;
  if (t.w && t.h && (fit === "cover" || fit === "fill")) {
    [width, height] = [t.w, t.h];
  } else {
    const sx = t.w ? t.w / W : Infinity;
    const sy = t.h ? t.h / H : Infinity;
    const s = t.w && t.h && fit === "outside" ? Math.max(sx, sy) : Math.min(sx, sy);
    [width, height] = [Math.round(W * s), Math.round(H * s)];
  }
  if (width <= W && height <= H) return { width, height, capped: false };
  const s = Math.min(1, W / width, H / height);
  return fit === "cover" || fit === "fill"
    ? { width: Math.min(width, W), height: Math.min(height, H), capped: true }
    : { width: Math.round(width * s), height: Math.round(height * s), capped: true };
}
