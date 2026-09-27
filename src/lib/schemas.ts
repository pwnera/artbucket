import { z } from "zod";
import { ABILITIES, RESOURCES } from "./access.ts";
import { COLLECTION_ICONS } from "./collection-icons.ts";
import { FieldDefInput, FieldDefPatch, FIELD_TYPES } from "./fields.ts";
import { FONT_CATEGORIES, GOOGLE_FAMILY } from "./font.ts";
import { STATES, STATUSES } from "./lifecycle.ts";
import { MODEL_RELEASES, ORIGINS, RightsInput, Use } from "./rights.ts";
import { FONT_VALUE, RULE_CONTEXT, RULE_TYPES, RuleInput, RuleOrder, RulePatch } from "./rules.ts";
import { SCOPES } from "./scopes.ts";
import { SETTING_CONTEXTS, SETTING_KEYS, type SettingKey } from "./settings.ts";
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

/** Rights and where it came from: at upload, or later by PATCH. */
const provenance = {
  rights: RightsInput.nullable().optional().describe("What it may be used for; null or {} says nothing"),
  origin: z.enum(ORIGINS).nullable().optional().describe("Defaults to what its Content Credentials say, if any"),
  parentAssetId: uuid.nullable().optional().describe("The asset it was made from: the photo an edit started from, a model's input"),
  generator: z.string().trim().max(200).nullable().optional().describe('The tool or model that made it, e.g. "gpt-image 2.0"'),
  prompt: z.string().trim().max(10000).nullable().optional().describe("For a generated asset: what it was asked for"),
};

/** Where it goes in its lifecycle. */
const lifecycle = {
  versionOf: uuid
    .optional()
    .describe("A new version of this asset: it joins its version stack, collections, tags and fields, and with write on it becomes current"),
  status: z
    .enum(["draft", "active"])
    .optional()
    .describe("draft keeps it out of the library until it is submitted and approved. Without write it is proposed whatever this says"),
};

