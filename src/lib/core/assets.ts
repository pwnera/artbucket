import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, getTableColumns, or, sql, type SQL } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { assets, collectionAssets, type AssetStatus } from "@/lib/db/schema";
import { inheritedFrom, joinCollections } from "@/lib/core/collections";
import { AssetError } from "@/lib/core/errors";
import { listFields } from "@/lib/core/fields";
import { isRenderable } from "@/lib/core/renditions";
import { env } from "@/lib/env";
import { fetchPublic, FetchError } from "@/lib/fetch-public";
import { describeIssues, fieldsValidator, relaxInherited, type FieldValues } from "@/lib/fields";
import { FilterError, isFacetable, parseFieldFilters, type FieldFilter } from "@/lib/filters";
import { extractMetadata } from "@/lib/metadata";
import { MAX_UPLOAD_BYTES } from "@/lib/schemas";
import { normalizeTags, prefixQuery } from "@/lib/search";
import { FITS, FORMATS, MAX_DIMENSION, PRESETS } from "@/lib/transform";
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
const { search: _search, ...own } = getTableColumns(assets);
const columns = {
  ...own,
  /** Ids of the collections this asset is in. */
  collections: sql<string[]>`(
    select coalesce(jsonb_agg(ca.collection_id), '[]'::jsonb)
    from ${collectionAssets} ca where ca.asset_id = ${assets.id}
  )`,
};
export type Asset = Omit<typeof assets.$inferSelect, "search"> & { collections: string[] };

export { MAX_UPLOAD_BYTES };

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
  /** Collections to file it into. Their values count toward required fields. */
  collections?: string[];
  /** Added to any keywords read from the file. */
  tags?: string[];
  /** `proposed` when an agent (a propose-scoped key) is the uploader. */
  status?: AssetStatus;
}): Promise<{ asset: Asset; deduped: boolean }> {
  const staged = stagingKey(input.token);
  if (!(await exists(staged))) {
    throw new AssetError("not_found", "No staged upload for that token");
  }
  // Checked before any bytes move: a rejected upload stays staged, so the
  // client can fix the fields and retry with the same token.
  const into = input.collections ?? [];
  const values = await validFields(input.fields ?? {}, "upload", await inheritedFrom(into));

  const bytes = await getObject(staged);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const existing = await bySha(sha256);
  if (existing) {
    await deleteObject(staged);
    return { asset: await fileInto(into, existing.id), deduped: true };
  }

  const probe = await probeImage(bytes);
  // Keywords move into tags, which own them from here on. Kept in metadata too,
  // a removed tag would stay searchable through its stale copy.
  const { keywords, ...metadata } = extractMetadata(bytes) ?? {};
  await putObject(originalKey(sha256), bytes, input.mime);
  await deleteObject(staged);

  const [row] = await db
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
      tags: normalizeTags([...(keywords ?? []), ...(input.tags ?? [])]),
      fields: values as FieldValues,
      status: input.status ?? "active",
    })
    .onConflictDoNothing({ target: assets.sha256 })
    .returning({ id: assets.id });

  // Lost a race with a concurrent upload of identical bytes - that upload won.
  if (!row) return { asset: await fileInto(into, (await bySha(sha256))!.id), deduped: true };
  return { asset: await fileInto(into, row.id), deduped: false };
}

/**
 * File an asset into the upload's collections and return it fresh. A deduped
 * upload is filed too: same bytes, but the uploader aimed them somewhere.
 */
async function fileInto(collectionIds: string[], id: string): Promise<Asset> {
  if (collectionIds.length) await db.transaction((tx) => joinCollections(tx, collectionIds, id));
  return (await getAsset(id))!;
}

/**
 * Ingest from a URL: the server fetches it, stages it, and promotes it like
 * any upload. For agents, which can name a URL but can't PUT bytes. The fetch
 * refuses private and loopback addresses (lib/fetch-public.ts).
 */
export async function ingestFromUrl(
  input: Omit<Parameters<typeof finalizeUpload>[0], "token" | "filename" | "mime"> & { url: string; filename?: string },
) {
  const { url, filename, ...rest } = input;
  let fetched;
  try {
    fetched = await fetchPublic(url, { maxBytes: MAX_UPLOAD_BYTES });
  } catch (err) {
    if (err instanceof FetchError || (err as NodeJS.ErrnoException).code) {
      throw new AssetError("invalid", `Couldn't fetch ${url}: ${(err as Error).message}`);
    }
    throw err;
  }
  const name =
    filename ?? (decodeURIComponent(fetched.url.pathname.split("/").filter(Boolean).pop() ?? "") || "download");
  await ensureBucket();
  const token = randomUUID();
  await putObject(stagingKey(token), fetched.bytes, fetched.mime);
  try {
    return await finalizeUpload({ ...rest, token, filename: name.slice(0, 512), mime: fetched.mime });
  } catch (err) {
    // Nobody holds this token to retry with, so a rejected ingest leaves nothing behind.
    await deleteObject(stagingKey(token)).catch(() => {});
    throw err;
  }
}

