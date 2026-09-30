import { z } from "zod";
import { ABILITIES, RESOURCES } from "./access.ts";
import { COLLECTION_ICONS } from "./collection-icons.ts";
import { SURFACES } from "./insights.ts";
import { FEATURES } from "./limits.ts";
import { FieldDefInput, FieldDefPatch, FIELD_TYPES } from "./fields.ts";
import { FONT_CATEGORIES, GOOGLE_FAMILY } from "./font.ts";
import { ICON_GROUP_NAMES, ICON_NAME, ICON_PREFIX } from "./icons.ts";
import { STATES, STATUSES } from "./lifecycle.ts";
import { MODEL_RELEASES, ORIGINS, RightsInput, Use } from "./rights.ts";
import { FONT_VALUE, RULE_CONTEXT, RULE_TYPES, ruleContext, RuleInput, ruleKey, RuleOrder, RulePatch } from "./rules.ts";
import { SCOPES } from "./scopes.ts";
import { SETTING_CONTEXTS, SETTING_KEYS, type SettingKey } from "./settings.ts";
import { TOKEN_FORMAT_IDS } from "./tokens.ts";
import { MAX_TAG_LENGTH, MAX_TAGS } from "./search.ts";
import { FITS, FORMATS } from "./transform.ts";
import { PORTAL_ACCESS, PORTAL_SLUG, PortalSite, PortalTheme, PortalThemePatch, PRESET_IDS } from "./portal.ts";
import { AUDIENCES, PAGE_LAYOUTS, PageInput, PageOp, pageSlug, REQUEST_KINDS, sectionId, SectionText, WIDTHS } from "./pages.ts";
import { ThemePatch, ThemeSettings } from "./brand-theme.ts";
import { MAX_COMMENT } from "./comments.ts";
import { REPORT_REASONS } from "./hub.ts";

/**
 * Every shape /api/v1 accepts or returns. Route handlers validate with these,
 * and lib/openapi.ts documents with the same objects, so the spec cannot say
 * one thing while the code does another.
 *
 * Relative imports: `pnpm test` runs this under plain Node, which has no `@/`.
 */

export { FieldDefInput, FieldDefPatch, PageInput, RuleInput, RuleOrder, RulePatch, ThemePatch, ThemeSettings };

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

const iconPrefix = z.string().regex(ICON_PREFIX, "An Iconify set's prefix, e.g. tabler").max(60);

export const IconSetQuery = z.object({
  q: z.string().max(80).optional().describe("Words in the set's name, author or license"),
  group: z.enum(ICON_GROUP_NAMES).optional().describe("Interface, Logos, Emoji, Flags or Other"),
  limit: z.coerce.number().int().min(1).max(300).default(60),
});

export const IconBrowseQuery = z.object({
  prefix: iconPrefix,
  q: z.string().max(80).optional().describe("Words in the icon's name"),
  category: z.string().max(80).optional().describe("One of the set's categories"),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(96),
});

export const IconImport = z.strictObject({
  prefix: iconPrefix.describe("The set, as Iconify names it: tabler, lucide, simple-icons"),
  icons: z
    .array(z.string().regex(ICON_NAME, "An icon's name, e.g. arrow-right").max(120))
    .min(1)
    .max(100)
    .refine((a) => new Set(a).size === a.length, "Each icon once")
    .describe("Its icons' names, 100 at a time"),
  ...promote,
});

export const TokenQuery = z.object({
  format: z.enum(TOKEN_FORMAT_IDS).default("css").describe("css, scss, less, tailwind, tailwind3, ts, shadcn, mui, chakra, json (W3C design tokens) or designmd (DESIGN.md, with guidance)"),
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
  proposedFields: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("The suggested values to keep waiting, by key; the rest are dismissed. {} dismisses them all. Accept one by setting it in `fields`"),
  ...provenance,
  rights: provenance.rights.describe("Replaces them whole; null clears"),
  supersededBy: uuid.nullable().optional().describe("The asset that replaces this one; /api/v1/check then refuses it and names that"),
  private: z.boolean().optional().describe("Only people with a grant on it, or on a collection it is in, and admins see it"),
  public: z.boolean().optional().describe("Serve it at /a/{id} to anyone, for embedding, while it may be used. Takes share on it"),
  focus: z
    .strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
    .nullable()
    .optional()
    .describe("The point crops keep in frame, from the top left, 0 to 1; null clears"),
});

export const CheckInput = Use.extend({
  asset: uuid,
  context: z.string().regex(RULE_CONTEXT).max(64).optional().describe("The brand context it is for, e.g. dark-background"),
  brand: z.string().max(60).optional().describe("Only this brand's rules; every brand's when left out"),
}).strict();

/** POST /api/v1/portal/{slug}/check: one of the portal's files, for a use. No context: a portal's check weighs the rights alone. */
export const PortalCheckInput = Use.extend({ asset: uuid }).strict();

/** POST /api/v1/brands/{slug}/pages, and generate_pages: `set` adds one topic's pages beside the ones there are. */
export const GeneratePagesInput = z.strictObject({
  set: z
    .strictObject({
      topic: z.string().trim().min(1).max(40).describe("e.g. logo"),
      parent: pageSlug.optional().describe("The page they go under; a new page named for the topic when left out"),
    })
    .optional()
    .describe("Six pages on one topic under parent, beside pages that exist"),
});

export const ProposeTags = z.strictObject({
  tags: z.array(z.string().min(1).max(MAX_TAG_LENGTH)).min(1).max(50),
});

export const ProposeFields = z.strictObject({
  fields: z
    .record(z.string(), z.unknown())
    .refine((v) => Object.keys(v).length > 0 && Object.keys(v).length <= 50, "One to fifty values")
    .describe("Custom field values by key (GET /api/v1/fields), each checked against its field"),
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
  template: z
    .enum(["firefox", "rust", "blender"])
    .optional()
    .describe("Start from a showcase brand's rules, theme, pages and logos, to edit into your own"),
}).refine((b) => !(b.from && b.template), "Start from a brand or a template, not both");
export const BrandPatch = z.strictObject({
  name: z.string().trim().min(1).max(80).optional(),
  slug: brandSlug.optional(),
  default: z.literal(true).optional().describe("Make this the default brand"),
});
export const VersionPatch = z.strictObject({
  name: z.string().trim().min(1).max(120).nullable().describe("Keep this version as a named checkpoint; null clears it"),
});

/** set_rules over REST: all of it or none. */
export const RuleBatch = z.strictObject({
  set: z.array(RuleInput).max(100).optional().describe("Rules to make, or change where the key and context exist"),
  remove: z
    .array(z.strictObject({ key: ruleKey, context: ruleContext.nullable().optional().describe("Only this context's version; the key and every version when left out") }))
    .max(100)
    .optional(),
});
export const PageEdit = z.strictObject({ ops: z.array(PageOp).min(1).max(50).describe("Applied in order; all or none") });
export const PublishInput = z.strictObject({
  note: z.string().trim().max(2000).optional().describe("What changed, for readers of the history and What's new"),
  image: uuid.optional().describe("An asset shown beside the note"),
});