export const Finalize = z.union([
  z.strictObject({
    token: uuid.describe("From POST /api/v1/uploads, after the PUT"),
    filename: z.string().min(1).max(512),
    mime: z.string().min(1).max(255),
    ...promote,
    ...provenance,
    ...lifecycle,
  }),
  z.strictObject({
    url: z.url({ protocol: /^https?$/ }).max(2048).describe("Public http(s) URL the server fetches. A Figma or Google Docs, Sheets, Slides or Drive link is kept as the link and shows as its embed"),
    filename: z.string().min(1).max(512).optional().describe("Defaults to the URL's last path segment, or a linked file's title"),
    ...promote,
    ...provenance,
    ...lifecycle,
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
    .enum(STATUSES)
    .optional()
    .describe(
      '"proposed" submits a draft for review; "active" approves it; "rejected" turns it down and keeps it, with `reviewNote`; "archived" retires it, and /a/{id} answers 410. Anything but submitting or reworking a draft takes approve',
    ),
  reviewNote: z.string().max(2000).nullable().optional().describe("Why it was rejected, for whoever proposed it"),
  proposedTags: tags.optional().describe("Replaces the pending suggestions; [] dismisses them all"),
  ...provenance,
  rights: provenance.rights.describe("Replaces them whole; null clears"),
  supersededBy: uuid.nullable().optional().describe("The asset that replaces this one; /api/v1/check then refuses it and names that"),
  private: z.boolean().optional().describe("Only people with a grant on it, or on a collection it is in, and admins see it"),
});

export const CheckInput = Use.extend({
  asset: uuid,
  context: z.string().regex(RULE_CONTEXT).max(64).optional().describe("The brand context it is for, e.g. dark-background"),
  brand: z.string().max(60).optional().describe("Only this brand's rules; every brand's when left out"),
}).strict();

export const ProposeTags = z.strictObject({
  tags: z.array(z.string().min(1).max(MAX_TAG_LENGTH)).min(1).max(50),
});

const icon = z.enum(COLLECTION_ICONS).nullable().optional();
const isPrivate = z
  .boolean()
  .optional()
  .describe("Only people with a grant on it and admins see it; assets only in private collections are private too");
export const CollectionCreate = z.strictObject({
  name: z.string().trim().min(1).max(120),
  icon,
  fields: values.optional().describe("Values its members inherit"),
  private: isPrivate,
});
export const CollectionPatch = z.strictObject({
  name: z.string().trim().min(1).max(120).optional(),
  icon,
  fields: values.optional().describe("Merges; null clears; members re-inherit"),
  private: isPrivate,
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

const named = z.strictObject({ name: z.string().trim().min(1).max(80) });
export const CreateOrganization = named;
export const OrganizationPatch = named;
export const CreateWorkspace = named;
export const WorkspacePatch = named;

const abilities = z.array(z.enum(ABILITIES));
const on = {
  resource: z.enum(RESOURCES).describe("What the grant is on; it reaches everything inside it"),
  resourceId: uuid.describe("The organization's, workspace's, collection's or asset's id"),
  scope: z.enum(SCOPES),
  limits: abilities
    .max(ABILITIES.length)
    .optional()
    .describe("What the scope would allow but this grant doesn't: delete, share (links and upload requests), approve (review), setup (fields and brand)"),
};
export const GrantInput = z.strictObject({ user: z.string().min(1).max(64).describe("A member's user id, from /api/v1/members"), ...on });
export const InvitationInput = z.strictObject({ email: z.email().max(320), ...on });

export const ShareCreate = z.strictObject({
  kind: z.enum(["view", "upload"]).describe("view: see and download; upload: send files in, as proposals"),
  collection: uuid.optional().describe("The collection it shows, or files uploads into"),
  asset: uuid.optional().describe("For a view link: one asset instead of a collection"),
  name: z.string().trim().max(120).optional().describe("What the holder sees it called, e.g. Press kit"),
  password: z.string().min(4).max(200).optional(),
  expiresAt: z.iso.datetime({ offset: true }).optional().describe("It stops working then"),
  emails: z.array(z.email().max(320)).max(20).optional().describe("Email the link to these people, through the organization's email"),
});
export const ShareSend = z.strictObject({ emails: z.array(z.email().max(320)).min(1).max(20) });
export const ShareFinalize = z.strictObject({
  token: uuid.describe("From POST /api/v1/shared/{token}/uploads, after the PUT"),
  filename: z.string().min(1).max(512),
  mime: z.string().min(1).max(255),
});

// ---- responses --------------------------------------------------------------

const date = z.iso.datetime({ offset: true });

export const Rights = z
  .object({
    license: z.string().nullable(),
    territories: z.array(z.string()).describe("ISO 3166-1 alpha-2; empty: anywhere"),
    channels: z.array(z.string()).describe("empty: any use"),
    embargo: z.iso.date().nullable().describe("Not before this day"),
    expires: z.iso.date().nullable().describe("The last day it may be used"),
    modelRelease: z.enum(MODEL_RELEASES).nullable(),
  })
  .nullable();

export const C2pa = z
  .object({
    manifests: z.number().int(),
    generator: z.string().nullable().describe("The app that signed it"),
    title: z.string().nullable(),
    signedBy: z.string().nullable().describe("The signing certificate's organization, as the file claims it; not verified"),
    actions: z.array(z.string()),
    digitalSourceType: z.string().nullable().describe("IPTC: digitalCapture, trainedAlgorithmicMedia..."),
    softwareAgent: z.string().nullable().describe("The tool the actions name, often the model"),
    ingredients: z.number().int(),
  })
  .nullable()
  .describe("Content Credentials read from the file; the original keeps the signed manifest");

const provenanceOut = {
  origin: z.enum(ORIGINS).nullable(),
  parentAssetId: uuid.nullable(),
  generator: z.string().nullable(),
  prompt: z.string().nullable(),
  c2pa: C2pa,
};
const fieldValues = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));

export const Asset = z.object({
  id: uuid,
  workspaceId: uuid,
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
  status: z.enum(STATUSES).describe("draft, proposed (in review), active (approved), archived or rejected"),
  state: z.enum(STATES).describe("The status; expired for an approved asset past its last day of use; deleted, until restored or purged"),
  deletedAt: date.nullable().describe("When it was deleted: restorable for 30 days, then purged"),
  stackId: uuid.nullable().describe("Versions of one thing share a stack; null when it has one version"),
  version: z.number().int().nullable().describe("Its number in the stack"),
  current: z.boolean().describe("Its stack's current approved version: the others are superseded by it"),
  proposedBy: z.string().nullable().describe("For a proposal: who made it, a person's or an API key's name"),
  reviewNote: z.string().nullable().describe("Why a person rejected it"),
  proposedTags: z.array(z.string()),
  rights: Rights,
  ...provenanceOut,
  supersededBy: uuid.nullable().describe("The asset that replaces this one"),
  private: z.boolean().describe("Its own flag; it is private too when every collection it is in is"),
  collections: z.array(uuid),
  createdAt: date,
  updatedAt: date,
});

const Count = z.object({ value: z.string(), count: z.number().int() });
export const Listing = z.object({
  data: z.array(Asset),
  total: z.number().int().describe("Every match; page through with offset and limit"),
  facets: z.object({
    tags: z.array(Count),
    types: z.array(Count),
    states: z.array(Count).describe("Counted over every state, so each is a status filter away"),
    fields: z.record(z.string(), z.array(Count)),
  }),
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
  private: z.boolean(),
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
  actor: z.string().describe("Who: a person's name, an API key's name, or \"web\" for the app without an account"),
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
  lastUsedAt: date.nullable().describe("The last request that presented it"),
  calls: z.number().int().describe("Requests that presented it"),
  owner: z.string().nullable().describe("Whose agent it is, for one a person connected; null for a key an admin made"),
  waiting: z.number().int().describe("Assets it proposed that wait in Review"),
});
export const ApiKeyCreated = ApiKey.extend({
  secret: z.string().describe("Shown once. Send as `Authorization: Bearer <secret>`"),
});

/** What `GET /api/v1/assets/{id}/description` returns. */
export const Description = z.object({
  id: uuid,
  filename: z.string(),
  mime: z.string(),
  size: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  sha256: z.string(),
  status: z.enum(STATUSES),
  state: z.enum(STATES).describe("Only active is served at /a/{id} to anyone; expired and archived answer 410"),
  version: z.number().int().nullable().describe("Its number in its stack of versions; null when it has one"),
  current: z.boolean().describe("The version to use: its stack's current one, or the only one"),
  proposedBy: z.string().nullable(),
  reviewNote: z.string().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  creator: z.string().nullable(),
  copyright: z.string().nullable(),
  tags: z.array(z.string()),
  fields: fieldValues.describe("Effective values: own over inherited"),
  collections: z.array(uuid),
  rights: Rights,
  provenance: z.object(provenanceOut),
  supersededBy: uuid.nullable().describe("Replaced: use this one instead"),
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
  actor: z.string().describe("Who: a person's name, an API key's name, or \"web\" for the app without an account"),
  agent: z.boolean().describe("Done with an API key"),
  verb: z.enum([
    "added",
    "suggested",
    "approved",
    "rejected",
    "deleted",
    "suggested_tags",
    "archived",
    "unarchived",
    "made_current",
    "edited_rules",
    "restored_rules",
  ]),
  label: z.string().describe("The asset's title or filename then, or the brand's name"),
  assetId: uuid.nullable(),
  brand: z.object({ slug: z.string(), name: z.string(), version: z.number().int() }).nullable(),
  detail: z
    .object({ tags: z.array(z.string()), note: z.string(), version: z.number().int(), rules: z.array(z.string()), summary: z.string() })
    .partial()
    .nullable(),
});
export const Activity = z.object({
  data: z.array(ActivityItem),
  next: date.nullable().describe("Pass as `before` for the next page; null at the end"),
});

export const CheckResult = z.object({
  allowed: z.boolean().describe("false when any reason is blocking"),
  asset: z.object({ id: uuid, title: z.string(), url: z.url() }),
  use: z.object({ channel: z.string(), territory: z.string(), date: z.iso.date(), context: z.string() }).partial(),
  reasons: z
    .array(
      z.object({
        code: z.enum(["not_approved", "deleted", "archived", "superseded", "embargoed", "expired", "territory", "channel", "model_release", "context"]),
        message: z.string(),
        blocking: z.boolean().describe("false: go ahead, but know this"),
      }),
    )
    .describe("Why not, and what to know"),
  suggest: z
    .array(z.object({ id: uuid, title: z.string(), url: z.url(), why: z.string() }))
    .describe("What to use instead: the replacement, the brand's variant for the context"),
});

export const Deleted = z.object({ data: z.object({ deleted: z.literal(true) }) });

const limit = (what: string) => z.number().nullable().describe(`${what}; null: no limit`);
export const Usage = z.object({
  limits: z.object({
    storage: limit("Bytes of assets"),
    editors: limit("People with write or admin, invitations included"),
    workspaces: limit("Workspaces"),
    brands: limit("Brands, over all workspaces"),
    features: z.array(z.enum(["agents", "shares"])).nullable().describe("What it may use; null: everything"),
    readOnly: z.boolean(),
  }).describe("Set by whoever runs the server; never by the organization"),
  used: z.object({ storage: z.number(), editors: z.number().int(), workspaces: z.number().int(), brands: z.number().int() }),
  traffic: z.object({
    days: z.number().int().describe("How far back"),
    workspaces: z.array(z.object({ id: uuid, name: z.string(), storage: z.number(), requests: z.number().int(), bytes: z.number() })),
    daily: z.array(z.object({ day: z.string(), requests: z.number().int(), bytes: z.number() })),
  }).describe("What /a/{id} served: originals, renditions and downloads"),
});

// ---- people and access ------------------------------------------------------

const scope = z.enum(SCOPES).nullable();
export const Organization = z.object({ id: uuid, slug: z.string(), name: z.string() });
export const WorkspaceRef = z.object({ id: uuid, slug: z.string(), name: z.string(), organization: Organization });
export const WorkspaceItem = z.object({ id: uuid, slug: z.string(), name: z.string(), scope: scope.describe("Yours on all of it; null when a grant inside it is all you have") });
export const OrganizationCreated = Organization.extend({ workspace: z.object({ id: uuid, slug: z.string(), name: z.string() }) });

export const Me = z.object({
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }).nullable().describe("Signed in as; null for a key or nobody"),
  key: z.boolean().describe("Calling with an API key"),
  actor: z.string().describe("How history names you"),
  workspace: WorkspaceRef.describe("Where this request acts: a key's workspace, or the one picked in the app"),
  scope: scope.describe("On the whole workspace"),
  orgScope: scope.describe("On its organization; admin there manages people and workspaces"),
  readOnly: z.boolean().describe("The organization is read-only: whatever the grants say, the scope is read at most"),
  narrowed: z.boolean().describe("No scope on the workspace, but grants on some collections or assets in it"),
  email: z.boolean().describe("The organization can send email now: invitations and links go out by mail"),
  narrow: z
    .object({ collections: z.record(uuid, z.enum(SCOPES)), assets: z.record(uuid, z.enum(SCOPES)) })
    .describe("Grants on single collections and assets here, by id: what reaches past the workspace scope"),
  off: z
    .object({ workspace: abilities, collections: z.record(uuid, abilities), assets: z.record(uuid, abilities) })
    .describe("Abilities your grants have switched off, on the workspace and on single collections and assets"),
  hidden: z.array(uuid).describe("The workspace's private collections: only a grant on one, or admin, reaches it"),
  workspaces: z.array(WorkspaceRef).describe("Every workspace you can switch to"),
  auth: z.object({
    signUp: z.boolean().describe("Nobody has an account yet: the first one made is the admin of everything"),
    open: z.boolean().describe("Anyone may make an account, and gets an organization of their own (SIGNUP=open)"),
    oidc: z.object({ name: z.string() }).nullable().describe("Single sign-on, when configured"),
    anonymous: scope.describe("What a request without a key or a session may do"),
    passwordReset: z.boolean().describe("A forgotten password can be reset by email"),
  }),
});

