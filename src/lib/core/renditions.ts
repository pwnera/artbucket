import sharp from "sharp";
import type { Asset } from "@/lib/core/assets";
import { getObject, getStream, originalKey, previewKey, putObject, renditionKey } from "@/lib/storage";
import {
  CONTENT_TYPE,
  effective,
  serializeTransform,
  type Format,
  type Transform,
} from "@/lib/transform";

/**
 * Renditions are pure functions of (content hash, transform), so they are
 * generated on first request and cached to object storage (renditions/ expires
 * after 30 days, lib/storage.ts; a request makes it again). That removes the
 * entire job queue from v0.1 - add one when p99 on a cold request hurts.
 */
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

  const original = await getObject(still ? previewKey(still) : originalKey(asset.sha256));

  let pipeline = sharp(original, { failOn: "none" }).rotate();
  if (transform.w || transform.h) {
    pipeline = pipeline.resize({
      width: transform.w,
      height: transform.h,
      fit: transform.fit ?? "inside",
      withoutEnlargement: true,
    });
  }
  pipeline = pipeline.toFormat(format, { quality: transform.q ?? 82 });

  const body = await pipeline.toBuffer();
  await putObject(key, body, CONTENT_TYPE[format]);

  return { body: new Uint8Array(body), length: body.byteLength, contentType: CONTENT_TYPE[format], cached: false };
}

function defaultFormat(mime: string): Format {
  if (mime === "image/png") return "png";
  if (mime === "image/avif") return "avif";
  if (mime === "image/webp") return "webp";
  return "jpeg";
}