const commentBody = z.string().trim().min(1).max(MAX_COMMENT);
export const CommentCreate = z
  .strictObject({
    page: pageSlug.optional().describe("The page it is on; a slug it had before a rename finds it too"),
    section: sectionId.nullable().optional().describe("A section's id on the page; left out or null: the page as a whole"),
    parent: uuid.optional().describe("Reply to this thread instead; its page and section are the reply's. A reply to a reply joins its thread"),
    body: commentBody.describe("Plain text"),
  })
  .refine((c) => !c.parent !== !c.page, "Send `page` for a new thread, or `parent` for a reply, not both")
  .refine((c) => !c.parent || c.section === undefined, "A reply is on its thread's section: leave `section` out");
export const CommentPatch = z
  .strictObject({
    body: commentBody.optional().describe("Your own comment's new text"),
    resolved: z.boolean().optional().describe("Resolve the thread, or reopen it; a thread's first comment only"),
  })
  .refine((p) => p.body !== undefined || p.resolved !== undefined, "Send `body`, `resolved`, or both");

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

const portal = {
  name: z.string().trim().min(1).max(120).describe("What visitors see it called, e.g. Press kit"),
  slug: z.string().regex(PORTAL_SLUG).describe("Its address: /p/{slug}, and {slug}.PORTAL_DOMAIN when the server has one. Lowercase letters, digits and dashes"),
  intro: z.string().trim().max(4000).nullable().optional().describe("A few paragraphs under the name"),
  access: z.enum(PORTAL_ACCESS).describe("public: anyone; password: whoever has it; members: people with access to the workspace. Either of the last two takes access requests"),
  password: z.string().min(4).max(200).optional().describe("For access: password. Left out on a change, it stays"),
  expiresAt: z.iso.datetime({ offset: true }).nullable().optional().describe("It closes then"),
  presets: z.array(z.enum(PRESET_IDS)).max(PRESET_IDS.length).optional().describe("What images download as; web, print and social when left out"),
  theme: PortalThemePatch.optional().describe("Left out, a setting stays; null clears it"),
  collections: z.array(uuid).max(50).optional().describe("Collections it shows, in this order. With brands, at least one of the two"),
  brands: z.array(z.string().min(1).max(64)).max(20).optional().describe("Brands whose guidelines it publishes, by slug, each a tab beside the assets, in this order"),
  site: PortalSite.optional().describe("Its footer, quick grab, terms, and whether search engines may list it (public portals only). Replaces the whole set"),
  domain: z
    .string()
    .max(253)
    .nullable()
    .optional()
    .describe("One of the organization's verified domains (/api/v1/domains), e.g. press.example.com, to serve it at; null: none"),
};
export const PortalInput = z.strictObject({ ...portal, access: portal.access.default("public") });
export const PortalPatch = z.strictObject(portal).partial();
export const PortalRequestInput = z.strictObject({
  email: z.email().max(320),
  name: z.string().trim().max(120).optional(),
  note: z.string().trim().max(2000).optional().describe("Who you are and what you need it for"),
  kind: z.enum(REQUEST_KINDS).optional().describe("access when left out; a request section asks for an asset, a review or an answer"),
  page: pageSlug.optional().describe("The page a request section sits on"),
  section: sectionId.optional().describe("The request section, by id"),
});
export const PortalDecision = z.strictObject({ status: z.enum(["approved", "denied"]) });
export const DomainInput = z.strictObject({ host: z.string().min(1).max(253).describe("A host name of the organization's, e.g. assets.example.com") });
export const SsoInput = z.strictObject({
  issuer: z
    .url({ protocol: /^https$/ })
    .max(2000)
    .describe("The provider's issuer URL: its discovery document is read from {issuer}/.well-known/openid-configuration"),
  clientId: z.string().trim().min(1).max(500).describe("The app's client ID at the provider"),
  clientSecret: z.string().min(1).max(2000).optional().describe("The app's client secret. Needed to set it up; left out on a change, the one kept stays"),
  domain: z.string().min(1).max(253).describe("The email domain its people sign in with, e.g. acme.com. Proved by a TXT record"),
});
export const GithubInput = z.strictObject({ login: z.string().min(1).max(100).describe("A GitHub account of the organization's: rust-lang, or https://github.com/rust-lang") });
export const HubReportInput = z.strictObject({
  reason: z.enum(Object.keys(REPORT_REASONS) as [keyof typeof REPORT_REASONS, ...(keyof typeof REPORT_REASONS)[]]).describe(Object.entries(REPORT_REASONS).map(([k, v]) => `${k}: ${v}`).join("; ")),
  note: z.string().trim().max(2000).optional().describe("What is wrong, in your words"),
  contact: z.string().trim().max(200).optional().describe("How the listing's owner may reach you, if you want them to: seen by them and this server's operator only"),
});
export const HubClaimInput = z.strictObject({
  note: z.string().trim().max(2000).optional().describe("Who you are to the brand, and whether you want the listing handed over or taken down"),
});
export const HubReportPatch = z.strictObject({
  status: z.enum(["open", "resolved"]).optional(),
  delist: z.literal(true).optional().describe("Take the listing off BrandHub: the brand goes private"),
});
export const DomainPatch = z.strictObject({ primary: z.literal(true).describe("Make it the default: where links in email point") });
export const SignedUrlInput = z.strictObject({
  expiresIn: z
    .number()
    .int()
    .min(60)
    .max(365 * 86400)
    .default(7 * 86400)
    .describe("Seconds it works for: a minute to a year, a week when left out"),
});

// ---- responses --------------------------------------------------------------

const date = z.iso.datetime({ offset: true });
export const Branding = z.object({
  name: z.string().describe("What the product is called here"),
  tagline: z.string().nullable(),
  logo: z.string().nullable().describe("A URL on this host"),
  icon: z.string().nullable().describe("A URL on this host, square"),
  accent: z.string().nullable(),
  emailFooter: z.string().nullable(),
  custom: z.boolean().describe("Anything differs from the product's own look"),
});

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
  via: z.enum(["agent", "import"]).nullable().describe("How it arrived when not from a person: agent, through an API key; import, brought in by the server (an icon set, Google Fonts)"),
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
      focus: z.object({ x: z.number(), y: z.number() }).describe("The point crops keep in frame, 0 to 1 from the top left"),
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
  proposedFields: fieldValues.describe("Custom field values an agent suggested, waiting for a person to accept or dismiss"),
  rights: Rights,
  ...provenanceOut,
  supersededBy: uuid.nullable().describe("The asset that replaces this one"),
  private: z.boolean().describe("Its own flag; it is private too when every collection it is in is"),
  public: z.boolean().describe("Served at /a/{id} to anyone while it may be used; otherwise to people who can see it, and signed URLs"),
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
  label: z.string().nullable().describe("The heading readers see; null: the key, in words"),
  context: z.string().nullable().describe("null: the default"),
  type: z.enum(RULE_TYPES),
  value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()])), FONT_VALUE]),
  spec: z.record(z.string(), z.unknown()).nullable().describe("Details beyond the value, by type: RuleInput's spec"),
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
  visibility: z.enum(["private", "public"]).describe("Who sees it on BrandHub"),
  rules: z.number().int(),
  createdAt: date,
});

// ---- brand pages ------------------------------------------------------------
// Open where later waves grow them: template and tone are strings, props a record, item fields optional.

export const Item = z
  .object({
    key: z.string().describe("A rule it shows"),
    asset: uuid,
    title: z.string(),
    text: z.string().describe("Markdown"),
    verdict: z.enum(["do", "dont"]),
    caption: z.string(),
    link: z.string(),
    label: z.string(),
    icon: z.string(),
    download: z.boolean().describe("false: for reference, never offered as a download"),
  })
  .partial()
  .describe("A thing a template lists: a do or a don't with its picture, a picture in a gallery");