export const Grant = z.object({
  id: uuid,
  resource: z.enum(RESOURCES),
  resourceId: uuid,
  workspaceId: uuid.nullable(),
  label: z.string().nullable().describe("The name of what it is on"),
  scope: z.enum(SCOPES),
  limits: abilities.describe("What the scope would allow but this grant doesn't"),
  createdAt: date,
});
export const Invitation = z.object({
  id: uuid,
  email: z.string(),
  resource: z.enum(RESOURCES),
  resourceId: uuid,
  label: z.string().nullable(),
  scope: z.enum(SCOPES),
  limits: abilities,
  invitedBy: z.string(),
  expiresAt: date,
  createdAt: date,
  url: z.url().nullable().describe("The link, to copy again; null for one whose link can't be opened any more: send it again"),
});
export const InvitationCreated = Invitation.extend({
  url: z.url().describe("Emailed to them when the organization can send email; send it yourself otherwise"),
  emailed: z.boolean(),
});
export const Members = z.object({
  data: z.array(z.object({ id: z.string(), name: z.string(), email: z.string(), grants: z.array(Grant) })),
  invitations: z.array(Invitation).describe("Waiting to be taken"),
});
export const InvitationInfo = z.object({
  email: z.string().describe("Who it was meant for"),
  organization: z.string(),
  resource: z.enum(RESOURCES),
  label: z.string().nullable(),
  scope: z.enum(SCOPES),
  invitedBy: z.string(),
  expiresAt: date,
  signUp: z.boolean().describe("No account has this email yet"),
});
export const Accepted = z.object({ organizationId: uuid, workspaceId: uuid.nullable(), resource: z.enum(RESOURCES), scope: z.enum(SCOPES) });

