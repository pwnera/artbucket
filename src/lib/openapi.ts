import { z } from "zod";
import * as S from "./schemas.ts";
import { ASSET_TYPES } from "./filters.ts";
import { FONT_CATEGORIES } from "./font.ts";
import { ICON_GROUP_NAMES } from "./icons.ts";
import { STATES } from "./lifecycle.ts";
import { TOOL_INPUTS } from "./mcp-tools.ts";
import { Consent, GRANTABLE } from "./oauth.ts";
import type { Scope } from "./scopes.ts";
import { TOKEN_FORMAT_IDS } from "./tokens.ts";

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
  /** "any": anyone gets in; what they may do is checked on the thing itself. */
  scope: Scope | "public" | "any";
  description?: string;
  body?: z.ZodType;
  query?: Record<string, { schema: object; description: string }>;
  ok: [status: number, description: string, schema?: z.ZodType];
  extra?: Record<string, object>;
};

function op({ summary, scope, description, body, query, ok: [status, desc, res], extra }: Op) {
  return {
    summary,
    description: [
      description,
      scope === "public" ? "No key needed." : scope === "any" ? "Any caller; the scope needed is checked on what it acts on." : `Scope: \`${scope}\`.`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    ...(scope === "public" ? { security: [] } : scope === "any" ? {} : { "x-scope": scope }),
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

/** The server docs/openapi.json names: a self-hosted install, where the docs' playground can reach one. */
export const DOCS_SERVER = "http://localhost:3000";

export function openapi(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "artbucket",
      version: "1",
      description:
        "Agent-first asset management. The web UI is built on this API and nothing else, beside signing in at /api/auth. " +
        "Send `Authorization: Bearer <key>`: a key works in one workspace with one scope, and scopes are a ladder: " +
        "read < propose < write < admin. People signed in to the app carry a session cookie instead, and their scope is " +
        "what their grants add up to: on the organization, the workspace, or single collections and assets. A scope " +
        "shown as needed on the workspace is also enough on the one collection or asset a route acts on. Agents (MCP at " +
        "POST /api/v1/mcp) usually get `propose`: what they add waits for a human.",
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: {
        bearer: { type: "http", scheme: "bearer", description: "An API key: ab_..." },
        session: { type: "apiKey", in: "cookie", name: "better-auth.session_token", description: "Signed in, at /api/auth" },
      },
    },
    security: [{ bearer: [] }, { session: [] }, {}],
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
            "`f.{key}.gte` / `f.{key}.lte` for numbers and dates. A filter on an unknown field is a 422. " +
            "Of a stack of versions, only the current approved one is listed; GET /api/v1/assets/{id}/versions has the rest.",
          query: {
            q: { schema: str, description: "Every word must match, each as a prefix" },
            tag: { schema: { type: "array", items: str }, description: "Repeat; assets carrying every tag" },
            type: {
              schema: { type: "array", items: { type: "string", enum: [...ASSET_TYPES] } },
              description: "Repeat; assets of any of these types",
            },
            collection: { schema: str, description: "Only this collection: its id, or its name" },
            status: {
              schema: { type: "array", items: { type: "string", enum: [...STATES] } },
              description: "Repeat; assets in any of these states. Without it, approved (active) and unexpired ones",
            },
            review: {
              schema: { type: "string", enum: ["true", "false"] },
              description: "true: proposed assets and assets with suggested tags, whatever `status` says",
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
            "Identical bytes dedupe to the existing asset (200). Without the write scope the new asset is `proposed`, " +
            "and required fields may be left for the person who approves it. C2PA Content Credentials in the file " +
            "are read into `c2pa`, and set `origin` and `generator` unless given. With `versionOf`, it is a new version " +
            "of that asset: filed where it is, with its tags and fields, and current once approved; public when the version " +
            "it takes over from is, if whoever uploads or approves it may share it.",
          body: S.Finalize,
          ok: [201, "Created", z.object({ data: S.Asset, deduped: z.boolean() })],
          extra: { 200: { description: "Deduped to an existing asset", content: json(z.object({ data: S.Asset, deduped: z.boolean() })) } },
        }),
      },
      "/api/v1/check": {
        post: op({
          summary: "May this asset be used like this?",
          scope: "read",
          description:
            "A verdict, not a lookup: `allowed`, the `reasons` (blocking, or worth knowing), and `suggest`, what to " +
            "use instead. Refuses an asset that isn't approved, one that was replaced (and names the replacement), " +
            "one outside its license window, territory or channel, one whose people have no model release outside " +
            "editorial use, and, with a `context`, a rule's default asset where the brand has a variant for that " +
            "context. A restriction the use says nothing about is a non-blocking reason: pass `territory` and " +
            "`channel` to settle it.",
          body: S.CheckInput,
          ok: [200, "The verdict", S.CheckResult],
        }),
      },
      "/api/v1/brand/templates": {
        get: op({
          summary: "Section templates",
          scope: "read",
          description:
            "What a brand page is built from: each template's use, what its keys may name, what its items are, its " +
            "layout defaults, its own props as JSON Schema and an example section. `common` says what every section " +
            "takes. The MCP tool list_templates serves the same.",
          ok: [200, "The templates", data(S.Templates)],
        }),
      },
      "/api/v1/brand/playbook": {
        get: op({
          summary: "The brand site playbook",
          scope: "read",
          description:
            "What a good brand site is, for an agent about to build one: research, assets before pages, a look that fits, " +
            "the overview as a landing page, varied blocks, titles as claims, review; with a worked example in calls. " +
            "Markdown. The MCP tool brand_playbook and the artbucket://playbook resource serve the same.",
          ok: [200, "The playbook", data(z.object({ markdown: z.string() }))],
        }),
      },
      "/api/v1/brands/{slug}/pages/{page}/preview": {
        get: op({
          summary: "A page as a picture",
          scope: "read",
          description:
            "The draft page as readers see it, drawn by the server's browser: a JPEG of the whole page, up to 10000px tall. " +
            "`width` is desktop (1280px, the default) or phone (390px); `context` draws it in a context. " +
            "503 when the server has no browser (CHROMIUM_PATH). The MCP tool preview_page serves the same, as an image.",
          ok: [200, "The page, as image/jpeg (binary)"],
        }),
      },
      "/api/v1/brand/tokens": {
        get: op({
          summary: "Export the brand as design tokens",
          scope: "read",
          description:
            "Colors, numbers, fonts and the type scale as code. `css`: custom properties on :root, with @font-face " +
            "for every font file. `scss`, `less`: the same as Sass or Less variables. `tailwind`: a Tailwind 4 @theme; " +
            "`tailwind3`: theme.extend for tailwind.config.js. `ts`: one typed object. `shadcn`: shadcn/ui's " +
            "variables; `mui`: a Material UI createTheme; `chakra`: a Chakra UI 3 system. `json`: W3C Design Tokens " +
            "(DTCG 2025.10), grouped by key, for Style Dictionary, Tokens Studio or a Figma importer; font files are " +
            "under `$extensions`. `designmd`: DESIGN.md for coding agents, the tokens as YAML front matter and the " +
            "guidance as prose. A rule set in one of the brand's fonts aliases it. Sentences and do/don't lists are " +
            "guidance, not tokens, and are left out of every format but `designmd`.",
          query: {
            format: { schema: { type: "string", enum: TOKEN_FORMAT_IDS, default: "css" }, description: "The output" },
            brand: { schema: str, description: "A brand's slug; the default brand without it" },
            context: { schema: str, description: "Resolve for this context, e.g. dark-background" },
          },
          ok: [200, "The tokens, as text: CSS, Sass, Less, JS, TypeScript or JSON"],
        }),
      },
      "/api/v1/fonts/google": {
        get: op({
          summary: "Search Google Fonts",
          scope: "read",
          description: "The Google Fonts catalog, most popular first; names starting with `q` before names containing it.",
          query: {
            q: { schema: str, description: "Part of the family name, any case" },
            category: { schema: { type: "string", enum: [...FONT_CATEGORIES] }, description: "Only this category" },
            limit: { schema: { type: "integer", minimum: 1, maximum: 100, default: 30 }, description: "Page size" },
          },
          ok: [200, "Matching families", S.GoogleFamilies],
        }),
        post: op({
          summary: "Import a Google Fonts family",
          scope: "propose",
          description:
            "One asset per style the family has (up to 9 weights, roman and italic), as whole TTF files. Fetched once " +
            "and served from /a/{id} after, so nobody's browser calls Google. Styles already here dedupe.",
          body: S.GoogleFontImport,
          ok: [
            201,
            "The family's styles, lightest first, roman before italic",
            z.object({ family: z.string().describe("As Google names it"), data: z.array(S.Asset) }),
          ],
        }),
      },
      "/api/v1/icons": {
        get: op({
          summary: "Search open source icon sets",
          scope: "read",
          description:
            "Iconify's icon sets (Tabler, Lucide, Material Symbols, Simple Icons and some 200 more), the popular ones first, " +
            "each with its author, license and a few sample names. Sets their authors no longer maintain are left out.",
          query: {
            q: { schema: str, description: "Words in the set's name, author or license" },
            group: { schema: { type: "string", enum: [...ICON_GROUP_NAMES] }, description: "Only this kind of set" },
            limit: { schema: { type: "integer", minimum: 1, maximum: 300, default: 60 }, description: "Page size" },
          },
          ok: [200, "Matching sets", S.IconSets],
        }),
        post: op({
          summary: "Import icons from a set",
          scope: "propose",
          description:
            "One SVG asset per icon, at the size it is drawn at, titled from its name, credited to the set's author, " +
            "with the set's license in its rights and tagged `icon` and the set's name. Fetched once and served from " +
            "/a/{id} after, so nobody's browser calls Iconify. Icons already here dedupe.",
          body: S.IconImport,
          ok: [
            201,
            "The icons, in the order asked",
            z.object({
              set: S.IconSets.shape.data.element,
              data: z.array(S.Asset),
              missing: z.array(z.string()).describe("Names the set doesn't have"),
            }),
          ],
        }),
      },
      "/api/v1/icons/{prefix}": {
        parameters: [path("prefix", "The set, as Iconify names it: tabler, lucide, simple-icons")],
        get: op({
          summary: "Browse an icon set",
          scope: "read",
          description: "A page of the set's icons, each drawn as the SVG an import would store, and its categories to narrow by.",
          query: {
            q: { schema: str, description: "Words in the icon's name" },
            category: { schema: str, description: "One of the set's categories" },
            offset: { schema: { type: "integer", minimum: 0, default: 0 }, description: "Icons to skip" },
            limit: { schema: { type: "integer", minimum: 1, maximum: 200, default: 96 }, description: "Page size" },
          },
          ok: [200, "The set and a page of its icons", S.IconBrowse],
        }),
      },
      "/api/v1/icons/{prefix}/samples": {
        parameters: [path("prefix", "The set, as Iconify names it: tabler, lucide, simple-icons")],
        get: op({
          summary: "An icon set's samples",
          scope: "read",
          description: "The few icons a set is shown by (its `samples`), each drawn as the SVG an import would store.",
          ok: [200, "The set's samples", S.IconSamples],
        }),
      },
      "/api/v1/assets/{id}": {
        parameters: [path("id", "Asset id")],
        get: op({ summary: "Fetch one asset", scope: "read", ok: [200, "The asset", data(S.Asset)] }),
        patch: op({
          summary: "Edit an asset, or review what was proposed",
          scope: "write",
          description:
            "Also its rights (replaced whole), provenance (`origin`, `parentAssetId`, `generator`, `prompt`), and " +
            "`supersededBy`: the asset that replaces it, which /api/v1/check then names. `status` moves it through " +
            "its lifecycle: draft, proposed (in review), active (approved), archived, rejected. Submitting or reworking " +
            "a draft takes write; any other move takes write with the approve ability.",
          body: S.AssetPatch,
          ok: [200, "The updated asset", data(S.Asset)],
        }),
        delete: op({
          summary: "Delete an asset",
          scope: "write",
          description:
            "It leaves the library, its links and its stack at once, reads `state: \"deleted\"` and answers 410 at /a/{id}. " +
            "Restorable for 30 days, then purged, with its bytes when nothing else holds them.",
          ok: [200, "Deleted", S.Deleted],
        }),
      },
      "/api/v1/assets/{id}/restore": {
        parameters: [path("id", "Asset id")],
        post: op({
          summary: "Restore a deleted asset",
          scope: "write",
          description: "Within 30 days of its deletion. It comes back as it was, but not as its stack's current version.",
          ok: [200, "The asset", data(S.Asset)],
        }),
      },
      "/api/v1/assets/{id}/versions": {
        parameters: [path("id", "Asset id: any version of it")],
        get: op({
          summary: "Its versions",
          scope: "read",
          description: "Newest first. `current` marks the one the library shows and share links serve. An asset with one version lists itself.",
          ok: [200, "The versions", data(z.array(S.Asset))],
        }),
      },
      "/api/v1/assets/{id}/insights": {
        parameters: [path("id", "Asset id")],
        get: op({
          summary: "Where it is used",
          scope: "write",
          description:
            "The brand rules that point at it, the brand pages that show it, the open public portals it is on, and its fetches over the last 30 days by surface and by referrer host.",
          ok: [200, "Where it is used", data(S.AssetInsights)],
        }),
      },
      "/api/v1/assets/{id}/versions/{number}/current": {
        parameters: [path("id", "Asset id: any version of it"), path("number", "Version number")],
        post: op({
          summary: "Make a version current",
          scope: "write",
          description: "Roll back, or forward. It must be approved and unexpired; the others are superseded by it.",
          ok: [200, "The versions", data(z.array(S.Asset))],
        }),
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
      "/api/v1/assets/{id}/proposed-fields": {
        parameters: [path("id", "Asset id")],
        post: op({
          summary: "Suggest custom field values",
          scope: "propose",
          description:
            "They wait in `proposedFields` for someone with the write scope, who accepts one by setting it in `fields`, " +
            "or dismisses it through `proposedFields`. Each is checked against its field; one the asset already has is dropped.",
          body: S.ProposeFields,
          ok: [200, "The asset, with its suggestions", data(S.Asset)],
        }),
      },
      "/api/v1/assets/{id}/description": {
        parameters: [path("id", "Asset id")],
        get: op({
          summary: "What an asset is and may be used for",
          scope: "read",
          description:
            "Title, credit, tags, effective field values, rights, provenance, what supersedes it, its URLs, the " +
            "transforms it allows and ready-made rendition URLs. Whether a particular use is allowed: POST /api/v1/check.",
          ok: [200, "The description", S.Description],
        }),
      },
      "/api/v1/assets/{id}/signed-url": {
        parameters: [path("id", "Asset id")],
        post: op({
          summary: "A signed URL to an asset",
          scope: "write",
          description:
            "Asset bytes are private: /a/{id} serves people who can see the asset. A signed URL lets anyone who holds " +
            "it in until it expires, originals, renditions and downloads alike, while the asset may be used. Takes " +
            "share on it; only an approved, unexpired asset out of embargo. To serve it to anyone for good, PATCH it " +
            "`public: true` instead.",
          body: S.SignedUrlInput,
          ok: [200, "The URL", data(S.SignedUrl)],
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
      "/api/v1/activity": {
        get: op({
          summary: "Who did what",
          scope: "read",
          description:
            "Newest first: assets added, suggested, approved, rejected and deleted, tags suggested, and brand rule " +
            "changes (one per brand version). An actor is an API key's name, or `web` for the app.",
          query: {
            before: { schema: { type: "string", format: "date-time" }, description: "Only before this time: the previous page's `next`" },
            limit: { schema: { type: "integer", minimum: 1, maximum: 100, default: 50 }, description: "Page size" },
          },
          ok: [200, "Activity", S.Activity],
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
        patch: op({
          summary: "Set brand rules in one go",
          scope: "write",
          description:
            "The MCP tool set_rules. Each of `set` is made, or changes the rule with its key and context (its type " +
            "can't change: remove it first); each of `remove` goes, a key without a context with every context " +
            "version. All or none, checked together, so a gradient and the colors it names can arrive at once: a 422 " +
            "lists every problem with its path, e.g. `set[0].spec: ...`. One change in the brand's history.",
          query: { brand: { schema: str, description: "A brand's slug; the default brand when left out" } },
          body: S.RuleBatch,
          ok: [
            200,
            "What changed, each as key (context)",
            data(z.object({ brand: z.string(), created: z.array(z.string()), updated: z.array(z.string()), removed: z.array(z.string()) })),
          ],
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
          description:
            "Empty, or `from` another brand's current rules, a public BrandHub brand's release, a `template`, or an AdCP " +
            "brand.json: a `domain`'s (https://{domain}/.well-known/brand.json, following its authoritative_location and a " +
            "house portfolio's brand_refs, https only) or a `brandJson` document. From a brand.json, its colors, type, " +
            "logos, voice and more become rules, its logos and font files are ingested from their URLs, and the brand " +
            "keeps its domain (a template's too); `skipped` and `dropped` say what was left out. `publish` releases it and `visibility: " +
            "public` lists it on BrandHub in the same call (both take share on the workspace); if either fails, no brand " +
            "is made. Its history starts at version 1.",
          body: S.BrandCreate,
          ok: [201, "Created", data(S.BrandMade)],
        }),
      },
      "/api/v1/brand-json": {
        get: op({
          summary: "Read a domain's brand.json",
          scope: "write",
          description:
            "What POST /brands with `domain` would make, before making it: each brand the domain's AdCP brand.json holds " +
            "(a house portfolio's, its brand_refs read at their own domains), with its colors, faces, logo count and what " +
            "has no place in the rules, and the one `pick`ed when no `brand` is named.",
          query: { domain: { schema: str, description: "A domain, e.g. acme.com" } },
          ok: [200, "What it holds", data(S.BrandJsonPreview)],
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
      "/api/v1/brands/{slug}/status": {
        parameters: [path("slug", "Brand slug")],
        get: op({
          summary: "A brand's launch checklist and Brand Agent Score",
          scope: "read",
          description:
            "The steps every brand takes before it is worth sharing, in order: colors, typefaces, logo and voice in " +
            "the rules, pages worth reading, a publish readers see, and a portal. `next` is the first step not done. " +
            "`score` is the Brand Agent Score, 0 to 100, and each step's `points` what it adds once done.",
          ok: [200, "The checklist", data(S.BrandStatus)],
        }),
      },
      "/api/v1/brands/{slug}/insights": {
        parameters: [path("slug", "Brand slug")],
        get: op({
          summary: "A brand's signals",
          scope: "write",
          description:
            "Over the last 30 days: reads of its BrandHub files (brand.json, llms.txt, tokens), and views of its pages on portals. " +
            "Fetches and checks name a file, so the brand's are the files its rules held in its recent releases: from them, this " +
            "week's answers and refusals, and release adoption, the fetches since the latest release on it or on an older one.",
          ok: [200, "The signals", data(S.BrandInsights)],
        }),
      },
      "/api/v1/brands/{slug}/assets": {
        parameters: [path("slug", "Brand slug")],
        get: op({
          summary: "The files a brand uses",
          scope: "read",
          description:
            "Its rules' files, in the rules' order, then the ones its pages show (a cover, an image, a video, a file), " +
            "each with the rules and pages it is in. Only what the caller may see.",
          ok: [200, "Its files", data(z.array(S.BrandAsset))],
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
      "/api/v1/brands/{slug}/pages": {
        parameters: [path("slug", "Brand slug")],
        get: op({
          summary: "A brand's pages",
          scope: "read",
          description: "In order, with their tree fields, how many sections each has and the keys of the rules they show. GET one for its sections.",
          ok: [200, "Pages", data(z.array(S.PageSummary))],
        }),
        post: {
          ...op({
            summary: "Lay out pages from the rules",
            scope: "write",
            description:
              "For a brand with no pages: an overview, then a page per group of rules, each in the templates it fits. " +
              "A start to edit from; 409 when the brand has pages. With `set`, one topic's pages (Our X, Using X, In " +
              "product, In marketing, Best practices, Showcase) go in beside the pages there are, under `parent`; 409 " +
              "only when one of their slugs is taken.",
            ok: [
              201,
              "The pages made",
              data(z.object({ brand: z.string(), pages: z.array(z.object({ slug: z.string(), title: z.string(), sections: z.number().int() })) })),
            ],
          }),
          // `set` is optional, so the body may be left out.
          requestBody: { required: false, content: json(S.GeneratePagesInput, "input") },
        },
      },
      "/api/v1/brands/{slug}/pages/{page}": {
        parameters: [path("slug", "Brand slug"), path("page", "The page's slug, e.g. logo")],
        get: op({
          summary: "A brand page",
          scope: "read",
          description:
            "The page, the rules its sections show resolved for `context`, the keys whose rule has gone (`missing`), " +
            "what a reader would trip on (`warnings`), the page as Markdown, and `url`, where a member reads it in the " +
            "app. A slug it had before a rename finds it too.",
          query: { context: { schema: str, description: "Resolve its rules for this context, e.g. dark-background" } },
          ok: [200, "The page", data(S.PageRead)],
        }),
        put: op({
          summary: "Save a page whole",
          scope: "write",
          description:
            "Makes the page, or replaces its title and every section, top to bottom. A page field left out keeps its " +
            "value; null clears it. Sections keep their ids; new ones get one. Each section is checked against its own " +
            "template (GET /api/v1/brand/templates), its keys against the rules and its assets against the library: a " +
            "422 lists every problem with its path, e.g. `sections[1].props.chanel: Unrecognized key`. A slug that " +
            "isn't one is a 422 too. A draft until the brand is published.",
          body: S.PageInput,
          ok: [201, "Made", data(S.PageSaved)],
          extra: { 200: { description: "Replaced", content: json(data(S.PageSaved)) } },
        }),
        patch: op({
          summary: "Edit a page an operation at a time",
          scope: "write",
          description:
            "`ops` apply in order: `add`, `update`, `move` and `remove` sections, and `page` for its own fields. " +
            "`page` with `slug` renames it: the old slug becomes an alias that still finds it, and the pages under it " +
            "follow. All or none: a 422 lists every problem with its path, e.g. `ops[0].section.props.chanel: Unrecognized key`.",
          body: S.PageEdit,
          ok: [200, "The page", data(S.PageSaved.omit({ created: true }))],
        }),
        delete: op({ summary: "Delete a page", scope: "write", description: "409 while pages sit under it: move or delete them first.", ok: [200, "Deleted", S.Deleted] }),
      },
      "/api/v1/brands/{slug}/theme": {
        parameters: [path("slug", "Brand slug")],
        get: op({
          summary: "A brand's theme",
          scope: "read",
          description:
            "How its pages look beyond what the rules say: which rule plays which part (accent, surface, ink, faces, " +
            "logo) and the page's measure, rhythm and chrome, with the look they give. Every ink is graded on its " +
            "ground in `checks`: a pair under its need (4.5:1 for text, 3:1 for marks) falls back to a color that " +
            "reads and is a warning. So is a setting whose rule has gone since, and the default is used.",
          ok: [200, "The theme", data(S.ThemeView)],
        }),
        patch: op({
          summary: "Change a brand's theme",
          scope: "write",
          description:
            "Merges: a key left out keeps its value, null clears it. A color setting names a color rule, a font setting " +
            "a font rule, `logo` a rule with a picture and `device` an image asset: a 422 names each that doesn't, with " +
            "its path. Answers with the look and its `checks`, as GET does. A draft in the brand's history until it is published.",
          body: S.ThemePatch,
          ok: [200, "The theme", data(S.ThemeView)],
        }),
      },
      "/api/v1/brands/{slug}/view": {
        parameters: [path("slug", "Brand slug")],
        get: op({
          summary: "A brand page, ready to read",
          scope: "read",
          description:
            "A page of the draft as readers with every door open see it: the nav (pages above a reader's level listed " +
            "with a lock), the page's sections, every context version of the rules they show, the assets they name " +
            "that may be used, and each collection section's assets. No `page`: the first. A slug it had before a " +
            "rename gives the page with `redirect` set. `theme` is the look, derived and graded, as GET theme gives it. " +
            "`edit=1` takes write, and adds hidden pages and sections, `warnings` (theme pairs that fell back among " +
            "them) and `missing`. `version=live` reads the release readers see instead, with `version` set; 404 before the first.",
          query: {
            page: { schema: str, description: "The page's slug; the first page when left out" },
            context: { schema: str, description: "The context the reader starts in, e.g. dark-background" },
            lang: { schema: str, description: "The reader's language" },
            edit: { schema: { type: "string", enum: ["1"] }, description: "1: as the builder sees it" },
            version: { schema: { type: "string", enum: ["draft", "live"] }, description: "live: the released brand; the draft when left out" },
            in: { schema: str, description: "A collection section's id, whose assets `find` narrows" },
            find: { schema: str, description: "Words a reader searches that collection section for" },
          },
          ok: [200, "The page", data(S.PageView)],
        }),
      },
      "/api/v1/brands/{slug}/comments": {
        parameters: [path("slug", "Brand slug")],
        get: op({
          summary: "Review comments on a brand's pages",
          scope: "read",
          description:
            "Threads, each a first comment with its replies (oldest first): open ones first, the one that moved last on " +
            "top, then resolved ones, the last resolved first. A comment is on a page, or on one section of it by the " +
            "section's id; `page` is the page's slug now, so comments follow a rename. A section deleted since leaves its " +
            "comments on the page. Comments are never published and never in the brand's history. `mine`: the caller wrote it.",
          query: { page: { schema: str, description: "That page's only; a slug it had before a rename finds it too" } },
          ok: [200, "Threads", data(z.array(S.CommentThread))],
        }),
        post: op({
          summary: "Comment on a brand page, or reply",
          scope: "propose",
          description:
            "`page` (and `section`, a section's id on it) starts a thread; a page or section that isn't there is a 404. " +
            "`parent` replies in a thread instead, on its page and section; a reply to a reply joins its thread, and a " +
            "reply to a resolved thread reopens it. Takes propose on the workspace.",
          body: S.CommentCreate,
          ok: [201, "The comment", data(S.Comment)],
        }),
      },
      "/api/v1/brands/{slug}/comments/{id}": {
        parameters: [path("slug", "Brand slug"), path("id", "The comment's id")],
        patch: op({
          summary: "Edit a comment, or resolve its thread",
          scope: "propose",
          description:
            "`body` changes the text, of your own comment only, and sets `editedAt`. `resolved` resolves the thread or " +
            "reopens it, on a thread's first comment (a reply is a 422); anyone who may comment may. Resolving a " +
            "resolved thread keeps who resolved it first.",
          body: S.CommentPatch,
          ok: [200, "The comment", data(S.Comment)],
        }),
        delete: op({
          summary: "Delete a comment",
          scope: "propose",
          description: "Your own, or anyone's with write on the workspace. A thread's first comment takes its replies with it.",
          ok: [200, "Deleted", S.Deleted],
        }),
      },
      "/api/v1/brands/{slug}/updates": {
        parameters: [path("slug", "Brand slug")],
        get: op({
          summary: "What's new in a brand",
          scope: "read",
          description:
            "Its latest publishes, newest first, up to 20: each one's note and picture, and what it changed for readers " +
            "since the publish before it (edits between two publishes are passed over): rules by key, and pages readers " +
            "can reach, a hidden one left out.",
          ok: [200, "Its publishes", data(z.array(S.Update))],
        }),
      },
      "/api/v1/brands/{slug}/publish": {
        parameters: [path("slug", "Brand slug")],
        post: {
          ...op({
            summary: "Publish a brand",
            scope: "write",
            description:
              "Its latest version, rules, pages and theme, becomes the published one, and the next edit starts a new " +
              "version. `note` says what changed, for readers, with `image` beside it. With nothing changed since the " +
              "last publish, it answers `unchanged: true` and publishes nothing. Takes share on the workspace.",
            ok: [200, "The published version", data(S.Published)],
          }),
          // Everything in it is optional, so the body may be left out.
          requestBody: { required: false, content: json(S.PublishInput, "input") },
        },
      },
      "/api/v1/brands/{slug}/hub": {
        parameters: [path("slug", "Brand slug")],
        get: op({
          summary: "A brand on BrandHub",
          scope: "read",
          description:
            "Every published brand is on BrandHub at {org}/{brand}, private by default: its workspace's people see it, " +
            "signed in. Public, anyone and any agent reads its latest publish, as a page, llms.txt, brand.json and design " +
            "tokens. `portals`: the portals it could link as its guidelines; null without the right to manage portals.",
          ok: [200, "The brand on BrandHub", data(S.BrandHubView)],
        }),
        patch: op({
          summary: "Make a brand public or private",
          scope: "write",
          description:
            "`visibility: public` shows its latest publish on BrandHub to anyone; it takes a publish, and a slug no other " +
            "public brand of the organization has. `portal` picks the portal linked as its guidelines. Takes share on the workspace.",
          body: S.HubPatch,
          ok: [200, "The brand on BrandHub", data(S.BrandHub)],
        }),
      },
      "/api/v1/brands/{slug}/files": {
        parameters: [path("slug", "Brand slug")],
        get: op({
          summary: "A brand as files",
          scope: "read",
          description:
            "Brand as code: the brand as YAML for a Git repository. `brand.yaml` (slug, name, theme, the order of `rules/`, " +
            "the page tree), `rules/{group}.yaml` (the rules whose key starts with the group), `pages/{slug}.yaml` " +
            "(a page's fields and sections). Every default is left out, so the same brand is always the same bytes. " +
            "Assets the repository holds are named by path under `assets/`, the rest by id; `assets=files` gives " +
            "every asset a path, to fetch from `assets[path].url` and add beside the files.",
          query: { assets: { schema: { type: "string", enum: ["ids", "files"] }, description: "files: every asset as a file under assets/" } },
          ok: [200, "The files", data(S.BrandExport)],
        }),
      },
      "/api/v1/brands/{slug}/files/export": {
        parameters: [path("slug", "Brand slug")],
        post: op({
          summary: "A brand as files, keeping the repository's",
          scope: "read",
          description:
            "As GET .../files, given the repository's files as they are in `previous`: a file that says the same as " +
            "what would be written is answered as it was written, comments and all, so a sync commits only what changed.",
          body: S.BrandExportInput,
          ok: [200, "The files", data(S.BrandExport)],
        }),
      },
      "/api/v1/brands/{slug}/files/import": {
        parameters: [path("slug", "Brand slug")],
        post: op({
          summary: "Take a brand from its files",
          scope: "write",
          description:
            "The brand's rules, pages, theme and name as the files say them, in one version of its history. With a " +
            "source that remembers what both sides last agreed, what changed here since is kept: the files win only " +
            "where both changed the same rule, page or setting, and `conflicts` names each. Files under `assets/` are " +
            "named in `assets` by id or by the SHA-256 of their bytes; a 422 lists every problem at its file and line " +
            "(`detail.errors`) and the files to upload first (`detail.missing`); a `brand.yaml` whose `slug` names another " +
            "brand is one. `dryRun` answers what would change. " +
            "`pending`: the brand still holds changes the files lack, to export back. Takes setup on the workspace.",
          body: S.BrandImportInput,
          ok: [200, "What changed", data(S.BrandImport)],
          extra: { 422: { description: "Problems in the files", content: json(z.object({ error: z.object({ code: z.string(), message: z.string(), detail: S.FileProblems }) })) } },
        }),
      },
      "/api/v1/brands/{slug}/source": {
        parameters: [path("slug", "Brand slug")],
        get: op({
          summary: "Where a brand's files live",
          scope: "read",
          description:
            "The repository, branch and folder, the commit both sides last agreed at, and `pending` when the brand changed " +
            "here since; `source` is null when it lives here alone. `connect`: where this server connects a repository.",
          ok: [200, "The source", data(S.BrandSourceView)],
        }),
        put: op({
          summary: "Say where a brand's files live",
          scope: "write",
          description:
            "Moving it to another repository, branch or folder forgets what was agreed: the next import takes the files " +
            "whole. After pushing an export, send the files pushed as `synced` with their commit: they become what both " +
            "sides agree on. Takes setup on the workspace.",
          body: S.BrandSourceInput,
          ok: [200, "The source", data(S.BrandSource)],
        }),
        delete: op({ summary: "Keep a brand here alone", scope: "write", description: "Its repository is left as it is.", ok: [204, "Done"] }),
      },
      "/api/v1/brands/{slug}/previews": {
        parameters: [path("slug", "Brand slug")],
        post: op({
          summary: "Preview a proposed change",
          scope: "write",
          description:
            "A pull request's files as the brand's site, at a link that needs no account, and what they would change " +
            "of the brand as it stands. Checked as an import is. One preview per `ref`: saving again keeps its link. " +
            "It opens for 30 days after its last save.",
          body: S.BrandPreviewInput,
          ok: [200, "The preview", data(S.BrandPreview)],
        }),
        delete: op({
          summary: "Close a preview",
          scope: "write",
          query: { ref: { schema: { type: "string" }, description: "The preview's ref, e.g. pull/12" } },
          ok: [204, "Done"],
        }),
      },
      "/api/v1/previews/{token}": {
        parameters: [path("token", "The preview's token, from its link")],
        get: op({
          summary: "A page of a preview",
          scope: "public",
          description:
            "What a preview's link shows (POST .../previews): a page of the brand as a proposed change's files say it, " +
            "as GET .../view gives a page of the draft, every page open, assets signed. A 404 once it has closed.",
          query: {
            page: { schema: str, description: "The page's slug; the first page when left out" },
            context: { schema: str, description: "The context the reader starts in" },
            lang: { schema: str, description: "The reader's language" },
          },
          ok: [200, "The page", data(z.object({ preview: S.PreviewMeta, view: S.PageView }))],
        }),
      },
      "/api/v1/me": {
        get: op({
          summary: "Who is calling",
          scope: "any",
          description:
            "The person or key, the workspace this request acts in (a key's own; for a person, the one in the " +
            "`ab_workspace` cookie if they can open it), the scope there and on its organization, every workspace " +
            "they can switch to, and how one signs in here.",
          ok: [200, "You", data(S.Me)],
        }),
      },
      "/api/v1/organizations": {
        get: op({ summary: "Your organizations", scope: "any", ok: [200, "Organizations you have a grant in", data(z.array(S.Organization))] }),
        post: op({
          summary: "Make an organization",
          scope: "any",
          description: "With a first workspace, Library. Needs a signed-in person, who becomes its admin.",
          body: S.CreateOrganization,
          ok: [201, "Made", data(S.OrganizationCreated)],
        }),
      },
      "/api/v1/organizations/{id}": {
        parameters: [path("id", "Organization id")],
        patch: op({ summary: "Rename the organization", scope: "any", description: "Admin on the organization.", body: S.OrganizationPatch, ok: [200, "Renamed", data(S.Organization)] }),
        delete: op({
          summary: "Delete the organization",
          scope: "any",
          description:
            "With its workspaces and everything in them, its grants, invitations and settings; its files go with the next " +
            "sweep. Admin on the organization. Not the server's only one.",
          ok: [200, "Deleted", S.Deleted],
        }),
      },
      "/api/v1/usage": {
        get: op({
          summary: "Usage and limits",
          scope: "any",
          description: "What the organization uses, the limits its server's operator set, and 30 days of delivery traffic. Admin on the organization.",
          ok: [200, "Usage", data(S.Usage)],
        }),
      },
      "/api/v1/insights": {
        get: op({
          summary: "Insights",
          scope: "write",
          description:
            "What the workspace's events say: brand answers per week, release adoption and who still loads a replaced version, " +
            "the most fetched assets by surface, searches that found nothing, the use-check log (refusals by reason, what was offered and whether it was taken), " +
            "delivery traffic and portal page views. " +
            "Events never hold an IP address, a person's name or a full URL, and never leave this server.",
          ok: [200, "Insights", data(S.Insights)],
        }),
      },
      "/api/v1/insights/connections": {
        get: op({
          summary: "Connections: what each agent asked for",
          scope: "write",
          description:
            "Per agent (an API key or OAuth client, by name), over the last 30 days: the MCP tools it called and how many failed, " +
            "the brand contexts it asked for, the uses it was refused and why, and the files it fetched and searches it made. " +
            "A tool call keeps its name and outcome, never its arguments.",
          ok: [200, "Connections", data(S.Connections)],
        }),
      },
      "/api/v1/workspaces": {
        get: op({
          summary: "Workspaces in this organization",
          scope: "any",
          description: "Those you can open, with your scope on each; null where a grant inside it is all you have.",
          ok: [200, "Workspaces", data(z.array(S.WorkspaceItem))],
        }),
        post: op({
          summary: "Make a workspace",
          scope: "any",
          description: "A library of its own in the current organization, with a default brand. Admin on the organization.",
          body: S.CreateWorkspace,
          ok: [201, "Made", data(S.WorkspaceItem)],
        }),
      },
      "/api/v1/workspaces/{id}": {
        parameters: [path("id", "Workspace id")],
        patch: op({ summary: "Rename a workspace", scope: "any", description: "Admin there.", body: S.WorkspacePatch, ok: [200, "Renamed", data(S.WorkspaceItem.omit({ scope: true }))] }),
        delete: op({
          summary: "Delete a workspace",
          scope: "any",
          description:
            "With its assets, collections, fields, brands, keys and links, at once; its files go with the next sweep, when " +
            "no other workspace holds the same bytes. Admin on the organization. Not its last workspace.",
          ok: [200, "Deleted", S.Deleted],
        }),
      },
      "/api/v1/members": {
        get: op({
          summary: "People and their access",
          scope: "admin",
          query: { in: { schema: { type: "string", enum: ["workspace"] }, description: "Only who can open this workspace, and invitations into it" } },
          description:
            "Everyone with a grant in the organization, with the grants you may see, and invitations still waiting. " +
            "An organization admin sees every workspace's grants; a workspace admin, the organization's and their workspace's.",
          ok: [200, "Members", S.Members],
        }),
      },
      "/api/v1/grants": {
        post: op({
          summary: "Give a member access, or change it",
          scope: "any",
          description:
            "A scope on the organization (its admins only), a workspace, a collection or one asset (admins of the " +
            "workspace). Grants add up and reach down. Only for people already in the organization; invite anyone else.",
          body: S.GrantInput,
          ok: [200, "The grant", data(S.Grant)],
        }),
      },
      "/api/v1/grants/{id}": {
        parameters: [path("id", "Grant id")],
        delete: op({ summary: "Take access away", scope: "any", description: "An organization keeps at least one admin.", ok: [200, "Removed", S.Deleted] }),
      },
      "/api/v1/invitations": {
        post: op({
          summary: "Invite someone",
          scope: "any",
          description:
            "A grant waiting for whoever holds the link: they make an account or sign in, and have it. The `url` is " +
            "in this response only. It works once, for seven days. Same rules as giving a grant.",
          body: S.InvitationInput,
          ok: [201, "The invitation, with its link", data(S.InvitationCreated)],
        }),
      },
      "/api/v1/invitations/{id}/resend": {
        parameters: [path("id", "Invitation id")],
        post: op({
          summary: "Send an invitation again",
          scope: "any",
          description: "A new link and a new week; the old link stops working. Emailed when the organization can send email. The `url` is in this response only.",
          ok: [200, "The invitation, with its new link", data(S.InvitationCreated)],
        }),
      },
      "/api/v1/invitations/{id}": {
        parameters: [path("id", "Invitation id")],
        delete: op({ summary: "Withdraw an invitation", scope: "any", ok: [200, "Withdrawn", S.Deleted] }),
      },
      "/api/v1/invite/{token}": {
        parameters: [path("token", "From the invitation link")],
        get: op({ summary: "What an invitation offers", scope: "public", ok: [200, "The invitation", data(S.InvitationInfo)] }),
        post: op({ summary: "Accept an invitation", scope: "any", description: "As the signed-in person.", ok: [200, "Accepted", data(S.Accepted)] }),
      },
      "/api/v1/shares": {
        get: op({ summary: "Share links", scope: "write", description: "The workspace's, on what you may share.", ok: [200, "Links", data(z.array(S.Share))] }),
        post: op({
          summary: "Make a share link",
          scope: "write",
          description:
            "For people without an account. `view`: a collection's approved assets, or one asset, to see and download. " +
            "`upload`: files sent in land `proposed`, in the collection (or the workspace), for review. Either can " +
            "expire and ask for a password. Needs write on what it shares.",
          body: S.ShareCreate,
          ok: [201, "The link, and how many of `emails` it was sent to", data(S.Share.extend({ emailed: z.number().int() }))],
        }),
      },
      "/api/v1/shares/{id}/send": {
        parameters: [path("id", "Share link id")],
        post: op({
          summary: "Email a share link",
          scope: "write",
          description: "To up to 20 people, through the organization's email. A 422 says why when none could be sent.",
          body: S.ShareSend,
          ok: [200, "How many it reached", data(z.object({ emailed: z.number().int() }))],
        }),
      },
      "/api/v1/shares/{id}": {
        parameters: [path("id", "Share link id")],
        delete: op({ summary: "Revoke a share link", scope: "write", description: "It stops working at once.", ok: [200, "Revoked", S.Deleted] }),
      },
      "/api/v1/shared/{token}": {
        parameters: [path("token", "From the share link")],
        get: op({
          summary: "Open a share link",
          scope: "public",
          description:
            "What the link is, and for a view link its approved assets with download URLs. A password goes in " +
            "`X-Share-Password`: 401 `password` without it or with a wrong one, 410 `gone` once expired.",
          query: {
            limit: { schema: { type: "integer", minimum: 1, maximum: 200, default: 100 }, description: "Page size" },
            offset: { schema: { type: "integer", minimum: 0, default: 0 }, description: "Skip this many" },
          },
          ok: [200, "The link's contents", S.Shared],
        }),
      },
      "/api/v1/shared/{token}/uploads": {
        parameters: [path("token", "From an upload link")],
        post: op({
          summary: "Start an upload through a link",
          scope: "public",
          description: "Like POST /api/v1/uploads: PUT the bytes to `uploadUrl`, then hand them in.",
          body: S.CreateUpload,
          ok: [200, "An upload ticket", S.UploadTicket],
        }),
      },
      "/api/v1/shared/{token}/assets": {
        parameters: [path("token", "From an upload link")],
        post: op({
          summary: "Hand in an upload through a link",
          scope: "public",
          description: "It lands proposed, in the link's collection. The guest learns it arrived, nothing about the library.",
          body: S.ShareFinalize,
          ok: [201, "Received", data(z.object({ received: z.literal(true), deduped: z.boolean() }))],
        }),
      },
      "/api/v1/portals": {
        get: op({ summary: "Brand portals", scope: "write", description: "The workspace's portals.", ok: [200, "Portals", data(z.array(S.Portal))] }),
        post: op({
          summary: "Make a brand portal",
          scope: "write",
          description:
            "A curated, themed front door onto chosen collections, for press, partners or retailers, at /p/{slug} or " +
            "a domain of its own. It shows only approved, unexpired, current assets, and offers images as renditions " +
            "made for a purpose (`presets`) rather than raw originals. `access`: `public`, `password`, or `members` " +
            "(people with access to the workspace); the last two take access requests. Needs sharing rights on each " +
            "collection. `domain` is one of the organization's verified domains (/api/v1/domains), not its default.",
          body: S.PortalInput,
          ok: [201, "The portal", data(S.Portal)],
        }),
      },
      "/api/v1/portals/{id}": {
        parameters: [path("id", "Portal id")],
        get: op({ summary: "A brand portal", scope: "write", ok: [200, "The portal", data(S.Portal)] }),
        patch: op({
          summary: "Change a brand portal",
          scope: "write",
          description: "Only what is given changes. A new `slug` keeps the old one leading here, and nobody else may take it while the portal stands: the last five. `domain` picks another of the organization's verified domains; null gives it back to the app. A left-out `password` stays.",
          body: S.PortalPatch,
          ok: [200, "The portal", data(S.Portal)],
        }),
        delete: op({ summary: "Delete a brand portal", scope: "write", description: "Its address and domain stop answering at once.", ok: [200, "Deleted", S.Deleted] }),
      },
      "/api/v1/portals/address": {
        get: op({
          summary: "Is a portal address free?",
          scope: "write",
          description: "Whether a portal may take this address, why not (taken, or kept for the service), and the URL it would answer at.",
          query: {
            slug: { schema: str, description: "The address, e.g. press-kit" },
            portal: { schema: str, description: "The portal being renamed, by id: its own address counts as free" },
          },
          ok: [200, "The address", data(S.PortalAddress)],
        }),
      },
      "/api/v1/portals/look": {
        get: op({
          summary: "The look a portal borrows from its brand",
          scope: "write",
          description:
            "A portal's empty logo or accent is its first brand's when served, from the brand's live release: this is that logo and accent, for a form to show before the portal is saved. A portal sets its own to override them (white-label).",
          query: { brand: { schema: str, description: "The brand the portal shows first, by slug" } },
          ok: [200, "The look", data(S.PortalLook)],
        }),
      },
      "/api/v1/portals/domains": {
        get: op({
          summary: "Domains a portal can be served at",
          scope: "write",
          description: "The organization's verified domains but the default, and the portal each serves. They are added and verified in Settings, Domains (/api/v1/domains).",
          ok: [200, "Domains", data(z.array(S.PortalDomain))],
        }),
      },
      "/api/v1/portals/{id}/close": {
        parameters: [path("id", "Portal id")],
        post: op({
          summary: "Take a portal offline now",
          scope: "write",
          description: "It closes as a portal past its `expiresAt` does. PATCH `expiresAt: null` opens it again, as it was.",
          ok: [200, "The portal", data(S.Portal)],
        }),
      },
      "/api/v1/portals/{id}/domain": {
        parameters: [path("id", "Portal id")],
        post: op({
          summary: "Verify a portal's domain",
          scope: "write",
          description: "Looks up the TXT record named in `domain.record`, and the CNAME in `domain.cname`, now. Found, the portal is served at its domain; a 422 says what was missing.",
          ok: [200, "The portal", data(S.Portal)],
        }),
      },
      "/api/v1/portals/{id}/requests": {
        parameters: [path("id", "Portal id")],
        get: op({ summary: "Access requests", scope: "write", description: "Who asked in, newest first, and what became of it.", ok: [200, "Requests", data(z.array(S.PortalRequest))] }),
      },
      "/api/v1/portals/{id}/views": {
        parameters: [path("id", "Portal id")],
        get: op({
          summary: "Page views",
          scope: "write",
          description: "How often its pages were read over the last 30 days, per brand and page, most read first. Asset downloads aren't counted here.",
          ok: [200, "Views", data(S.PortalViews)],
        }),
      },
      "/api/v1/portals/{id}/requests/{request}": {
        parameters: [path("id", "Portal id"), path("request", "Request id")],
        patch: op({
          summary: "Answer a request",
          scope: "write",
          description:
            `An access request approved gets a link of their own for ${90} days (or until the portal closes), emailed when the organization's email works, and in \`url\` to copy. ` +
            "A request section's ask (asset, review, question) approved is marked done, and denied dismissed; it makes no link.",
          body: S.PortalDecision,
          ok: [200, "The request, and whether it was emailed", S.Decided],
        }),
        delete: op({ summary: "Remove an access request", scope: "write", description: "An approved link stops working.", ok: [200, "Removed", S.Deleted] }),
      },
      "/api/v1/portal/{slug}": {
        parameters: [path("slug", "The portal's address")],
        get: op({
          summary: "Open a brand portal",
          scope: "public",
          description:
            "What a visitor sees: the portal, themed, its collections with how many usable assets each has, its brands, and a page " +
            "of them with their downloads. URLs are relative to the host asked, so a portal on its own domain loads " +
            "from there. A password goes in `X-Portal-Password`, an approved request's key in `X-Portal-Key`; a " +
            "`members` portal reads the session. 401 `password` names how to get in (see PortalGate), 410 `gone` once closed.",
          query: {
            q: { schema: str, description: "Every word must match, each as a prefix" },
            collection: { schema: str, description: "Only this one of its collections" },
            limit: { schema: { type: "integer", minimum: 1, maximum: 200, default: 60 }, description: "Page size" },
            offset: { schema: { type: "integer", minimum: 0, default: 0 }, description: "Skip this many" },
          },
          ok: [200, "The portal's contents", S.PortalView],
          extra: { 401: { description: "Not in yet: how to get in", content: json(S.PortalGate) } },
        }),
      },
      "/api/v1/portal/{slug}/brands/{brand}": {
        parameters: [path("slug", "The portal's address"), path("brand", "One of its brands, by slug")],
        get: op({
          summary: "A brand's guidelines, in a portal",
          scope: "public",
          description:
            "The rules of one of the portal's brands as its latest publish has them, read-only, behind the same door " +
            "as the portal (see GET /api/v1/portal/{slug}); a brand never published is a 404. A rule's assets are listed " +
            "only when they may be used, and load from /a/{id} with the signature in `signed`; images in a rule's text " +
            "come signed. `updatedAt` is when it was published.",
          query: { context: { schema: str, description: "Resolve for one context, e.g. dark-background" } },
          ok: [200, "The guidelines", S.PortalBrand],
          extra: { 401: { description: "Not in yet: how to get in", content: json(S.PortalGate) } },
        }),
      },
      "/api/v1/portal/{slug}/site": {
        parameters: [path("slug", "The portal's address")],
        get: op({
          summary: "A page of a portal's brand book",
          scope: "public",
          description:
            "A page of one of the portal's brands, from its latest publish (never the draft), as this visitor may read " +
            "it, behind the same door as the portal. `path` is what follows /p/{slug}: nothing for the first brand's " +
            "first page, `{page}` for a page of the first brand (else another brand's first page), `{brand}/{page}`. " +
            "Pages above the visitor (`portal.level`) are listed with a lock and carry nothing; sections above them and " +
            "hidden ones are left out. Every asset URL comes signed. `redirect`: the path was an old slug or a long " +
            "form, so send the reader to `canonical`. A portal showing no brand answers `view: null`.",
          query: {
            path: { schema: str, description: "The portal path, e.g. logo or other-brand/logo" },
            context: { schema: str, description: "The context the reader starts in, e.g. dark-background" },
            lang: { schema: str, description: "The reader's language, a lowercase tag: ar, en-gb" },
            in: { schema: str, description: "A collection section's id, whose assets `find` narrows" },
            find: { schema: str, description: "Words a reader searches that collection section for" },
          },
          ok: [200, "The page", data(S.PortalSiteView)],
          extra: { 401: { description: "Not in yet: how to get in", content: json(S.PortalGate) } },
        }),
      },
      "/api/v1/portal/{slug}/search": {
        parameters: [path("slug", "The portal's address")],
        get: op({
          summary: "Search a portal",
          scope: "public",
          description:
            "The pages, sections and rules of every brand it shows, from their latest publish, as far as this visitor " +
            "may read: nothing hidden or locked is found. Every word must match, each as a prefix; each brand's best " +
            "first, 20 at most. Beside them, up to 12 of its collections' assets.",
          query: {
            q: { schema: str, description: "Words to find" },
            lang: { schema: str, description: "Search the pages in this language" },
          },
          ok: [200, "Hits and assets", data(z.object({ hits: z.array(S.Hit), assets: z.array(S.Media) }))],
          extra: { 401: { description: "Not in yet: how to get in", content: json(S.PortalGate) } },
        }),
      },
      "/api/v1/portal/{slug}/check": {
        parameters: [path("slug", "The portal's address")],
        post: op({
          summary: "May this portal file be used like this?",
          scope: "public",
          description:
            "POST /api/v1/check for a portal's visitor, behind the same door as the portal (see GET /api/v1/portal/{slug}): " +
            "one of the files it shows, weighed for a use against its license window, territories, channels and model " +
            "release. A file the portal doesn't show is a 404. It never suggests another file.",
          body: S.PortalCheckInput,
          ok: [200, "The verdict", S.PortalCheckResult],
          extra: { 401: { description: "Not in yet: how to get in", content: json(S.PortalGate) } },
        }),
      },
      "/api/v1/portal/{slug}/updates": {
        parameters: [path("slug", "The portal's address")],
        get: op({
          summary: "What's new in a portal's brand",
          scope: "public",
          description:
            "One of its brands' latest publishes, newest first, up to 20, with what each changed for readers. A " +
            "publish's picture is in `media`, signed, while it may be used.",
          query: { brand: { schema: str, description: "One of its brands, by slug; the first when left out" } },
          ok: [200, "Its publishes", z.object({ data: z.array(S.Update), media: z.record(z.string(), S.Media) })],
          extra: { 401: { description: "Not in yet: how to get in", content: json(S.PortalGate) } },
        }),
      },
      "/api/v1/portal/{slug}/requests": {
        parameters: [path("slug", "The portal's address")],
        post: op({
          summary: "Ask for access to a portal, or ask its brand team",
          scope: "public",
          description:
            "Access (`kind` access, the default) is for a `password` or `members` portal. The workspace's admins hear about it. It answers the same whoever asks, and asking twice while one waits is one request. " +
            "A request section's ask (`kind` asset, review or question) works on any portal, says the `page` and `section` it came from, and needs what reading " +
            "that page needs (X-Portal-Password or X-Portal-Key, or a member's session), else 401. The `page` must be one the visitor can read and `section` a " +
            "request section on it; access takes neither.",
          body: S.PortalRequestInput,
          ok: [202, "Received", data(z.object({ received: z.literal(true) }))],
        }),
      },
      "/api/v1/branding": {
        get: op({
          summary: "The brand this request sees",
          scope: "public",
          description:
            "What the product is called and how it looks: the organization whose domain this is, else whoever is signed " +
            "in or holds the key, else the only organization, else the server's (BRAND_*). An organization sets its own " +
            "with PATCH /api/v1/settings/branding.",
          ok: [200, "The brand", data(S.Branding)],
        }),
      },
      "/api/v1/domains": {
        get: op({ summary: "The organization's domains", scope: "admin", description: "Its app's and its portals'. Organization admin.", ok: [200, "Domains", data(z.array(S.Domain))] }),
        post: op({
          summary: "Add a domain",
          scope: "admin",
          description:
            "An address of the organization's own: the app's, or a portal's once the portal picks it. Add the TXT record " +
            "in `record`, point it at the server (`cname`), then POST /api/v1/domains/{host}/verify. The first verified " +
            "one becomes the default, where links in email point. Counts against the `domains` limit.",
          body: S.DomainInput,
          ok: [201, "The domain, not verified yet", data(S.Domain)],
        }),
      },
      "/api/v1/domains/{host}": {
        parameters: [path("host", "e.g. assets.example.com")],
        patch: op({
          summary: "Make a domain the default",
          scope: "admin",
          description: "The app's default address: links in email point there. It must be verified, and not serve a portal.",
          body: S.DomainPatch,
          ok: [200, "The domain", data(S.Domain)],
        }),
        delete: op({ summary: "Remove a domain", scope: "admin", description: "It stops answering at once; a portal served there goes back to /p/{slug}.", ok: [200, "Removed", S.Deleted] }),
      },
      "/api/v1/domains/{host}/verify": {
        parameters: [path("host", "e.g. assets.example.com")],
        post: op({ summary: "Verify a domain", scope: "admin", description: "Looks up its TXT record, and its CNAME when the server names a target, now; a 422 names what is missing and what was found.", ok: [200, "The domain", data(S.Domain)] }),
      },
      "/api/v1/github-orgs": {
        get: op({ summary: "The organization's GitHub accounts", scope: "admin", description: "Named as its own, proved or not. Organization admin.", ok: [200, "GitHub accounts", data(z.array(S.GithubAccount))] }),
        post: op({
          summary: "Name a GitHub account",
          scope: "admin",
          description:
            "A GitHub organization (or account) of the organization's. Put the file in `file` in its `.github` repository, " +
            "holding `file.token`, then POST /api/v1/github-orgs/{login}/verify. Once proved, the organization's BrandHub " +
            "listings are verified, as github.com/{login}, like a verified domain.",
          body: S.GithubInput,
          ok: [201, "The account, not verified yet", data(S.GithubAccount)],
        }),
      },
      "/api/v1/github-orgs/{login}": {
        parameters: [path("login", "e.g. rust-lang")],
        delete: op({ summary: "Remove a GitHub account", scope: "admin", description: "It proves nothing for the organization from then on.", ok: [200, "Removed", S.Deleted] }),
      },
      "/api/v1/github-orgs/{login}/verify": {
        parameters: [path("login", "e.g. rust-lang")],
        post: op({
          summary: "Verify a GitHub account",
          scope: "admin",
          description: "Reads the proof file from the account's `.github` repository, on its default branch, now; a 422 says what is missing.",
          ok: [200, "The account", data(S.GithubAccount)],
        }),
      },
      "/api/v1/hub/{org}/{brand}/reports": {
        parameters: [path("org", "The listing's organization"), path("brand", "The listing's brand")],
        post: op({
          summary: "Report a BrandHub listing",
          scope: "public",
          description:
            "Tell a public listing's owner, and this server's operator, what is wrong with it. Nothing about it is public. " +
            "Anyone may report; a few an hour from one address, and the address is never kept.",
          body: S.HubReportInput,
          ok: [202, "Received", data(z.object({ received: z.literal(true) }))],
        }),
      },
      "/api/v1/hub/{org}/{brand}/claims": {
        parameters: [path("org", "The listing's organization"), path("brand", "The listing's brand")],
        post: op({
          summary: "Claim a BrandHub listing",
          scope: "admin",
          description:
            "Say a public listing is your organization's brand. It takes an organization admin, signed in, whose organization " +
            "proved a domain or a GitHub account: the claim names it, with your email, for the listing's owner and this " +
            "server's operator, who hand it over or take it down.",
          body: S.HubClaimInput,
          ok: [202, "Received", data(z.object({ received: z.literal(true), proof: z.string().describe("What the claim names you as holding") }))],
        }),
      },
      "/api/v1/hub/{org}/{brand}/follow": {
        parameters: [path("org", "The listing's organization"), path("brand", "The listing's brand")],
        put: op({
          summary: "Follow a BrandHub listing",
          scope: "any",
          description: "A person, signed in: the public listing shows in their Following tab on BrandHub. Following one already followed changes nothing.",
          ok: [200, "Following", data(z.object({ following: z.literal(true) }))],
        }),
        delete: op({ summary: "Stop following a BrandHub listing", scope: "any", description: "A person, signed in.", ok: [200, "Not following", data(z.object({ following: z.literal(false) }))] }),
      },
      "/api/v1/hub/reports": {
        get: op({
          summary: "Reports and claims about your listings",
          scope: "admin",
          description: "About the organization's BrandHub listings, open first, newest first, 200 at most. Organization admin.",
          ok: [200, "Reports and claims", data(z.array(S.HubReport))],
        }),
      },
      "/api/v1/hub/reports/{id}": {
        parameters: [path("id", "The report's id")],
        patch: op({
          summary: "Act on a report or a claim",
          scope: "admin",
          description: "Mark it resolved, or open again; `delist` takes its listing off BrandHub (the brand goes private).",
          body: S.HubReportPatch,
          ok: [
            200,
            "The report",
            data(z.object({ id: z.uuid(), status: z.enum(["open", "resolved"]), brand: z.object({ slug: z.string(), visibility: z.enum(["private", "public"]) }) })),
          ],
        }),
      },
      "/api/v1/sso": {
        get: op({
          summary: "The organization's single sign-on",
          scope: "admin",
          description: "Its OpenID Connect provider, or null, and the redirect URI to register with the provider before setting it up. Never the client secret. Organization admin.",
          ok: [200, "Single sign-on", z.object({ data: S.Sso.nullable(), redirectUri: z.url() })],
        }),
        put: op({
          summary: "Set up single sign-on",
          scope: "admin",
          description:
            "One OpenID Connect provider (Okta, Entra ID, Google Workspace...) for the people at one email domain. Register " +
            "`redirectUri` with the provider first, then save its issuer and client here: the endpoints are read from the " +
            "issuer's discovery document now, and a 422 says what was wrong with it. Add the TXT record in `record`, then " +
            "POST /api/v1/sso/verify. From then on anyone at the domain signs in through the provider and joins the " +
            "organization able to read. A new domain is proved again; one another organization proved is refused.",
          body: S.SsoInput,
          ok: [200, "Single sign-on", data(S.Sso)],
        }),
        delete: op({
          summary: "Turn off single sign-on",
          scope: "admin",
          description: "Its people keep their accounts and access, and sign in with a password (reset by email) from then on.",
          ok: [200, "Removed", S.Deleted],
        }),
      },
      "/api/v1/sso/verify": {
        post: op({
          summary: "Verify the single sign-on domain",
          scope: "admin",
          description: "Looks up its TXT record now; a 422 names what is missing and what was found.",
          ok: [200, "Single sign-on", data(S.Sso)],
        }),
      },
      "/api/v1/domains/check": {
        get: op({
          summary: "Does this server serve a domain?",
          scope: "public",
          description: "200 for a verified domain, an organization's or a portal's, or a portal's subdomain of PORTAL_DOMAIN, 404 otherwise. For a reverse proxy issuing TLS certificates on demand, e.g. Caddy's `on_demand_tls { ask }`.",
          query: { domain: { schema: str, description: "A host name, e.g. press.example.com" } },
          ok: [200, "Served", data(z.object({ domain: z.string(), served: z.literal(true) }))],
        }),
      },
      "/api/v1/audit": {
        get: op({
          summary: "The audit log",
          scope: "admin",
          description:
            "Who changed who may do what, newest first: sign-ins, members and grants, invitations, keys, share links, " +
            "workspaces. An organization admin reads the organization's (with its members' sign-ins); a workspace " +
            "admin, the workspace's.",
          query: {
            before: { schema: { type: "string", format: "date-time" }, description: "The `next` of the previous page" },
            limit: { schema: { type: "integer", minimum: 1, maximum: 200, default: 50 }, description: "Page size" },
          },
          ok: [200, "Entries", S.Audit],
        }),
      },
      "/api/v1/settings": {
        get: op({
          summary: "Settings",
          scope: "any",
          description:
            "Every setting that can be set in `context` (organization or workspace), as it applies there, and its " +
            "`source`: set here, inherited from the organization, the server's environment (config files), or the " +
            "default. Secret properties come back null, with whether each is set in `secrets`. Admin on that place.",
          query: { context: { schema: { type: "string", enum: ["organization", "workspace"], default: "organization" }, description: "Where" } },
          ok: [200, "Settings", data(z.array(S.SettingItem))],
        }),
      },
      "/api/v1/settings/{key}": {
        parameters: [path("key", "e.g. email")],
        patch: op({
          summary: "Change a setting",
          scope: "any",
          description: "Starts from what applies now. A blank secret keeps the stored one; null clears it. Admin on that place.",
          query: { context: { schema: { type: "string", enum: ["organization", "workspace"], default: "organization" }, description: "Where" } },
          body: S.SettingPatch,
          ok: [200, "The setting", data(S.SettingItem)],
        }),
        delete: op({
          summary: "Reset a setting",
          scope: "any",
          description: "Forget this place's own value, so the one above it (or the server's) applies again.",
          query: { context: { schema: { type: "string", enum: ["organization", "workspace"], default: "organization" }, description: "Where" } },
          ok: [200, "The setting, as it now applies", data(S.SettingItem)],
        }),
      },
      "/api/v1/email/test": {
        post: op({
          summary: "Send a test email",
          scope: "any",
          description: "Through the organization's email settings, to you or `to`. A 422 carries the provider's reason. Organization admin.",
          body: S.EmailTest,
          ok: [200, "Sent", data(z.object({ sent: z.literal(true), to: z.string() }))],
        }),
      },
      "/api/v1/keys": {
        get: op({
          summary: "Connected agents",
          scope: "read",
          description: "API keys, without secrets, with when each last called and what it left in Review: every key in the workspace for an admin, the agents you connected for anyone else.",
          ok: [200, "Keys, without secrets", data(z.array(S.ApiKey))],
        }),
        post: op({
          summary: "Mint an API key",
          scope: "admin",
          body: S.CreateKey,
          ok: [201, "The key, with its secret, shown this once", data(S.ApiKeyCreated)],
        }),
      },
      "/api/v1/keys/{id}": {
        parameters: [path("id", "Key id")],
        delete: op({ summary: "Revoke an API key", scope: "read", description: "Any key, for an admin; the agents you connected, for anyone.", ok: [200, "Revoked", S.Deleted] }),
      },
      "/api/v1/oauth/server": {
        get: op({ summary: "OAuth authorization server metadata", scope: "public", description: "RFC 8414. Also at /.well-known/oauth-authorization-server.", ok: [200, "Metadata"] }),
      },
      "/api/v1/oauth/resource": {
        get: op({
          summary: "OAuth protected resource metadata",
          scope: "public",
          description: "RFC 9728, for /api/v1/mcp. Also at /.well-known/oauth-protected-resource; a 401 names it in `WWW-Authenticate`.",
          ok: [200, "Metadata"],
        }),
      },
      "/api/v1/oauth/register": {
        post: op({
          summary: "Register an OAuth client",
          scope: "public",
          description: "RFC 7591 dynamic registration. Public clients: no secret, PKCE (S256) instead. Redirects: https, http to loopback, or an app scheme.",
          body: z.object({ client_name: z.string().optional(), redirect_uris: z.array(z.string()).optional(), grant_types: z.array(z.string()).optional() }),
          ok: [201, "The client", z.object({ client_id: z.string(), client_name: z.string(), redirect_uris: z.array(z.string()) })],
        }),
      },
      "/api/v1/oauth/token": {
        post: op({
          summary: "Trade a code for a token",
          scope: "public",
          description:
            "Form-encoded (or JSON). `authorization_code` with `code_verifier`, or the device code grant. The token is an API key bound to " +
            "the person who consented: at most the scope they picked, never more than they can do. It lasts until revoked.",
          ok: [200, "The token", z.object({ access_token: z.string(), token_type: z.literal("Bearer"), scope: z.enum(GRANTABLE) })],
        }),
      },
      "/api/v1/oauth/device": {
        post: op({
          summary: "Start the device flow",
          scope: "public",
          description:
            "RFC 8628, with a registered `client_id`, form-encoded (or JSON). A person approves `user_code` at `verification_uri`; poll the token " +
            "endpoint meanwhile. `scope` (read, propose or write) is what the consent screen offers first, never more than the person may give; " +
            "without it, propose. `artbucket login` asks for write.",
          ok: [200, "Codes", z.object({ device_code: z.string(), user_code: z.string(), verification_uri: z.string(), verification_uri_complete: z.string(), expires_in: z.number(), interval: z.number() })],
        }),
      },
      "/api/v1/oauth/device/{code}": {
        parameters: [path("code", "The user code, e.g. WDJB-MJHT")],
        get: op({ summary: "What a device code asks for", scope: "any", description: "Signed in: the client, and the workspaces and scopes you can give it.", ok: [200, "The request"] }),
        post: op({ summary: "Approve or turn down a device code", scope: "any", description: "Signed in.", body: Consent, ok: [200, "Decided", data(z.object({ allowed: z.boolean() }))] }),
      },
      "/api/v1/oauth/authorize": {
        get: op({
          summary: "What an authorization request asks for",
          scope: "any",
          description: "Signed in, with the client's query (response_type=code, client_id, redirect_uri, code_challenge, S256, state). For the consent screen.",
          ok: [200, "The request"],
        }),
        post: op({
          summary: "Decide an authorization request",
          scope: "any",
          description: "Signed in: the decision and the `request` query it answers. Returns the URL to send the browser to, with a code or `error=access_denied`.",
          body: z.object({ request: z.record(z.string(), z.string()) }).and(Consent),
          ok: [200, "Where to go", data(z.object({ redirect: z.string() }))],
        }),
      },
      "/api/v1/mcp": {
        post: op({
          summary: "MCP (Streamable HTTP, stateless)",
          scope: "read",
          description:
            `JSON-RPC 2.0 for Model Context Protocol clients. Tools: ${Object.keys(TOOL_INPUTS).join(", ")}. ` +
            "Each tool checks its own scope. Resources: a brand's rules (artbucket://brand/rules for the default " +
            "brand, artbucket://brands/{slug}/rules for any, and /{context} after either for one context) and its " +
            "pages as Markdown (artbucket://brands/{slug}/pages/{page}).",
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
          summary: "The original",
          scope: "public",
          description:
            "Bytes, exactly as uploaded, Content Credentials included; `?download` writes current metadata in, except " +
            "into a file with Content Credentials, which it leaves as signed. What the asset is: " +
            "GET /api/v1/assets/{id}/description. Private: served to whoever can see the asset in the library, by " +
            "session or key. Anyone else needs `s`, a signature from POST /api/v1/assets/{id}/signed-url, a share " +
            "link or a portal, or the asset made public. Signed or public, only while approved, unexpired and out of " +
            "embargo, and cached for an hour at most, never past the last day of use. Expired or archived: 410. " +
            "Not there for this caller: 404.",
          query: {
            download: { schema: { type: "string" }, description: "Present: attach, with metadata embedded" },
            s: { schema: { type: "string" }, description: "A signature: lets whoever holds the URL in until it expires. Renditions take it too" },
          },
          ok: [200, "The file"],
          extra: { 410: { description: "Expired or archived", content: json(S.ErrorBody) } },
        }),
      },
      "/c/{id}": {
        parameters: [path("id", "Asset id, any version of it")],
        get: {
          summary: "The current version",
          description:
            "302 to /a/{current id}, with whatever follows the id (a transform) and `?download` carried over: the " +
            "stack's current version, or the asset a person replaced it with. For embedding: a new version reaches " +
            "the page without editing it. Cached for a minute. Public when the asset is, else for whoever can see it " +
            "in the library; /a/ then answers as it always does. Not there for this caller: 404.",
          security: [],
          responses: { 302: { description: "To /a/{current id}" }, 404: { description: "Not there for this caller", content: json(S.ErrorBody) } },
        },
      },
      "/c/{id}/{transform}": {
        parameters: [path("id", "Asset id, any version of it"), path("transform", "As /a/{id}/{transform}")],
        get: {
          summary: "A rendition of the current version",
          security: [],
          responses: { 302: { description: "To /a/{current id}/{transform}" }, 404: { description: "Not there for this caller", content: json(S.ErrorBody) } },
        },
      },
      "/a/{id}/{transform}": {
        parameters: [
          path("id", "Asset id"),
          path("transform", "e.g. w_800,f_webp. Keys: w, h (1-8000, each up to the next of a fixed ladder of sizes), fit (with both w and h), q (1-100, to a multiple of 5), f (jpeg, png, webp, avif)"),
        ],
        get: {
          summary: "A rendition, generated once and cached",
          security: [],
          responses: { 200: { description: "Image bytes" }, 429: { description: "Busy making renditions: try again", content: json(S.ErrorBody) }, default: { description: "An error", content: json(S.ErrorBody) } },
        },
      },
    },
  };
}