export const Section = z.object({
  id: z.string(),
  template: z.string().describe("GET /api/v1/brand/templates lists them"),
  title: z.string(),
  body: z.string().describe("Markdown"),
  width: z.enum(WIDTHS),
  columns: z.number().int(),
  tone: z.string().describe("Its ground: plain, tint, brand, panel, dark, color, image or pattern"),
  hidden: z.boolean(),
  keys: z.array(z.string()).describe("The rules it shows, by key, in order"),
  props: z.record(z.string(), z.unknown()).describe("Its template's own settings"),
  // Left out when not set.
  eyebrow: z.string().optional(),
  lede: z.string().optional(),
  aside: z.string().optional().describe("Markdown"),
  tab: z.string().optional().describe("Sections sharing a tab name show under one tab"),
  background: z.object({ color: z.string(), to: z.string(), angle: z.number(), image: uuid, scrim: z.number() }).partial().optional(),
  items: z.array(Item).optional(),
  audience: z.enum(AUDIENCES).optional(),
  contexts: z.array(z.string()).optional().describe("A tab per context, its rules resolved for each"),
  only: z.string().optional().describe("Shown only in this context"),
  translations: z.record(z.string(), SectionText).optional().describe("Its words by language tag; readers get them already in their language"),
});

const pageFields = {
  slug: z.string(),
  title: z.string(),
  position: z.number().int(),
  hidden: z.boolean(),
  parent: z.string().nullable().describe("The page it sits under; null at the top"),
  eyebrow: z.string().nullable(),
  lede: z.string().nullable(),
  cover: uuid.nullable().describe("Its header and card image"),
  icon: z.string().nullable(),
  audience: z.enum(AUDIENCES).describe("On portals: who may read it"),
  tabs: z.boolean().describe("Its child pages show as tabs across its top"),
  aliases: z.array(z.string()).describe("Slugs it had before a rename: they still find it"),
  layout: z.enum(PAGE_LAYOUTS).describe("landing: a front with no nav column, on-this-page or pager; book: a chapter"),
  updatedAt: date.describe("The last change to what it says"),
};
const pageText = z.object({ title: z.string(), eyebrow: z.string(), lede: z.string() }).partial();
export const BrandPage = z.object({
  ...pageFields,
  translations: z.record(z.string(), pageText).nullable().optional().describe("Its title, eyebrow and lede by language tag"),
  sections: z.array(Section),
});
export const PageSummary = z.object({
  ...pageFields,
  sections: z.number().int().describe("How many"),
  keys: z.array(z.string()).describe("The rules its sections show, by key: keys, items' keys and background colors"),
});

const warnings = z.array(z.string()).describe("What a reader would trip on, though it saves: links that go nowhere, keys with no rule");
const readerUrl = z.url().describe("Where a member reads it in the app");
export const PageRead = z.object({
  brand: z.string(),
  context: z.string().nullable(),
  page: BrandPage,
  rules: z.array(BrandRule).describe("The rules its sections show, resolved for the context"),
  missing: z.array(z.string()).describe("Keys a section shows whose rule has gone since"),
  warnings,
  markdown: z.string().describe("The page as Markdown, its rules' values filled in"),
  url: readerUrl,
});
export const PageSaved = z.object({ brand: z.string(), created: z.boolean(), page: BrandPage, warnings, url: readerUrl });

export const Templates = z.object({
  templates: z.array(
    z.object({
      template: z.string(),
      name: z.string(),
      use: z.string().describe("What it is for"),
      binds: z.string().nullable().describe("What its keys may name; null: it binds no rules"),
      items: z.string().nullable().describe("What its items are; null: it takes none"),
      defaults: z.object({ width: z.enum(WIDTHS), columns: z.number().int(), tone: z.string() }),
      props: z.record(z.string(), z.unknown()).describe("Its own settings, as JSON Schema"),
      example: z.record(z.string(), z.unknown()).describe("A section using it, as PUT takes it"),
    }),
  ),
  common: z.string().describe("What every section takes besides its props"),
});

const ThemeChecks = z
  .array(
    z.object({
      pair: z.string().describe("Which color on which, e.g. ink on surface"),
      fg: z.string(),
      bg: z.string(),
      ratio: z.number(),
      need: z.number().describe("The contrast it must reach: 4.5 for text, 3 for marks"),
      ok: z.boolean(),
      used: z.string().describe("The color used: fg when it passes, else its fallback"),
    }),
  )
  .describe("Contrast of each pair in the look: one that fails falls back to a color that reads, and says which");
const ThemeFace = z.object({
  family: z.string(),
  weight: z.number().optional(),
  file: uuid.optional().describe("The font file for its weight"),
  files: z.array(z.object({ id: uuid, filename: z.string(), mime: z.string() })).optional().describe("Every font file of the rule, one @font-face each"),
  fallback: z.string().optional(),
  google: z.literal(true).optional().describe("From Google Fonts, with no files: its CSS is imported"),
});
const color = z.string().describe("A hex color");
/** What deriveTheme gives (lib/brand-theme.ts): the settings over what the rules say, every ink graded on its ground. */
const Theme = z.object({
  v1: z.record(z.string(), z.unknown()).describe("The accent, lifted for light and dark pages, and the faces, as before W3"),
  surface: color.nullable().describe("The page ground; null: none set or named, so the page keeps the app's, light or dark"),
  panel: color,
  dark: color,
  ink: color,
  muted: color,
  onDark: color,
  mutedOnDark: color,
  accent: color.describe("The fill, as the brand has it: bands and buttons"),
  accentText: color.describe("The accent where it is text (links), at 4.5:1 on the surface"),
  onAccent: color,
  accentUse: z.enum(["fill", "hairline"]),
  line: color,
  faces: z.object({
    head: ThemeFace.optional(),
    body: ThemeFace.optional(),
    label: ThemeFace.extend({ case: z.string(), tracking: z.number().describe("In em") }).optional(),
  }),
  radius: z.number(),
  width: z.enum(["narrow", "normal", "wide"]),
  density: z.enum(["compact", "normal", "airy"]),
  scale: z.number(),
  device: uuid.nullable(),
  logo: z.object({ key: z.string() }).nullable(),
  nav: z.enum(["sidebar", "top", "overlay"]),
  band: z.boolean().describe("header is band"),
  header: z.enum(["plain", "band", "split"]),
  separation: z.enum(["space", "hairline"]),
  numbering: z.boolean(),
  motion: z.enum(["none", "subtle"]),
  toc: z.enum(["side", "inline", "none"]).describe("On this page: a side column, a list under the page header, or none"),
  checks: ThemeChecks,
});

export const ThemeView = z.object({
  brand: z.string(),
  settings: ThemeSettings.describe("Which rule plays which part, and the page's measure, rhythm and chrome; left out: read from the rules"),
  theme: Theme.describe("The look the settings and rules give: grounds, inks, accent, faces and chrome"),
  checks: ThemeChecks,
  warnings: z.array(z.string()).describe("Settings naming a rule that has gone since (the default is used), and each pair that fell back"),
});

