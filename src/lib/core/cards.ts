import sharp from "sharp";
import { findAsset, type Asset } from "@/lib/core/assets";
import { AssetError } from "@/lib/core/errors";
import { publishedSource, viewLook } from "@/lib/core/page-view";
import { renderAsset } from "@/lib/core/renditions";
import { CARD_TEMPLATES, cardEtag, cardFace, cardLogos, type CardQuery, type CardTemplate } from "@/lib/cards";
import { contrast, lift, mix } from "@/lib/color";
import { deliverable } from "@/lib/lifecycle";
import { gate } from "@/lib/pool";
import { hasPreview } from "@/lib/preview";
import { getObject, originalKey } from "@/lib/storage";
import type { Transform } from "@/lib/transform";

/**
 * A brand's cards (lib/cards.ts), drawn (lib/card-draw.tsx) from a release
 * as its theme reads it (lib/brand-theme.ts deriveTheme): its paper
 * and ink, its accent as a solid field, its logo, its heading and text faces
 * from their own files when the renderer reads them (TrueType, OpenType,
 * WOFF), else the renderer's Geist. BrandHub serves them for public brands
 * ({org}/{brand}/og.png), the API for anyone who may read the brand.
 *
 * ponytail: drawn per request, never stored; the URL's cache headers and
 * ETag keep repeat reads off the server. Store them as renditions are if a
 * CDN-less install draws the same card often.
 */

/** Two cards at once, a few more waiting: each holds its fonts and pictures in memory while drawn. */
const drawing = gate(2, 8);
/** Bumped when lib/card-draw.tsx draws differently, so caches holding the old picture by its ETag take the new one. */
const LAYOUT = 1;
/** A face larger than this (a CJK family, a variable font with every axis) is set in the fallback instead. */
const FONT_MAX = 8 * 1024 * 1024;

export type Card = {
  /** Of everything the card is drawn from (lib/cards.ts cardEtag). */
  etag: string;
  /** The release drawn; null for a brand with no history, drawn as it stands. */
  version: number | null;
  draw: () => Promise<Buffer>;
};

/**
 * The card `template` of brand `slug` (the default brand without it) in
 * project `ws`, as its latest release has it or release `version`. `q.image`
 * is shown when it is one of the release's files, or `mayShow` lets the
 * caller see it; never a file that may not be used (lib/lifecycle.ts). What it is drawn from is read now, its
 * ETag with it; the drawing waits for `draw`, so a 304 draws nothing.
 */
export async function brandCard(
  ws: string,
  slug: string | undefined,
  version: number | undefined,
  template: CardTemplate,
  q: CardQuery,
  mayShow: (a: Asset) => boolean | Promise<boolean>,
): Promise<Card> {
  const src = await publishedSource(ws, slug, version);
  if (!src) throw new AssetError("not_found", version === undefined ? "That brand isn't published yet" : `Version ${version} was never published`);
  const { theme: t } = await viewLook(ws, src, null, null);
  const { width, height } = CARD_TEMPLATES[template];

  const dark = q.theme === "dark";
  const paper = dark ? t.dark : (t.surface ?? "#ffffff");
  const ink = dark ? t.onDark : t.ink;
  const muted = dark ? t.mutedOnDark : t.muted;
  const accentText = dark ? lift(t.accent, paper, 4.5) : t.accentText;
  // An accent the paper swallows (a white brand on white) is no field: the brand's dark, or a step off a dark card, is.
  const field = contrast(t.accent, paper) >= 1.5 ? t.accent : dark ? mix(paper, ink, 0.14) : t.dark;

  const usable = async (id: string) => {
    const a = await findAsset(id);
    return a && a.projectId === ws && deliverable(a) && hasPreview(a) && a.mime.startsWith("image/") ? a : null;
  };
  let logo: Asset | null = null;
  // ponytail: one lookup per candidate, in order; a brand has a handful of logos.
  for (const r of cardLogos(src.rules, t.logo?.key ?? null, dark)) {
    for (const x of r.assets) if (!logo) logo = await usable(x.id);
    if (logo) break;
  }
  let image: Asset | null = null;
  if (q.image) {
    const a = await usable(q.image);
    const released = src.rules.some((r) => r.assets.some((x) => x.id === q.image));
    if (!a || !(released || (await mayShow(a)))) throw new AssetError("not_found", "image: no picture by that id that this card may show");
    image = a;
  }
  const head = t.faces.head && cardFace(t.faces.head.files ?? [], t.faces.head.weight ?? 700);
  const body = t.faces.body && cardFace(t.faces.body.files ?? [], t.faces.body.weight ?? 400);

  const look = { paper, ink, muted, accentText, field };
  const etag = cardEtag({ layout: LAYOUT, template, version: src.version?.number ?? null, q, look, name: src.brand.name, logo: logo?.id, image: image?.id, faces: [head?.id, body?.id] });

  const draw = async () => {
    if (drawing.full) throw new AssetError("rate_limited", "Busy drawing other cards: try again in a moment");
    return drawing.run(1, async () => {
      const side = image ? Math.round(width * 0.38) : Math.round(width * 0.25);
      const [logoPic, imagePic, headData, bodyData] = await Promise.all([
        logo ? picture(logo, { w: 720, h: 144, fit: "inside", f: "png" }) : null,
        image ? picture(image, { w: side, h: height, fit: "cover", f: "jpeg" }) : null,
        head ? fontData(head.id) : null,
        body ? fontData(body.id) : null,
      ]);
      // Loaded here: it is JSX, which `pnpm test:db` can't load, and only drawing needs it.
      const { drawCard } = await import("@/lib/card-draw");
      return drawCard(template, { ...look, name: src.brand.name, q, side, logo: logoPic, image: imagePic }, { head: headData, body: bodyData });
    });
  };
  return { etag, version: src.version?.number ?? null, draw };
}

async function fontData(id: string) {
  const a = await findAsset(id);
  if (!a || a.size > FONT_MAX) return null;
  return getObject(originalKey(a.sha256)).catch(() => null);
}

/**
 * A rendition as a data URI, with its size (Satori draws an <img> at the size
 * it is given) and the average color of what it draws, its transparent
 * pixels left out: whether a logo reads on the card's paper.
 */
async function picture(a: Asset, t: Transform) {
  const { body, contentType } = await renderAsset(a, t);
  const bytes = Buffer.from(await new Response(body).arrayBuffer());
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const sum = [0, 0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    const w = data[i + 3] / 255;
    sum[0] += data[i] * w;
    sum[1] += data[i + 1] * w;
    sum[2] += data[i + 2] * w;
    sum[3] += w;
  }
  const hex = (n: number) => Math.round(n / Math.max(sum[3], 1)).toString(16).padStart(2, "0");
  return { src: `data:${contentType};base64,${bytes.toString("base64")}`, width: info.width, height: info.height, tone: `#${hex(sum[0])}${hex(sum[1])}${hex(sum[2])}` };
}
