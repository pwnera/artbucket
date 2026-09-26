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
import { listCollections } from "@/lib/core/collections";
import { listFields } from "@/lib/core/fields";
import type { Caller } from "@/lib/core/keys";
import { isRenderable } from "@/lib/core/renditions";
import { env } from "@/lib/env";
import { allows, type Scope } from "@/lib/scopes";
import { FITS, FORMATS, MAX_DIMENSION, parseTransform, serializeTransform } from "@/lib/transform";

/**
 * The MCP adapter: a second front door onto lib/core, beside REST. Stateless
 * Streamable HTTP with plain JSON responses, which is all a tool server needs:
 * no sessions, no SSE, nothing to keep in memory between requests.
 *
 * ponytail: hand-rolled JSON-RPC over the four methods tools use. Take the
 * official SDK when resources (v0.5), prompts or server-initiated messages land.
 */

const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS = `artbucket is a brand's asset library. Search it, describe an asset before using it, and hand out rendition URLs rather than downloading bytes: /a/{id}/w_800,f_webp is a stable, cacheable URL for exactly that size and format. What you ingest or tag is proposed, not final: a person reviews it.`;

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
  url: base(a.id),
  thumbnail: isRenderable(a.mime) ? `${base(a.id)}/w_480,f_webp` : null,
});

const text = z.string().min(1);
const id = z.uuid().describe("Asset id, from search_assets");

type Tool = {
  description: string | (() => Promise<string>);
  scope: Scope;
  input: z.ZodObject;
  readOnly: boolean;
  run: (args: never, caller: Caller) => Promise<Record<string, unknown>>;
};

const tool = <S extends z.ZodObject>(t: {
  description: Tool["description"];
  scope: Scope;
  input: S;
  readOnly: boolean;
  run: (args: z.infer<S>, caller: Caller) => Promise<Record<string, unknown>>;
}) => t as unknown as Tool;

const found = async (assetId: string) => {
  const a = await getAsset(assetId);
  if (!a) throw new AssetError("not_found", `No asset ${assetId}`);
  return a;
};

const TOOLS: Record<string, Tool> = {
  search_assets: tool({
    // Built per call: the field schema and collections are the library's own.
    description: async () => {
      const [fields, collections] = await Promise.all([listFields(), listCollections()]);
      return [
        "Search the library. Every word of `q` must match (as a prefix) the filename, tags, captions or field values.",
        "No arguments lists the newest assets. Results carry facet counts: tags and field values you can narrow by.",
        fields.length
          ? `Custom fields, for \`filters\`: ${fields.map((f) => `${f.key} (${f.type}${f.options.length ? `: ${f.options.join(", ")}` : ""})`).join("; ")}.`
          : "",
        collections.length
          ? `Collections, for \`collection\`: ${collections.map((c) => `${c.name} = ${c.id}`).join("; ")}.`
          : "",
      ]
        .filter(Boolean)
        .join(" ");
    },
    scope: "read",
    readOnly: true,
    input: z.object({
      q: z.string().max(512).optional().describe("Free text"),
      tags: z.array(z.string()).max(20).optional().describe("Only assets carrying every one of these tags"),
      collection: z.uuid().optional().describe("Only this collection's assets"),
      filters: z
        .record(z.string(), z.union([z.string(), z.array(z.string())]))
        .optional()
        .describe('Field filters: {"channel": ["web", "print"], "budget.gte": "10", "expires.lte": "2027-01-31"}'),
      review: z.boolean().optional().describe("Only what waits on a human: proposed assets and suggested tags"),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    run: async ({ q, tags, collection, filters, review, limit }) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      for (const t of tags ?? []) params.append("tag", t);
      if (collection) params.set("collection", collection);
      if (review) params.set("review", "true");
      for (const [k, v] of Object.entries(filters ?? {}))
        for (const one of [v].flat()) params.append(`f.${k}`, one);
      params.set("limit", String(limit));
      // The REST query parser, so a filter the API rejects is rejected here too.
      const { data, facets } = await searchAssets(await parseAssetQuery(params));
      return { results: data.map(summary), facets };
    },
  }),

  describe_asset: tool({
    description:
      "Everything known about one asset: title, credit, tags, field values, the URLs it is served at, " +
      "what renditions it allows, and ready-made rendition URLs. Read this before using an asset.",
    scope: "read",
    readOnly: true,
    input: z.object({ id }),
    run: async ({ id }) => describeAsset(await found(id)),
  }),

  rendition_url: tool({
    description:
      "The URL of an asset at a given size and format, to embed or hand over. Building it costs nothing; the " +
      "image is made on first request and cached. Renditions never upscale: asking for more pixels than the " +
      "original has returns the original size.",
    scope: "read",
    readOnly: true,
    input: z.object({
      id,
      width: z.number().int().min(1).max(MAX_DIMENSION).optional(),
      height: z.number().int().min(1).max(MAX_DIMENSION).optional(),
      fit: z.enum(FITS).optional().describe("With both width and height: cover crops, contain pads, inside fits (default)"),
      format: z.enum(FORMATS).optional().describe("Defaults to the original's format; webp suits the web"),
      quality: z.number().int().min(1).max(100).optional(),
    }),
    run: async ({ id, width, height, fit, format, quality }) => {
      const a = await found(id);
      if (!isRenderable(a.mime)) throw new AssetError("unsupported", `${a.mime} can't be transformed; use ${base(a.id)}`);
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

  ingest_asset: tool({
    description:
      "Add a file to the library from a public http(s) URL. Identical bytes dedupe to the existing asset. " +
      "The new asset is proposed: it shows up for review, not in the library, until a person approves it.",
    scope: "propose",
    readOnly: false,
    input: z.object({
      url: z.url({ protocol: /^https?$/ }).max(2048),
      filename: z.string().min(1).max(512).optional().describe("Defaults to the URL's last path segment"),
      tags: z.array(text.max(64)).max(50).optional(),
      fields: z.record(z.string(), z.unknown()).optional().describe("Custom field values; required fields must be set"),
      collections: z.array(z.uuid()).max(50).optional(),
    }),
    run: async (input, caller) => {
      const status = allows(caller.scope, "write") ? "active" : "proposed";
      const { asset, deduped } = await ingestFromUrl({ ...input, status });
      return { deduped, asset: describeAsset(asset) };
    },
  }),

  propose_tags: tool({
    description:
      "Suggest tags for an asset. They are not applied: a person accepts or dismisses each one. " +
      "Tags the asset already has are ignored.",
    scope: "propose",
    readOnly: false,
    input: z.object({ id, tags: z.array(text.max(64)).min(1).max(50) }),
    run: async ({ id, tags }) => {
      const a = await proposeTags(id, tags);
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
        capabilities: { tools: {} },
        serverInfo: { name: "artbucket", version: "0.4.0" },
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
            .filter(([, t]) => allows(caller.scope, t.scope))
            .map(async ([name, t]) => {
              const inputSchema = z.toJSONSchema(t.input, { io: "input" });
              delete inputSchema.$schema;
              return {
                name,
                description: typeof t.description === "string" ? t.description : await t.description(),
                inputSchema,
                annotations: { readOnlyHint: t.readOnly, destructiveHint: false, openWorldHint: name === "ingest_asset" },
              };
            }),
        ),
      });
    case "tools/call": {
      const t = TOOLS[String(params.name)];
      if (!t) return error(id, -32602, `Unknown tool: ${String(params.name)}`);
      if (!allows(caller.scope, t.scope)) {
        return result(id, toolResult({ error: `This key's scope is ${caller.scope ?? "none"}; ${params.name} needs ${t.scope}` }, true));
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
