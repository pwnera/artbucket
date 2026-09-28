import { createHash, randomUUID } from "node:crypto";
import { and, count, desc, eq, getTableColumns, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { assets, collectionAssets, type AssetStatus } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { record } from "@/lib/core/activity";
import { recordAudit } from "@/lib/core/audit";
import { inheritedFrom, joinCollections, listCollections } from "@/lib/core/collections";
import { AssetError } from "@/lib/core/errors";
import { listFields } from "@/lib/core/fields";
import { dropGrants, keepReach } from "@/lib/core/people";
import { checkLimit, claimStorage, limitsOf } from "@/lib/core/usage";
import { repoint } from "@/lib/core/versions";
import { collectionScope, reach } from "@/lib/access";
import { can, needs, type Action } from "@/lib/permissions";
import { linkTitle, previewOf } from "@/lib/core/previews";
import { env } from "@/lib/env";
import { fetchPublic, FetchError } from "@/lib/fetch-public";
import { describeIssues, fieldsValidator, missingRequired, relaxInherited, type FieldValues } from "@/lib/fields";
import { ASSET_TYPES, FilterError, isFacetable, parseFieldFilters, type FieldFilter } from "@/lib/filters";
import { fontMime } from "@/lib/font";
import { isMonochromeSvg } from "@/lib/icons";
import { originOf, readC2pa } from "@/lib/c2pa";
import { extractMetadata } from "@/lib/metadata";
import { isEmpty, type Origin, type Rights } from "@/lib/rights";
import { hasPreview, isRenderable, parseLink } from "@/lib/preview";
import { isReview, STATES, type State } from "@/lib/lifecycle";
import { gate } from "@/lib/pool";
import { MAX_UPLOAD_BYTES } from "@/lib/schemas";
import { allows, SCOPES, type Scope } from "@/lib/scopes";
import { normalizeTags, prefixQuery } from "@/lib/search";
import { FITS, FORMATS, MAX_DIMENSION, PRESETS, SIZES } from "@/lib/transform";
import { buildXmp, embedXmp } from "@/lib/xmp";
import {
  BYTES_LOCK,
  deleteObject,
  ensureBucket,
  getObject,
  originalKey,
  presignPut,
  putObject,
  sizeOf,
  stagingKey,
} from "@/lib/storage";

/**
 * The service layer. Every adapter - REST, MCP, CLI, the web UI - goes through
 * here and nowhere else. That constraint is what keeps the public API honest:
 * if the UI can't be built on it, it isn't finished.
 *
 * Everything is inside the caller's workspace (lib/core/access.ts). A caller
 * with read on the workspace sees all of it; one with grants on some
 * collections or assets only (lib/access.ts) sees those, and writes where its
 * grant says it may.
 */

// The search vector is an index, not data: it never leaves the database.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { search: _search, ...own } = getTableColumns(assets);
/** Assets in collections: the lowest scope over them decides what an upload into them becomes. */
const lowest = (scopes: (Scope | null)[]) =>
  scopes.some((s) => s === null) ? null : (SCOPES[Math.min(...scopes.map((s) => SCOPES.indexOf(s!)))] ?? null);

/** Today in UTC, as lib/rights.ts today() has it: ISO dates compare as text. */
const todaySql = sql`to_char(now() at time zone 'utc', 'YYYY-MM-DD')`;
/** lib/lifecycle.ts stateOf, as SQL. */
export const stateSql = sql<State>`(case when ${assets.deletedAt} is not null then 'deleted' when ${assets.status} = 'active' and ${assets.rights} ->> 'expires' < ${todaySql} then 'expired' else ${assets.status} end)`;
/** lib/lifecycle.ts deliverable, as SQL. */
export const deliverableSql = sql`(${stateSql} = 'active' and coalesce(${assets.rights} ->> 'embargo', '') <= ${todaySql})`;
/** Not an earlier approved version of something: the library shows a stack's current one. */
export const notSuperseded = sql`(${assets.stackId} is null or ${assets.current} or ${assets.status} <> 'active' or ${assets.deletedAt} is not null)`;

export const columns = {
  ...own,
  state: stateSql,
  /** Ids of the collections this asset is in. */
  collections: sql<string[]>`(
    select coalesce(jsonb_agg(ca.collection_id), '[]'::jsonb)
    from ${collectionAssets} ca where ca.asset_id = ${assets.id}
  )`,
};
export type Asset = Omit<typeof assets.$inferSelect, "search"> & { collections: string[]; state: State };

/**
 * Private, as SQL: its own flag, or it is in collections and every one of
 * them is private. lib/access.ts isPrivate, for a query.
 */
export const privateAsset = (hidden: string[]) =>
  // No private collections: nothing is hidden by being in them, and no row needs asking (docs: benchmarks).
  hidden.length
    ? sql`(${assets.private} or (
  exists (select 1 from ${collectionAssets} ca where ca.asset_id = ${assets.id})
  and not exists (select 1 from ${collectionAssets} ca where ca.asset_id = ${assets.id} and not ${inArray(sql`ca.collection_id`, hidden)})
))`
    : sql`${assets.private}`;

/**
 * What this caller may see: all of the workspace with read on it, private
 * assets aside unless it is admin; and what its grants reach, an asset on its
 * own or through a collection it is in.
 */
export function visible(caller: Caller): SQL {
  const inWorkspace = eq(assets.workspaceId, caller.workspace.id);
  if (allows(caller.scope, "admin")) return inWorkspace;
  const r = reach(caller, "read");
  // Asked per row, so only when there is a grant to ask about.
  const granted = or(
    r.assets.length ? inArray(assets.id, r.assets) : undefined,
    r.collections.length
      ? sql`exists (select 1 from ${collectionAssets} ca where ca.asset_id = ${assets.id} and ${inArray(sql`ca.collection_id`, r.collections)})`
      : undefined,
  );
  const open = sql`not ${privateAsset(caller.hidden)}`;
  return and(inWorkspace, allows(caller.scope, "read") ? (granted ? or(open, granted) : open) : (granted ?? sql`false`))!;
}

export { MAX_UPLOAD_BYTES };

export type UploadTicket = {
  token: string;
  uploadUrl: string;
  expiresIn: number;
};

/**
 * Step 1: hand the browser a presigned PUT straight to object storage. The
 * ticket is the workspace's: the bytes land under it, so only an upload into
 * it can promote them, and its organization's storage is checked for the
 * size claimed before any bytes move (again, for the real size, at step 2).
 */
export async function createUploadTicket(
  caller: Pick<Caller, "workspace">,
  input: { filename: string; mime: string; size: number },
): Promise<UploadTicket> {
  if (input.size > MAX_UPLOAD_BYTES) {
    throw new AssetError("too_large", `Max upload size is ${MAX_UPLOAD_BYTES} bytes`);
  }
  await checkLimit(caller.workspace.organizationId, "storage", { adding: input.size });
  await ensureBucket();
  const token = randomUUID();
  const uploadUrl = await presignPut(stagingKey(caller.workspace.id, token), input.mime, input.size);
  return { token, uploadUrl, expiresIn: 900 };
}

/**
 * Step 2: promote a staged upload into an asset.
 *
 * The hash is computed server-side from the stored bytes, never taken from the
 * client - a client-supplied digest would let anyone claim an existing asset by
 * guessing its hash.
 *
 * ponytail: buffers the whole object to hash and probe it, bounded by
 * MAX_UPLOAD_BYTES (checked first). The probes, XMP, C2PA and previews all read
 * a Buffer; streaming means teaching them to read ranges. So uploads take
 * turns by size (UPLOAD_MEMORY at once), with a short line behind them.
 */
export async function finalizeUpload(caller: Caller, input: FinalizeInput): Promise<{ asset: Asset; deduped: boolean }> {
  if (uploads.full) throw new AssetError("rate_limited", "Busy taking uploads: try again in a moment");
  const size = (await sizeOf(stagingKey(caller.workspace.id, input.token))) ?? 0;
  return uploads.run(Math.min(size, MAX_UPLOAD_BYTES), () => promote(caller, input));
}

/** An SVG bigger than this is a drawing, not an icon: its colors aren't read. */
const SVG_SCAN_BYTES = 1024 * 1024;

// ponytail: per process, and the bytes of the file only: probes and previews take more on top.
const UPLOAD_MEMORY = 2 * MAX_UPLOAD_BYTES;
const uploads = gate(UPLOAD_MEMORY, 32);

type FinalizeInput = {
  token: string;
  filename: string;
  mime: string;
  fields?: Record<string, unknown>;
  /** Collections to file it into. Their values count toward required fields. */
  collections?: string[];
  /** Added to any keywords read from the file. */
  tags?: string[];
  /** A new version of this asset: it joins its stack, collections, tags and fields (lib/core/versions.ts). */
  versionOf?: string;
  /** `draft` keeps it out of the library until it is submitted and approved. */
  status?: "draft" | "active";
  /** What the server knows to say about it (an imported icon's title and author); the file's own metadata wins. */
  described?: Partial<Record<(typeof EDITABLE)[number], string>>;
} & Provenance;

async function promote(caller: Caller, input: FinalizeInput): Promise<{ asset: Asset; deduped: boolean }> {
  const ws = caller.workspace.id;
  const prior = input.versionOf ? await getAsset(caller, input.versionOf) : null;
  if (input.versionOf && (!prior || prior.deletedAt)) throw new AssetError("invalid", `versionOf: no asset ${input.versionOf}`);
  if (prior && !can(caller, "asset.version", prior)) throw new AssetError("forbidden", `You need ${needs("asset.version")}`);
  const into = [...new Set([...(input.collections ?? []), ...(prior?.collections ?? [])])];
  // A new version is a change to the asset: write on it makes it approved, less a proposal.
  const proposed = prior
    ? !can(caller, "asset.edit", prior) || (!!input.collections?.length && !allows(uploadScope(caller, input.collections), "write"))
    : !allows(uploadScope(caller, into), "write");
  const status: AssetStatus = proposed ? "proposed" : (input.status ?? "active");
  const staged = stagingKey(ws, input.token);
  const size = await sizeOf(staged);
  if (size === null) throw new AssetError("not_found", "No staged upload for that token");
  // The signed PUT pins the size claimed for the ticket, but not every provider checks it.
  if (size > MAX_UPLOAD_BYTES) {
    await deleteObject(staged);
    throw new AssetError("too_large", `Max upload size is ${MAX_UPLOAD_BYTES} bytes`);
  }
  // Checked before any bytes move: a rejected upload stays staged, so the
  // client can fix the fields and retry with the same token.
  // A proposal may leave required fields empty: an agent can't always know
  // them. The person approving it fills them in (updateAsset checks).
  const values = withoutNulls(
    await validFields(ws, { ...prior?.fields, ...input.fields }, proposed ? "patch" : "upload", await inheritedFrom(ws, into)),
  );
  if (input.parentAssetId) await mustExist(caller, input.parentAssetId, "parentAssetId");

  const bytes = await getObject(staged);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const existing = await bySha(ws, sha256);
  if (existing) {
    await deleteObject(staged);
    // Uploading a version that is already in the stack changes nothing; the same bytes elsewhere are another asset's.
    if (prior && existing.id !== prior.id && !(prior.stackId && existing.stackId === prior.stackId)) {
      throw new AssetError("conflict", `Those bytes are already in the library as ${existing.metadata?.title ?? existing.filename}`, {
        id: existing.id,
      });
    }
    return { asset: await fileInto(ws, into, existing.id), deduped: true };
  }
  // The size stored, not the size claimed for the ticket; checked again under a lock as it lands.
  await checkLimit(caller.workspace.organizationId, "storage", { adding: size });
  const limits = await limitsOf(caller.workspace.organizationId);

  const mime = fontMime(bytes) ?? input.mime;
  // Anything but a web image gets a look for what it can show as: a still, an
  // animation, an embed. Even one sharp probes: it reads HEIC's header, not its pixels.
  const image = await probeImage(bytes);
  const probe = isRenderable(mime)
    ? // An SVG in one ink can be drawn in any color: an icon shows in the text's (lib/icons.ts).
      mime === "image/svg+xml" && bytes.byteLength <= SVG_SCAN_BYTES
      ? { ...image, mono: isMonochromeSvg(bytes.toString("utf8")) }
      : image
    : { ...image, ...(await previewOf(bytes, mime)) };
  // Keywords move into tags, which own them from here on. Kept in metadata too,
  // a removed tag would stay searchable through its stale copy.
  const { keywords, ...metadata } = extractMetadata(bytes) ?? {};
  // Content Credentials say how it was made, unless the uploader says otherwise.
  const c2pa = readC2pa(bytes);

  // A version keeps what a person wrote about the one before, where the file says nothing.
  const described = Object.fromEntries(EDITABLE.flatMap((k) => (prior?.metadata?.[k] ? [[k, prior.metadata[k]]] : [])));
  const kept = { ...input.described, ...described, ...metadata };
  const stack = prior ? (prior.stackId ?? prior.id) : null;
  const { row, purged } = await db.transaction(async (tx) => {
    // The bytes and the row that holds them land together: lib/core/sweep.ts
    // takes the same lock before it removes an original nothing holds.
    await tx.execute(sql`select pg_advisory_xact_lock(${BYTES_LOCK}, hashtext(${sha256}))`);
    await putObject(originalKey(sha256), bytes, mime);
    // These bytes, deleted here before: that asset is gone for good, and this is a new one.
    const purged = await tx
      .delete(assets)
      .where(and(eq(assets.workspaceId, ws), eq(assets.sha256, sha256), isNotNull(assets.deletedAt)))
      .returning({ id: assets.id, stackId: assets.stackId });
    await dropGrants("asset", purged.map((p) => p.id), tx);
    let version: number | null = null;
    if (stack) {
      // One new version of a stack at a time, so each gets the next number.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${stack}))`);
      await tx.update(assets).set({ stackId: stack, version: 1 }).where(and(eq(assets.id, prior!.id), isNull(assets.stackId)));
      const [{ next }] = await tx
        .select({ next: sql<number>`coalesce(max(${assets.version}), 0)::int + 1` })
        .from(assets)
        .where(eq(assets.stackId, stack));
      version = next;
    }
    await claimStorage(tx, caller.workspace.organizationId, size, limits);
    const [row] = await tx
      .insert(assets)
      .values({
        workspaceId: ws,
        sha256,
        filename: input.filename,
        mime,
        size: bytes.byteLength,
        width: probe?.width ?? null,
        height: probe?.height ?? null,
        probe: probe ?? null,
        metadata: Object.keys(kept).length ? kept : null,
        // Embedded keywords seed the tags, so a library imported from Lightroom
        // is searchable by what it was already tagged with.
        tags: normalizeTags([...(prior?.tags ?? []), ...(keywords ?? []), ...(input.tags ?? [])]),
        fields: values as FieldValues,
        status,
        proposedBy: proposed ? caller.actor : null,
        private: prior?.private ?? false,
        rights: input.rights && !isEmpty(input.rights) ? input.rights : null,
        origin: input.origin ?? (c2pa && originOf(c2pa)),
        parentAssetId: input.parentAssetId ?? null,
        generator: input.generator ?? (c2pa && (c2pa.softwareAgent ?? c2pa.generator)),
        prompt: input.prompt ?? null,
        c2pa,
        stackId: stack,
        version,
      })
      .onConflictDoNothing({ target: [assets.workspaceId, assets.sha256] })
      .returning({ id: assets.id, version: assets.version });
    return { row, purged };
  });
  await deleteObject(staged);
  for (const p of purged) if (p.stackId && p.stackId !== stack) await repoint(p.stackId);

  // Lost a race with a concurrent upload of identical bytes - that upload won.
  if (!row) return { asset: await fileInto(ws, into, (await bySha(ws, sha256))!.id), deduped: true };
  // An approved new version becomes current; one in review waits for its approval.
  if (stack) await repoint(stack, status === "active" ? { id: row.id } : undefined);
  const asset = await fileInto(ws, into, row.id);
  await record(caller, proposed ? "suggested" : "added", asset, row.version ? { version: row.version } : undefined);
  return { asset, deduped: false };
}

/**
 * What an upload into these collections (or the workspace) becomes: write
 * where it lands makes it active, propose makes it a proposal. Into
 * collections, the least the caller may do in any of them decides. Less than
 * propose is a 403, before any bytes move.
 */
function uploadScope(caller: Caller, into: string[]) {
  const may = into.length ? into.every((id) => can(caller, "asset.upload", { id })) : can(caller, "workspace.upload");
  if (!may) throw new AssetError("forbidden", into.length ? "You can't add to that collection" : "Upload into a collection you have access to");
  return into.length ? lowest(into.map((c) => collectionScope(caller, c))) : caller.scope;
}

/**
 * File an asset into the upload's collections and return it fresh. A deduped
 * upload is filed too: same bytes, but the uploader aimed them somewhere.
 */
async function fileInto(ws: string, collectionIds: string[], id: string): Promise<Asset> {
  if (collectionIds.length) await db.transaction((tx) => joinCollections(tx, ws, collectionIds, id));
  return (await findAsset(id))!;
}

/**
 * Ingest from a URL: the server fetches it, stages it, and promotes it like
 * any upload. For agents, which can name a URL but can't PUT bytes. The fetch
 * refuses private and loopback addresses (lib/fetch-public.ts).
 *
 * A Figma or Google Docs, Sheets, Slides or Drive link isn't fetched: its
 * bytes would be the service's web app. It is kept as the link itself
 * (text/uri-list) and shows as the service's embed (lib/preview.ts parseLink).
 */
export async function ingestFromUrl(
  caller: Caller,
  input: Omit<Parameters<typeof finalizeUpload>[1], "token" | "filename" | "mime"> & { url: string; filename?: string },
) {
  const { url, filename, ...rest } = input;
  uploadScope(caller, rest.collections ?? []);
  const kept = parseLink(url);
  if (kept) {
    const name = filename ?? (await linkTitle(url)) ?? `${kept.service === "Figma" ? "Figma" : `Google ${kept.service}`} link`;
    return stageAndFinalize(caller, rest, Buffer.from(`${url}\r\n`), "text/uri-list", name);
  }
  if (uploads.full) throw new AssetError("rate_limited", "Busy taking uploads: try again in a moment");
  // The size isn't known until it arrives: it takes turns as the largest there can be.
  return uploads.run(MAX_UPLOAD_BYTES, async () => {
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
    return stageAndFinalize(caller, rest, fetched.bytes, fetched.mime, name);
  });
}

/**
 * Ingest bytes the server made or fetched itself (an icon built from its
 * pack's data): staged and promoted like any upload, with the same checks.
 */
export async function ingestBytes(
  caller: Caller,
  input: Omit<FinalizeInput, "token" | "filename" | "mime"> & { bytes: Buffer; mime: string; filename: string },
) {
  const { bytes, mime, filename, ...rest } = input;
  uploadScope(caller, rest.collections ?? []);
  if (uploads.full) throw new AssetError("rate_limited", "Busy taking uploads: try again in a moment");
  return uploads.run(bytes.byteLength, () => stageAndFinalize(caller, rest, bytes, mime, filename));
}

async function stageAndFinalize(
  caller: Caller,
  rest: Omit<FinalizeInput, "token" | "filename" | "mime">,
  bytes: Buffer,
  mime: string,
  name: string,
) {
  await ensureBucket();
  const token = randomUUID();
  await checkLimit(caller.workspace.organizationId, "storage", { adding: bytes.byteLength });
  await putObject(stagingKey(caller.workspace.id, token), bytes, mime);
  try {
    // Not finalizeUpload: an ingest already has its turn (and a link is a few bytes).
    return await promote(caller, { ...rest, token, filename: name.slice(0, 512), mime });
  } catch (err) {
    // Nobody holds this token to retry with, so a rejected ingest leaves nothing behind.
    await deleteObject(stagingKey(caller.workspace.id, token)).catch(() => {});
    throw err;
  }
}

export type AssetQuery = {
  /** Free text over filename, tags and embedded metadata. Every word must match. */
  q?: string;
  /** Assets carrying all of these tags. */
  tags?: string[];
  /** Assets of any of these types (lib/filters.ts ASSET_TYPES). */
  types?: string[];
  /** Assets in this collection. */
  collection?: string;
  /** Custom field filters, matched against own-else-inherited values. */
  filters?: FieldFilter[];
  /**
   * Assets in any of these states (lib/lifecycle.ts). Approved and unexpired
   * when left out: the library as it may be used.
   */
  status?: State[];
  /** What waits on a human: proposed assets, and assets with suggested tags. */
  review?: boolean;
  /** Everything this actor proposed, whatever became of it: active, proposed or rejected. */
  proposedBy?: string;
  limit?: number;
  offset?: number;
};

const QueryParams = z.object({
  q: z.string().max(512).optional(),
  tag: z.array(z.string().max(64)).max(20),
  type: z.array(z.string().max(20)).max(ASSET_TYPES.length),
  status: z.array(z.enum(STATES, { error: `A status is one of ${STATES.join(", ")}` })).max(STATES.length),
  collection: z.string().max(120).optional(),
  review: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().optional(),
});

/**
 * Parse an /api/v1/assets query string. Shared by the list endpoint and saved
 * searches, so a search that saves is a search that runs.
 */
export async function parseAssetQuery(caller: Caller, params: URLSearchParams): Promise<AssetQuery> {
  const { tag, type, review, ...rest } = QueryParams.parse({
    q: params.get("q") ?? undefined,
    tag: params.getAll("tag"),
    type: params.getAll("type"),
    status: params.getAll("status"),
    collection: params.get("collection") ?? undefined,
    review: params.get("review") ?? undefined,
    limit: params.get("limit") ?? undefined,
    offset: params.get("offset") ?? undefined,
  });
  const unknown = type.find((t) => !(ASSET_TYPES as readonly string[]).includes(t));
  if (unknown) throw new AssetError("invalid", `No asset type "${unknown}". Types: ${ASSET_TYPES.join(", ")}`);
  const collection = rest.collection && (await collectionId(caller, rest.collection));
  try {
    return {
      ...rest,
      collection,
      tags: tag,
      types: type,
      review: review === "true",
      filters: parseFieldFilters(params, await listFields(caller.workspace.id)),
    };
  } catch (err) {
    if (err instanceof FilterError) throw new AssetError("invalid", err.message);
    throw err;
  }
}

/** A collection by id, or by name (any case): agents and people remember names. */
async function collectionId(caller: Caller, ref: string): Promise<string> {
  const all = await listCollections(caller);
  const hit = all.find((c) => c.id === ref) ?? all.find((c) => c.name.toLowerCase() === ref.trim().toLowerCase());
  if (hit) return hit.id;
  throw new AssetError(
    "invalid",
    `No collection "${ref}". ${all.length ? `Collections: ${all.map((c) => c.name).join(", ")}` : "There are no collections yet"}`,
  );
}

/**
 * An asset's type (ASSET_TYPES), from its media type. Fonts go by extension
 * too, like lib/font.ts isFont: a font can arrive as application/octet-stream.
 */
const assetType = sql<string>`case
  when ${assets.mime} like 'font/%' or ${assets.filename} ~* '\\.(woff2?|[ot]tf)$' then 'font'
  when ${assets.mime} like 'image/%' then 'image'
  when ${assets.mime} like 'video/%' then 'video'
  when ${assets.mime} like 'audio/%' then 'audio'
  when ${assets.mime} = 'application/pdf' or ${assets.mime} like 'text/%'
    or ${assets.mime} ~ '^application/(msword|rtf|vnd\\.(openxmlformats-officedocument|oasis\\.opendocument|ms-))' then 'document'
  else 'other' end`;

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
 * What a search matches, as SQL: what the caller may see, narrowed by the
 * query. Collection sections (core/section-assets.ts) filter with it too.
 * `except` leaves one field's filter out, `anyType` the types and `anyState`
 * the states, for facets that count past their own filter.
 */
export function assetWhere(
  caller: Caller,
  { q, tags = [], types = [], status = [], collection, filters = [], review = false, proposedBy }: AssetQuery,
  except?: string,
  anyType = false,
  anyState = false,
) {
  const tsq = q ? prefixQuery(q) : null;
  const wanted = normalizeTags(tags);
  return and(
    visible(caller),
    proposedBy !== undefined
      ? eq(assets.proposedBy, proposedBy)
      : review
        ? sql`(${assets.deletedAt} is null and (${assets.status} = 'proposed' or (${assets.status} = 'active' and (${assets.proposedTags} <> '[]'::jsonb or ${assets.proposedFields} <> '{}'::jsonb))))`
        : anyState
          ? undefined
          : inArray(stateSql, status.length ? status : ["active"]),
    // Whoever proposed a version sees it whatever became of it; everyone else, the current one.
    proposedBy !== undefined ? undefined : notSuperseded,
    tsq ? sql`${assets.search} @@ to_tsquery('simple', ${tsq})` : undefined,
    wanted.length ? sql`${assets.tags} @> ${JSON.stringify(wanted)}::jsonb` : undefined,
    types.length && !anyType ? inArray(assetType, types) : undefined,
    collection
      ? sql`exists (select 1 from ${collectionAssets} ca where ca.asset_id = ${assets.id} and ca.collection_id = ${collection})`
      : undefined,
    ...filters.filter((f) => f.key !== except).map(filterSql),
  );
}

/**
 * Search and browse are one call: no query means newest first.
 *
 * Facets are counted over the same filter, so every count is a click that
 * returns exactly that many results. A field's own facet ignores that field's
 * filter: pick "web" and "print" still shows its count, because values of one
 * field OR together. Types OR the same way, so their facet ignores `types`.
 *
 * ponytail: one facet query per select/boolean field, each scanning the
 * matching set. Fine at the v0.2 target (1,000 assets, <100ms); cache or
 * approximate past ~100k.
 */
export async function searchAssets(caller: Caller, query: AssetQuery) {
  const { q, limit = 100, offset = 0 } = query;
  const tsq = q ? prefixQuery(q) : null;
  const where = (except?: string, anyType = false, anyState = false) => assetWhere(caller, query, except, anyType, anyState);

  const facetable = (await listFields(caller.workspace.id)).filter(isFacetable);
  // ponytail: facets count over every match, about 100 ms at 93,000 (docs: developers/benchmarks).
  // Cache them per query, or count a sample past some size, when libraries outgrow that.
  const [data, [{ total }], tagCounts, typeCounts, stateCounts, ...fieldCounts] = await Promise.all([
    db
      .select(columns)
      .from(assets)
      .where(where())
      .orderBy(
        ...(tsq ? [desc(sql`ts_rank(${assets.search}, to_tsquery('simple', ${tsq}))`)] : []),
        desc(assets.createdAt),
      )
      .limit(Math.min(Math.max(limit, 1), 200))
      .offset(Math.max(offset, 0)),
    db.select({ total: count() }).from(assets).where(where()),
    tagFacet(where()),
    typeFacet(where(undefined, true)),
    stateFacet(where(undefined, false, true)),
    ...facetable.map((d) => fieldFacet(d.key, where(d.key))),
  ]);
  return {
    data,
    /** Every match, not just this page: page with `offset` until it is reached. */
    total,
    facets: {
      tags: tagCounts,
      types: typeCounts,
      states: stateCounts,
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

function stateFacet(where: SQL | undefined) {
  return db
    .select({ value: stateSql, count: sql<number>`count(*)::int` })
    .from(assets)
    .where(where)
    .groupBy(sql`1`)
    .orderBy(sql`2 desc`, sql`1`);
}

function typeFacet(where: SQL | undefined) {
  return db
    .select({ value: assetType, count: sql<number>`count(*)::int` })
    .from(assets)
    .where(where)
    .groupBy(sql`1`)
    .orderBy(sql`2 desc`, sql`1`);
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

/** An asset this caller may see, or null: one it can't see is one that isn't there. */
export async function getAsset(caller: Caller, id: string): Promise<Asset | null> {
  // A malformed id is an asset that doesn't exist, not a database error.
  if (!z.uuid().safeParse(id).success) return null;
  const [asset] = await db
    .select(columns)
    .from(assets)
    .where(and(eq(assets.id, id), visible(caller)))
    .limit(1);
  return asset ?? null;
}

/** Any asset, by id, whoever asks: for code that checks access itself, as /a/{id} does. */
export async function findAsset(id: string): Promise<Asset | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const [asset] = await db.select(columns).from(assets).where(eq(assets.id, id)).limit(1);
  return asset ?? null;
}

/** The live asset with these bytes; a deleted one is replaced by a new upload of them. */
async function bySha(ws: string, sha256: string): Promise<Asset | null> {
  const [asset] = await db
    .select(columns)
    .from(assets)
    .where(and(eq(assets.workspaceId, ws), eq(assets.sha256, sha256), isNull(assets.deletedAt)))
    .limit(1);
  return asset ?? null;
}

/** The asset, if the caller may do `action` to it; a 403 when it may only look. */
async function allowed(caller: Caller, id: string, action: Action): Promise<Asset | null> {
  const asset = await getAsset(caller, id);
  if (asset && !can(caller, action, asset)) throw new AssetError("forbidden", `You need ${needs(action)}`);
  return asset;
}

/**
 * Where an asset came from. Set at upload or by PATCH; `origin` and
 * `generator` default to what the file's Content Credentials say.
 */
export type Provenance = {
  rights?: Rights | null;
  origin?: Origin | null;
  /** The asset it was made from. */
  parentAssetId?: string | null;
  generator?: string | null;
  prompt?: string | null;
};

async function mustExist(caller: Caller, id: string, what: string) {
  if (!(await getAsset(caller, id))) throw new AssetError("invalid", `${what}: no asset ${id}`);
}

/** The asset that replaces this one at last: replacements can be replaced too. */
export async function currentVersion(asset: Asset): Promise<Asset> {
  let at = asset;
  const seen = new Set([at.id]);
  while (at.supersededBy && !seen.has(at.supersededBy)) {
    const next = await findAsset(at.supersededBy);
    if (!next) break;
    seen.add(next.id);
    at = next;
  }
  return at;
}

/** The descriptive fields a person edits. Everything else is read from the file. */
export const EDITABLE = ["title", "description", "creator", "copyright"] as const;
export type AssetPatch = {
  tags?: string[];
  status?: AssetStatus;
  /** Why it was rejected; read back by whoever proposed it. */
  reviewNote?: string | null;
  /** Replaces the pending suggestions. */
  proposedTags?: string[];
  /** Replaces the pending field values; {} dismisses them all. */
  proposedFields?: Record<string, unknown>;
  /** Custom field values to merge; null clears one. */
  fields?: Record<string, unknown>;
  /** The asset that replaces this one; null un-replaces it. */
  supersededBy?: string | null;
  /** Only grants on it (or a collection it is in) and admins reach it. */
  private?: boolean;
  /** Served at /a/{id} to anyone while it may be used. Takes share on it. */
  public?: boolean;
  /** Where crops keep, 0 to 1 from the top left; null clears it. */
  focus?: { x: number; y: number } | null;
} & Provenance & { [K in (typeof EDITABLE)[number]]?: string | null };

/**
 * Edits merge into `metadata` over what was extracted; null clears a field.
 * One statement, so concurrent edits to different fields don't clobber.
 */
export async function updateAsset(
  caller: Caller,
  id: string,
  {
    tags,
    status,
    reviewNote,
    proposedTags,
    proposedFields,
    fields: custom,
    rights,
    origin,
    parentAssetId,
    generator,
    prompt,
    supersededBy,
    private: hidden,
    public: open,
    focus,
    ...fields
  }: AssetPatch,
): Promise<Asset | null> {
  const current = await getAsset(caller, id);
  if (!current) return null;
  if (current.deletedAt) throw new AssetError("invalid", "Deleted: restore it first");
  // Deciding what the library holds is reviewing; reworking a draft, and anything else, is editing.
  const moves = status !== undefined && status !== current.status;
  const reviewing = (moves && isReview(current.status, status)) || reviewNote !== undefined || proposedTags !== undefined || proposedFields !== undefined;
  const action = reviewing ? "asset.review" : "asset.edit";
  const publishing = open !== undefined && open !== current.public;
  // Making it public is sharing it; on its own, that is all it takes.
  const others = Object.entries({ tags, status, reviewNote, proposedTags, proposedFields, custom, rights, origin, parentAssetId, generator, prompt, supersededBy, hidden, focus, ...fields });
  if (others.some(([, v]) => v !== undefined) && !can(caller, action, current)) throw new AssetError("forbidden", `You need ${needs(action)}`);
  if (publishing && !can(caller, "asset.share", current)) throw new AssetError("forbidden", `Making it public takes ${needs("asset.share")}`);
  const ws = caller.workspace.id;
  const set: PgUpdateSetSource<typeof assets> = {};
  if (rights !== undefined) set.rights = rights && !isEmpty(rights) ? rights : null;
  if (origin !== undefined) set.origin = origin;
  if (generator !== undefined) set.generator = generator?.trim() || null;
  if (prompt !== undefined) set.prompt = prompt?.trim() || null;
  if (parentAssetId) {
    if (parentAssetId === id) throw new AssetError("invalid", "An asset can't be made from itself");
    await mustExist(caller, parentAssetId, "parentAssetId");
  }
  if (parentAssetId !== undefined) set.parentAssetId = parentAssetId;
  if (supersededBy) {
    let at = await getAsset(caller, supersededBy);
    if (!at) throw new AssetError("invalid", `supersededBy: no asset ${supersededBy}`);
    // Following replacements must end somewhere: A replaced by B replaced by A never does.
    for (const seen = new Set<string>(); at && !seen.has(at.id); at = at.supersededBy ? await findAsset(at.supersededBy) : null) {
      if (at.id === id) throw new AssetError("invalid", "That would make a loop: the replacement is, or leads back to, this asset");
      seen.add(at.id);
    }
  }
  if (supersededBy !== undefined) set.supersededBy = supersededBy;
  if (hidden !== undefined) set.private = hidden;
  if (publishing) set.public = open;
  if (tags) set.tags = normalizeTags(tags);
  if (status) set.status = status;
  if (reviewNote !== undefined) set.reviewNote = reviewNote?.trim() || null;
  if (proposedTags) set.proposedTags = normalizeTags(proposedTags);
  // Only ever fewer: what is left of the suggestions after some were accepted or dismissed.
  if (proposedFields) set.proposedFields = Object.fromEntries(Object.entries(current.proposedFields).filter(([k]) => k in proposedFields));
  if (custom && Object.keys(custom).length) {
    const values = await validFields(ws, custom, "patch", current.inherited);
    set.fields = sql`jsonb_strip_nulls(${assets.fields} || ${JSON.stringify(values)}::jsonb)`;
  }
  // A proposal could skip required fields; it can't go live without them.
  if (status === "active" && current.status !== "active") {
    const merged = { ...current.inherited, ...current.fields, ...(custom ?? {}) };
    const missing = missingRequired(await listFields(ws), merged);
    if (missing.length) {
      throw new AssetError("invalid", `Fill in ${missing.map((d) => d.label).join(", ")} before approving`, {
        missing: missing.map((d) => d.key),
      });
    }
  }
  // The focal point sits with the words a person wrote about it: metadata, merged the same way.
  const clean = {
    ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v?.trim() || null])),
    ...(focus !== undefined && { focus }),
  };
  if (Object.keys(clean).length) {
    set.metadata = sql`jsonb_strip_nulls(coalesce(${assets.metadata}, '{}'::jsonb) || ${JSON.stringify(clean)}::jsonb)`;
  }
  if (!Object.keys(set).length) return current;
  let [asset] = await db
    .update(assets)
    .set({ ...set, updatedAt: sql`now()` })
    .where(and(eq(assets.id, id), eq(assets.workspaceId, ws)))
    .returning(columns);
  if (!asset) return null;
  if (hidden) await keepReach(caller, "asset", id);
  if (publishing) await recordAudit(caller, open ? "asset.published" : "asset.unpublished", asset.filename);
  if (moves) {
    // Approving a newer version makes it current; archiving the current one hands over to the newest
    // approved. Unarchiving brings one back without taking over: make it current for that.
    if (asset.stackId) {
      await repoint(asset.stackId, status === "active" && current.status !== "archived" ? { id } : undefined);
      asset = (await findAsset(id))!;
    }
    // A decision about what the library holds is worth a line in the activity; routine edits are not.
    const verb =
      status === "active" && (current.status === "draft" || current.status === "proposed")
        ? "approved"
        : status === "rejected"
          ? "rejected"
          : status === "archived"
            ? "archived"
            : current.status === "archived" && status === "active"
              ? "unarchived"
              : null;
    if (verb) await record(caller, verb, asset, verb === "rejected" && asset.reviewNote ? { note: asset.reviewNote } : undefined);
  }
  return asset;
}

/**
 * Suggest tags without applying them: they wait in `proposedTags` for a human
 * to accept (move into `tags`) or dismiss. Tags the asset already has are
 * dropped, so a suggestion is always something new.
 */
export async function proposeTags(caller: Caller, id: string, suggested: string[]): Promise<Asset | null> {
  const fresh = normalizeTags(suggested);
  const before = await allowed(caller, id, "asset.propose_tags");
  if (!before) return null;
  const actor = caller.actor;
  const [asset] = await db
    .update(assets)
    .set({
      proposedTags: sql`(
        select coalesce(jsonb_agg(distinct t), '[]'::jsonb)
        from jsonb_array_elements_text(${assets.proposedTags} || ${JSON.stringify(fresh)}::jsonb) t
        where not ${assets.tags} ? t
      )`,
      // Whoever first proposed something about it: shown in Review, and in their my_proposals.
      proposedBy: sql`coalesce(${assets.proposedBy}, ${actor})`,
      updatedAt: sql`now()`,
    })
    .where(eq(assets.id, id))
    .returning(columns);
  // Only what is new, so suggesting the same tag twice is one line of activity.
  const added = fresh.filter((t) => !before.tags.includes(t) && !before.proposedTags.includes(t));
  if (asset && added.length) await record(caller, "suggested_tags", asset, { tags: added });
  return asset ?? null;
}

/**
 * Suggest custom field values without applying them: they wait in
 * `proposedFields` for a human to accept (into `fields`) or dismiss. Each is
 * checked against its field now, so what waits can be accepted as it is; a
 * value the asset already has is dropped.
 */
export async function proposeFields(caller: Caller, id: string, suggested: Record<string, unknown>): Promise<Asset | null> {
  const before = await allowed(caller, id, "asset.propose_fields");
  if (!before) return null;
  const values = await validFields(before.workspaceId, suggested, "patch", before.inherited);
  const own = { ...before.inherited, ...before.fields };
  const fresh = Object.fromEntries(
    Object.entries(values).filter(([k, v]) => v !== null && v !== undefined && JSON.stringify(own[k]) !== JSON.stringify(v)),
  );
  if (!Object.keys(fresh).length) return before;
  const [asset] = await db
    .update(assets)
    .set({
      proposedFields: sql`${assets.proposedFields} || ${JSON.stringify(fresh)}::jsonb`,
      proposedBy: sql`coalesce(${assets.proposedBy}, ${caller.actor})`,
      updatedAt: sql`now()`,
    })
    .where(eq(assets.id, id))
    .returning(columns);
  const added = Object.keys(fresh).filter((k) => JSON.stringify(before.proposedFields[k]) !== JSON.stringify(fresh[k]));
  if (asset && added.length) await record(caller, "suggested_fields", asset, { fields: added });
  return asset ?? null;
}

/**
 * What an asset is, for a machine deciding whether and how to use it:
 * `GET /api/v1/assets/{id}/description`, and MCP's describe tool.
 * Whether a particular use is allowed is /api/v1/check's question (lib/core/check.ts).
 */
export function describeAsset(asset: Asset) {
  const base = `${env.APP_URL}/a/${asset.id}`;
  const m = asset.metadata ?? {};
  const renderable = hasPreview(asset);
  return {
    id: asset.id,
    filename: asset.filename,
    mime: asset.mime,
    size: asset.size,
    width: asset.width,
    height: asset.height,
    sha256: asset.sha256,
    status: asset.status,
    state: asset.state,
    /** Its number in its stack of versions; null when it has only the one. */
    version: asset.version,
    /** The version to use: true for its stack's current one, and for an asset with one version. */
    current: !asset.stackId || asset.current,
    proposedBy: asset.proposedBy,
    reviewNote: asset.reviewNote,
    title: m.title ?? null,
    description: m.description ?? null,
    creator: m.creator ?? null,
    copyright: m.copyright ?? null,
    /** Where crops keep, 0 to 1 from the top left; null for the center. */
    focus: m.focus ?? null,
    tags: asset.tags,
    fields: { ...asset.inherited, ...asset.fields },
    collections: asset.collections,
    rights: asset.rights,
    provenance: {
      origin: asset.origin,
      parentAssetId: asset.parentAssetId,
      generator: asset.generator,
      prompt: asset.prompt,
      c2pa: asset.c2pa,
    },
    supersededBy: asset.supersededBy,
    /** Its URLs work for anyone while it may be used; otherwise for people who can see it, and signed. */
    public: asset.public,
    urls: {
      original: base,
      download: `${base}?download`,
      rendition: renderable ? `${base}/{transform}` : null,
    },
    constraints: renderable
      ? {
          w: [1, MAX_DIMENSION] as [number, number],
          h: [1, MAX_DIMENSION] as [number, number],
          // A side snaps up to the next of these, q to a multiple of 5 (lib/transform.ts).
          sizes: [...SIZES],
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
 * So does a file with Content Credentials: its manifest signs these exact
 * bytes, and a byte more would make it read as tampered with.
 */
export async function downloadAsset(asset: Asset): Promise<{ body: Buffer; embedded: boolean }> {
  const bytes = await getObject(originalKey(asset.sha256));
  if (asset.c2pa) return { body: bytes, embedded: false };
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

/**
 * Delete, softly: the asset leaves the library, its links and its stack at
 * once, and can be restored for 30 days. Then lib/core/sweep.ts purges it,
 * and its bytes when nothing else holds them. Deleting it again changes nothing.
 */
export async function deleteAsset(caller: Caller, id: string) {
  const asset = await allowed(caller, id, "asset.delete");
  if (!asset) return false;
  if (asset.deletedAt) return true;
  await db.update(assets).set({ deletedAt: sql`now()`, updatedAt: sql`now()` }).where(eq(assets.id, id));
  // Deleting the current version hands over to the newest approved one left.
  if (asset.stackId) await repoint(asset.stackId);
  await record(caller, "deleted", asset);
  return true;
}

/** Undo a delete, within the 30 days. It comes back as it was, but not as its stack's current version: make it current for that. */
export async function restoreAsset(caller: Caller, id: string): Promise<Asset | null> {
  const asset = await allowed(caller, id, "asset.delete");
  if (!asset?.deletedAt) return asset;
  await db.update(assets).set({ deletedAt: null, updatedAt: sql`now()` }).where(eq(assets.id, id));
  if (asset.stackId) await repoint(asset.stackId);
  const back = (await findAsset(id))!;
  await record(caller, "restored", back);
  return back;
}

const withoutNulls = (v: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null));

async function validFields(
  ws: string,
  values: Record<string, unknown>,
  mode: "upload" | "patch",
  inherited: FieldValues = {},
) {
  const parsed = fieldsValidator(relaxInherited(await listFields(ws), inherited), mode).safeParse(values);
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
