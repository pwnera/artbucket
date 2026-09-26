import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, getTableColumns, sql, type SQL } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { listFields } from "@/lib/core/fields";
import { fieldsValidator, type FieldValues } from "@/lib/fields";
import { extractMetadata } from "@/lib/metadata";
import { normalizeTags, prefixQuery } from "@/lib/search";
import { buildXmp, embedXmp } from "@/lib/xmp";
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
 * The service layer. Every adapter - REST, MCP, CLI, the web UI - goes through
 * here and nowhere else. That constraint is what keeps the public API honest:
 * if the UI can't be built on it, it isn't finished.
 */

// The search vector is an index, not data: it never leaves the database.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { search: _search, ...columns } = getTableColumns(assets);
export type Asset = Omit<typeof assets.$inferSelect, "search">;

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
 * client - a client-supplied digest would let anyone claim an existing asset by
 * guessing its hash.
 *
 * ponytail: buffers the whole object to hash and probe it. Fine to ~512MB on a
 * single box; stream through a hash transform when large video lands (v0.2+).
 */
export async function finalizeUpload(input: {
  token: string;
  filename: string;
  mime: string;
  fields?: Record<string, unknown>;
}): Promise<{ asset: Asset; deduped: boolean }> {
  const staged = stagingKey(input.token);
  if (!(await exists(staged))) {
    throw new AssetError("not_found", "No staged upload for that token");
  }
  // Checked before any bytes move: a rejected upload stays staged, so the
  // client can fix the fields and retry with the same token.
  const values = await validFields(input.fields ?? {}, "upload");

  const bytes = await getObject(staged);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const existing = await bySha(sha256);
  if (existing) {
    await deleteObject(staged);
    return { asset: existing, deduped: true };
  }

  const probe = await probeImage(bytes);
  // Keywords move into tags, which own them from here on. Kept in metadata too,
  // a removed tag would stay searchable through its stale copy.
  const { keywords, ...metadata } = extractMetadata(bytes) ?? {};
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
      metadata: Object.keys(metadata).length ? metadata : null,
      // Embedded keywords seed the tags, so a library imported from Lightroom
      // is searchable by what it was already tagged with.
      tags: normalizeTags(keywords ?? []),
      fields: values as FieldValues,
    })
    .onConflictDoNothing({ target: assets.sha256 })
    .returning(columns);

  // Lost a race with a concurrent upload of identical bytes - that upload won.
  if (!asset) {
    return { asset: (await bySha(sha256))!, deduped: true };
  }

  return { asset, deduped: false };
}

export type AssetQuery = {
  /** Free text over filename, tags and embedded metadata. Every word must match. */
  q?: string;
  /** Assets carrying all of these tags. */
  tags?: string[];
  limit?: number;
  offset?: number;
};

/**
 * Search and browse are one call: no query means newest first. The tag facet
 * is counted over the same filter, so every count it shows is a click that
 * returns exactly that many results.
 *
 * ponytail: facet counts scan the matching set on every request. Fine at the
 * v0.2 target (1,000 assets, <100ms); cache or approximate past ~100k.
 */
export async function searchAssets({ q, tags = [], limit = 100, offset = 0 }: AssetQuery) {
  const tsq = q ? prefixQuery(q) : null;
  const match = tsq ? sql`${assets.search} @@ to_tsquery('simple', ${tsq})` : undefined;
  const wanted = normalizeTags(tags);
  const where = and(
    match,
    wanted.length ? sql`${assets.tags} @> ${JSON.stringify(wanted)}::jsonb` : undefined,
  );

  const [data, facets] = await Promise.all([
    db
      .select(columns)
      .from(assets)
      .where(where)
      .orderBy(
        ...(match ? [desc(sql`ts_rank(${assets.search}, to_tsquery('simple', ${tsq}))`)] : []),
        desc(assets.createdAt),
      )
      .limit(Math.min(Math.max(limit, 1), 200))
      .offset(Math.max(offset, 0)),
    tagFacet(where),
  ]);
  return { data, facets: { tags: facets } };
}

