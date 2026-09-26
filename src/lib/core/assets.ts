import { createHash, randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/lib/db";
import { assets, type Asset } from "@/lib/db/schema";
import {
  deleteObject,
  ensureBucket,
  exists,
  getObject,
  originalKey,
  presignPut,
  putObject,
  stagingKey,
} from "@/lib/storage";

/**
 * The service layer. Every adapter — REST, MCP, CLI, the web UI — goes through
 * here and nowhere else. That constraint is what keeps the public API honest:
 * if the UI can't be built on it, it isn't finished.
 */

export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;

export type UploadTicket = {
  token: string;
  uploadUrl: string;
  expiresIn: number;
};

/** Step 1: hand the browser a presigned PUT straight to object storage. */
export async function createUploadTicket(input: {
  filename: string;
  mime: string;
  size: number;
}): Promise<UploadTicket> {
  if (input.size > MAX_UPLOAD_BYTES) {
    throw new AssetError("too_large", `Max upload size is ${MAX_UPLOAD_BYTES} bytes`);
  }
  await ensureBucket();
  const token = randomUUID();
  const uploadUrl = await presignPut(stagingKey(token), input.mime);
  return { token, uploadUrl, expiresIn: 900 };
}

/**
 * Step 2: promote a staged upload into an asset.
 *
 * The hash is computed server-side from the stored bytes, never taken from the
 * client — a client-supplied digest would let anyone claim an existing asset by
 * guessing its hash.
 *
 * ponytail: buffers the whole object to hash and probe it. Fine to ~512MB on a
 * single box; stream through a hash transform when large video lands (v0.2+).
 */
export async function finalizeUpload(input: {
  token: string;
  filename: string;
  mime: string;
}): Promise<{ asset: Asset; deduped: boolean }> {
  const staged = stagingKey(input.token);
  if (!(await exists(staged))) {
    throw new AssetError("not_found", "No staged upload for that token");
  }

  const bytes = await getObject(staged);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const [existing] = await db.select().from(assets).where(eq(assets.sha256, sha256)).limit(1);
  if (existing) {
    await deleteObject(staged);
    return { asset: existing, deduped: true };
  }

  const probe = await probeImage(bytes);
  await putObject(originalKey(sha256), bytes, input.mime);
  await deleteObject(staged);

  const [asset] = await db
    .insert(assets)
    .values({
      sha256,
      filename: input.filename,
      mime: input.mime,
      size: bytes.byteLength,
      width: probe?.width ?? null,
      height: probe?.height ?? null,
      probe: probe ?? null,
    })
    .onConflictDoNothing({ target: assets.sha256 })
    .returning();

  // Lost a race with a concurrent upload of identical bytes — that upload won.
  if (!asset) {
    const [won] = await db.select().from(assets).where(eq(assets.sha256, sha256)).limit(1);
    return { asset: won, deduped: true };
  }

  return { asset, deduped: false };
}

export async function listAssets(limit = 100, offset = 0) {
  return db
    .select()
    .from(assets)
    .orderBy(desc(assets.createdAt))
    .limit(Math.min(limit, 200))
    .offset(offset);
}

export async function getAsset(id: string): Promise<Asset | null> {
  const [asset] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  return asset ?? null;
}

export async function deleteAsset(id: string) {
  const asset = await getAsset(id);
  if (!asset) return false;
  await db.delete(assets).where(eq(assets.id, id));
  // Renditions are left to an S3 lifecycle rule; they are derivable and cheap.
  await deleteObject(originalKey(asset.sha256));
  return true;
}

async function probeImage(bytes: Buffer) {
  try {
    const m = await sharp(bytes).metadata();
    return {
      width: m.width,
      height: m.height,
      format: m.format,
      space: m.space,
      hasAlpha: m.hasAlpha,
      pages: m.pages,
    };
  } catch {
    return null; // Not an image sharp understands. Still a perfectly good asset.
  }
}

export class AssetError extends Error {
  constructor(
    readonly code: "not_found" | "too_large" | "unsupported",
    message: string,
  ) {
    super(message);
  }
}
