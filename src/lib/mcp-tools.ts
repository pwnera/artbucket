import { z } from "zod";
import { ASSET_TYPES } from "./filters.ts";
import { GOOGLE_FAMILY } from "./font.ts";
import { STATES, STATUSES } from "./lifecycle.ts";
import { ORIGINS, RightsInput, Use } from "./rights.ts";
import { FITS, FORMATS, MAX_DIMENSION } from "./transform.ts";

/**
 * What each MCP tool takes: its signature, which v1 freezes (contract/mcp-v1.json,
 * lib/contract.test.ts). lib/mcp.ts is what they do.
 *
 * Relative imports only: `pnpm test` runs this under plain Node.
 */

const text = z.string().min(1);
const id = z.uuid().describe("Asset id, from search_assets");

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

  brand_rules: z.object({
    brand: z.string().max(60).optional().describe("A brand's slug; the default brand when left out"),
    context: z.string().max(64).optional().describe("e.g. dark-background, instagram-story"),
  }),

  my_proposals: z.object({
    status: z.enum(STATUSES).optional().describe("Only these; all of them when left out"),
    limit: z.number().int().min(1).max(50).default(20),
  }),

  propose_tags: z.object({ id, tags: z.array(text.max(64)).min(1).max(50) }),

  list_fields: z.object({}),

  propose_fields: z.object({
    id,
    fields: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
      .describe("Custom field values by key, as list_fields names them: each is checked against its field"),
  }),
};

export type ToolName = keyof typeof TOOL_INPUTS;

/** The tools as JSON Schema, the way tools/list sends them. */
export function toolSchemas() {
  return Object.fromEntries(
    Object.entries(TOOL_INPUTS).map(([name, input]) => {
      const s = z.toJSONSchema(input, { io: "input" });
      delete s.$schema;
      return [name, s];
    }),
  );
}