async function tagFacet(where: SQL | undefined) {
  const tag = sql<string>`jsonb_array_elements_text(${assets.tags})`;
  const rows = await db
    .select({ value: sql<string>`t.value`, count: sql<number>`count(*)::int` })
    .from(sql`${assets}, ${tag} as t(value)`)
    .where(where)
    .groupBy(sql`t.value`)
    .orderBy(sql`count(*) desc`, sql`t.value`)
    .limit(50);
  return rows;
}

export async function getAsset(id: string): Promise<Asset | null> {
  const [asset] = await db.select(columns).from(assets).where(eq(assets.id, id)).limit(1);
  return asset ?? null;
}

async function bySha(sha256: string): Promise<Asset | null> {
  const [asset] = await db.select(columns).from(assets).where(eq(assets.sha256, sha256)).limit(1);
  return asset ?? null;
}

/** The descriptive fields a person edits. Everything else is read from the file. */
export const EDITABLE = ["title", "description", "creator", "copyright"] as const;
export type AssetPatch = {
  tags?: string[];
  /** Custom field values to merge; null clears one. */
  fields?: Record<string, unknown>;
} & { [K in (typeof EDITABLE)[number]]?: string | null };

/**
 * Edits merge into `metadata` over what was extracted; null clears a field.
 * One statement, so concurrent edits to different fields don't clobber.
 */
export async function updateAsset(
  id: string,
  { tags, fields: custom, ...fields }: AssetPatch,
): Promise<Asset | null> {
  const set: PgUpdateSetSource<typeof assets> = {};
  if (tags) set.tags = normalizeTags(tags);
  if (custom && Object.keys(custom).length) {
    const values = await validFields(custom, "patch");
    set.fields = sql`jsonb_strip_nulls(${assets.fields} || ${JSON.stringify(values)}::jsonb)`;
  }
  if (Object.keys(fields).length) {
    const clean = Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, v?.trim() || null]),
    );
    set.metadata = sql`jsonb_strip_nulls(coalesce(${assets.metadata}, '{}'::jsonb) || ${JSON.stringify(clean)}::jsonb)`;
  }
  if (!Object.keys(set).length) return getAsset(id);
  const [asset] = await db
    .update(assets)
    .set({ ...set, updatedAt: sql`now()` })
    .where(eq(assets.id, id))
    .returning(columns);
  return asset ?? null;
}

/**
 * The original with the library's current metadata written into it. Formats
 * that can't carry XMP yet come back as stored, flagged so the caller can say so.
 */
export async function downloadAsset(asset: Asset): Promise<{ body: Buffer; embedded: boolean }> {
  const bytes = await getObject(originalKey(asset.sha256));
  const m = asset.metadata ?? {};
  const xmp = buildXmp({
    title: m.title,
    description: m.description,
    creator: m.creator,
    copyright: m.copyright,
    tags: asset.tags,
  });
  const out = embedXmp(bytes, asset.mime, xmp);
  return { body: out ?? bytes, embedded: out !== null };
}

export async function deleteAsset(id: string) {
  const asset = await getAsset(id);
  if (!asset) return false;
  await db.delete(assets).where(eq(assets.id, id));
  // Renditions are left to an S3 lifecycle rule; they are derivable and cheap.
  await deleteObject(originalKey(asset.sha256));
  return true;
}

async function validFields(values: Record<string, unknown>, mode: "upload" | "patch") {
  const parsed = fieldsValidator(await listFields(), mode).safeParse(values);
  if (!parsed.success) {
    throw new AssetError("invalid", "Custom field values are invalid", z.treeifyError(parsed.error));
  }
  return parsed.data;
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
    readonly code: "not_found" | "too_large" | "unsupported" | "invalid" | "conflict",
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
  }
}
