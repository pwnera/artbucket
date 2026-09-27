import { z } from "zod";
import { COLLECTION_ICONS } from "./collection-icons.ts";
import { FieldDefInput, FieldDefPatch, FIELD_TYPES } from "./fields.ts";
import { FONT_CATEGORIES, GOOGLE_FAMILY } from "./font.ts";
import { FONT_VALUE, RULE_CONTEXT, RULE_TYPES, RuleInput, RuleOrder, RulePatch } from "./rules.ts";
import { SCOPES } from "./scopes.ts";
import { TOKEN_FORMAT_IDS } from "./tokens.ts";
import { MAX_TAG_LENGTH, MAX_TAGS } from "./search.ts";
import { FITS, FORMATS } from "./transform.ts";

/**
 * Every shape /api/v1 accepts or returns. Route handlers validate with these,
 * and lib/openapi.ts documents with the same objects, so the spec cannot say
 * one thing while the code does another.
 *
 * Relative imports: `pnpm test` runs this under plain Node, which has no `@/`.
 */

export { FieldDefInput, FieldDefPatch, RuleInput, RuleOrder, RulePatch };

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

export const GoogleFontImport = z.strictObject({
  family: z.string().trim().regex(GOOGLE_FAMILY, "A Google Fonts family, e.g. Playfair Display").describe("As Google Fonts names it"),
  ...promote,
});

export const TokenQuery = z.object({
  format: z.enum(TOKEN_FORMAT_IDS).default("css").describe("css, scss, less, tailwind, tailwind3, ts, shadcn, mui, chakra or json (W3C design tokens)"),
  context: z.string().regex(RULE_CONTEXT).optional().describe("Resolve for this context; otherwise the defaults"),
});

export const GoogleFontQuery = z.object({
  q: z.string().max(80).optional().describe("Part of the family name, any case"),
  category: z.enum(FONT_CATEGORIES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

const text = z.string().max(2000).nullable().optional();
export const AssetPatch = z.strictObject({
  tags: tags.optional().describe("Replaces the whole set"),
  fields: values.optional().describe("Merges; null clears one unless it is required"),
  title: text,
  description: text,
  creator: text,
  copyright: text,
  status: z
    .enum(["active", "proposed", "rejected"])
    .optional()
    .describe('"active" approves a proposed asset; "rejected" turns it down and keeps it, with `reviewNote`'),
  reviewNote: z.string().max(2000).nullable().optional().describe("Why it was rejected, for whoever proposed it"),
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

const brandSlug = z.string().max(60).regex(RULE_CONTEXT, "Use a slug, e.g. acme-studio");
export const BrandCreate = z.strictObject({
  name: z.string().trim().min(1).max(80),
  slug: brandSlug.optional().describe("Defaults to the name, as a slug"),
  from: brandSlug.optional().describe("Start as a copy of this brand's rules"),
});
export const BrandPatch = z.strictObject({
  name: z.string().trim().min(1).max(80).optional(),
  slug: brandSlug.optional(),
  default: z.literal(true).optional().describe("Make this the default brand"),
});
export const VersionPatch = z.strictObject({
  name: z.string().trim().min(1).max(120).nullable().describe("Keep this version as a named checkpoint; null clears it"),
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
  status: z.enum(["active", "proposed", "rejected"]),
  proposedBy: z.string().nullable().describe('For a proposal: the API key\'s name, or "web"'),
  reviewNote: z.string().nullable().describe("Why a person rejected it"),
  proposedTags: z.array(z.string()),
  collections: z.array(uuid),
  createdAt: date,
  updatedAt: date,
});

const Count = z.object({ value: z.string(), count: z.number().int() });
export const Listing = z.object({
  data: z.array(Asset),
  total: z.number().int().describe("Every match; page through with offset and limit"),
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

export const BrandRule = z.object({
  id: uuid,
  brand: z.string().describe("The brand's slug"),
  key: z.string().describe("Dotted, e.g. color.primary"),
  context: z.string().nullable().describe("null: the default"),
  type: z.enum(RULE_TYPES),
  value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()])), FONT_VALUE]),
  usage: z.string().nullable(),
  assets: z
    .array(
      z.object({
        id: uuid,
        rendition: z.string().nullable(),
        title: z.string().nullable(),
        filename: z.string(),
        mime: z.string(),
        width: z.number().int().nullable(),
        height: z.number().int().nullable(),
      }),
    )
    .describe("Assets it points at, in order: /a/{id}, or /a/{id}/{rendition} when it names one"),
  updatedAt: date,
});
export const BrandRules = z.object({
  data: z.array(BrandRule),
  contexts: z.array(z.string()).describe("Every context some rule is scoped to"),
});

export const Brand = z.object({
  slug: z.string(),
  name: z.string(),
  default: z.boolean(),
  rules: z.number().int(),
  createdAt: date,
});

const snapRule = z.object({
  key: z.string(),
  context: z.string().nullable(),
  type: z.enum(RULE_TYPES),
  value: z.unknown(),
  usage: z.string().nullable(),
  position: z.number().int(),
  assets: z.array(z.object({ id: uuid, rendition: z.string().nullable() })),
});
export const VersionMeta = z.object({
  number: z.number().int(),
  kind: z.enum(["baseline", "edit", "restore"]),
  name: z.string().nullable(),
  actor: z.string().describe('An API key\'s name, or "web"'),
  changed: z.array(z.string()).describe("Keys touched"),
  restoredFrom: z.number().int().nullable().describe("For a restore: the version it put back"),
  summary: z.string(),
  rules: z.number().int(),
  createdAt: date,
  updatedAt: date.describe("Edits close together extend a version; this is its last"),
});
export const Version = VersionMeta.extend({
  rules: z.array(snapRule),
  against: z.union([z.number().int(), z.literal("current")]).nullable(),
  diff: z.array(z.record(z.string(), z.unknown())).describe("added, removed, changed (field by field) or moved, per rule"),
});
export const Restored = z.object({
  restored: z.number().int(),
  version: z.number().int().describe("The new version the restore made"),
  droppedAssets: z.number().int().describe("Asset references left out because the asset has since been deleted"),
});

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
  status: z.enum(["active", "proposed", "rejected"]),
  proposedBy: z.string().nullable(),
  reviewNote: z.string().nullable(),
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

export const ActivityItem = z.object({
  id: uuid,
  at: date,
  actor: z.string().describe('An API key\'s name, or "web" for the app'),
  verb: z.enum(["added", "suggested", "approved", "rejected", "deleted", "suggested_tags", "edited_rules", "restored_rules"]),
  label: z.string().describe("The asset's title or filename then, or the brand's name"),
  assetId: uuid.nullable(),
  brand: z.object({ slug: z.string(), name: z.string(), version: z.number().int() }).nullable(),
  detail: z
    .object({ tags: z.array(z.string()), note: z.string(), rules: z.array(z.string()), summary: z.string() })
    .partial()
    .nullable(),
});
export const Activity = z.object({
  data: z.array(ActivityItem),
  next: date.nullable().describe("Pass as `before` for the next page; null at the end"),
});

export const Deleted = z.object({ data: z.object({ deleted: z.literal(true) }) });

export const ErrorBody = z.object({
  error: z.object({ code: z.string(), message: z.string(), detail: z.unknown().optional() }),
});


export const GoogleFamilies = z.object({
  data: z.array(
    z.object({
      family: z.string(),
      category: z.string(),
      styles: z.array(z.string()).describe('"400", "700i": weight, and i for italic'),
    }),
  ),
  total: z.number().int().describe("Matches before `limit`"),
});
