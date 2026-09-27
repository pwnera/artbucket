import { z } from "zod";
import { AssetError } from "@/lib/core/errors";
import {
  describeAsset,
  getAsset,
  ingestFromUrl,
  parseAssetQuery,
  proposeTags,
  searchAssets,
  type Asset,
} from "@/lib/core/assets";
import { listContexts, listRules, type BrandRule } from "@/lib/core/brand";
import { checkUse } from "@/lib/core/check";
import { listBrands } from "@/lib/core/brands";
import { listCollections } from "@/lib/core/collections";
import { listFields } from "@/lib/core/fields";
import { importGoogleFont } from "@/lib/core/fonts";
import type { Caller } from "@/lib/core/access";
import { hasPreview } from "@/lib/preview";
import { env } from "@/lib/env";
import { ASSET_TYPES } from "@/lib/filters";
import { GOOGLE_FAMILY } from "@/lib/font";
import { ORIGINS, RightsInput, Use } from "@/lib/rights";
import { can, needs, type Action } from "@/lib/permissions";
import { FITS, FORMATS, MAX_DIMENSION, parseTransform, serializeTransform } from "@/lib/transform";

/**
 * The MCP adapter: a second front door onto lib/core, beside REST. Stateless
 * Streamable HTTP with plain JSON responses, which is all a tool server needs:
 * no sessions, no SSE, nothing to keep in memory between requests.
 *
 * ponytail: hand-rolled JSON-RPC over the methods tools and resources use.
 * Take the official SDK when prompts, subscriptions or server-initiated
 * messages land.
 */

const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS = `artbucket is a brand's asset library. Search it, describe an asset before using it, and hand out rendition URLs rather than downloading bytes: /a/{id}/w_800,f_webp is a stable, cacheable URL for exactly that size and format. What you ingest or tag is proposed, not final: a person reviews it, and my_proposals tells you what they decided and why. Before making anything on-brand (colors, logo use, type, tone), read the brand rules with brand_rules, for the context you are working in. Before publishing or handing out an asset, ask check_use with where, when and in what context it will run: it refuses replaced logos, expired licenses and the wrong variant, and names what to use instead. When you ingest something a model made, say so (origin, generator, prompt).`;

const base = (id: string) => `${env.APP_URL}/a/${id}`;

/** What a search result needs to be useful to a model, and no more. */
const summary = (a: Asset) => ({
  id: a.id,
  filename: a.filename,
  title: a.metadata?.title ?? null,
  mime: a.mime,
  width: a.width,
  height: a.height,
  tags: a.tags,
  fields: { ...a.inherited, ...a.fields },
  status: a.status,
  supersededBy: a.supersededBy,
  url: base(a.id),
  thumbnail: hasPreview(a) ? `${base(a.id)}/w_480,f_webp` : null,
});

/** Rules as a model reads them: referenced assets come with URLs it can use as is. */
const forAgent = (rules: BrandRule[]) =>
  rules.map(({ key, context, type, value, usage, assets }) => ({
    key,
    context,
    type,
    value,
    usage,
    assets: assets.map(({ id, rendition, title, filename, mime, width, height }) => ({
      id,
      title: title ?? filename,
      mime,
      width,
      height,
      rendition,
      url: rendition ? `${base(id)}/${rendition}` : base(id),
    })),
  }));

const rulesFor = async (ws: string, context?: string, brand?: string) => ({
  brand: brand ?? (await listBrands(ws)).find((b) => b.default)?.slug ?? null,
  context: context ?? null,
  rules: forAgent(await listRules(ws, { brand, context })),
});

/** The default brand's rules live at artbucket://brand/rules, every brand's at artbucket://brands/{slug}/rules. */
const RULES_URI = "artbucket://brand/rules";
const rulesUri = (brand: { slug: string; default: boolean }) =>
  brand.default ? RULES_URI : `artbucket://brands/${brand.slug}/rules`;

const text = z.string().min(1);
const id = z.uuid().describe("Asset id, from search_assets");

type Tool = {
  description: string | ((caller: Caller) => Promise<string>);
  /** What running it takes (lib/permissions.ts), somewhere in the workspace; core checks the asset itself. */
  action: Action;
  input: z.ZodObject;
  readOnly: boolean;
  run: (args: never, caller: Caller) => Promise<Record<string, unknown>>;
};

const tool = <S extends z.ZodObject>(t: {
  description: Tool["description"];
  action: Action;
  input: S;
  readOnly: boolean;
  run: (args: z.infer<S>, caller: Caller) => Promise<Record<string, unknown>>;
}) => t as unknown as Tool;

const found = async (caller: Caller, assetId: string) => {
  const a = await getAsset(caller, assetId);
  if (!a) throw new AssetError("not_found", `No asset ${assetId}`);
  return a;
};

