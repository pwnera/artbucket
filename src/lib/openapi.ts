import { z } from "zod";
import * as S from "./schemas.ts";
import type { Scope } from "./scopes.ts";

/**
 * The OpenAPI 3.1 document for /api/v1, built from the same Zod schemas the
 * handlers validate with. Served at /api/v1/openapi.json; openapi.test.ts
 * fails if a route exists that this does not describe.
 */

const schema = (s: z.ZodType, io: "input" | "output" = "output") => {
  const out = z.toJSONSchema(s, { io, unrepresentable: "any" });
  delete out.$schema;
  return out;
};

const json = (s: z.ZodType, io?: "input" | "output") => ({ "application/json": { schema: schema(s, io) } });
const data = (s: z.ZodType) => z.object({ data: s });

type Op = {
  summary: string;
  scope: Scope | "public";
  description?: string;
  body?: z.ZodType;
  query?: Record<string, { schema: object; description: string }>;
  ok: [status: number, description: string, schema?: z.ZodType];
  extra?: Record<string, object>;
};

function op({ summary, scope, description, body, query, ok: [status, desc, res], extra }: Op) {
  return {
    summary,
    description: [description, scope === "public" ? "No key needed." : `Scope: \`${scope}\`.`]
      .filter(Boolean)
      .join("\n\n"),
    ...(scope === "public" ? { security: [] } : { "x-scope": scope }),
    ...(query
      ? { parameters: Object.entries(query).map(([name, p]) => ({ name, in: "query", ...p })) }
      : {}),
    ...(body ? { requestBody: { required: true, content: json(body, "input") } } : {}),
    responses: {
      [status]: { description: desc, ...(res ? { content: json(res) } : {}) },
      ...extra,
      default: { description: "An error", content: json(S.ErrorBody) },
    },
  };
}

const path = (name: string, description: string) => ({
  name,
  in: "path",
  required: true,
  description,
  schema: { type: "string" },
});

const str = { type: "string" };

