import sharp from "sharp";
import type { Asset } from "@/lib/core/assets";
import { exists, getObject, originalKey, previewKey, putObject, renditionKey } from "@/lib/storage";
import {
  CONTENT_TYPE,
  serializeTransform,
  type Format,
  type Transform,
} from "@/lib/transform";

/**
 * Renditions are pure functions of (content hash, transform), so they are
 * generated on first request and cached to object storage forever. That removes
 * the entire job queue from v0.1 - add one when p99 on a cold request hurts.
 */
export async function renderAsset(
  asset: Asset,
  transform: Transform,
): Promise<{ body: Buffer; contentType: string; cached: boolean }> {
  // A file sharp can't read renders from the still derived at upload (lib/core/previews.ts).
  const still = typeof asset.probe?.preview === "string" ? asset.probe.preview : null;
  const format: Format = transform.f ?? (still ? "png" : defaultFormat(asset.mime));
  const canonical = serializeTransform({ ...transform, f: format });
  const key = renditionKey(still ?? asset.sha256, canonical, format);

  if (await exists(key)) {
    return { body: await getObject(key), contentType: CONTENT_TYPE[format], cached: true };
  }

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

  return { body, contentType: CONTENT_TYPE[format], cached: false };
}

function defaultFormat(mime: string): Format {
  if (mime === "image/png") return "png";
  if (mime === "image/avif") return "avif";
  if (mime === "image/webp") return "webp";
  return "jpeg";
}

