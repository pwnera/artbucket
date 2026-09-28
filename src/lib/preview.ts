/**
 * What an asset shows as. Safe on both sides: the server decides what to
 * render, the UI decides what to draw, from the same two facts.
 */

type Previewable = { mime: string; probe?: Record<string, unknown> | null };

/** Originals sharp reads directly. */
export const RENDERABLE = /^image\/(jpeg|png|webp|avif|gif|tiff|svg\+xml)$/;
export const isRenderable = (mime: string) => RENDERABLE.test(mime);

/**
 * Has renditions: an image sharp reads, or a file a still was derived from at
 * upload (a PDF's first page, a PSD's composite, a video frame; lib/core/previews.ts).
 */
export const hasPreview = (a: Previewable) => isRenderable(a.mime) || typeof a.probe?.preview === "string";

/**
 * An icon: an SVG tagged `icon` (as an icon pack import tags them), or one
 * drawn on a small grid. Shown at a glyph's size, crisp as the vector, never
 * stretched to fill its tile.
 */
export const isIcon = (a: Previewable & { tags?: string[]; width?: number | null; height?: number | null }) =>
  a.mime === "image/svg+xml" && (!!a.tags?.includes("icon") || (!!a.width && !!a.height && Math.max(a.width, a.height) <= 64));

/** An SVG drawn in one ink (currentColor or black): it can be shown in any color, the theme's text by default. */
export const isMono = (a: Previewable & { mono?: boolean }) => a.mono === true || a.probe?.mono === true;

/** A Lottie animation, JSON or dotLottie: plays in the browser, has no still. */
export const isLottie = (a: Previewable) => a.probe?.lottie === true;

/** A link (Figma, Google Docs, Sheets, Slides, Drive): the iframe URL, only ever one parseLink built. */
export function embedUrl(a: Previewable): string | null {
  const url = a.probe?.embed;
  return typeof url === "string" && EMBEDS.some((prefix) => url.startsWith(prefix)) ? url : null;
}

const EMBEDS = ["https://www.figma.com/embed?", "https://docs.google.com/", "https://drive.google.com/file/d/"];

/** What a link is: its service (the badge a file's type would get) and how to show it. */
export type Link = { service: string; embed: string; /** A Google Drive file id, for its thumbnail. */ drive?: string };

const GOOGLE: Record<string, string> = {
  document: "Docs",
  spreadsheets: "Sheets",
  presentation: "Slides",
  drawings: "Drawings",
};

/**
 * A link kept as a link rather than fetched: a Figma file, prototype or board,
 * a Google Doc, Sheet, Slides deck or Drawing, or a file on Google Drive.
 * Null for anything else, which is fetched like any URL.
 */
export function parseLink(url: string): Link | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (/^(www\.)?figma\.com$/.test(u.hostname) && /^\/(file|design|proto|board|slides|deck)\/[A-Za-z0-9]+/.test(u.pathname)) {
    return { service: "Figma", embed: `${EMBEDS[0]}embed_host=artbucket&url=${encodeURIComponent(u.href)}` };
  }
  const doc = u.hostname === "docs.google.com" ? /^\/(document|spreadsheets|presentation|drawings)\/d\/([\w-]{20,})/.exec(u.pathname) : null;
  if (doc) return { service: GOOGLE[doc[1]], embed: `https://docs.google.com/${doc[1]}/d/${doc[2]}/preview`, drive: doc[2] };
  const file = u.hostname === "drive.google.com" ? /^\/file\/d\/([\w-]{20,})/.exec(u.pathname) : null;
  if (file) return { service: "Drive", embed: `https://drive.google.com/file/d/${file[1]}/preview`, drive: file[1] };
  return null;
}
