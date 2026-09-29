import { z } from "zod";
import { ThemePatch } from "./brand-theme.ts";
import { ASSET_TYPES } from "./filters.ts";
import { GOOGLE_FAMILY } from "./font.ts";
import { STATES, STATUSES } from "./lifecycle.ts";
import { PageInput, PageOp, pageSlug } from "./pages.ts";
import { PORTAL_ACCESS } from "./portal.ts";
import { ORIGINS, RightsInput, Use } from "./rights.ts";
import { ruleContext, RuleInput, ruleKey } from "./rules.ts";
import {
  BrandCreate,
  BrandPatch,
  CollectionCreate,
  CollectionPatch,
  CommentCreate,
  CommentPatch,
  GeneratePagesInput,
  IconBrowseQuery,
  IconImport,
  IconSetQuery,
  MembersChange,
  PortalDecision,
  PortalInput,
  PortalPatch,
  VersionPatch,
} from "./schemas.ts";
import { FIELD_KEY, FieldDefInput, FieldDefPatch } from "./fields.ts";
import { FITS, FORMATS, MAX_DIMENSION } from "./transform.ts";

/**
 * What each MCP tool takes: its signature, which v1 freezes (contract/mcp-v1.json,
 * lib/contract.test.ts). lib/mcp.ts is what they do.
 *
 * Relative imports only: `pnpm test` runs this under plain Node.
 */

const text = z.string().min(1);
const id = z.uuid().describe("Asset id, from search_assets");
const brand = z.string().max(60).optional().describe("A brand's slug; the default brand when left out");
const page = pageSlug.describe("Its slug, e.g. logo (list_pages)");
const which = z.string().min(1).max(60).describe("The brand's slug, as brand_status names it");
const version = z.number().int().min(1).describe("The version's number, from list_versions");
const portal = z.string().min(1).max(64).describe("Its address (slug), as list_portals names it");
const fieldKey = z.string().regex(FIELD_KEY).describe("The field's key, as list_fields names it");
const comment = z.uuid().describe("The comment's id, from list_comments");
const collection = z.string().min(1).max(120).describe("Its id, or its name in any case, as list_collections names it");