export function openapi(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "artbucket",
      version: "1",
      description:
        "Agent-first asset management. The web UI is built on this API and nothing else. " +
        "Send `Authorization: Bearer <key>`; scopes are a ladder: read < propose < write < admin. " +
        "Agents (MCP at POST /api/v1/mcp) usually get `propose`: what they add waits for a human.",
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "An API key: ab_..." } },
    },
    security: [{ bearer: [] }, {}],
    paths: {
      "/api/v1/uploads": {
        post: op({
          summary: "Create a presigned upload",
          scope: "propose",
          description: "PUT the bytes to `uploadUrl`, then promote with POST /api/v1/assets.",
          body: S.CreateUpload,
          ok: [200, "An upload ticket", S.UploadTicket],
        }),
      },
      "/api/v1/assets": {
        get: op({
          summary: "Search and browse assets",
          scope: "read",
          description:
            "Newest first without `q`. Custom fields filter as `f.{key}={value}` (repeat to OR) and " +
            "`f.{key}.gte` / `f.{key}.lte` for numbers and dates. A filter on an unknown field is a 422.",
          query: {
            q: { schema: str, description: "Every word must match, each as a prefix" },
            tag: { schema: { type: "array", items: str }, description: "Repeat; assets carrying every tag" },
            collection: { schema: { type: "string", format: "uuid" }, description: "Only this collection" },
            review: {
              schema: { type: "string", enum: ["true", "false"] },
              description: "true: proposed assets and assets with suggested tags. Otherwise active only",
            },
            limit: { schema: { type: "integer", minimum: 1, maximum: 200, default: 100 }, description: "Page size" },
            offset: { schema: { type: "integer", minimum: 0, default: 0 }, description: "Skip this many" },
          },
          ok: [200, "Matching assets, with facet counts", S.Listing],
        }),
        post: op({
          summary: "Promote an upload, or ingest from a URL",
          scope: "propose",
          description:
            "With `token`: promote a staged upload. With `url`: the server fetches it (public addresses only). " +
            "Identical bytes dedupe to the existing asset (200). Without the write scope the new asset is `proposed`.",
          body: S.Finalize,
          ok: [201, "Created", z.object({ data: S.Asset, deduped: z.boolean() })],
          extra: { 200: { description: "Deduped to an existing asset", content: json(z.object({ data: S.Asset, deduped: z.boolean() })) } },
        }),
      },
      "/api/v1/assets/{id}": {
        parameters: [path("id", "Asset id")],
        get: op({ summary: "Fetch one asset", scope: "read", ok: [200, "The asset", data(S.Asset)] }),
        patch: op({
          summary: "Edit an asset, or review what was proposed",
          scope: "write",
          body: S.AssetPatch,
          ok: [200, "The updated asset", data(S.Asset)],
        }),
        delete: op({ summary: "Delete an asset", scope: "write", ok: [200, "Deleted", S.Deleted] }),
      },
      "/api/v1/assets/{id}/proposed-tags": {
        parameters: [path("id", "Asset id")],
        post: op({
          summary: "Suggest tags",
          scope: "propose",
          description: "They wait in `proposedTags` for someone with the write scope. Tags it already has are dropped.",
          body: S.ProposeTags,
          ok: [200, "The asset, with its suggestions", data(S.Asset)],
        }),
      },
      "/api/v1/collections": {
        get: op({ summary: "List collections", scope: "read", ok: [200, "Collections", data(z.array(S.Collection))] }),
        post: op({
          summary: "Create a collection",
          scope: "write",
          body: S.CollectionCreate,
          ok: [201, "Created", data(S.Collection)],
        }),
      },
      "/api/v1/collections/{id}": {
        parameters: [path("id", "Collection id")],
        get: op({ summary: "Fetch a collection", scope: "read", ok: [200, "The collection", data(S.Collection)] }),
        patch: op({
          summary: "Edit a collection",
          scope: "write",
          body: S.CollectionPatch,
          ok: [200, "The collection", data(S.Collection)],
        }),
        delete: op({ summary: "Delete a collection; its assets stay", scope: "write", ok: [200, "Deleted", S.Deleted] }),
      },
      "/api/v1/collections/{id}/assets": {
        parameters: [path("id", "Collection id")],
        post: op({
          summary: "Add and remove members",
          scope: "write",
          body: S.MembersChange,
          ok: [200, "Done", data(z.object({ ok: z.literal(true) }))],
        }),
      },
      "/api/v1/fields": {
        get: op({ summary: "The custom field schema", scope: "read", ok: [200, "Fields", data(z.array(S.FieldDef))] }),
        post: op({ summary: "Define a field", scope: "write", body: S.FieldDefInput, ok: [201, "Created", data(S.FieldDef)] }),
      },
      "/api/v1/fields/{key}": {
        parameters: [path("key", "Field key")],
        patch: op({ summary: "Edit a field", scope: "write", body: S.FieldDefPatch, ok: [200, "The field", data(S.FieldDef)] }),
        delete: op({
          summary: "Delete a field and every value stored under it",
          scope: "write",
          ok: [200, "Deleted", S.Deleted],
        }),
      },
      "/api/v1/searches": {
        get: op({ summary: "Saved searches", scope: "read", ok: [200, "Saved searches", data(z.array(S.SavedSearch))] }),
        post: op({ summary: "Save a search", scope: "write", body: S.SaveSearch, ok: [201, "Saved", data(S.SavedSearch)] }),
      },
      "/api/v1/searches/{id}": {
        parameters: [path("id", "Saved search id")],
        delete: op({ summary: "Forget a saved search", scope: "write", ok: [200, "Deleted", S.Deleted] }),
      },
      "/api/v1/brand/rules": {
        get: op({
          summary: "Brand rules",
          scope: "read",
          description:
            "The canon, as structured records: `color.primary`, `logo.neverDo`, `type.scale`. Without `context`, " +
            "every rule and its context variants. With one, one rule per key: the context's own where it has one, " +
            "the default otherwise.",
          query: {
            brand: { schema: str, description: "A brand's slug; the default brand when left out" },
            context: { schema: str, description: "A slug, e.g. instagram-story or dark-background" },
            asset: { schema: { type: "string", format: "uuid" }, description: "Only the rules that point at this asset" },
          },
          ok: [200, "Rules, and the contexts in use", S.BrandRules],
        }),
        post: op({
          summary: "Add a brand rule",
          scope: "write",
          description:
            "One per key and context; 409 when it exists. `value` must match `type`. `?brand=` picks the brand; " +
            "the default otherwise. Every change to rules lands in the brand's history.",
          query: { brand: { schema: str, description: "A brand's slug" } },
          body: S.RuleInput,
          ok: [201, "Created", data(S.BrandRule)],
        }),
      },
      "/api/v1/brand/rules/order": {
        put: op({
          summary: "Reorder brand rules",
          scope: "write",
          description: "Rules appear in this order within their section. A key's context versions move with it.",
          query: { brand: { schema: str, description: "A brand's slug" } },
          body: S.RuleOrder,
          ok: [200, "Done", data(z.object({ ok: z.literal(true) }))],
        }),
      },
      "/api/v1/brand/rules/{id}": {
        parameters: [path("id", "Rule id")],
        patch: op({
          summary: "Edit a brand rule",
          scope: "write",
          description: "A new `key` renames the rule and its context versions. The type never changes: delete and recreate.",
          body: S.RulePatch,
          ok: [200, "The rule", data(S.BrandRule)],
        }),
        delete: op({ summary: "Delete a brand rule", scope: "write", ok: [200, "Deleted", S.Deleted] }),
      },
      "/api/v1/brands": {
        get: op({ summary: "Brands, the default first", scope: "read", ok: [200, "Brands", data(z.array(S.Brand))] }),
        post: op({
          summary: "Create a brand",
          scope: "write",
          description: "Empty, or `from` another brand's current rules. Its history starts at version 1.",
          body: S.BrandCreate,
          ok: [201, "Created", data(S.Brand)],
        }),
      },
      "/api/v1/brands/{slug}": {
        parameters: [path("slug", "Brand slug")],
        get: op({ summary: "Fetch a brand", scope: "read", ok: [200, "The brand", data(S.Brand)] }),
        patch: op({
          summary: "Rename a brand, or make it the default",
          scope: "write",
          body: S.BrandPatch,
          ok: [200, "The brand", data(S.Brand.omit({ rules: true }))],
        }),
        delete: op({
          summary: "Delete a brand with its rules and history",
          scope: "write",
          description: "Not the default: make another brand the default first.",
          ok: [200, "Deleted", S.Deleted],
        }),
      },
      "/api/v1/brands/{slug}/versions": {
        parameters: [path("slug", "Brand slug")],
        get: op({
          summary: "A brand's history",
          scope: "read",
          description:
            "Newest first. Every change is recorded; changes by the same actor within ten minutes extend one " +
            "version, as in a shared doc, unless it has been named.",
          ok: [200, "Versions, without their rules", data(z.array(S.VersionMeta))],
        }),
      },
      "/api/v1/brands/{slug}/versions/{number}": {
        parameters: [path("slug", "Brand slug"), path("number", "Version number")],
        get: op({
          summary: "One version, and what changed",
          scope: "read",
          description:
            "The rules as they were. `diff` goes from the version before (or `against`) to this one; with " +
            "`against=current`, from this one to now.",
          query: { against: { schema: str, description: 'A version number, or "current"' } },
          ok: [200, "The version", data(S.Version)],
        }),
        patch: op({
          summary: "Name a version",
          scope: "write",
          description: "A named version is a checkpoint: later edits start a new version instead of extending it.",
          body: S.VersionPatch,
          ok: [200, "The version", data(S.VersionMeta)],
        }),
      },
      "/api/v1/brands/{slug}/versions/{number}/restore": {
        parameters: [path("slug", "Brand slug"), path("number", "Version number")],
        post: op({
          summary: "Restore a version",
          scope: "write",
          description: "Replaces the brand's rules with the version's. The restore is a new version, so it can be undone.",
          ok: [200, "Restored", data(S.Restored)],
        }),
      },
      "/api/v1/keys": {
        get: op({ summary: "List API keys", scope: "admin", ok: [200, "Keys, without secrets", data(z.array(S.ApiKey))] }),
        post: op({
          summary: "Mint an API key",
          scope: "admin",
          body: S.CreateKey,
          ok: [201, "The key, with its secret, shown this once", data(S.ApiKeyCreated)],
        }),
      },
      "/api/v1/keys/{id}": {
        parameters: [path("id", "Key id")],
        delete: op({ summary: "Revoke an API key", scope: "admin", ok: [200, "Revoked", S.Deleted] }),
      },
      "/api/v1/mcp": {
        post: op({
          summary: "MCP (Streamable HTTP, stateless)",
          scope: "read",
          description:
            "JSON-RPC 2.0 for Model Context Protocol clients. Tools: search_assets, describe_asset, " +
            "rendition_url, ingest_asset, propose_tags, brand_rules. Each tool checks its own scope. " +
            "Resources: artbucket://brand/rules and artbucket://brand/rules/{context}.",
          body: z.object({ jsonrpc: z.literal("2.0"), id: z.union([z.string(), z.number()]).optional(), method: z.string(), params: z.unknown().optional() }),
          ok: [200, "A JSON-RPC response", z.object({ jsonrpc: z.literal("2.0"), id: z.unknown(), result: z.unknown().optional(), error: z.unknown().optional() })],
          extra: { 202: { description: "A notification was accepted" } },
        }),
        get: { summary: "No server-initiated stream", security: [], responses: { 405: { description: "POST only" } } },
      },
      "/api/v1/openapi.json": {
        get: { summary: "This document", security: [], responses: { 200: { description: "OpenAPI 3.1" } } },
      },
      "/a/{id}": {
        parameters: [path("id", "Asset id")],
        get: op({
          summary: "The original, or its description",
          scope: "public",
          description:
            "Bytes, exactly as uploaded; `?download` writes current metadata in. With `Accept: application/json` " +
            "it returns the description instead, which needs the read scope.",
          query: { download: { schema: { type: "string" }, description: "Present: attach, with metadata embedded" } },
          ok: [200, "The file", S.Description],
        }),
      },
      "/a/{id}/{transform}": {
        parameters: [
          path("id", "Asset id"),
          path("transform", "e.g. w_800,f_webp. Keys: w, h (1-8000), fit, q (1-100), f (jpeg, png, webp, avif)"),
        ],
        get: {
          summary: "A rendition, generated once and cached forever",
          security: [],
          responses: { 200: { description: "Image bytes" }, default: { description: "An error", content: json(S.ErrorBody) } },
        },
      },
    },
  };
}
