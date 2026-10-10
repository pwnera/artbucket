import { availableParallelism } from "node:os";
import sharp from "sharp";
import type { Asset } from "@/lib/core/assets";
import { AssetError } from "@/lib/core/errors";
import { countRendition, roomFor } from "@/lib/core/usage";
import { gate } from "@/lib/pool";
import { PORTAL_PRESETS } from "@/lib/portal";
import { getObject, getStream, listObjects, originalKey, previewKey, putObject, renditionKey } from "@/lib/storage";
import {
  capSides,
  CONTENT_TYPE,
  drawScale,
  effective,
  encodeOptions,
  isStock,
  isVector,
  OUTSIDE_MAX,
  OUTSIDE_RENDITIONS,
  parseTransform,
  PRESETS,
  serializeTransform,
  type Format,
  type Transform,
} from "@/lib/transform";

/**
 * Renditions are pure functions of (content hash, transform), so they are
 * generated on first request and cached to object storage (renditions/ expires
 * after 30 days, lib/storage.ts; a request makes it again). That removes the
 * entire job queue from v0.1 - add one when p99 on a cold request hurts.
 *
 * A stored rendition its project asked for counts toward its organization's
 * storage (lib/core/usage.ts); one that doesn't fit is served, not kept.
 * `outside`: asked by someone a URL alone let in (a public asset, a signed
 * link). The organization doesn't choose what they ask, so theirs is kept
 * without counting, and bounded instead: what pages draw and the presets
 * (isStock), and past those at most OUTSIDE_RENDITIONS of one file; then a
 * 403 until the bucket expires some, while those already made keep serving.
 *
 * Renders take turns: a few at once (sharp uses several threads for each), a
 * short line behind them, and past that a 429 to try again. One that runs past
 * RENDER_SECONDS stops. Asked for twice while it renders, it renders once.
 */
const renders = gate(Math.max(1, Math.min(4, availableParallelism() - 1)), 32);
const rendering = new Map<string, Promise<Buffer>>();
const RENDER_SECONDS = 30;
const STOCK = [...PRESETS, ...Object.values(PORTAL_PRESETS)].map((p) => p.spec);

export async function renderAsset(
  asset: Asset,
  requested: Transform,
  { outside = false } = {},
): Promise<{ body: BodyInit; length: number; contentType: string; cached: boolean }> {
  // A file sharp can't read renders from the still derived at upload (lib/core/previews.ts).
  const still = typeof asset.probe?.preview === "string" ? asset.probe.preview : null;
  const format: Format = requested.f ?? (still ? "png" : defaultFormat(asset.mime));
  const vector = !still && isVector(asset.mime);
  // AVIF's encoder and an SVG's drawing don't stop at RENDER_SECONDS: theirs stay smaller for whoever a URL let in.
  const asked = outside && (format === "avif" || vector) ? capSides(requested, OUTSIDE_MAX) : requested;
  // The asset's size is the original's, not the still's.
  const transform = still ? asked : effective(asked, asset);
  const canonical = serializeTransform({ ...transform, f: format });
  const hash = still ?? asset.sha256;
  const key = renditionKey(hash, canonical, format);

  const stored = await getStream(key).catch(() => null);
  if (stored) return { body: stored.body, length: stored.length, contentType: CONTENT_TYPE[format], cached: true };

  let job = rendering.get(key);
  if (!job) {
    if (renders.full) throw new AssetError("rate_limited", "Busy making renditions: try again in a moment");
    // As asked, before a side that can't bind drops: a portal's full-size download is a preset on any image.
    if (outside && !isStock({ ...requested, f: format }, STOCK) && (await othersOf(hash)) >= OUTSIDE_RENDITIONS) {
      throw new AssetError("forbidden", "This file has as many custom renditions as a link may make: ask for a stored one, a preset, or w_{size},f_webp");
    }
    job = renders
      .run(1, async () => {
        const source = still ? previewKey(still) : originalKey(asset.sha256);
        const body = await render(source, transform, format, vector);
        if (outside) await putObject(key, body, CONTENT_TYPE[format]);
        else if (await roomFor(asset.projectId, body.byteLength)) {
          await putObject(key, body, CONTENT_TYPE[format]);
          await countRendition(key, asset.projectId, body.byteLength);
        }
        return body;
      })
      .finally(() => rendering.delete(key));
    rendering.set(key, job);
  }
  const body = await job;
  return { body: new Uint8Array(body), length: body.byteLength, contentType: CONTENT_TYPE[format], cached: false };
}

/**
 * Renditions of a file the bucket keeps that aren't stock, counted up to the
 * cap. ponytail: renders already in line aren't in the bucket yet, so a burst
 * can pass the cap by up to the gate's line; one listing per render refused or made.
 */
async function othersOf(hash: string) {
  let n = 0;
  for await (const { key } of listObjects(`renditions/${hash}/`)) {
    const t = parseTransform(key.slice(key.lastIndexOf("/") + 1, key.lastIndexOf(".")));
    if (!(t && isStock(t, STOCK)) && ++n >= OUTSIDE_RENDITIONS) break;
  }
  return n;
}

/**
 * A vector is drawn at a density that makes it at least as large as the
 * transform asks (lib/transform.ts drawScale), so the resize below only ever
 * shrinks: a 24px icon at w_512 is drawn at 512, not stretched from 24.
 */
async function render(source: string, transform: Transform, format: Format, vector: boolean) {
  const original = await getObject(source);
  let density: number | undefined;
  if (vector) {
    // Its own size is what it draws at the default 72 dpi.
    const { width, height } = await sharp(original, { failOn: "none" }).metadata();
    density = Math.min(100_000, 72 * drawScale(transform, { width, height, mime: "image/svg+xml" }));
  }
  let pipeline = sharp(original, { failOn: "none", density }).timeout({ seconds: RENDER_SECONDS }).rotate();
  if (transform.w || transform.h) {
    pipeline = pipeline.resize({
      width: transform.w,
      height: transform.h,
      fit: transform.fit ?? "inside",
      withoutEnlargement: true,
    });
  }
  return pipeline
    .toFormat(format, encodeOptions(transform, format))
    .toBuffer()
    .catch((err: Error) => {
      throw err.message.startsWith("timeout") ? new AssetError("too_large", "This rendition takes too long to make: ask for a smaller one") : err;
    });
}

function defaultFormat(mime: string): Format {
  if (mime === "image/png") return "png";
  if (mime === "image/avif") return "avif";
  if (mime === "image/webp") return "webp";
  return "jpeg";
}