export type AssetQuery = {
  /** Free text over filename, tags and embedded metadata. Every word must match. */
  q?: string;
  /** Assets carrying all of these tags. */
  tags?: string[];
  /** Assets in this collection. */
  collection?: string;
  /** Custom field filters, matched against own-else-inherited values. */
  filters?: FieldFilter[];
  /**
   * What waits on a human: proposed assets, and assets with suggested tags.
   * Otherwise only active assets are listed.
   */
  review?: boolean;
  limit?: number;
  offset?: number;
};

const QueryParams = z.object({
  q: z.string().max(512).optional(),
  tag: z.array(z.string().max(64)).max(20),
  collection: z.uuid().optional(),
  review: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().optional(),
});

/**
 * Parse an /api/v1/assets query string. Shared by the list endpoint and saved
 * searches, so a search that saves is a search that runs.
 */
export async function parseAssetQuery(params: URLSearchParams): Promise<AssetQuery> {
  const { tag, review, ...rest } = QueryParams.parse({
    q: params.get("q") ?? undefined,
    tag: params.getAll("tag"),
    collection: params.get("collection") ?? undefined,
    review: params.get("review") ?? undefined,
    limit: params.get("limit") ?? undefined,
    offset: params.get("offset") ?? undefined,
  });
  try {
    return { ...rest, tags: tag, review: review === "true", filters: parseFieldFilters(params, await listFields()) };
  } catch (err) {
    if (err instanceof FilterError) throw new AssetError("invalid", err.message);
    throw err;
  }
}

/** Own values over inherited ones. Must match assets_effective_fields_idx exactly. */
const effective = sql`(${assets.inherited} || ${assets.fields})`;

function filterSql(f: FieldFilter): SQL {
  if (f.op === "in") {
    return or(...f.values.map((v) => sql`${effective} @> ${JSON.stringify({ [f.key]: v })}::jsonb`))!;
  }
  const cmp = f.op === "gte" ? sql`>=` : sql`<=`;
  // Numbers compare as numbers; dates are ISO strings, which compare correctly as text.
  return typeof f.value === "number"
    ? sql`(jsonb_typeof(${effective} -> ${f.key}) = 'number' and (${effective} ->> ${f.key})::numeric ${cmp} ${f.value})`
    : sql`(${effective} ->> ${f.key}) ${cmp} ${f.value}`;
}

/**
 * Search and browse are one call: no query means newest first.
 *
 * Facets are counted over the same filter, so every count is a click that
 * returns exactly that many results. A field's own facet ignores that field's
 * filter: pick "web" and "print" still shows its count, because values of one
 * field OR together.
 *
 * ponytail: one facet query per select/boolean field, each scanning the
 * matching set. Fine at the v0.2 target (1,000 assets, <100ms); cache or
 * approximate past ~100k.
 */