const snapRule = z.object({
  key: z.string(),
  label: z.string().optional(),
  context: z.string().nullable(),
  type: z.enum(RULE_TYPES),
  value: z.unknown(),
  spec: z.record(z.string(), z.unknown()).optional(),
  usage: z.string().nullable(),
  position: z.number().int(),
  assets: z.array(z.object({ id: uuid, rendition: z.string().nullable() })),
});
/** A page as a version keeps it: a field that isn't set is left out. */
const snapPage = z.object({
  slug: z.string(),
  title: z.string(),
  position: z.number().int(),
  hidden: z.boolean(),
  sections: z.array(Section),
  parent: z.string().optional(),
  eyebrow: z.string().optional(),
  lede: z.string().optional(),
  cover: uuid.optional(),
  icon: z.string().optional(),
  audience: z.enum(AUDIENCES).optional(),
  tabs: z.boolean().optional(),
  aliases: z.array(z.string()).optional(),
  layout: z.literal("landing").optional().describe("Left out: book"),
  translations: z.record(z.string(), pageText).optional(),
  updatedAt: z.string().optional(),
});
export const VersionMeta = z.object({
  number: z.number().int(),
  kind: z.enum(["baseline", "edit", "restore"]),
  name: z.string().nullable(),
  actor: z.string().describe("Who: a person's name, an API key's name, or \"web\" for the app without an account"),
  changed: z.array(z.string()).describe("Keys touched; a page as page:{slug}, and theme"),
  restoredFrom: z.number().int().nullable().describe("For a restore: the version it put back"),
  summary: z.string(),
  rules: z.number().int(),
  pages: z.number().int().nullable().describe("How many pages; null for a version from before pages"),
  publishedAt: date.nullable().describe("When it was published; null for a draft"),
  publishedBy: z.string().nullable(),
  note: z.string().nullable().describe("What changed, for readers, given when it was published"),
  noteImage: uuid.nullable().describe("An asset shown beside the note"),
  createdAt: date,
  updatedAt: date.describe("Edits close together extend a version; this is its last"),
});
export const Version = VersionMeta.extend({
  rules: z.array(snapRule),
  pages: z.array(snapPage).nullable().describe("null for a version from before pages"),
  theme: ThemeSettings.nullable().describe("null for a version from before themes: a restore leaves the theme as it is"),
  against: z.union([z.number().int(), z.literal("current")]).nullable(),
  diff: z.array(z.record(z.string(), z.unknown())).describe("added, removed, changed (field by field) or moved, per rule"),
  pageDiff: z.array(z.string()).describe("Pages that differ, as page:{slug}"),
  themeChanged: z.boolean().describe("The theme differs; against current, whether a restore would change it"),
});
export const BrandHub = z.object({
  visibility: z.enum(["private", "public"]).describe("private: the workspace's people see it on BrandHub, signed in; public: anyone and any agent"),
  url: z.url().describe("Its page there: the hub's own address when public, the app's /hub when private"),
  published: z.object({ number: z.number().int(), publishedAt: date }).nullable().describe("What BrandHub shows: the latest publish; null: nothing yet"),
  portal: z.object({ slug: z.string(), name: z.string() }).nullable().describe("The portal it links as its guidelines"),
  chosen: z.boolean().describe("That portal was picked; false: it is the brand's first public portal"),
  delisted: z.string().nullable().describe("Taken off BrandHub by whoever runs the server, and why: it can't be made public until they list it again"),
});
export const BrandHubView = BrandHub.extend({
  portals: z
    .array(z.object({ slug: z.string(), name: z.string(), access: z.enum(PORTAL_ACCESS), url: z.url() }))
    .nullable()
    .describe("The portals it could link as its guidelines; null without the right to manage portals"),
});
export const HubPatch = z.strictObject({
  visibility: z.enum(["private", "public"]).optional().describe("public shows its latest publish to anyone and any agent; it takes a publish"),
  portal: z.string().nullable().optional().describe("The slug of a portal showing it, linked as its guidelines; null: its first public portal"),
});
export const Published = VersionMeta.extend({
  brand: z.string(),
  unchanged: z.boolean().describe("Nothing changed since the last publish, which stands"),
  portals: z
    .array(z.object({ slug: z.string(), name: z.string(), access: z.enum(PORTAL_ACCESS), url: z.url() }))
    .optional()
    .describe("The portals showing it, where visitors now read it"),
  hub: z
    .object({ visibility: z.enum(["private", "public"]), url: z.url() })
    .nullable()
    .describe("Who sees it on BrandHub, and where; null when this server has none"),
});
export const BrandStatus = z.object({
  brand: z.object({ slug: z.string(), name: z.string(), default: z.boolean() }),
  brands: z.array(z.object({ slug: z.string(), name: z.string(), default: z.boolean() })).describe("Every brand, the default first"),
  steps: z
    .array(
      z.object({
        id: z.enum(["colors", "type", "logo", "voice", "pages", "publish", "portal"]),
        title: z.string(),
        done: z.boolean().nullable().describe("null: the caller can't tell"),
        detail: z.string(),
        agent: z.string().describe("How an agent does it, with the tools by name"),
        points: z.number().int().describe("What it adds to the Brand Agent Score once done; 0 when the caller can't tell"),
      }),
    )
    .describe("In the order to take them"),
  done: z.number().int(),
  total: z.number().int(),
  score: z.number().int().min(0).max(100).describe("The Brand Agent Score: the steps done, weighed by what each gives an agent"),
  next: z.string().nullable().describe("The first step not done; null when the brand is ready"),
  publish: z.enum(["never", "behind", "current"]).describe("never published, changes since the last publish, or up to date"),
  portals: z
    .array(z.object({ slug: z.string(), name: z.string(), access: z.enum(PORTAL_ACCESS), url: z.url() }))
    .nullable()
    .describe("The portals showing it; null without the right to manage portals"),
  hub: BrandHub.nullable().describe("The brand on BrandHub; null when this server has none"),
  url: z.url().describe("The brand in the app"),
});
const refs = z.array(z.object({ slug: z.string(), title: z.string() }));
const keys = z.array(z.string());
export const Update = z.object({
  version: z.number().int(),
  publishedAt: date,
  publishedBy: z.string().nullable(),
  note: z.string().nullable().describe("What changed, in the publisher's words"),
  image: uuid.nullable().describe("An asset shown beside the note; null when it may no longer be used"),
  changes: z
    .object({
      rules: z.object({ added: keys, changed: keys, removed: keys }).describe("By key"),
      pages: z.object({ added: refs, changed: refs, removed: refs }).describe("Pages readers can reach: a hidden one is left out"),
    })
    .describe("What it changed for readers since the publish before it"),
});
/** A review comment on a brand page (lib/core/brand-comments.ts). */
export const Comment = z.object({
  id: uuid,
  page: z.string().describe("The page's slug now: a comment on a page renamed since follows it"),
  section: z.string().nullable().describe("The section's id; null for the page as a whole"),
  parent: uuid.nullable().describe("The thread it replies in; null for a thread's first comment"),
  body: z.string(),
  author: z.string().describe("Their name when they wrote it"),
  authorId: z.string().nullable().describe("The person's id; null for an agent's, or once they are gone"),
  mine: z.boolean().describe("Written by the caller: theirs to edit and delete"),
  resolvedAt: date.nullable().describe("When its thread was resolved; null while open, and always on a reply"),
  resolvedBy: z.string().nullable(),
  editedAt: date.nullable().describe("When its text last changed; null if never"),
  createdAt: date,
  updatedAt: date,
});
export const CommentThread = Comment.extend({ replies: z.array(Comment).describe("Oldest first") });

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
  focus: z.object({ x: z.number(), y: z.number() }).nullable().describe("The point crops keep in frame, 0 to 1 from the top left; null: the center"),
  tags: z.array(z.string()),
  fields: fieldValues.describe("Effective values: own over inherited"),
  collections: z.array(uuid),
  rights: Rights,
  provenance: z.object(provenanceOut),
  supersededBy: uuid.nullable().describe("Replaced: use this one instead"),
  public: z.boolean().describe("Its URLs work for anyone while it may be used; otherwise with a key or session, or signed (POST /api/v1/assets/{id}/signed-url)"),
  urls: z.object({
    original: z.url(),
    download: z.url().describe("The original with current metadata written in"),
    rendition: z.string().nullable().describe("Template: replace {transform}, e.g. w_800,f_webp"),
  }),
  constraints: z
    .object({
      w: z.tuple([z.number(), z.number()]),
      h: z.tuple([z.number(), z.number()]),
      sizes: z.array(z.number()).describe("A side snaps up to the next of these: w_801 is w_828"),
      q: z.tuple([z.number(), z.number()]).describe("Snaps to a multiple of 5"),
      fit: z.array(z.enum(FITS)),
      f: z.array(z.enum(FORMATS)),
      enlarges: z.boolean().describe("An SVG is drawn at the size asked, up to the w and h caps; any other image never comes out larger than it is"),
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
    "suggested_fields",
    "archived",
    "unarchived",
    "made_current",
    "edited_rules",
    "restored_rules",
    "published",
  ]),
  label: z.string().describe("The asset's title or filename then, or the brand's name"),
  assetId: uuid.nullable(),
  brand: z.object({ slug: z.string(), name: z.string(), version: z.number().int() }).nullable(),
  detail: z
    .object({ tags: z.array(z.string()), fields: z.array(z.string()), note: z.string(), version: z.number().int(), rules: z.array(z.string()), summary: z.string() })
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

