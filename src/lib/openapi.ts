import { z } from "zod";
import * as S from "./schemas.ts";
import { ASSET_TYPES } from "./filters.ts";
import { FONT_CATEGORIES } from "./font.ts";
import { STATES } from "./lifecycle.ts";
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
            "of that asset: filed where it is, with its tags and fields, and current once approved.",
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
            "under `$extensions`. A rule set in one of the brand's fonts aliases it. Sentences and do/don't lists are " +
            "guidance, not tokens, and are left out.",
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
            "collection. A `domain` is served once its TXT record is in place: POST /api/v1/portals/{id}/domain.",
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
          description: "Only what is given changes. A new `domain` needs proving again; null removes it. A left-out `password` stays.",
          body: S.PortalPatch,
          ok: [200, "The portal", data(S.Portal)],
        }),
        delete: op({ summary: "Delete a brand portal", scope: "write", description: "Its address and domain stop answering at once.", ok: [200, "Deleted", S.Deleted] }),
      },
      "/api/v1/portals/{id}/domain": {
        parameters: [path("id", "Portal id")],
        post: op({
          summary: "Verify a portal's domain",
          scope: "write",
          description: "Looks up the TXT record named in `domain.record` now. Found, the portal is served at its domain; a 422 says what was found instead.",
          ok: [200, "The portal", data(S.Portal)],
        }),
      },
      "/api/v1/portals/{id}/requests": {
        parameters: [path("id", "Portal id")],
        get: op({ summary: "Access requests", scope: "write", description: "Who asked in, newest first, and what became of it.", ok: [200, "Requests", data(z.array(S.PortalRequest))] }),
      },
      "/api/v1/portals/{id}/requests/{request}": {
        parameters: [path("id", "Portal id"), path("request", "Request id")],
        patch: op({
          summary: "Approve or deny an access request",
          scope: "write",
          description: `Approved, they get a link of their own for ${90} days (or until the portal closes), emailed when the organization's email works, and in \`url\` to copy.`,
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
            "The rules of one of the portal's brands, read-only, behind the same door as the portal (see GET " +
            "/api/v1/portal/{slug}). A rule's assets are listed only when they may be used, and load from /a/{id}.",
          query: { context: { schema: str, description: "Resolve for one context, e.g. dark-background" } },
          ok: [200, "The guidelines", S.PortalBrand],
          extra: { 401: { description: "Not in yet: how to get in", content: json(S.PortalGate) } },
        }),
      },
      "/api/v1/portal/{slug}/requests": {
        parameters: [path("slug", "The portal's address")],
        post: op({
          summary: "Ask for access to a portal",
          scope: "public",
          description: "For a `password` or `members` portal. The workspace's admins hear about it. It answers the same whoever asks, and asking twice while one waits is one request.",
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
          summary: "Add an app domain",
          scope: "admin",
          description:
            "An address of the organization's own for the whole app. Add the TXT record in `record`, point the domain at " +
            "this server, then POST /api/v1/domains/{host}/verify. Its people sign in there; links in email point there.",
          body: S.DomainInput,
          ok: [201, "The domain, not verified yet", data(S.Domain)],
        }),
      },
      "/api/v1/domains/{host}": {
        parameters: [path("host", "e.g. assets.example.com")],
        delete: op({ summary: "Remove an app domain", scope: "admin", description: "It stops answering at once. A portal's domain is changed on the portal.", ok: [200, "Removed", S.Deleted] }),
      },
      "/api/v1/domains/{host}/verify": {
        parameters: [path("host", "e.g. assets.example.com")],
        post: op({ summary: "Verify an app domain", scope: "admin", description: "Looks up its TXT record now; a 422 names what was found instead.", ok: [200, "The domain", data(S.Domain)] }),
      },
      "/api/v1/domains/check": {
        get: op({
          summary: "Does this server serve a domain?",
          scope: "public",
          description: "200 for a verified domain, an organization's or a portal's, 404 otherwise. For a reverse proxy issuing TLS certificates on demand, e.g. Caddy's `on_demand_tls { ask }`.",
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
          description: "RFC 8628, with a registered `client_id`. A person approves `user_code` at `verification_uri`; poll the token endpoint meanwhile.",
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
            "JSON-RPC 2.0 for Model Context Protocol clients. Tools: search_assets, describe_asset, " +
            "rendition_url, check_use, ingest_asset, import_google_font, propose_tags, my_proposals, brand_rules. Each tool checks its own scope. " +
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
          summary: "The original",
          scope: "public",
          description:
            "Bytes, exactly as uploaded, Content Credentials included; `?download` writes current metadata in, except " +
            "into a file with Content Credentials, which it leaves as signed. What the asset is: " +
            "GET /api/v1/assets/{id}/description. Public while approved, unexpired and out of embargo, and cached for " +
            "an hour at most, never past the last day of use. Expired or archived: 410. Not approved yet: 404, except " +
            "to someone who can see it in the library.",
          query: { download: { schema: { type: "string" }, description: "Present: attach, with metadata embedded" } },
          ok: [200, "The file"],
          extra: { 410: { description: "Expired or archived", content: json(S.ErrorBody) } },
        }),
      },
      "/a/{id}/{transform}": {
        parameters: [
          path("id", "Asset id"),
          path("transform", "e.g. w_800,f_webp. Keys: w, h (1-8000), fit, q (1-100), f (jpeg, png, webp, avif)"),
        ],
        get: {
          summary: "A rendition, generated once and cached",
          security: [],
          responses: { 200: { description: "Image bytes" }, default: { description: "An error", content: json(S.ErrorBody) } },
        },
      },
    },
  };
}
