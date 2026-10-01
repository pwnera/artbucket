import { availableParallelism } from "node:os";
import sharp from "sharp";
import type { Asset } from "@/lib/core/assets";
import { AssetError } from "@/lib/core/errors";
import { countRendition, roomFor } from "@/lib/core/usage";
import { gate } from "@/lib/pool";
import { getObject, getStream, originalKey, previewKey, putObject, renditionKey } from "@/lib/storage";
import {
  CONTENT_TYPE,
  drawScale,
  effective,
  encodeOptions,
  isVector,
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
 * A stored rendition counts toward its organization's storage (lib/core/usage.ts);
 * one that doesn't fit is served, not kept. Renders take turns: a few at once
 * (sharp uses several threads for each), a short line behind them, and past
 * that a 429 to try again. Asked for twice while it renders, it renders once.
 */
const renders = gate(Math.max(1, Math.min(4, availableParallelism() - 1)), 32);
const rendering = new Map<string, Promise<Buffer>>();

export async function renderAsset(
  asset: Asset,
  requested: Transform,
): Promise<{ body: BodyInit; length: number; contentType: string; cached: boolean }> {
  // A file sharp can't read renders from the still derived at upload (lib/core/previews.ts).
  const still = typeof asset.probe?.preview === "string" ? asset.probe.preview : null;
  // The asset's size is the original's, not the still's.
  const transform = still ? requested : effective(requested, asset);
  const format: Format = transform.f ?? (still ? "png" : defaultFormat(asset.mime));
  const canonical = serializeTransform({ ...transform, f: format });
  const key = renditionKey(still ?? asset.sha256, canonical, format);

  const stored = await getStream(key).catch(() => null);
  if (stored) return { body: stored.body, length: stored.length, contentType: CONTENT_TYPE[format], cached: true };

  let job = rendering.get(key);
  if (!job) {
    if (renders.full) throw new AssetError("rate_limited", "Busy making renditions: try again in a moment");
    job = renders
      .run(1, async () => {
        const source = still ? previewKey(still) : originalKey(asset.sha256);
        const body = await render(source, transform, format, !still && isVector(asset.mime));
        if (await roomFor(asset.workspaceId, body.byteLength)) {
          await putObject(key, body, CONTENT_TYPE[format]);
          await countRendition(key, asset.workspaceId, body.byteLength);
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
  let pipeline = sharp(original, { failOn: "none", density }).rotate();
  if (transform.w || transform.h) {
    pipeline = pipeline.resize({
      width: transform.w,
      height: transform.h,
      fit: transform.fit ?? "inside",
      withoutEnlargement: true,
    });
  }
  return pipeline.toFormat(format, encodeOptions(transform, format)).toBuffer();
}

function defaultFormat(mime: string): Format {
  if (mime === "image/png") return "png";
  if (mime === "image/avif") return "avif";
  if (mime === "image/webp") return "webp";
  return "jpeg";
}