/** A portal's check answers the same, less the library's address for the file, and never suggests another. */
export const PortalCheckResult = CheckResult.extend({ asset: z.object({ id: uuid, title: z.string() }) });

export const Deleted = z.object({ data: z.object({ deleted: z.literal(true) }) });

const limit = (what: string) => z.number().nullable().describe(`${what}; null: no limit`);
export const Usage = z.object({
  limits: z.object({
    storage: limit("Bytes of assets"),
    editors: limit("People with write or admin, invitations included"),
    workspaces: limit("Workspaces"),
    brands: limit("Brands, over all workspaces"),
    domains: limit("Custom domains, the app's and its portals'"),
    features: z.array(z.enum(["agents", "shares", "sso"])).nullable().describe("What it may use; null: everything"),
    readOnly: z.boolean(),
  }).describe("Set by whoever runs the server; never by the organization"),
  billing: z.string().url().nullable().describe("Where the organization's admins manage the plan behind these limits; null when this server has no such place"),
  used: z.object({ storage: z.number(), editors: z.number().int(), workspaces: z.number().int(), brands: z.number().int(), domains: z.number().int() }),
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
  features: z
    .array(z.enum(FEATURES))
    .nullable()
    .describe("What the organization may use, of what its limits can switch off (agents, shares, sso, branding, domains); null is everything"),
  upgrade: z
    .string()
    .url()
    .nullable()
    .describe("Where you can take a plan (BILLING_URL): set for an organization's admin while it runs on the server's own limits, else null"),
  git: z
    .string()
    .nullable()
    .describe("Where a brand gets kept in a Git repository (GIT_CONNECT_URL), {brand} standing for its slug, empty to bring a new brand in: set for a workspace admin, else null"),
  hub: z.boolean().describe("This server runs BrandHub (HUB_URL)"),
  notice: z
    .object({ text: z.string(), href: z.string().nullable() })
    .nullable()
    .describe("A word from whoever runs the server to the organization's admins (a plan that ends, a payment that failed), shown across the top of the app; null for everyone else, and when there is none"),
  auth: z.object({
    signUp: z.boolean().describe("Nobody has an account yet: the first one made is the admin of everything"),
    open: z.boolean().describe("Anyone may make an account, and gets an organization of their own (SIGNUP=open)"),
    oidc: z.object({ name: z.string() }).nullable().describe("Single sign-on, when configured"),
    sso: z.boolean().describe("Some organization here signs its people in through its own provider: sign-in offers it by email domain"),
    anonymous: scope.describe("What a request without a key or a session may do"),
    passwordReset: z.boolean().describe("A forgotten password can be reset by email"),
    serverEmail: z
      .boolean()
      .describe("The server sends every organization's email (EMAIL_*): organizations don't set their own, and a new account confirms its address with a code"),
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
/** A look for a page that is not one of a brand's but reads as part of its site. */
const Look = z.object({
  brand: z.object({ slug: z.string(), name: z.string() }).nullable().describe("Whose look it is; null: none, the accent over the app's own"),
  theme: Theme.extend({ settings: ThemeSettings }).describe("Derived and graded, as a page view's"),
  signed: z.record(uuid, z.string()).describe("Signatures for the theme's font files and device"),
});
export const Shared = z.object({
  share: z.object({
    kind: z.enum(["view", "upload"]),
    name: z.string().nullable(),
    workspace: z.string().nullable(),
    organization: z.string().nullable(),
    target: Share.shape.target,
    expiresAt: date.nullable(),
    brand: Branding.describe("Whose link this is, and how it looks"),
    look: Look.describe("How to draw it: the workspace's brand site once published; else the organization's accent over the app's own"),
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

const domainState = z.object({
  host: z.string(),
  verified: z.boolean(),
  record: z.object({ type: z.literal("TXT"), name: z.string(), value: z.string() }).describe("What proves it: add this record at your DNS host"),
  cname: z
    .object({ type: z.literal("CNAME"), name: z.string(), value: z.string() })
    .nullable()
    .describe("Where to point it, when the server says (DOMAIN_TARGET): checked with the TXT record. Null: at this server"),
});
export const Portal = z.object({
  id: uuid,
  slug: z.string(),
  name: z.string(),
  intro: z.string().nullable(),
  access: z.enum(PORTAL_ACCESS),
  password: z.boolean(),
  expiresAt: date.nullable(),
  expired: z.boolean(),
  presets: z.array(z.enum(PRESET_IDS)),
  theme: PortalTheme,
  collections: z.array(z.object({ id: uuid, name: z.string() })),
  brands: z
    .array(z.object({ slug: z.string(), name: z.string(), publishedAt: date.nullable().describe("Its latest publish; null: never published, so visitors see nothing of it") }))
    .describe("Brands whose guidelines it publishes, in tab order"),
  site: PortalSite,
  domain: domainState.nullable(),
  url: z.url().describe("Where visitors go: its domain once verified, else {slug}.PORTAL_DOMAIN when the server has one (not for a members portal), else /p/{slug}"),
  pending: z.number().int().describe("Access requests waiting"),
  createdBy: z.string(),
  createdAt: date,
  updatedAt: date,
});
export const PortalRequest = z.object({
  id: uuid,
  email: z.string(),
  name: z.string().nullable(),
  note: z.string().nullable(),
  status: z.enum(["pending", "approved", "denied"]),
  kind: z.enum(REQUEST_KINDS).describe("access: to get in; asset, review or question: asked from a request section"),
  page: z.string().nullable().describe("The page a request section asked from"),
  section: z.string().nullable().describe("The request section, by id"),
  expiresAt: date.nullable(),
  decidedBy: z.string().nullable(),
  decidedAt: date.nullable(),
  createdAt: date,
  url: z.string().nullable().describe("For an approved request: their own link, to copy"),
});
export const PortalAddress = z.object({
  slug: z.string(),
  available: z.boolean(),
  reason: z.string().nullable().describe("Why not: taken, or kept for the service"),
  url: z.url().describe("Where a public portal at it answers: {slug}.PORTAL_DOMAIN when the server has one, else /p/{slug}"),
});
export const PortalDomain = z.object({
  host: z.string(),
  portal: z.string().nullable().describe("The portal it serves, by slug; null: free to pick"),
});
export const PortalViews = z.object({
  days: z.number().int().describe("How far back"),
  pages: z
    .array(z.object({ brand: z.object({ slug: z.string(), name: z.string() }), page: z.string().describe("The page's slug when it was read"), views: z.number().int() }))
    .describe("Most read first; a page shown counts, not an error, a lock or a redirect"),
});
const InsightAsset = z.object({
  id: uuid,
  title: z.string(),
  version: z.number().int().nullable().describe("Its version in its stack; null for an asset with one"),
  preview: z.boolean().describe("Whether /a/{id} can make a picture of it"),
  supersededBy: uuid.nullable(),
});
export const Connections = z.object({
  days: z.number().int().describe("How far back it goes"),
  clients: z
    .array(
      z.object({
        client: z.string().describe("The agent, by its key's name"),
        events: z.number().int().describe("Everything it did, counted"),
        tools: z.array(z.object({ name: z.string(), calls: z.number().int(), failed: z.number().int().describe("Errors and refusals") })).describe("MCP tools it called, most first"),
        contexts: z.array(z.object({ context: z.string(), count: z.number().int() })).describe("Brand contexts it asked for, in checks and lookups"),
        refusals: z.object({
          total: z.number().int(),
          reasons: z.array(z.object({ code: z.string(), count: z.number().int() })).describe("A check's blocking reasons; scope: a tool its key may not run"),
        }),
        fetches: z.number().int(),
        searches: z.number().int(),
      }),
    )
    .describe("Busiest first"),
});
const Week = z.string().describe("The Monday (UTC) the week starts, YYYY-MM-DD");
export const Insights = z.object({
  days: z.number().int().describe("How far back the lists go"),
  weeks: z.number().int().describe("How many weeks the weekly charts have, oldest first, quiet weeks at zero"),
  answers: z
    .array(z.object({ week: Week, person: z.number().int(), agent: z.number().int(), anonymous: z.number().int() }))
    .describe("Brand answers per week, by who got them: files served, hub files read, uses checked, searches that found something"),
  adoption: z
    .array(z.object({ week: Week, current: z.number().int(), superseded: z.number().int() }))
    .describe("Fetches per week of a current version, and of one already replaced when it was fetched"),
  stale: z
    .array(
      z.object({
        asset: InsightAsset,
        replacement: InsightAsset.nullable().describe("What replaced it"),
        referrer: z.string().nullable().describe("The host that loaded it; null when the request didn't say"),
        fetches: z.number().int(),
        last: z.string().describe("The last day it was fetched"),
      }),
    )
    .describe("Still on the old release: replaced versions fetched lately, by referrer, most first"),
  top: z
    .array(z.object({ asset: InsightAsset, total: z.number().int(), surfaces: z.partialRecord(z.enum(SURFACES), z.number().int()).describe("Fetches through each surface: app, api, mcp, portal, share, hub, link (a signed URL), public") }))
    .describe("The ten most fetched assets, with their fetches by surface"),
  gaps: z.array(z.object({ q: z.string(), searches: z.number().int(), last: z.string() })).describe("Searches that found nothing, most asked first"),
  checks: z
    .object({
      allowed: z.number().int(),
      refused: z.number().int(),
      reasons: z.array(z.object({ code: z.string(), count: z.number().int() })).describe("Refusals by blocking reason, most first; one refusal can have several"),
      log: z
        .array(
          z.object({
            id: uuid,
            at: date,
            asset: InsightAsset,
            surface: z.enum(SURFACES),
            client: z.string().nullable().describe("The agent's key name; null for a person or nobody in particular"),
            context: z.string().nullable(),
            reasons: z.array(z.string()),
            offered: z
              .array(z.object({ asset: InsightAsset, taken: z.boolean().describe("The same client fetched it, or checked it and was allowed, afterwards") }))
              .describe("What was offered instead"),
          }),
        )
        .describe("The latest refusals, newest first"),
    })
    .describe("The use-check log: check_use and POST /api/v1/check answers"),
  delivery: z.array(z.object({ day: z.string(), requests: z.number().int(), bytes: z.number() })).describe("What /a/{id} served in this workspace, per day"),
  pageViews: z
    .array(
      z.object({
        portal: z.object({ id: uuid, name: z.string() }),
        brand: z.object({ slug: z.string(), name: z.string() }),
        page: z.string(),
        views: z.number().int(),
      }),
    )
    .describe("Portal pages read, most first"),
});
export const AssetInsights = z.object({
  days: z.number().int().describe("How far back fetches go"),
  rules: z.array(z.object({ brand: z.string(), key: z.string(), label: z.string().nullable(), context: z.string().nullable() })).describe("Brand rules that point at it"),
  pages: z
    .array(z.object({ brand: z.object({ slug: z.string(), name: z.string(), default: z.boolean() }), slug: z.string(), title: z.string() }))
    .describe("Brand pages that show it, as they stand now"),
  portals: z.array(z.object({ name: z.string(), url: z.string() })).describe("Open public portals that show it"),
  fetches: z.object({
    total: z.number().int(),
    surfaces: z.partialRecord(z.enum(SURFACES), z.number().int()),
  }),
  referrers: z.array(z.object({ host: z.string(), fetches: z.number().int(), last: z.string() })).describe("The hosts that loaded it, most first"),
});
export const BrandInsights = z.object({
  days: z.number().int().describe("How far back it counts"),
  pulls: z.number().int().describe("Reads of its BrandHub files: brand.json, llms.txt, tokens"),
  views: z.number().int().describe("Portal page views of its pages"),
});
export const SignedUrl = z.object({
  url: z.url().describe("The original; add a rendition before the query, /a/{id}/w_800,f_webp?s=..., or ?download"),
  expiresAt: date,
});
export const Decided = z.object({ data: PortalRequest, emailed: z.boolean() });
export const Sso = z.object({
  issuer: z.string(),
  clientId: z.string(),
  domain: z.string(),
  verified: z.boolean().describe("The domain is proved: its people sign in through the provider"),
  record: z.object({ type: z.literal("TXT"), name: z.string(), value: z.string() }).describe("What proves the domain: add this record at your DNS host"),
  redirectUri: z.url().describe("Register this with the provider as the app's redirect URI"),
});
export const GithubAccount = z.object({
  login: z.string(),
  verified: z.boolean().describe("Proved: its listings on BrandHub are verified, as github.com/{login}"),
  url: z.url(),
  file: z
    .object({ repository: z.string(), path: z.string(), url: z.url(), token: z.string() })
    .describe("What proves it: a file at `path` in the account's `.github` repository, on its default branch, holding `token`"),
});
export const HubReport = z.object({
  id: uuid,
  kind: z.enum(["report", "claim"]).describe("report: anyone's word about a listing; claim: an organization that proved a domain or a GitHub account says the brand is its"),
  reason: z.string().describe("A report's reason; claim for a claim"),
  note: z.string().nullable(),
  contact: z.string().nullable().describe("How to reach who sent it, as they gave it; a claimant's email"),
  claimant: z.object({ name: z.string(), proof: z.string().nullable().describe("What it proved it holds: a domain, or github.com/{login}") }).nullable(),
  status: z.enum(["open", "resolved"]),
  createdAt: date,
  brand: z.object({ slug: z.string(), name: z.string(), workspace: z.string(), visibility: z.enum(["private", "public"]) }),
});
export const Domain = domainState.extend({
  primary: z.boolean().describe("The app's default address: links in email point here"),
  portal: z.string().nullable().describe("The portal it serves, by slug; null for the whole app"),
  url: z.url(),
});
const download = z.object({ preset: z.enum(PRESET_IDS), label: z.string(), hint: z.string(), url: z.string(), filename: z.string() });
export const PortalView = z.object({
  portal: z.object({
    slug: z.string(),
    name: z.string(),
    intro: z.string().nullable(),
    organization: z.string(),
    access: z.enum(PORTAL_ACCESS),
    expiresAt: date.nullable(),
    theme: z.object({
      logo: z.string().nullable().describe("A URL on this host: the portal's, else its organization's"),
      accent: z.string().nullable().describe("The portal's, else its organization's"),
      background: z.string().nullable(),
      icon: z.string().nullable().describe("The organization's, for the browser tab"),
      product: z.string().describe("What the organization calls the product"),
    }),
    collections: z.array(
      z.object({ id: uuid, name: z.string(), count: z.number().int(), covers: z.array(z.string()).describe("Up to 3 of its newest pictures' thumbnails, URLs on this host") }),
    ),
    brands: z
      .array(z.object({ slug: z.string(), name: z.string(), publishedAt: date.nullable().describe("null: shown as it stands, having no history") }))
      .describe("Brands it publishes: each one's guidelines at GET /api/v1/portal/{slug}/brands/{brand}"),
    site: PortalSite.describe("Footer, quick grab and terms, as its pages have them"),
    look: Look.describe("How to draw it: its first brand's site; with no brand, the portal's accent over the app's own"),
    madeWith: z.boolean().describe('Its pages carry "Made with Artbucket": its organization\'s plan has no white-label'),
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
      thumbnail: z.string().nullable().describe("A URL on this host"),
      preview: z.string().nullable().describe("Larger, for a closer look"),
      downloads: z.array(download),
    }),
  ),
  total: z.number().int(),
});
export const PortalBrand = z.object({
  brand: z.object({ slug: z.string(), name: z.string() }),
  version: z.object({ number: z.number().int(), publishedAt: date }).nullable().describe("The publish shown; null for a brand with no history, shown as it stands"),
  data: z.array(BrandRule).describe("Its rules in page order; a rule's assets only when they may be used"),
  contexts: z.array(z.string()).describe("Contexts some rule is scoped to, for ?context="),
  signed: z.record(uuid, z.string()).describe("Each listed asset's signature: /a/{id}/{rendition}?s={it} loads it for the visitor"),
});
export const PortalGate = z.object({
  error: z.object({
    code: z.literal("password"),
    message: z.string(),
    detail: z.object({ name: z.string(), access: z.enum(["password", "members"]), theme: PortalView.shape.portal.shape.theme }),
  }),
});

// ---- page views (lib/site.ts) -------------------------------------------------

export const ViewRule = BrandRule.pick({ key: true, label: true, context: true, type: true, value: true, spec: true, usage: true }).extend({
  assets: z
    .array(
      BrandRule.shape.assets.element.extend({
        size: z.number().int(),
        preview: z.boolean().describe("Has renditions: /a/{id}/{rendition} draws it"),
      }),
    )
    .describe("Its assets readers may see, in order; one that may not be used is left out"),
});
export const Media = PortalView.shape.data.element.extend({
  original: z.string().describe("The file as uploaded"),
  focus: z.object({ x: z.number(), y: z.number() }).nullable().describe("Where a crop keeps its subject, from 0 to 1 across and down"),
  updatedAt: date,
});
export const NavPage = z.object({
  ...BrandPage.pick({ slug: true, title: true, parent: true, position: true, eyebrow: true, lede: true, cover: true, icon: true, audience: true, tabs: true }).shape,
  home: z.boolean().describe("The first page, opening on a cover: never numbered"),
  locked: z.boolean().describe("Above the reader: listed by title with a lock, nothing more"),
  updatedAt: date.nullable(),
});
export const PageView = z.object({
  brand: z.object({ slug: z.string(), name: z.string() }),
  version: z.object({ number: z.number().int(), publishedAt: date.nullable() }).nullable().describe("The version it shows; null: the draft"),
  context: z.string().nullable(),
  contexts: z.array(z.string()).describe("Every context some rule is scoped to"),
  lang: z.string().nullable(),
  theme: Theme.extend({ settings: ThemeSettings }).describe("The look, derived and graded, and the settings it came from"),
  nav: z.array(NavPage).describe("Every page the reader is listed, in order"),
  page: NavPage.omit({ locked: true })
    .extend({
      sections: z.array(Section).describe("What the reader gets: hidden ones for editors only"),
      aliases: z.array(z.string()),
      layout: BrandPage.shape.layout,
    })
    .nullable()
    .describe("null: locked for this reader"),
  locked: z.boolean(),
  redirect: z.string().optional().describe("An old slug was asked for: the page's slug now"),
  rules: z.array(ViewRule).describe("Every context version of the rules the page binds, the theme's, and those their specs name"),
  media: z.record(uuid, Media).describe("The assets it names that may be used, by id"),
  collections: z
    .record(z.string(), z.object({ items: z.array(Media), total: z.number().int(), error: z.string().nullable().describe("Why it shows nothing; editors only") }))
    .describe("A collection section's assets, by section id"),
  updates: z.array(Update).optional().describe("With an updates section: the latest publishes, newest first, as many as its largest limit"),
  signed: z.record(uuid, z.string()).describe("Signatures by asset id, for visitors; empty for members"),
  warnings: z.array(z.string()).describe("Editors only: what a reader would trip on, assets they won't see, and theme pairs that fell back"),
  missing: z.array(z.string()).describe("Editors only: keys a section binds with no rule"),
});

export const Hit = z.object({
  kind: z.enum(["page", "section", "rule"]),
  brand: z.string(),
  page: z.string(),
  section: z.string().optional().describe("The section's id: its anchor on the page"),
  title: z.string(),
  snippet: z.string().describe("Plain text around the first word found"),
  path: z.string().describe("The page's path on the portal, e.g. /logo: the first brand's pages sit at the top, the others under their brand"),
});
export const PortalSiteView = z.object({
  portal: z.object({
    slug: z.string(),
    name: z.string(),
    theme: PortalView.shape.portal.shape.theme.describe("The portal's own look, for its header: pages wear their brand's"),
    site: PortalSite.describe("Footer, quick grab and terms; an asset in quick grab comes with `href`, signed to download"),
    brands: z.array(z.object({ slug: z.string(), name: z.string(), publishedAt: date.nullable().describe("null: shown as it stands, having no history") })).describe(
      "The brands it shows, in order; one never published is left out",
    ),
    assets: z.boolean().describe("It shows collections: its Assets view"),
    madeWith: z.boolean().describe('Its pages carry "Made with Artbucket": its organization\'s plan has no white-label'),
    level: z.enum(AUDIENCES).describe("Who the visitor is to it: everyone, partners (its password or an approved request) or members"),
  }),
  canonical: z.string().nullable().describe("The page's path on the portal, what links use; null with no page"),
  redirect: z.boolean().describe("The path asked was an old slug or a long form: send the reader to canonical"),
  view: PageView.nullable().describe("null: it shows no brand, so its Assets view is the portal"),
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

const IconSetInfo = z.object({
  prefix: z.string().describe("Iconify's name for it: tabler, lucide, simple-icons"),
  name: z.string(),
  total: z.number().int().describe("Icons in it"),
  author: z.object({ name: z.string(), url: z.string().optional() }).nullable(),
  license: z.object({ title: z.string(), spdx: z.string().optional(), url: z.string().optional() }).nullable(),
  samples: z.array(z.string()).describe("A few of its icons' names"),
  category: z.string().nullable(),
  palette: z.boolean().describe("Its icons carry their own colors; false: drawn in one color"),
  height: z.number().nullable().describe("The grid it is drawn on, in px"),
});
export const IconSets = z.object({ data: z.array(IconSetInfo), total: z.number().int().describe("Matches before `limit`") });
export const IconSamples = z.object({
  data: z.array(z.object({ name: z.string(), svg: z.string().describe("The file an import stores") })).describe("The set's samples, those it has"),
});

export const IconBrowse = z.object({
  set: IconSetInfo,
  categories: z.array(z.string()).describe("The set's own categories, to narrow by"),
  total: z.number().int().describe("Matching icons before `offset` and `limit`"),
  data: z.array(z.object({ name: z.string(), svg: z.string().describe("The file an import stores") })),
});

// ---- brand as code (core/brand-sync.ts) -------------------------------------------

const MAX_FILES = 500;
const brandFiles = z
  .record(z.string().min(1).max(300), z.string().max(2_000_000))
  .refine((f) => Object.keys(f).length <= MAX_FILES, `${MAX_FILES} files at most`)
  .describe("The brand's files by path in its folder: brand.yaml, rules/*.yaml, pages/*.yaml. Others are left alone");
const fileAssets = z
  .record(z.string().min(1).max(300), z.string().max(64))
  .optional()
  .describe("The files under assets/ the brand's files point at: path to asset id, or to the SHA-256 of its bytes (upload first)");
const commit = z.string().trim().min(1).max(100);

export const BrandExportInput = z.strictObject({
  previous: brandFiles.optional().describe("The repository's files as they are: one that says the same is kept as written, comments and all"),
  assets: z.enum(["ids", "files"]).optional().describe("files: give every asset the brand points at a path under assets/, to add them to the repository"),
});
export const BrandImportInput = z.strictObject({
  files: brandFiles,
  assets: fileAssets,
  commit: commit.optional().describe("The commit the files are at, when they are the repository's: recorded as agreed, when the brand has a source"),
  message: z.string().trim().max(2000).optional().describe("The commit's message: its first line names the version the import makes"),
  dryRun: z.boolean().optional().describe("Check and merge, answer what would change, write nothing"),
  merge: z.boolean().optional().describe("Keep what changed here since the source last agreed (default); false takes the files whole"),
  publish: z.union([z.boolean(), z.string().trim().max(2000)]).optional().describe("Publish after, with this note (true: none). Takes share"),
});
export const BrandSourceInput = z.strictObject({
  remote: z.url({ protocol: /^https?$/ }).max(500).describe("The repository, as its host shows it: https://github.com/acme/brand"),
  branch: z.string().trim().min(1).max(255).optional().describe("main when left out"),
  path: z.string().max(500).optional().describe("The brand's folder in the repository; its root when left out"),
  synced: z
    .strictObject({ commit, files: brandFiles, assets: fileAssets })
    .optional()
    .describe("The files just pushed, at `commit`: recorded as what both sides agree on"),
});
export const BrandPreviewInput = z.strictObject({
  ref: z.string().trim().min(1).max(200).describe("What proposes it, as its host names it: pull/12. One preview each; saving again updates it"),
  title: z.string().trim().max(300).optional(),
  commit: commit.optional(),
  files: brandFiles,
  assets: fileAssets,
});

export const FileProblem = z.object({ file: z.string(), line: z.number().int().optional(), message: z.string() });
export const FileProblems = z.object({
  errors: z.array(FileProblem),
  warnings: z.array(FileProblem),
  missing: z.array(z.string()).describe("Files under assets/ to upload, then name in assets by SHA-256"),
});
const StateDiff = z.object({
  name: z.object({ before: z.string(), after: z.string() }).nullable(),
  rules: z.array(
    z.object({
      change: z.enum(["added", "removed", "changed"]),
      key: z.string(),
      context: z.string().nullable(),
      type: z.enum(RULE_TYPES),
      before: z.unknown().optional(),
      after: z.unknown().optional(),
      fields: z.array(z.string()).optional().describe("What changed: value, usage, label, spec, assets, type"),
    }),
  ),
  pages: z.array(z.object({ change: z.enum(["added", "removed", "changed", "moved"]), slug: z.string(), title: z.string() })),
  theme: z.array(z.string()).describe("Theme settings changed"),
  reordered: z.boolean().describe("The rules' order changed"),
});
export const BrandSource = z.object({
  remote: z.string(),
  branch: z.string(),
  path: z.string(),
  commit: z.string().nullable(),
  syncedAt: date.nullable(),
  pending: z.boolean().describe("Changed here since the repository last agreed: an export is due"),
  files: z.number().int().describe("Assets that are files in the repository"),
});
export const BrandSourceView = z.object({
  source: BrandSource.nullable().describe("null: the brand lives here alone"),
  connect: z.url().nullable().describe("Where this server connects a brand to a Git repository (GIT_CONNECT_URL): for a workspace admin, else null"),
});
export const BrandExport = z.object({
  brand: z.string(),
  files: z.record(z.string(), z.string()),
  assets: z
    .record(z.string(), z.object({ id: uuid, filename: z.string(), mime: z.string(), size: z.number().int(), sha256: z.string(), url: z.url() }))
    .describe("Each path under assets/ the files name, with its asset: fetch it from url, or compare by sha256"),
  source: BrandSource.nullable(),
});
export const BrandImport = z.object({
  brand: z.string(),
  applied: z.boolean().describe("Something changed: a new version in the brand's history"),
  version: z.number().int().nullable(),
  published: z.number().int().nullable().describe("The version published, when publish was asked and something was new"),
  diff: StateDiff,
  conflicts: z
    .array(z.object({ what: z.string(), ours: z.unknown(), theirs: z.unknown() }))
    .describe("Pieces both sides changed differently: the files' side was taken, this side's is in the history"),
  warnings: z.array(FileProblem),
  pending: z.boolean().describe("The brand holds changes the files lack: export them back"),
});
export const BrandPreview = z.object({
  brand: z.string(),
  ref: z.string(),
  url: z.url().describe("The site as the files say it; no account needed"),
  pages: z.array(z.object({ slug: z.string(), title: z.string(), url: z.url() })),
  expiresAt: date,
  diff: StateDiff.describe("What it would change of the brand as it stands"),
  warnings: z.array(FileProblem),
});
export const PreviewMeta = z.object({
  brand: z.string(),
  name: z.string(),
  ref: z.string(),
  title: z.string().nullable(),
  commit: z.string().nullable(),
  updatedAt: date,
  expiresAt: date,
});