export async function searchAssets({
  q,
  tags = [],
  collection,
  filters = [],
  review = false,
  limit = 100,
  offset = 0,
}: AssetQuery) {
  const tsq = q ? prefixQuery(q) : null;
  const match = tsq ? sql`${assets.search} @@ to_tsquery('simple', ${tsq})` : undefined;
  const wanted = normalizeTags(tags);
  const where = (except?: string) =>
    and(
      review
        ? sql`(${assets.status} = 'proposed' or ${assets.proposedTags} <> '[]'::jsonb)`
        : eq(assets.status, "active"),
      match,
      wanted.length ? sql`${assets.tags} @> ${JSON.stringify(wanted)}::jsonb` : undefined,
      collection
        ? sql`exists (select 1 from ${collectionAssets} ca where ca.asset_id = ${assets.id} and ca.collection_id = ${collection})`
        : undefined,
      ...filters.filter((f) => f.key !== except).map(filterSql),
    );

  const facetable = (await listFields()).filter(isFacetable);
  const [data, tagCounts, ...fieldCounts] = await Promise.all([
    db
      .select(columns)
      .from(assets)
      .where(where())
      .orderBy(
        ...(match ? [desc(sql`ts_rank(${assets.search}, to_tsquery('simple', ${tsq}))`)] : []),
        desc(assets.createdAt),
      )
      .limit(Math.min(Math.max(limit, 1), 200))
      .offset(Math.max(offset, 0)),
    tagFacet(where()),
    ...facetable.map((d) => fieldFacet(d.key, where(d.key))),
  ]);
  return {
    data,
    facets: {
      tags: tagCounts,
      fields: Object.fromEntries(facetable.map((d, i) => [d.key, fieldCounts[i]])),
    },
  };
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

/** Values as strings ("web", "true"): exactly what goes back in as `f.key=value`. */
async function fieldFacet(key: string, where: SQL | undefined) {
  const value = sql<string>`${effective} ->> ${key}`;
  return db
    .select({ value, count: sql<number>`count(*)::int` })
    .from(assets)
    .where(and(where, sql`${effective} ? ${key}`))
    // By position: the key is a bind parameter, and Postgres won't match
    // `->> $1` in the select to `->> $3` in a GROUP BY as the same expression.
    .groupBy(sql`1`)
    .orderBy(sql`2 desc`, sql`1`)
    .limit(50);
}

export async function getAsset(id: string): Promise<Asset | null> {
  // A malformed id is an asset that doesn't exist, not a database error.
  if (!z.uuid().safeParse(id).success) return null;
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
  status?: AssetStatus;
  /** Replaces the pending suggestions. */
  proposedTags?: string[];
  /** Custom field values to merge; null clears one. */
  fields?: Record<string, unknown>;
} & { [K in (typeof EDITABLE)[number]]?: string | null };

/**
 * Edits merge into `metadata` over what was extracted; null clears a field.
 * One statement, so concurrent edits to different fields don't clobber.
 */
export async function updateAsset(
  id: string,
  { tags, status, proposedTags, fields: custom, ...fields }: AssetPatch,
): Promise<Asset | null> {
  const set: PgUpdateSetSource<typeof assets> = {};
  if (tags) set.tags = normalizeTags(tags);
  if (status) set.status = status;
  if (proposedTags) set.proposedTags = normalizeTags(proposedTags);
  if (custom && Object.keys(custom).length) {
    const current = await getAsset(id);
    if (!current) return null;
    const values = await validFields(custom, "patch", current.inherited);
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
 * Suggest tags without applying them: they wait in `proposedTags` for a human
 * to accept (move into `tags`) or dismiss. Tags the asset already has are
 * dropped, so a suggestion is always something new.
 */
export async function proposeTags(id: string, suggested: string[]): Promise<Asset | null> {
  const fresh = normalizeTags(suggested);
  const [asset] = await db
    .update(assets)
    .set({
      proposedTags: sql`(
        select coalesce(jsonb_agg(distinct t), '[]'::jsonb)
        from jsonb_array_elements_text(${assets.proposedTags} || ${JSON.stringify(fresh)}::jsonb) t
        where not ${assets.tags} ? t
      )`,
      updatedAt: sql`now()`,
    })
    .where(eq(assets.id, id))
    .returning(columns);
  return asset ?? null;
}

/**
 * What an asset is, for a machine deciding whether and how to use it:
 * `GET /a/{id}` with `Accept: application/json`, and MCP's describe tool.
 * Rights arrive in v0.6; the key is here now so clients can code against it.
 */
export function describeAsset(asset: Asset) {
  const base = `${env.APP_URL}/a/${asset.id}`;
  const m = asset.metadata ?? {};
  const renderable = isRenderable(asset.mime);
  return {
    id: asset.id,
    filename: asset.filename,
    mime: asset.mime,
    size: asset.size,
    width: asset.width,
    height: asset.height,
    sha256: asset.sha256,
    status: asset.status,
    title: m.title ?? null,
    description: m.description ?? null,
    creator: m.creator ?? null,
    copyright: m.copyright ?? null,
    tags: asset.tags,
    fields: { ...asset.inherited, ...asset.fields },
    collections: asset.collections,
    rights: null,
    urls: {
      original: base,
      download: `${base}?download`,
      rendition: renderable ? `${base}/{transform}` : null,
    },
    constraints: renderable
      ? {
          w: [1, MAX_DIMENSION] as [number, number],
          h: [1, MAX_DIMENSION] as [number, number],
          q: [1, 100] as [number, number],
          fit: [...FITS],
          f: [...FORMATS],
          enlarges: false as const,
        }
      : null,
    alternatives: renderable ? PRESETS.map((p) => ({ name: p.name, url: `${base}/${p.spec}` })) : [],
  };
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

async function validFields(
  values: Record<string, unknown>,
  mode: "upload" | "patch",
  inherited: FieldValues = {},
) {
  const parsed = fieldsValidator(relaxInherited(await listFields(), inherited), mode).safeParse(values);
  if (!parsed.success) {
    throw new AssetError(
      "invalid",
      `Custom fields: ${describeIssues(parsed.error)}`,
      z.treeifyError(parsed.error),
    );
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