export const Share = z.object({
  id: uuid,
  kind: z.enum(["view", "upload"]),
  name: z.string().nullable(),
  target: z.object({ type: z.enum(["collection", "asset", "workspace"]), id: uuid.nullable(), label: z.string().nullable() }),
  url: z.url(),
  password: z.boolean(),
  expiresAt: date.nullable(),
  expired: z.boolean(),
  createdBy: z.string(),
  createdAt: date,
});
export const Shared = z.object({
  share: z.object({
    kind: z.enum(["view", "upload"]),
    name: z.string().nullable(),
    workspace: z.string().nullable(),
    organization: z.string().nullable(),
    target: Share.shape.target,
    expiresAt: date.nullable(),
  }),
  data: z.array(
    z.object({
      id: uuid,
      filename: z.string(),
      title: z.string().nullable(),
      description: z.string().nullable(),
      creator: z.string().nullable(),
      copyright: z.string().nullable(),
      mime: z.string(),
      size: z.number().int(),
      width: z.number().int().nullable(),
      height: z.number().int().nullable(),
      url: z.url(),
      download: z.url(),
      thumbnail: z.url().nullable(),
    }),
  ),
  total: z.number().int(),
});

export const AuditEntry = z.object({
  id: uuid,
  at: date,
  organizationId: uuid.nullable(),
  workspaceId: uuid.nullable(),
  actor: z.string(),
  userId: z.string().nullable(),
  keyId: uuid.nullable(),
  action: z.string().describe("user.signed_in, grant.set, key.created, share.revoked..."),
  target: z.string().nullable(),
  detail: z.record(z.string(), z.unknown()).nullable(),
  ip: z.string().nullable(),
});
export const SettingItem = z.object({
  key: z.enum(SETTING_KEYS as [SettingKey, ...SettingKey[]]),
  label: z.string(),
  context: z.enum(SETTING_CONTEXTS),
  value: z.record(z.string(), z.unknown()).describe("As it applies here; secret properties are null"),
  secrets: z.record(z.string(), z.boolean()).describe("Whether each secret property is set"),
  source: z.enum(["workspace", "organization", "environment", "default"]).describe("The narrowest place any of it comes from"),
  sources: z.record(z.string(), z.enum(["workspace", "organization", "environment", "default"])).describe("Where each property comes from"),
  own: z.boolean().describe("Set here: resetting it lets what is above apply"),
});
export const SettingPatch = z.record(z.string(), z.unknown()).describe("Properties to change; a blank secret keeps it, null clears it");
export const EmailTest = z.strictObject({ to: z.email().optional().describe("Defaults to you") });

export const Audit = z.object({ data: z.array(AuditEntry), next: date.nullable().describe("Pass as `before` for the next page") });

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