const TOOLS: Record<string, Tool> = {
  search_assets: tool({
    // Built per call: the field schema and collections are the library's own.
    description: async (caller) => {
      const [fields, collections] = await Promise.all([listFields(caller.workspace.id), listCollections(caller)]);
      return [
        "Search the library. Every word of `q` must match (as a prefix) the filename, tags, captions or field values.",
        "No arguments lists the newest assets. Results carry facet counts: tags, types and field values you can narrow by,",
        "and `total`, every match. Next: describe_asset before using one, rendition_url for a size to hand out.",
        fields.length
          ? `Custom fields, for \`filters\`: ${fields.map((f) => `${f.key} (${f.type}${f.options.length ? `: ${f.options.join(", ")}` : ""})`).join("; ")}.`
          : "",
        collections.length
          ? `Collections, for \`collection\` (by name or id): ${collections.map((c) => c.name).join("; ")}.`
          : "",
      ]
        .filter(Boolean)
        .join(" ");
    },
    action: "asset.read",
    readOnly: true,
    input: z.object({
      q: z.string().max(512).optional().describe("Free text"),
      tags: z.array(z.string()).max(20).optional().describe("Only assets carrying every one of these tags"),
      types: z.array(z.enum(ASSET_TYPES)).optional().describe("Only assets of any of these types"),
      collection: z.string().max(120).optional().describe("Only this collection's assets: its name or id"),
      filters: z
        .record(z.string(), z.union([z.string(), z.array(z.string())]))
        .optional()
        .describe('Field filters: {"channel": ["web", "print"], "budget.gte": "10", "expires.lte": "2027-01-31"}'),
      review: z.boolean().optional().describe("Only what waits on a human: proposed assets and suggested tags"),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    run: async ({ q, tags, types, collection, filters, review, limit }, caller) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      for (const t of tags ?? []) params.append("tag", t);
      for (const t of types ?? []) params.append("type", t);
      if (collection) params.set("collection", collection);
      if (review) params.set("review", "true");
      for (const [k, v] of Object.entries(filters ?? {}))
        for (const one of [v].flat()) params.append(`f.${k}`, one);
      params.set("limit", String(limit));
      // The REST query parser, so a filter the API rejects is rejected here too.
      const { data, total, facets } = await searchAssets(caller, await parseAssetQuery(caller, params));
      return { results: data.map(summary), total, facets };
    },
  }),

  describe_asset: tool({
    description:
      "Everything known about one asset: title, credit, tags, field values, the URLs it is served at, " +
      "what renditions it allows, ready-made rendition URLs, and the brand rules that point at it " +
      "(for a logo: how it may and may not be used). Read this before using an asset.",
    action: "asset.read",
    readOnly: true,
    input: z.object({ id }),
    run: async ({ id }, caller) => ({
      ...describeAsset(await found(caller, id)),
      brandRules: (await listRules(caller.workspace.id, { asset: id })).map(({ brand, key, context, type, value, usage }) => ({
        brand,
        key,
        context,
        type,
        value,
        usage,
      })),
    }),
  }),

  rendition_url: tool({
    description:
      "The URL of an asset at a given size and format, to embed or hand over. Building it costs nothing; the " +
      "image is made on first request and cached. Renditions never upscale: asking for more pixels than the " +
      "original has returns the original size.",
    action: "asset.read",
    readOnly: true,
    input: z.object({
      id,
      width: z.number().int().min(1).max(MAX_DIMENSION).optional(),
      height: z.number().int().min(1).max(MAX_DIMENSION).optional(),
      fit: z.enum(FITS).optional().describe("With both width and height: cover crops, contain pads, inside fits (default)"),
      format: z.enum(FORMATS).optional().describe("Defaults to the original's format; webp suits the web"),
      quality: z.number().int().min(1).max(100).optional(),
    }),
    run: async ({ id, width, height, fit, format, quality }, caller) => {
      const a = await found(caller, id);
      if (!hasPreview(a)) throw new AssetError("unsupported", `${a.mime} can't be transformed; use ${base(a.id)}`);
      const spec = serializeTransform({ w: width, h: height, fit, f: format, q: quality });
      if (!spec) return { url: base(a.id), transform: null, note: "No transform asked for: this is the original." };
      if (!parseTransform(spec)) throw new AssetError("invalid", `Not a valid transform: ${spec}`);
      const notes = [
        width && a.width && width > a.width ? `The original is ${a.width}px wide; it will not be upscaled.` : null,
        height && a.height && height > a.height ? `The original is ${a.height}px tall; it will not be upscaled.` : null,
        fit && !(width && height) ? "fit only matters with both width and height." : null,
      ].filter(Boolean);
      return { url: `${base(a.id)}/${spec}`, transform: spec, source: { width: a.width, height: a.height }, notes };
    },
  }),

  check_use: tool({
    description:
      "Ask before you use an asset: may it run here, now, like this? Checks that it was approved, that nothing " +
      "replaced it, its license window, territory and channel, its model release, and, with a context, whether the " +
      "brand has a different variant for that context (a light logo for dark backgrounds). `allowed: false` comes " +
      "with reasons and, in `suggest`, what to use instead. Non-blocking reasons are worth knowing; say the " +
      "territory and channel to settle them.",
    action: "asset.read",
    readOnly: true,
    input: Use.extend({
      id,
      context: z.string().max(64).optional().describe("The brand context, e.g. dark-background, instagram-story"),
      brand: z.string().max(60).optional().describe("A brand's slug; every brand's rules when left out"),
    }),
    run: async ({ id, ...use }, caller) => checkUse(caller, { asset: id, ...use }),
  }),

  ingest_asset: tool({
    description:
      "Add a file to the library from a public http(s) URL. Identical bytes dedupe to the existing asset. " +
      "The new asset is proposed: it shows up for review, not in the library, until a person approves it. " +
      "Required fields may be left out; the person approving fills them in. Check back with my_proposals.",
    action: "asset.upload",
    readOnly: false,
    input: z.object({
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
    }),
    run: async (input, caller) => {
      const { asset, deduped } = await ingestFromUrl(caller, input);
      return { deduped, asset: describeAsset(asset) };
    },
  }),

  import_google_font: tool({
    description:
      "Add a Google Fonts family to the library: one font file per weight and italic it has, served from here after. " +
      "The name matches in any case (ibm plex sans is IBM Plex Sans). Like ingest_asset, the files are proposed " +
      "until a person approves them, and styles already here dedupe. Use it before a brand rule names a Google font.",
    action: "asset.upload",
    readOnly: false,
    input: z.object({
      family: z.string().trim().regex(GOOGLE_FAMILY).describe("As Google Fonts names it, e.g. Playfair Display"),
      tags: z.array(text.max(64)).max(50).optional(),
      collections: z.array(z.uuid()).max(50).optional(),
    }),
    run: async (input, caller) => {
      const { family, assets } = await importGoogleFont(caller, input);
      return { family, assets: assets.map(summary) };
    },
  }),

  brand_rules: tool({
    // Built per call: the brands and their contexts are the library's own.
    description: async (caller) => {
      const brands = await listBrands(caller.workspace.id);
      const contexts = await Promise.all(brands.map(async (b) => [b, await listContexts(caller.workspace.id, b.slug)] as const));
      return [
        "A brand's rules as data: colors (hex), logo use, type, tone, each with a sentence on how to use it",
        "and the assets it points at (the logo it governs, examples; describe_asset tells you more about one).",
        "A font rule's value is the family name, and its assets are the font files to use (url, one per style).",
        "Pass the context you are working in to get one rule per key: that context's own where it has one, the default otherwise.",
        "No context returns every rule and its variants. No brand means the default brand.",
        brands.length > 1
          ? `Brands: ${contexts
              .map(([b, cs]) => `${b.slug} (${b.name}${b.default ? ", the default" : ""}${cs.length ? `; contexts: ${cs.join(", ")}` : ""})`)
              .join("; ")}.`
          : contexts[0]?.[1].length
            ? `Contexts: ${contexts[0][1].join(", ")}.`
            : "",
      ]
        .filter(Boolean)
        .join(" ");
    },
    action: "brand.read",
    readOnly: true,
    input: z.object({
      brand: z.string().max(60).optional().describe("A brand's slug; the default brand when left out"),
      context: z.string().max(64).optional().describe("e.g. dark-background, instagram-story"),
    }),
    run: async ({ brand, context }, caller) => rulesFor(caller.workspace.id, context, brand),
  }),

  my_proposals: tool({
    description:
      "What you proposed and what became of it: `proposed` still waits for a person, `active` was " +
      "approved, `rejected` was turned down, with the person's reason in `reviewNote`. Read the reasons before " +
      "proposing more of the same.",
    action: "asset.upload",
    readOnly: true,
    input: z.object({
      status: z.enum(["proposed", "active", "rejected"]).optional().describe("Only these; all of them when left out"),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    run: async ({ status, limit }, caller) => {
      // ponytail: filters the newest 200 in memory; a status filter in core when an agent proposes more.
      const { data } = await searchAssets(caller, { proposedBy: caller.actor, limit: 200 });
      const mine = data.filter((a) => !status || a.status === status).slice(0, limit);
      return {
        proposals: mine.map((a) => ({ ...summary(a), reviewNote: a.reviewNote, proposedTags: a.proposedTags })),
      };
    },
  }),

  propose_tags: tool({
    description:
      "Suggest tags for an asset. They are not applied: a person accepts or dismisses each one. " +
      "Tags the asset already has are ignored.",
    action: "asset.propose_tags",
    readOnly: false,
    input: z.object({ id, tags: z.array(text.max(64)).min(1).max(50) }),
    run: async ({ id, tags }, caller) => {
      const a = await proposeTags(caller, id, tags);
      if (!a) throw new AssetError("not_found", `No asset ${id}`);
      return { id: a.id, tags: a.tags, proposedTags: a.proposedTags };
    },
  }),
};

// ---- JSON-RPC ---------------------------------------------------------------

type Id = string | number | null;
const Message = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

const result = (id: Id, r: unknown) => ({ jsonrpc: "2.0", id, result: r });
const error = (id: Id, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

const toolResult = (data: Record<string, unknown>, isError = false) => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  ...(isError ? { isError } : { structuredContent: data }),
});

/** One JSON-RPC message in; the response body, or null for a notification. */
export async function handleMcp(raw: unknown, caller: Caller): Promise<object | null> {
  const parsed = Message.safeParse(raw);
  if (!parsed.success) return error(null, -32600, "Invalid request");
  const { id, method, params = {} } = parsed.data;
  if (id === undefined) return null; // notifications/initialized and friends: nothing to say

  switch (method) {
    case "initialize": {
      const asked = String(params.protocolVersion ?? "");
      return result(id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "artbucket", version: "0.7.5" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return result(id, {});
    case "tools/list":
      return result(id, {
        tools: await Promise.all(
          Object.entries(TOOLS)
            // Only what this caller may run: a read-only key sees read-only tools.
            .filter(([, t]) => can(caller, t.action))
            .map(async ([name, t]) => {
              const inputSchema = z.toJSONSchema(t.input, { io: "input" });
              delete inputSchema.$schema;
              return {
                name,
                description: typeof t.description === "string" ? t.description : await t.description(caller),
                inputSchema,
                annotations: { readOnlyHint: t.readOnly, destructiveHint: false, openWorldHint: name === "ingest_asset" || name === "import_google_font" },
              };
            }),
        ),
      });
    // Brand rules as resources, for clients that attach context by hand.
    case "resources/list": {
      const resources = [];
      for (const b of await listBrands(caller.workspace.id)) {
        const uri = rulesUri(b);
        const all = { uri, name: `brand-rules-${b.slug}`, title: `${b.name}: brand rules`, mimeType: "application/json" };
        resources.push({ ...all, description: `Every rule of ${b.name}${b.default ? ", the default brand" : ""}` });
        for (const c of await listContexts(caller.workspace.id, b.slug)) {
          resources.push({ ...all, uri: `${uri}/${c}`, name: `${all.name}-${c}`, title: `${b.name}: ${c}`, description: `One rule per key, for ${c}` });
        }
      }
      return result(id, { resources });
    }
    case "resources/templates/list":
      return result(id, {
        resourceTemplates: [
          {
            uriTemplate: `${RULES_URI}/{context}`,
            name: "brand-rules-context",
            title: "Default brand's rules for a context",
            description: "One rule per key: the context's own where it has one, the default otherwise",
            mimeType: "application/json",
          },
          {
            uriTemplate: "artbucket://brands/{brand}/rules/{context}",
            name: "brand-rules-brand-context",
            title: "A brand's rules for a context",
            description: "One rule per key, for one brand and context",
            mimeType: "application/json",
          },
        ],
      });
    case "resources/read": {
      const uri = String(params.uri ?? "");
      const m = uri.match(/^artbucket:\/\/(?:brand|brands\/([^/?#]+))\/rules(?:\/([^/?#]+))?$/);
      if (!m) return error(id, -32002, `Resource not found: ${uri}`);
      try {
        const data = await rulesFor(caller.workspace.id, m[2] && decodeURIComponent(m[2]), m[1] && decodeURIComponent(m[1]));
        return result(id, { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }] });
      } catch (err) {
        if (err instanceof AssetError) return error(id, -32602, err.message);
        throw err;
      }
    }
    case "tools/call": {
      const t = TOOLS[String(params.name)];
      if (!t) return error(id, -32602, `Unknown tool: ${String(params.name)}`);
      if (!can(caller, t.action)) {
        return result(id, toolResult({ error: `This key's scope is ${caller.scope ?? "none"}; ${params.name} needs ${needs(t.action)}` }, true));
      }
      const args = t.input.safeParse(params.arguments ?? {});
      if (!args.success) return result(id, toolResult({ error: z.prettifyError(args.error) }, true));
      try {
        return result(id, toolResult(await t.run(args.data as never, caller)));
      } catch (err) {
        // Expected failures go back to the model as tool errors it can act on.
        if (err instanceof AssetError) return result(id, toolResult({ error: err.message, code: err.code }, true));
        console.error(err);
        return error(id, -32603, "Internal error");
      }
    }
    default:
      return error(id, -32601, `Method not found: ${method}`);
  }
}