export const TOOL_INPUTS = {
  search_assets: z.object({
    q: z.string().max(512).optional().describe("Free text"),
    tags: z.array(z.string()).max(20).optional().describe("Only assets carrying every one of these tags"),
    types: z.array(z.enum(ASSET_TYPES)).optional().describe("Only assets of any of these types"),
    collection: z.string().max(120).optional().describe("Only this collection's assets: its name or id"),
    filters: z
      .record(z.string(), z.union([z.string(), z.array(z.string())]))
      .optional()
      .describe('Field filters: {"channel": ["web", "print"], "budget.gte": "10", "expires.lte": "2027-01-31"}'),
    status: z
      .array(z.enum(STATES))
      .optional()
      .describe("Only assets in these states; approved (active) and unexpired ones when left out, which is what may be used"),
    review: z.boolean().optional().describe("Only what waits on a human: proposed assets and suggested tags"),
    limit: z.number().int().min(1).max(50).default(20),
  }),

  describe_asset: z.object({ id }),

  rendition_url: z.object({
    id,
    width: z.number().int().min(1).max(MAX_DIMENSION).optional(),
    height: z.number().int().min(1).max(MAX_DIMENSION).optional(),
    fit: z.enum(FITS).optional().describe("With both width and height: cover crops, contain pads, inside fits (default)"),
    format: z.enum(FORMATS).optional().describe("Defaults to the original's format; webp suits the web"),
    quality: z.number().int().min(1).max(100).optional(),
    expiresIn: z
      .number()
      .int()
      .min(60)
      .max(365 * 86400)
      .optional()
      .describe("For someone without access to the library: a signed URL that works this many seconds. Takes share on it"),
  }),

  check_use: Use.extend({
    id,
    context: z.string().max(64).optional().describe("The brand context, e.g. dark-background, instagram-story"),
    brand: z.string().max(60).optional().describe("A brand's slug; every brand's rules when left out"),
  }),

  ingest_asset: z.object({
    url: z.url({ protocol: /^https?$/ }).max(2048),
    filename: z.string().min(1).max(512).optional().describe("Defaults to the URL's last path segment"),
    tags: z.array(text.max(64)).max(50).optional(),
    fields: z.record(z.string(), z.unknown()).optional().describe("Custom field values; required fields must be set"),
    collections: z.array(z.uuid()).max(50).optional(),
    origin: z.enum(ORIGINS).optional().describe("generated for anything a model made; read from Content Credentials when left out"),
    generator: z.string().max(200).optional().describe('The model or tool that made it, e.g. "gpt-image 2.0"'),
    prompt: z.string().max(10000).optional().describe("For a generated image: what it was asked for"),
    parentAssetId: z.uuid().optional().describe("The library asset it was made from, e.g. the photo you edited"),
    rights: RightsInput.optional().describe("License, territories, channels, embargo, expires, modelRelease, if known"),
    versionOf: z
      .uuid()
      .optional()
      .describe("It is a new version of this asset: it joins its stack, collections, tags and fields, and replaces it once approved"),
  }),

  import_google_font: z.object({
    family: z.string().trim().regex(GOOGLE_FAMILY).describe("As Google Fonts names it, e.g. Playfair Display"),
    tags: z.array(text.max(64)).max(50).optional(),
    collections: z.array(z.uuid()).max(50).optional(),
  }),

  find_icons: z.object({
    q: z.string().max(80).optional().describe("Words in a set's name, author or license; with prefix, in an icon's name"),
    prefix: IconBrowseQuery.shape.prefix.optional().describe("A set, e.g. tabler: search its icons instead of the sets"),
    group: IconSetQuery.shape.group,
    category: IconBrowseQuery.shape.category.describe("With prefix: one of the set's categories"),
    offset: z.number().int().min(0).max(100000).default(0),
    limit: z.number().int().min(1).max(200).optional().describe("20 sets or 100 icons when left out"),
  }),

  import_icons: z.object({
    prefix: IconImport.shape.prefix,
    icons: IconImport.shape.icons,
    tags: z.array(text.max(64)).max(50).optional(),
    collections: z.array(z.uuid()).max(50).optional(),
  }),

  brand_rules: z.object({
    brand: z.string().max(60).optional().describe("A brand's slug; the default brand when left out"),
    context: z.string().max(64).optional().describe("e.g. dark-background, instagram-story"),
  }),

  my_proposals: z.object({
    status: z.enum(STATUSES).optional().describe("Only these; all of them when left out"),
    limit: z.number().int().min(1).max(50).default(20),
  }),

  propose_tags: z.object({ id, tags: z.array(text.max(64)).min(1).max(50) }),

  review_asset: z.strictObject({
    id,
    decision: z
      .enum(["approve", "reject"])
      .optional()
      .describe("approve puts a proposed asset in the library; reject turns it down and keeps it, with `note` saying why"),
    note: z.string().trim().min(1).max(2000).optional().describe("Why, read back by whoever proposed it in my_proposals; asked for with reject"),
    fields: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Field values to set, merged; null clears one. Required fields must be set before approve"),
    acceptTags: z.array(text.max(64)).max(50).optional().describe("Suggested tags to apply"),
    dismissTags: z.array(text.max(64)).max(50).optional().describe("Suggested tags to drop"),
    acceptFields: z.array(z.string().regex(FIELD_KEY)).max(50).optional().describe("Keys of suggested field values to apply"),
    dismissFields: z.array(z.string().regex(FIELD_KEY)).max(50).optional().describe("Keys of suggested field values to drop"),
  }),

  list_fields: z.object({}),

  // POST /fields's and PATCH /fields/{key}'s own fields; strict, as there.
  create_field: FieldDefInput,

  update_field: FieldDefPatch.safeExtend({ key: fieldKey }),

  delete_field: z.object({ key: fieldKey }),

  list_collections: z.object({}),

  // POST /collections's and PATCH /collections/{id}'s own fields; strict, as there.
  create_collection: CollectionCreate,

  update_collection: CollectionPatch.extend({ collection }),

  // POST /collections/{id}/assets's own fields; strict, as there.
  update_collection_assets: MembersChange.extend({
    collection,
    add: MembersChange.shape.add.describe("Asset ids to put in it, from search_assets"),
    remove: MembersChange.shape.remove.describe("Asset ids to take out; the assets stay in the library"),
  }),

  delete_collection: z.object({ collection }),

  brand_status: z.object({ brand }),

  // POST /brands's and PATCH /brands/{slug}'s own fields, so both doors take the same thing; strict, as there.
  create_brand: BrandCreate,

  update_brand: BrandPatch.extend({ brand: which }),

  delete_brand: z.object({ brand: which }),

  list_templates: z.object({}),

  brand_playbook: z.object({}),

  preview_page: z.object({
    brand,
    page,
    width: z.enum(["desktop", "phone"]).optional().describe("desktop (1280px) when left out"),
    context: z.string().max(64).optional().describe("Draw it in this context, e.g. dark-background"),
  }),

  list_pages: z.object({ brand }),

  get_page: z.object({
    brand,
    page,
    context: z.string().max(64).optional().describe("Resolve its rules for this context, e.g. dark-background"),
  }),

  set_rules: z.object({
    brand,
    set: z
      .array(RuleInput)
      .max(100)
      .optional()
      .describe("Rules to make, or change where the key and context exist: { key, type, value, label?, usage?, spec?, context?, assets? }"),
    remove: z
      .array(z.object({ key: ruleKey, context: ruleContext.nullable().optional().describe("Only this context's version; the key and every version when left out") }))
      .max(100)
      .optional(),
  }),

  save_page: PageInput.extend({ brand, page }),

  edit_page: z.object({ brand, page, ops: z.array(PageOp).min(1).max(50).describe("Applied in order; all or none") }),

  delete_page: z.object({ brand, page }),

  generate_pages: z.object({ brand, set: GeneratePagesInput.shape.set }),

  get_theme: z.object({ brand }),

  // Strict: a misspelled setting is refused, not dropped.
  set_theme: z.strictObject({ brand, ...ThemePatch.shape }),

  list_versions: z.object({ brand }),

  get_version: z.object({
    brand,
    number: version,
    against: z
      .union([z.number().int().min(1), z.literal("current")])
      .optional()
      .describe("Diff against this version, or current for this one to now; the version before when left out"),
  }),

  name_version: VersionPatch.extend({ brand, number: version }),

  restore_version: z.object({ brand, number: version }),

  list_comments: z.object({ brand, page: pageSlug.optional().describe("That page's only; an old slug finds it too") }),

  add_comment: CommentCreate.safeExtend({ brand }),

  update_comment: CommentPatch.safeExtend({ brand, id: comment }),

  delete_comment: z.object({ brand, id: comment }),

  publish: z.object({
    brand,
    note: z.string().trim().max(2000).optional().describe("What changed, for the history and What's new"),
    image: z.uuid().optional().describe("An asset shown beside the note, from search_assets"),
  }),

  list_portals: z.object({}),

  // PATCH /portals/{id}'s own fields, so both doors take the same thing; strict, as there.
  update_portal: PortalPatch.extend({ portal }),

  // POST /portals's own fields; strict, as there. Access is asked for, never assumed public.
  create_portal: PortalInput.extend({
    slug: PortalInput.shape.slug.optional().describe("Its address, /p/{slug}; made from the name when left out"),
    access: z
      .enum(PORTAL_ACCESS)
      .describe("members: people with access to the workspace; password: whoever has `password`; public: anyone with the address"),
  }),

  close_portal: z.object({ portal }),

  delete_portal: z.object({ portal }),

  list_portal_requests: z.object({ portal }),

  decide_portal_request: PortalDecision.extend({ portal, request: z.uuid().describe("The request's id, from list_portal_requests") }),

  propose_fields: z.object({
    id,
    fields: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
      .describe("Custom field values by key, as list_fields names them: each is checked against its field"),
  }),
};

export type ToolName = keyof typeof TOOL_INPUTS;

/**
 * The tools as JSON Schema, the way tools/list sends them. A uuid's or a
 * date-time's `format` says it all: zod's 190- and 400-character patterns
 * beside them would be most of a page tool's schema (the size guard in
 * mcp-tools.test.ts).
 */
export function toolSchemas() {
  return Object.fromEntries(
    Object.entries(TOOL_INPUTS).map(([name, input]) => {
      const s = z.toJSONSchema(input, {
        io: "input",
        override: ({ jsonSchema: j }) => {
          if (j.format === "uuid" || j.format === "date-time") delete j.pattern;
        },
      });
      delete s.$schema;
      return [name, s];
    }),
  );
}
