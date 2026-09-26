import { z } from "zod";
import { COLLECTION_ICONS } from "./collection-icons.ts";
import { FieldDefInput, FieldDefPatch, FIELD_TYPES } from "./fields.ts";
import { SCOPES } from "./scopes.ts";
import { MAX_TAG_LENGTH, MAX_TAGS } from "./search.ts";
import { FITS, FORMATS } from "./transform.ts";

/**
 * Every shape /api/v1 accepts or returns. Route handlers validate with these,
 * and lib/openapi.ts documents with the same objects, so the spec cannot say
 * one thing while the code does another.
 *
 * Relative imports: `pnpm test` runs this under plain Node, which has no `@/`.
 */

export { FieldDefInput, FieldDefPatch };

export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;
const uuid = z.uuid();
const values = z.record(z.string(), z.unknown()).describe("Custom field values, keyed by field key");
const tags = z.array(z.string().max(MAX_TAG_LENGTH)).max(MAX_TAGS);

// ---- requests ---------------------------------------------------------------

export const CreateUpload = z.object({
  filename: z.string().min(1).max(512),
  mime: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

const promote = {
  /** Custom field values; validated against the schema, required ones enforced. */
  fields: values.optional(),
  /** Collections to file it into; their values count toward required fields. */
  collections: z.array(uuid).max(50).optional(),
  tags: tags.optional(),
};

export const Finalize = z.union([
  z.strictObject({
    token: uuid.describe("From POST /api/v1/uploads, after the PUT"),
    filename: z.string().min(1).max(512),
    mime: z.string().min(1).max(255),
    ...promote,
  }),
  z.strictObject({
    url: z.url({ protocol: /^https?$/ }).max(2048).describe("Public http(s) URL the server fetches"),
    filename: z.string().min(1).max(512).optional().describe("Defaults to the URL's last path segment"),
    ...promote,
  }),
]);

const text = z.string().max(2000).nullable().optional();
export const AssetPatch = z.strictObject({
  tags: tags.optional().describe("Replaces the whole set"),
  fields: values.optional().describe("Merges; null clears one unless it is required"),
  title: text,
  description: text,
  creator: text,
  copyright: text,
  status: z.enum(["active", "proposed"]).optional().describe('"active" promotes a proposed asset'),
  proposedTags: tags.optional().describe("Replaces the pending suggestions; [] dismisses them all"),
});

export const ProposeTags = z.strictObject({
  tags: z.array(z.string().min(1).max(MAX_TAG_LENGTH)).min(1).max(50),
});

const icon = z.enum(COLLECTION_ICONS).nullable().optional();
export const CollectionCreate = z.strictObject({
  name: z.string().trim().min(1).max(120),
  icon,
  fields: values.optional().describe("Values its members inherit"),
});
export const CollectionPatch = z.strictObject({
  name: z.string().trim().min(1).max(120).optional(),
  icon,
  fields: values.optional().describe("Merges; null clears; members re-inherit"),
});
export const MembersChange = z.strictObject({
  add: z.array(uuid).max(1000).optional(),
  remove: z.array(uuid).max(1000).optional(),
});

export const SaveSearch = z.strictObject({
  name: z.string().trim().min(1).max(120),
  query: z.string().max(4000).describe('An /api/v1/assets query string, e.g. "q=fox&f.channel=web"'),
});

export const CreateKey = z.strictObject({
  name: z.string().trim().min(1).max(120),
  scope: z.enum(SCOPES),
});

// ---- responses --------------------------------------------------------------

const date = z.iso.datetime({ offset: true });
const fieldValues = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));

export const Asset = z.object({
  id: uuid,
  sha256: z.string(),
  filename: z.string(),
  mime: z.string(),
  size: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  probe: z.record(z.string(), z.unknown()).nullable(),
  metadata: z
    .object({
      title: z.string(),
      description: z.string(),
      keywords: z.array(z.string()),
      creator: z.string(),
      copyright: z.string(),
      capturedAt: z.string(),
      camera: z.string(),
      lens: z.string(),
      gps: z.object({ lat: z.number(), lon: z.number() }),
    })
    .partial()
    .nullable(),
  tags: z.array(z.string()),
  fields: fieldValues.describe("The asset's own values"),
  inherited: fieldValues.describe("Values inherited from its collections; own values win"),
  status: z.enum(["active", "proposed"]),
  proposedTags: z.array(z.string()),
  collections: z.array(uuid),
  createdAt: date,
  updatedAt: date,
});

const Count = z.object({ value: z.string(), count: z.number().int() });
export const Listing = z.object({
  data: z.array(Asset),
  facets: z.object({ tags: z.array(Count), fields: z.record(z.string(), z.array(Count)) }),
});

export const UploadTicket = z.object({
  token: uuid,
  uploadUrl: z.url().describe("PUT the bytes here, with the same Content-Type"),
  expiresIn: z.number().int(),
});

export const Collection = z.object({
  id: uuid,
  name: z.string(),
  icon: z.string().nullable(),
  fields: fieldValues,
  count: z.number().int(),
  createdAt: date,
});

export const FieldDef = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(FIELD_TYPES),
  options: z.array(z.string()),
  required: z.boolean(),
});

export const SavedSearch = z.object({ id: uuid, name: z.string(), query: z.string(), createdAt: date });

export const ApiKey = z.object({
  id: uuid,
  name: z.string(),
  prefix: z.string(),
  scope: z.enum(SCOPES),
  createdAt: date,
});
export const ApiKeyCreated = ApiKey.extend({
  secret: z.string().describe("Shown once. Send as `Authorization: Bearer <secret>`"),
});

/** What `GET /a/{id}` with `Accept: application/json` returns. */
export const Description = z.object({
  id: uuid,
  filename: z.string(),
  mime: z.string(),
  size: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  sha256: z.string(),
  status: z.enum(["active", "proposed"]),
  title: z.string().nullable(),
  description: z.string().nullable(),
  creator: z.string().nullable(),
  copyright: z.string().nullable(),
  tags: z.array(z.string()),
  fields: fieldValues.describe("Effective values: own over inherited"),
  collections: z.array(uuid),
  rights: z.null().describe("License, territory, channel, expiry. Arrives in v0.6; null until then"),
  urls: z.object({
    original: z.url(),
    download: z.url().describe("The original with current metadata written in"),
    rendition: z.string().nullable().describe("Template: replace {transform}, e.g. w_800,f_webp"),
  }),
  constraints: z
    .object({
      w: z.tuple([z.number(), z.number()]),
      h: z.tuple([z.number(), z.number()]),
      q: z.tuple([z.number(), z.number()]),
      fit: z.array(z.enum(FITS)),
      f: z.array(z.enum(FORMATS)),
      enlarges: z.literal(false),
    })
    .nullable()
    .describe("What a rendition of this asset may ask for; null when it can't be transformed"),
  alternatives: z.array(z.object({ name: z.string(), url: z.url() })).describe("Ready-made renditions"),
});

export const Deleted = z.object({ data: z.object({ deleted: z.literal(true) }) });

export const ErrorBody = z.object({
  error: z.object({ code: z.string(), message: z.string(), detail: z.unknown().optional() }),
});

