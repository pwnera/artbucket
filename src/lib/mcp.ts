import { z } from "zod";
import { AssetError } from "@/lib/core/errors";
import {
  collectionId,
  describeAsset,
  getAsset,
  ingestFromUrl,
  parseAssetQuery,
  proposeFields,
  proposeTags,
  searchAssets,
  updateAsset,
  type Asset,
  type AssetPatch,
} from "@/lib/core/assets";
import {
  getVersion,
  listContexts,
  listRules,
  listVersions,
  nameVersion,
  publishBrand,
  restoreVersion,
  setRules,
  type BrandRule,
} from "@/lib/core/brand";
import { makeBrand } from "@/lib/core/templates";
import { createComment, deleteComment, listComments, updateComment } from "@/lib/core/brand-comments";
import { deletePage, editPage, generatePages, getPage, listPages, savePage } from "@/lib/core/pages";
import { getTheme, setTheme } from "@/lib/core/theme";
import { checkUse } from "@/lib/core/check";
import { deleteBrand, listBrands, resolveBrand, slugify, updateBrand } from "@/lib/core/brands";
import { brandStatus } from "@/lib/core/brand-status";
import { createCollection, deleteCollection, getCollection, listCollections, setMembers, updateCollection } from "@/lib/core/collections";
import { createField, deleteField, listFields, updateField } from "@/lib/core/fields";
import { importGoogleFont } from "@/lib/core/fonts";
import { findIconNames, importIcons, searchIconSets } from "@/lib/core/icons";
import type { IconSet } from "@/lib/icons";
import { closePortal, createPortal, decideRequest, deletePortal, listPortals, listRequests, portalsShowing, updatePortal } from "@/lib/core/portals";
import type { Caller } from "@/lib/core/access";
import { hasPreview } from "@/lib/preview";
import { env } from "@/lib/env";
import { TOOL_INPUTS, toolSchemas, type ToolName } from "@/lib/mcp-tools";
import { fetchUrl, outsideReach, outsideUrl } from "@/lib/core/outside";
import { can, needs, type Action } from "@/lib/permissions";
import { allows } from "@/lib/scopes";
import { normalizeTags } from "@/lib/search";
import { issues, templateCatalog, TEMPLATES } from "@/lib/pages";
import { PLAYBOOK } from "@/lib/playbook";
import { printPage } from "@/lib/core/print";
import { isVector, MAX_DIMENSION, parseTransform, serializeTransform } from "@/lib/transform";

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

const INSTRUCTIONS = `artbucket is a brand's asset library. Search it, describe an asset before using it, and hand out rendition URLs rather than downloading bytes: /a/{id}/w_800,f_webp is a stable, cacheable URL for exactly that size and format. Asset URLs are private: they work with your key, and for people who can see the asset. When your own fetch can't send the key (a web fetch, a sandbox), open fetchUrl from describe_asset or rendition_url: signed for a few minutes, for you, not to hand on. For anyone else, ask rendition_url with expiresIn: it answers when the asset is public, shown on a public portal, or your key may share; otherwise it says what the person can do, so tell them. What you ingest, import or tag is proposed, not final: a person reviews it, and my_proposals tells you what they decided and why. With a key that may approve, review_asset approves or rejects what waits (search_assets with review: true lists it), and applies or drops suggested tags and field values: only on a person's say-so. Before making anything on-brand (colors, logo use, type, tone), read the brand rules with brand_rules, for the context you are working in. Before publishing or handing out an asset, ask check_use with where, when and in what context it will run: it refuses replaced logos, expired licenses and the wrong variant, and names what to use instead. When you ingest something a model made, say so (origin, generator, prompt). A new version of an existing asset (the logo, redrawn) is ingested with versionOf, so it replaces the old one once approved instead of standing beside it. Expired and archived assets are not served: their URLs answer 410.

Custom fields (list_fields) are defined with create_field and update_field. Collections group assets: list_collections names them with their ids (ingest_asset, import_icons and create_portal take those), create_collection makes one, and update_collection_assets files assets in it.

To build a brand's guidelines for people, start with brand_status: it names every brand, and says what the one you work on still lacks (colors, typefaces, logo, voice, a look, pages, a publish, a portal) and how to add each, next step first. Before the first page, read brand_playbook (also the artbucket://playbook resource): what a good brand site is, and a worked example; a site built without it reads like a document. create_brand makes another brand, empty or as a copy of one (from). Write its rules with set_rules: a label is the heading readers see, a spec the details (print values, a gradient, a face's role). Pages are built from these section templates (blocks): ${TEMPLATES.join(", ")}. Read list_templates for what each shows, binds and takes, then lay out pages with save_page, a tree up to three levels deep through parent (generate_pages starts one from the rules). A page's sections show rules by key, so change a value with set_rules and every page follows. Set the look with set_theme. After each write, read its warnings, check the page with get_page and open its url to see it as readers will. Edits are drafts: publish only when the person asks, with a note saying what changed. Every edit is a version: list_versions and get_version read the history, restore_version brings an earlier one back as a new version, name_version keeps one as a checkpoint. list_comments reads what reviewers said on the pages; add_comment replies, update_comment resolves a thread once it is dealt with. Portals are where people outside the team read a brand: create_portal makes one for it, update_portal adds it to one list_portals names, and brand_status says when it is ready. Ask the person before a public portal: it is open to anyone with the address. A password portal takes the password the person gives you; people who ask to get in wait in list_portal_requests for decide_portal_request.`;

/** Said when a key can read the brand but not edit it, so the agent can tell the person how, rather than guess. */
const READ_ONLY_BRAND =
  "\n\nThis key can't edit brands: create_brand, update_brand, delete_brand, set_rules, save_page, edit_page, delete_page, generate_pages, set_theme, name_version and restore_version need write on the workspace, and publish needs write with sharing, so they are hidden. To edit, the person reconnects and picks Edit on the consent screen, or connects with a key whose scope is write.";

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
  state: a.state,
  version: a.version,
  supersededBy: a.supersededBy,
  url: base(a.id),
  thumbnail: hasPreview(a) ? `${base(a.id)}/w_480,f_webp` : null,
});

/** An icon set as a model needs it to pick one and credit it. */
const aboutSet = (s: IconSet) => ({ prefix: s.prefix, name: s.name, license: s.license, author: s.author });

/** Rules as a model reads them: referenced assets come with URLs it can use as is. */
const forAgent = (rules: BrandRule[]) =>
  rules.map(({ key, label, context, type, value, spec, usage, assets }) => ({
    key,
    label,
    context,
    type,
    value,
    spec,
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
/** A page as Markdown, what get_page returns in `markdown`. */
const pageUri = (brand: string, page: string) => `artbucket://brands/${brand}/pages/${page}`;
const PLAYBOOK_URI = "artbucket://playbook";

/** Tools that reach outside artbucket: a public URL, Google Fonts, Iconify. */
const OPEN_WORLD = new Set(["ingest_asset", "import_google_font", "find_icons", "import_icons"]);

/** Computed once: the schemas are code, and the size guard (mcp-tools.test.ts) measures exactly these. */
const SCHEMAS = toolSchemas();

type Tool = {
  description: string | ((caller: Caller) => Promise<string>);
  /** What running it takes (lib/permissions.ts), somewhere in the workspace; core checks the asset itself. */
  action: Action;
  input: z.ZodObject;
  readOnly: boolean;
  /** Takes away what can't be had back without the brand's history. */
  destructive?: boolean;
  run: (args: never, caller: Caller) => Promise<Record<string, unknown>>;
};

const tool = <S extends z.ZodObject>(t: {
  description: Tool["description"];
  action: Action;
  input: S;
  readOnly: boolean;
  destructive?: boolean;
  run: (args: z.infer<S>, caller: Caller) => Promise<Record<string, unknown>>;
}) => t as unknown as Tool;

const found = async (caller: Caller, assetId: string) => {
  const a = await getAsset(caller, assetId);
  if (!a) throw new AssetError("not_found", `No asset ${assetId}`);
  return a;
};

/** A collection this caller can see, by id or by name, as search_assets takes one. */
const collectionOf = async (caller: Caller, ref: string) => {
  const c = await getCollection(caller, await collectionId(caller, ref));
  if (!c) throw new AssetError("not_found", `No collection "${ref}": list_collections names them`);
  return c;
};

/**
 * Making a collection private keeps it in reach of the person who did it (core/people.ts keepReach); a key
 * with nobody behind it and short of admin would lose sight of it at once. Refused, rather than lost.
 */
const mayHide = (caller: Caller, hide?: boolean) => {
  if (hide && !caller.user && !allows(caller.scope, "admin"))
    throw new AssetError(
      "forbidden",
      "This key belongs to no person, so it could not see a private collection once it made one. A person makes it private in the app, or connects over OAuth as themselves.",
    );
};

/** A portal by its slug (or id), as list_portals names it. */
const portalOf = async (caller: Caller, ref: string) => {
  // ponytail: finds it among every portal presented; a lookup by slug in core when a workspace has hundreds.
  const p = (await listPortals(caller)).find((x) => x.slug === ref || x.id === ref);
  if (!p) throw new AssetError("not_found", `No portal "${ref}": list_portals names them`);
  return p;
};

const brandUrl = (slug: string) => `${env.APP_URL}/brand?${new URLSearchParams({ brand: slug })}`;

/** Every tool in lib/mcp-tools.ts, and nothing else: their signatures are frozen there. */
const TOOLS: Record<ToolName, Tool> = {
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
    input: TOOL_INPUTS.search_assets,
    run: async ({ q, tags, types, collection, filters, status, review, limit }, caller) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      for (const t of tags ?? []) params.append("tag", t);
      for (const t of types ?? []) params.append("type", t);
      for (const s of status ?? []) params.append("status", s);
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
      "Everything known about one asset: title, credit, tags, field values, suggestions waiting on review, the URLs it is served at, " +
      "a fetchUrl to open it yourself, whether people outside can see it (public, or the public portals showing it), " +
      "what renditions it allows, ready-made rendition URLs, and the brand rules that point at it " +
      "(for a logo: how it may and may not be used). Read this before using an asset.",
    action: "asset.read",
    readOnly: true,
    input: TOOL_INPUTS.describe_asset,
    run: async ({ id }, caller) => {
      const a = await found(caller, id);
      return {
        ...describeAsset(a),
        fetchUrl: fetchUrl(a),
        outside: await outsideReach(caller, a),
        proposedTags: a.proposedTags,
        proposedFields: a.proposedFields,
        brandRules: (await listRules(caller.workspace.id, { asset: id })).map(({ brand, key, label, context, type, value, spec, usage }) => ({
          brand,
          key,
          label,
          context,
          type,
          value,
          spec,
          usage,
        })),
      };
    },
  }),

  rendition_url: tool({
    description:
      "The URL of an asset at a given size and format, to embed or hand over. Building it costs nothing; the " +
      "image is made on first request and cached. A raster image is never upscaled: asking for more pixels than the " +
      `original has returns the original size. An SVG is drawn sharp at the size asked, up to ${MAX_DIMENSION}px. The URL works for people who can see the asset; ` +
      "fetchUrl opens it for you for a few minutes, when your fetch can't send your key. With expiresIn, the URL works for anyone until then: " +
      "an asset that is public (its plain URL, no end), or shown on a public portal (about a day, as the portal signs it; ask again for a " +
      "fresh one), or with a key that may share. Anything else is refused with what the person can do.",
    action: "asset.read",
    readOnly: true,
    input: TOOL_INPUTS.rendition_url,
    run: async ({ id, width, height, fit, format, quality, expiresIn }, caller) => {
      const a = await found(caller, id);
      const spec = serializeTransform({ w: width, h: height, fit, f: format, q: quality });
      if (spec && !hasPreview(a)) throw new AssetError("unsupported", `${a.mime} can't be transformed; ask without a size or format for the original`);
      if (spec && !parseTransform(spec)) throw new AssetError("invalid", `Not a valid transform: ${spec}`);
      const rest = spec ? `/${spec}` : "";
      const out = expiresIn ? await outsideUrl(caller, a, expiresIn, rest) : null;
      const url = out?.url ?? `${base(a.id)}${rest}`;
      const expiresAt = out?.expiresAt ?? null;
      const reach = { fetchUrl: fetchUrl(a, rest), ...(out && { via: out.via, portals: out.portals }) };
      if (!spec) return { url, expiresAt, ...reach, transform: null, note: "No transform asked for: this is the original." };
      const raster = !isVector(a.mime);
      const notes = [
        raster && width && a.width && width > a.width ? `The original is ${a.width}px wide; it will not be upscaled.` : null,
        raster && height && a.height && height > a.height ? `The original is ${a.height}px tall; it will not be upscaled.` : null,
        fit && !(width && height) ? "fit only matters with both width and height." : null,
      ].filter(Boolean);
      return { url, expiresAt, ...reach, transform: spec, source: { width: a.width, height: a.height }, notes };
    },
  }),

  check_use: tool({
    description:
      "Ask before you use an asset: may it run here, now, like this? Checks that it was approved and not archived, that nothing " +
      "replaced it, its license window, territory and channel, its model release, and, with a context, whether the " +
      "brand has a different variant for that context (a light logo for dark backgrounds). `allowed: false` comes " +
      "with reasons and, in `suggest`, what to use instead. Non-blocking reasons are worth knowing; say the " +
      "territory and channel to settle them.",
    action: "asset.read",
    readOnly: true,
    input: TOOL_INPUTS.check_use,
    run: async ({ id, ...use }, caller) => checkUse(caller, { asset: id, ...use }),
  }),

  ingest_asset: tool({
    description:
      "Add a file to the library from a public http(s) URL. Identical bytes dedupe to the existing asset. " +
      "The new asset is proposed: it shows up for review, not in the library, until a person approves it. " +
      "Required fields may be left out; the person approving fills them in. Check back with my_proposals.",
    action: "asset.upload",
    readOnly: false,
    input: TOOL_INPUTS.ingest_asset,
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
    input: TOOL_INPUTS.import_google_font,
    run: async (input, caller) => {
      const { family, assets } = await importGoogleFont(caller, input);
      return { family, assets: assets.map(summary) };
    },
  }),

  find_icons: tool({
    description:
      "Find open source icons to import, through Iconify. Without prefix, the icon sets matching q, each with its license, " +
      "author and a few sample names. With prefix, that set's icons matching q, by name. Next: import_icons.",
    action: "library.read",
    readOnly: true,
    input: TOOL_INPUTS.find_icons,
    run: async ({ q, prefix, group, category, offset, limit }) => {
      if (!prefix) {
        const { data, total } = await searchIconSets({ q, group, limit: limit ?? 20 });
        return { sets: data.map((s) => ({ ...aboutSet(s), total: s.total, samples: s.samples, category: s.category, palette: s.palette })), total };
      }
      const { set, categories, total, names } = await findIconNames(prefix, { q, category, offset, limit: limit ?? 100 });
      return { set: { ...aboutSet(set), total: set.total, palette: set.palette }, categories, total, offset, icons: names };
    },
  }),

  import_icons: tool({
    description:
      "Add icons from an open source set to the library, one SVG each, carrying the set's license and author. " +
      "Like ingest_asset, they are proposed until a person approves them, and icons already here dedupe. " +
      "`missing` names any the set doesn't have.",
    action: "asset.upload",
    readOnly: false,
    input: TOOL_INPUTS.import_icons,
    run: async (input, caller) => {
      const { set, assets, missing } = await importIcons(caller, input);
      return { set: aboutSet(set), assets: assets.map(summary), missing };
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
    input: TOOL_INPUTS.brand_rules,
    run: async ({ brand, context }, caller) => rulesFor(caller.workspace.id, context, brand),
  }),

  brand_status: tool({
    description:
      "What a brand still lacks before it is worth sharing, as steps in order: colors, typefaces, logo and voice in " +
      "the rules, pages worth reading, a publish readers see, and a portal. Each step says whether it is done, what " +
      "it stands at, and `agent`: how to do it, with the tools by name. `next` is the step to take now; `brands` " +
      "names every brand; `url` opens the brand in the app. Start here, and ask again after a change.",
    action: "brand.read",
    readOnly: true,
    input: TOOL_INPUTS.brand_status,
    run: async ({ brand }, caller) => brandStatus(caller, brand),
  }),

  create_brand: tool({
    description:
      "Make a brand: its own rules, pages, theme and history, beside the others in the workspace. Empty, or with " +
      "`from`, a copy of that brand's current rules, pages and theme, or `template`, a showcase brand (Firefox, Rust, Blender) to edit. `slug` is made from the name when left out. " +
      "Returns the brand and its url. Next: brand_status with its slug, which says what it lacks.",
    action: "brand.edit",
    readOnly: false,
    input: TOOL_INPUTS.create_brand,
    run: async (input, caller) => {
      const made = await makeBrand(caller, input);
      return { ...made, url: brandUrl(made.slug) };
    },
  }),

  update_brand: tool({
    description:
      "Rename a brand, change its slug, or make it the default (`default: true`; the old default lets go). A new " +
      "slug changes its address in the app; portals showing it keep showing it. Returns the brand.",
    action: "brand.edit",
    readOnly: false,
    input: TOOL_INPUTS.update_brand,
    run: async ({ brand, ...patch }, caller) => {
      const b = await updateBrand(caller.workspace.id, brand, patch);
      return { ...b, url: brandUrl(b.slug) };
    },
  }),

  delete_brand: tool({
    description:
      "Delete a brand with its rules, pages, theme and history, which can't be had back; portals stop showing it. " +
      "The assets stay in the library. The default brand can't go: make another the default first with update_brand. " +
      "Only when the person asks.",
    action: "brand.edit",
    readOnly: false,
    destructive: true,
    input: TOOL_INPUTS.delete_brand,
    run: async ({ brand }, caller) => ({ deleted: await deleteBrand(caller.workspace.id, brand), brand }),
  }),

  // ---- brand pages: guidelines laid out for people, over the rules (lib/pages.ts)

  brand_playbook: tool({
    description:
      "What a good brand site is, before you build one: research the brand, assets before pages, a look that fits, " +
      "the overview as a landing page, one idea per section with varied blocks, titles as claims, how to review. " +
      "With a worked example in calls. Read it once, before the first save_page.",
    action: "brand.read",
    readOnly: true,
    input: TOOL_INPUTS.brand_playbook,
    run: async () => ({ markdown: PLAYBOOK }),
  }),

  preview_page: tool({
    description:
      "The page as readers see it now, as a picture (JPEG, the whole page, up to 10000px tall): look at your work " +
      "the way a person would, after save_page or set_theme. `url` opens the same in the app. Needs the server's " +
      "browser; without one it says so.",
    action: "brand.read",
    readOnly: true,
    input: TOOL_INPUTS.preview_page,
    run: async ({ brand, page, width, context }, caller) => {
      const p = await printPage(caller, brand, page, { width, context });
      return { image: { data: p.jpeg.toString("base64"), mimeType: "image/jpeg" }, width: p.width, height: p.height, bytes: p.jpeg.length, url: p.url };
    },
  }),

  list_templates: tool({
    description:
      "The section templates a brand page is built from: what each is for, which rules it binds by key, what its " +
      "items are, its layout defaults, its own props as JSON Schema, and an example section. `common` says what " +
      "every section takes. Read it before save_page or edit_page.",
    action: "brand.read",
    readOnly: true,
    input: TOOL_INPUTS.list_templates,
    run: async () => templateCatalog(),
  }),

  list_pages: tool({
    description:
      "A brand's pages, in order, with their tree: slug, title, parent (the page each sits under), eyebrow, lede, " +
      "cover, icon, audience, whether hidden, how many sections, and aliases (old slugs that still lead to it). " +
      "get_page reads one.",
    action: "brand.read",
    readOnly: true,
    input: TOOL_INPUTS.list_pages,
    run: async ({ brand }, caller) => listPages(caller.workspace.id, brand),
  }),

  get_page: tool({
    description:
      "One brand page: its fields and sections (template, layout, the keys of the rules each shows, items, props), " +
      "the rules they show resolved for a context, and the page as Markdown. `missing` names keys whose rule has " +
      "since gone; `warnings`, what a reader would trip on (a link to no page, a key with no rule); `url` opens it " +
      "in the app as readers see it. An old slug finds the page too.",
    action: "brand.read",
    readOnly: true,
    input: TOOL_INPUTS.get_page,
    run: async ({ brand, page, context }, caller) => {
      const p = await getPage(caller.workspace.id, brand, page, context);
      return { ...p, rules: forAgent(p.rules) };
    },
  }),

  set_rules: tool({
    description:
      "Make or change brand rules, many at once, as one version in the brand's history. A rule is { key, type, " +
      "value, label?, usage?, spec?, context?, assets? }: type is color (#rrggbb), text (Markdown), number, list, or font " +
      '({ family, weight?, size? }); keys are dotted camelCase (color.primary, logo.minSize, tone.avoid) and never ' +
      "change: `label` is the heading readers see. `spec` holds what the value can't: a color's print values, tints, " +
      "pair or gradient (its stops name color rules), a number's unit, a face's role, tracking and case; null clears it. " +
      "Name lists like always, do or prefer for do's, never, avoid or dont for don'ts: pages show them that way. " +
      "An existing key and context is changed; its type can't change. `remove` deletes. All or nothing.",
    action: "brand.edit",
    readOnly: false,
    input: TOOL_INPUTS.set_rules,
    run: async ({ brand, set, remove }, caller) => setRules(caller, brand, { set, remove }),
  }),

  save_page: tool({
    description:
      "Make a brand page, or replace one, whole: its title, its place (parent nests it, three levels at most), its " +
      "own fields and every section top to bottom. A section is a template with its keys, items, tone and words; " +
      "list_templates says what each shows, binds and lists. Keys must name rules the template can show (set_rules " +
      "makes them). A page field left out keeps its value; null clears it. Every problem comes back at once with its " +
      "path; `warnings` name what a reader would trip on, and `url` opens the page. Example: " +
      '{ page: "color", title: "Color", parent: "identity", sections: [{ template: "palette", title: "Palette", ' +
      'keys: ["color.primary", "color.ink"] }, { template: "dodont", title: "Contrast", tone: "panel", items: ' +
      '[{ verdict: "dont", title: "Ink on primary" }] }] }. Changes are drafts until publish.',
    action: "brand.edit",
    readOnly: false,
    input: TOOL_INPUTS.save_page,
    run: async ({ brand, page, ...input }, caller) => savePage(caller, brand, page, input),
  }),

  edit_page: tool({
    description:
      "Change a page without resending it: add a section (after a section id, null for the top, or at the end), " +
      "update one (the fields in `set`; null clears one), move one (after an id, null for the top), remove one, and " +
      "page for the page's own fields (title, parent, audience...; a new slug renames it, and the old one keeps " +
      "working). Applied in order; all or none, and every problem comes back with its path. Section ids come from " +
      "get_page. Returns the page, its warnings and its url.",
    action: "brand.edit",
    readOnly: false,
    input: TOOL_INPUTS.edit_page,
    run: async ({ brand, page, ops }, caller) => editPage(caller, brand, page, ops),
  }),

  delete_page: tool({
    description: "Delete a brand page. The brand's history keeps it: restoring a version brings it back.",
    action: "brand.edit",
    readOnly: false,
    destructive: true,
    input: TOOL_INPUTS.delete_page,
    run: async ({ brand, page }, caller) => deletePage(caller, brand, page),
  }),

  generate_pages: tool({
    description:
      "Lay out a brand that has no pages from its rules: an Overview (cover, palette), then a page per section of " +
      "keys (color, logo, type, tone...) with the templates its rules fit. Write the rules first: with none it makes one cover, and " +
      "warns. A start to edit from; a brand with pages is left alone. " +
      "With `set`, add one topic's pages beside the ones there are: Our X, Using X, In product, In marketing, Best practices " +
      "and Showcase, with starter sections, under `parent` (or a page named for the topic). Refused when a slug is taken.",
    action: "brand.edit",
    readOnly: false,
    input: TOOL_INPUTS.generate_pages,
    run: async ({ brand, set }, caller) => {
      const made = await generatePages(caller, brand, set);
      if (set) return made;
      // A brand with no rules gets a cover and nothing else: say so, and what makes it more.
      const rules = await listRules(caller.workspace.id, { brand: made.brand });
      const warnings = rules.length
        ? []
        : ["The brand has no rules, so its pages are one cover. set_rules adds colors, typefaces, a logo and a voice; then save_page lays them out, or delete the overview and generate_pages again."];
      return { ...made, warnings, url: brandUrl(made.brand) };
    },
  }),

  get_theme: tool({
    description:
      "How a brand's pages look: its theme settings (which rules are the accent, grounds, ink and faces; the logo " +
      "and device; radius, width, density, type scale, nav, band, numbering, motion), the look they give, and " +
      "checks: every ink graded on its ground, a failing pair with the color used instead. Warnings name each " +
      "pair that fell back and each setting whose rule has gone. What isn't set is read from the rules.",
    action: "brand.read",
    readOnly: true,
    input: TOOL_INPUTS.get_theme,
    run: async ({ brand }, caller) => getTheme(caller.workspace.id, brand),
  }),

  set_theme: tool({
    description:
      "Change how a brand's pages look, a setting at a time: what you pass merges into the settings, and null " +
      "clears one back to what the rules give. Color settings name color rules, face settings font rules, logo a " +
      "rule with a picture, device an image asset. Every problem comes back at once with its path. Returns the " +
      "look and its contrast checks, as get_theme does: a pair that fails falls back and warns, so pick another " +
      "rule or accept the fallback. A draft in the brand's history until publish.",
    action: "brand.edit",
    readOnly: false,
    input: TOOL_INPUTS.set_theme,
    run: async ({ brand, ...patch }, caller) => setTheme(caller, brand, patch),
  }),

  // ---- history and review comments

  list_versions: tool({
    description:
      "A brand's history, newest first: every edit to its rules, pages and theme is a version, with who made it, " +
      "what it changed, its name if someone kept it as a checkpoint, and whether (and when) it was published. " +
      "get_version reads one; restore_version brings one back.",
    action: "brand.read",
    readOnly: true,
    input: TOOL_INPUTS.list_versions,
    run: async ({ brand }, caller) => {
      const b = await resolveBrand(caller.workspace.id, brand);
      return { brand: b.slug, versions: await listVersions(caller.workspace.id, b.slug) };
    },
  }),

  get_version: tool({
    description:
      "One version of a brand: its rules as they were, and what changed, rule by rule, from the version before " +
      "(or from `against`; `against: current` shows what changed since it, what restoring it would undo).",
    action: "brand.read",
    readOnly: true,
    input: TOOL_INPUTS.get_version,
    run: async ({ brand, number, against }, caller) => {
      const b = await resolveBrand(caller.workspace.id, brand);
      const v = await getVersion(caller.workspace.id, b.slug, number, against);
      if (!v) throw new AssetError("not_found", `${b.slug} has no version ${number}: list_versions names them`);
      return v;
    },
  }),

  name_version: tool({
    description: "Keep a version as a named checkpoint (e.g. Before the rebrand), easy to find and restore later; `name: null` clears it.",
    action: "brand.edit",
    readOnly: false,
    input: TOOL_INPUTS.name_version,
    run: async ({ brand, number, name }, caller) => {
      const b = await resolveBrand(caller.workspace.id, brand);
      const v = await nameVersion(caller.workspace.id, b.slug, number, name);
      if (!v) throw new AssetError("not_found", `${b.slug} has no version ${number}: list_versions names them`);
      return v;
    },
  }),

  restore_version: tool({
    description:
      "Bring a brand's rules, pages and theme back to an earlier version. Nothing is lost: the restore is itself a " +
      "new version, so it can be undone the same way. A draft like any edit, until publish. `droppedAssets` counts " +
      "assets its rules pointed at that are gone since. get_version with `against: current` says what it would change.",
    action: "brand.edit",
    readOnly: false,
    input: TOOL_INPUTS.restore_version,
    run: async ({ brand, number }, caller) => {
      const b = await resolveBrand(caller.workspace.id, brand);
      const r = await restoreVersion(caller, b.slug, number);
      if (!r) throw new AssetError("not_found", `${b.slug} has no version ${number}: list_versions names them`);
      return { brand: b.slug, ...r, url: brandUrl(b.slug) };
    },
  }),

  list_comments: tool({
    description:
      "Review comments on a brand's pages, as threads, open ones first: each pinned to a page and maybe a section " +
      "(its id, as get_page gives), with its replies, author, and whether it is resolved. `mine` marks yours. " +
      "Read the open ones before publishing.",
    action: "brand.read",
    readOnly: true,
    input: TOOL_INPUTS.list_comments,
    run: async ({ brand, page }, caller) => ({ threads: await listComments(caller, brand, { page }) }),
  }),

  add_comment: tool({
    description:
      "Comment on a brand page: `page` (and a `section` id, from get_page) starts a thread; `parent` replies in one. " +
      "Plain text. Comments are about the guidelines, never in them: readers don't see them. Returns the comment.",
    action: "brand.comment",
    readOnly: false,
    input: TOOL_INPUTS.add_comment,
    run: async ({ brand, ...input }, caller) => createComment(caller, brand, input),
  }),

  update_comment: tool({
    description:
      "Resolve a thread once it is dealt with (`resolved: true` on its first comment), or reopen it; or change " +
      "your own comment's `body`. Returns the comment.",
    action: "brand.comment",
    readOnly: false,
    input: TOOL_INPUTS.update_comment,
    run: async ({ brand, id, ...patch }, caller) => updateComment(caller, brand, id, patch),
  }),

  delete_comment: tool({
    description:
      "Delete a comment: your own, or anyone's with a key that edits the brand. A thread's first comment takes its " +
      "replies with it. Resolving keeps the conversation; delete only what shouldn't be there.",
    action: "brand.comment",
    readOnly: false,
    destructive: true,
    input: TOOL_INPUTS.delete_comment,
    run: async ({ brand, id }, caller) => {
      await deleteComment(caller, brand, id);
      return { deleted: true, id };
    },
  }),

  publish: tool({
    description:
      "Publish a brand's pages, rules and theme as they stand: portals show this version, and later edits wait for " +
      "the next publish. Only when the person asks; check the pages with get_page first. `note` tells readers what " +
      "changed (What's new), with an `image` beside it. Publishing with nothing changed does nothing. `portals` " +
      "names the portals showing the brand, where visitors now read it.",
    action: "brand.publish",
    readOnly: false,
    input: TOOL_INPUTS.publish,
    run: async ({ brand, note, image }, caller) => {
      const published = await publishBrand(caller, brand, { note, image });
      const { id } = await resolveBrand(caller.workspace.id, published.brand);
      return { ...published, portals: await portalsShowing(caller.workspace.id, id) };
    },
  }),

  // ---- portals: where brand pages meet visitors outside the team (lib/core/portals.ts)

  list_portals: tool({
    description:
      "The workspace's portals: each one's address (slug) and url, who gets in (access), when it closes, the " +
      "collections and brands it shows, and its site (footer, quick grab, terms, listed). Visitors read a brand's " +
      "latest publish, never the draft: a brand whose publishedAt is null was never published, and shows nothing.",
    action: "portal.manage",
    readOnly: true,
    input: TOOL_INPUTS.list_portals,
    run: async (_input, caller) => ({ portals: await listPortals(caller) }),
  }),

  create_portal: tool({
    description:
      "Make a portal: an address of its own (/p/{slug}) where people read the brands it shows, and browse the " +
      "collections it shows, as last published. `brands` by slug and `collections` by id (list_collections), in order; " +
      "at least one of the two. `access` is members (people with access to the workspace), password (whoever has " +
      "`password`, which the person gives you) or public (anyone with the address): ask the person before a public " +
      "one. `theme` is its look: logo (an approved image asset), accent and background (#rrggbb). `domain`, one of " +
      "the organization's verified domains. `slug` is made from the name when left out, with a number when that one " +
      "is taken. Returns the portal and its url; a brand never published shows nothing there until publish.",
    action: "portal.manage",
    readOnly: false,
    input: TOOL_INPUTS.create_portal,
    run: async ({ slug, ...input }, caller) => {
      if (slug) return (await createPortal(caller, { ...input, slug })) as Record<string, unknown>;
      const base = slugify(input.name).slice(0, 40).replace(/-+$/, "") || "portal";
      for (const s of [base, ...[2, 3, 4, 5].map((n) => `${base}-${n}`)]) {
        try {
          return (await createPortal(caller, { ...input, slug: s })) as Record<string, unknown>;
        } catch (e) {
          if (!(e instanceof AssetError && e.code === "conflict")) throw e;
        }
      }
      throw new AssetError("conflict", `/p/${base} and the next four are taken: pass a slug`);
    },
  }),

  update_portal: tool({
    description:
      "Change a portal: its name, intro and slug; the brands (by slug) and collections (by id) it shows, each the " +
      "whole list, in order; who gets in (`access`, and `password` to set or change one; left out, it stays); " +
      "`theme` (logo, an approved image asset; accent and background, #rrggbb; null clears one); `presets`; " +
      "`domain` (null takes it off); when it closes (expiresAt, a future date; null opens it again); and its site. `site` replaces the whole set, so " +
      "send back what list_portals gave, changed: footer { text (Markdown), links [{ label, href }], credit, " +
      "feedback (a URL or mailto:) }; quick, up to 6 links pinned in the header, each { label } with one of page " +
      "(and brand, else the first), asset or href; terms (Markdown) readers accept before their first download; " +
      "listed, which lets search engines index a public portal. An href is https://, mailto: or a /path. Returns the portal.",
    action: "portal.manage",
    readOnly: false,
    input: TOOL_INPUTS.update_portal,
    run: async ({ portal, ...input }, caller) => {
      // ponytail: finds it among every portal presented; a lookup by slug in core when a workspace has hundreds.
      const p = await portalOf(caller, portal);
      return (await updatePortal(caller, p.id, input))!;
    },
  }),

  delete_portal: tool({
    description:
      "Delete a portal: its address and domain stop answering at once, and links given to people who asked in stop " +
      "working. The brands and collections it showed stay. To take it offline for now, close_portal instead. " +
      "Only when the person asks.",
    action: "portal.manage",
    readOnly: false,
    destructive: true,
    input: TOOL_INPUTS.delete_portal,
    run: async ({ portal }, caller) => {
      const p = await portalOf(caller, portal);
      await deletePortal(caller, p.id);
      return { deleted: true, portal: p.slug };
    },
  }),

  close_portal: tool({
    description:
      "Take a portal offline now: visitors are told it is closed, and nothing about it is lost. update_portal with " +
      "`expiresAt: null` opens it again. Returns the portal.",
    action: "portal.manage",
    readOnly: false,
    input: TOOL_INPUTS.close_portal,
    run: async ({ portal }, caller) => {
      const p = await portalOf(caller, portal);
      return (await closePortal(caller, p.id))!;
    },
  }),

  list_portal_requests: tool({
    description:
      "Who asked to get into a password or members portal, or asked for something through a request section, " +
      "newest first: their email, name, note, what they asked for, and what became of it. decide_portal_request answers.",
    action: "portal.manage",
    readOnly: true,
    input: TOOL_INPUTS.list_portal_requests,
    run: async ({ portal }, caller) => {
      const p = await portalOf(caller, portal);
      return { portal: p.slug, requests: (await listRequests(caller, p.id)) ?? [] };
    },
  }),

  decide_portal_request: tool({
    description:
      "Approve or deny a request. Approving someone's access gives them a link of their own, emailed to them when " +
      "the organization's email works (`emailed`), and in `url` either way; approving an ask marks it done. On a " +
      "person's say-so.",
    action: "portal.manage",
    readOnly: false,
    input: TOOL_INPUTS.decide_portal_request,
    run: async ({ portal, request, status }, caller) => {
      const p = await portalOf(caller, portal);
      const out = await decideRequest(caller, p.id, request, status);
      if (!out) throw new AssetError("not_found", `No request ${request} on ${p.slug}: list_portal_requests names them`);
      return { ...out.data, emailed: out.emailed };
    },
  }),

  my_proposals: tool({
    description:
      "What you proposed and what became of it: `proposed` still waits for a person, `active` was " +
      "approved, `rejected` was turned down, with the person's reason in `reviewNote`. Read the reasons before " +
      "proposing more of the same.",
    action: "asset.upload",
    readOnly: true,
    input: TOOL_INPUTS.my_proposals,
    run: async ({ status, limit }, caller) => {
      // ponytail: filters the newest 200 in memory; a status filter in core when an agent proposes more.
      const { data } = await searchAssets(caller, { proposedBy: caller.actor, limit: 200 });
      const mine = data.filter((a) => !status || a.status === status).slice(0, limit);
      return {
        proposals: mine.map((a) => ({ ...summary(a), reviewNote: a.reviewNote, proposedTags: a.proposedTags, proposedFields: a.proposedFields })),
      };
    },
  }),

  propose_tags: tool({
    description:
      "Suggest tags for an asset. They are not applied: a person accepts or dismisses each one. " +
      "Tags the asset already has are ignored.",
    action: "asset.propose_tags",
    readOnly: false,
    input: TOOL_INPUTS.propose_tags,
    run: async ({ id, tags }, caller) => {
      const a = await proposeTags(caller, id, tags);
      if (!a) throw new AssetError("not_found", `No asset ${id}`);
      return { id: a.id, tags: a.tags, proposedTags: a.proposedTags };
    },
  }),

  review_asset: tool({
    description:
      "Decide what waits on review, as a person with approve would: `decision` approve puts a proposed asset in " +
      "the library (its required fields set first, in `fields` if need be), reject turns it down with a `note` " +
      "saying why, which its proposer reads in my_proposals. Suggested tags and field values (describe_asset shows " +
      "them) are applied with acceptTags and acceptFields, or dropped with dismissTags and dismissFields, on any " +
      "asset. All in one change. search_assets with review: true lists what waits. Only on a person's say-so.",
    action: "asset.review",
    readOnly: false,
    input: TOOL_INPUTS.review_asset,
    run: async ({ id, decision, note, fields, acceptTags, dismissTags, acceptFields, dismissFields }, caller) => {
      const a = await found(caller, id);
      if (decision === "reject" && !note) throw new AssetError("invalid", "Say why in `note`: whoever proposed it reads it in my_proposals");
      const [accept, dismiss] = [normalizeTags(acceptTags ?? []), normalizeTags(dismissTags ?? [])];
      const strayTags = [...accept, ...dismiss].filter((t) => !a.proposedTags.includes(t));
      if (strayTags.length) {
        throw new AssetError("invalid", `Not suggested: ${strayTags.join(", ")}. Suggested tags: ${a.proposedTags.join(", ") || "none"}`);
      }
      const [take, drop] = [acceptFields ?? [], dismissFields ?? []];
      const strayKeys = [...take, ...drop].filter((k) => !Object.hasOwn(a.proposedFields, k));
      if (strayKeys.length) {
        throw new AssetError("invalid", `No suggested value for ${strayKeys.join(", ")}. Suggested: ${Object.keys(a.proposedFields).join(", ") || "none"}`);
      }
      const patch: AssetPatch = {};
      if (accept.length) patch.tags = [...a.tags, ...accept];
      if (accept.length || dismiss.length) patch.proposedTags = a.proposedTags.filter((t) => !accept.includes(t) && !dismiss.includes(t));
      if (take.length || drop.length) {
        patch.proposedFields = Object.fromEntries(Object.entries(a.proposedFields).filter(([k]) => !take.includes(k) && !drop.includes(k)));
      }
      const values = { ...Object.fromEntries(take.map((k) => [k, a.proposedFields[k]])), ...fields };
      if (Object.keys(values).length) patch.fields = values;
      if (decision) patch.status = decision === "approve" ? "active" : "rejected";
      if (note) patch.reviewNote = note;
      if (!Object.keys(patch).length) throw new AssetError("invalid", "Nothing to do: pass a decision, fields, or suggestions to accept or dismiss");
      const next = (await updateAsset(caller, id, patch))!;
      return { ...summary(next), reviewNote: next.reviewNote, proposedTags: next.proposedTags, proposedFields: next.proposedFields };
    },
  }),

  list_fields: tool({
    description: "The library's custom fields: each one's key, label, type, the options a choice takes, and whether it is required. For propose_fields.",
    action: "field.read",
    readOnly: true,
    input: TOOL_INPUTS.list_fields,
    run: async (_input, caller) => ({ fields: await listFields(caller.workspace.id) }),
  }),

  create_field: tool({
    description:
      "Define a custom field every asset can carry: a `key` (lowercase, digits and _) and a `type`, which never " +
      "change, a `label` people see, `options` for a select (and only for one), whether it is `required` before an " +
      "asset is approved, and its `position` in the list. Returns the field.",
    action: "field.manage",
    readOnly: false,
    input: TOOL_INPUTS.create_field,
    run: async (input, caller) => createField(caller.workspace.id, input),
  }),

  update_field: tool({
    description:
      "Change a custom field's label, options (the whole list), whether it is required, or its position. Its key " +
      "and type can't change: make another field for that. Returns the field.",
    action: "field.manage",
    readOnly: false,
    input: TOOL_INPUTS.update_field,
    run: async ({ key, ...patch }, caller) => {
      const f = await updateField(caller.workspace.id, key, patch);
      if (!f) throw new AssetError("not_found", `No field "${key}": list_fields names them`);
      return f;
    },
  }),

  delete_field: tool({
    description: "Delete a custom field and every value stored under it, on assets and collections alike. Only when the person asks.",
    action: "field.manage",
    readOnly: false,
    destructive: true,
    input: TOOL_INPUTS.delete_field,
    run: async ({ key }, caller) => {
      if (!(await deleteField(caller.workspace.id, key))) throw new AssetError("not_found", `No field "${key}": list_fields names them`);
      return { deleted: true, key };
    },
  }),

  // ---- collections: groups of assets whose field values their members inherit (lib/core/collections.ts)

  list_collections: tool({
    description:
      "The collections you can see: each one's id, name, icon, whether it is private, the field values its assets " +
      "inherit, and how many assets it holds. ingest_asset, import_icons, import_google_font and create_portal take " +
      "their ids; search_assets narrows to one by name or id.",
    action: "collection.read",
    readOnly: true,
    input: TOOL_INPUTS.list_collections,
    run: async (_input, caller) => ({ collections: await listCollections(caller) }),
  }),

  create_collection: tool({
    description:
      "Make a collection. `fields` are custom field values (list_fields names them) that every asset in it " +
      "inherits, where the asset has none of its own. `private`: only people with a grant on it and admins see " +
      "it; a key that belongs to no person can't make one private. Returns it with its id; update_collection_assets " +
      "puts assets in it.",
    action: "collection.create",
    readOnly: false,
    input: TOOL_INPUTS.create_collection,
    run: async (input, caller) => {
      mayHide(caller, input.private);
      return createCollection(caller, input);
    },
  }),

  update_collection: tool({
    description:
      "Change a collection: its name, icon, whether it is private, and `fields`, which merge into its values (null " +
      "clears one); its assets inherit the change at once. Returns it.",
    action: "collection.edit",
    readOnly: false,
    input: TOOL_INPUTS.update_collection,
    run: async ({ collection, ...patch }, caller) => {
      mayHide(caller, patch.private);
      const c = await collectionOf(caller, collection);
      const changed = await updateCollection(caller, c.id, patch);
      if (!changed) throw new AssetError("not_found", `No collection "${collection}": list_collections names them`);
      return changed;
    },
  }),

  update_collection_assets: tool({
    description:
      "Put assets in a collection and take others out, in one call. An asset can be in many collections; taking " +
      "one out leaves it in the library. An id you can't see is refused, not skipped. Returns the collection.",
    action: "collection.edit",
    readOnly: false,
    input: TOOL_INPUTS.update_collection_assets,
    run: async ({ collection, add, remove }, caller) => {
      const c = await collectionOf(caller, collection);
      await setMembers(caller, c.id, { add, remove });
      return (await getCollection(caller, c.id)) ?? c;
    },
  }),

  delete_collection: tool({
    description:
      "Delete a collection. Its assets stay in the library and stop inheriting its field values; portals stop " +
      "showing it, and grants on it go. Only when the person asks.",
    action: "collection.delete",
    readOnly: false,
    destructive: true,
    input: TOOL_INPUTS.delete_collection,
    run: async ({ collection }, caller) => {
      const c = await collectionOf(caller, collection);
      return { deleted: await deleteCollection(caller.workspace.id, c.id), collection: { id: c.id, name: c.name } };
    },
  }),

  propose_fields: tool({
    description:
      "Suggest custom field values for an asset (a campaign, a product code, a usage note). They are not applied: a " +
      "person accepts or dismisses each one. Each value is checked against its field now; one the asset already has is ignored.",
    action: "asset.propose_fields",
    readOnly: false,
    input: TOOL_INPUTS.propose_fields,
    run: async ({ id, fields }, caller) => {
      const a = await proposeFields(caller, id, fields);
      if (!a) throw new AssetError("not_found", `No asset ${id}`);
      return { id: a.id, fields: { ...a.inherited, ...a.fields }, proposedFields: a.proposedFields };
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

/** A tool's answer as MCP content: its JSON, and a picture first when it drew one (preview_page). */
const toolResult = ({ image, ...data }: Record<string, unknown> & { image?: { data: string; mimeType: string } }, isError = false) => ({
  content: [...(image ? [{ type: "image", data: image.data, mimeType: image.mimeType }] : []), { type: "text", text: JSON.stringify(data, null, 2) }],
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
        serverInfo: { name: "artbucket", version: "1.2.0" },
        instructions: can(caller, "brand.edit") ? INSTRUCTIONS : INSTRUCTIONS + READ_ONLY_BRAND,
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
            .map(async ([name, t]) => ({
              name,
              description: typeof t.description === "string" ? t.description : await t.description(caller),
              inputSchema: SCHEMAS[name],
              annotations: { readOnlyHint: t.readOnly, destructiveHint: !!t.destructive, openWorldHint: OPEN_WORLD.has(name) },
            })),
        ),
      });
    // Brand rules and pages as resources, for clients that attach context by hand.
    case "resources/list": {
      const resources: Record<string, string>[] = [
        { uri: PLAYBOOK_URI, name: "brand-playbook", title: "Building a brand site: the playbook", description: "What a good brand site is, and a worked example in calls", mimeType: "text/markdown" },
      ];
      for (const b of await listBrands(caller.workspace.id)) {
        const uri = rulesUri(b);
        const all = { uri, name: `brand-rules-${b.slug}`, title: `${b.name}: brand rules`, mimeType: "application/json" };
        resources.push({ ...all, description: `Every rule of ${b.name}${b.default ? ", the default brand" : ""}` });
        for (const c of await listContexts(caller.workspace.id, b.slug)) {
          resources.push({ ...all, uri: `${uri}/${c}`, name: `${all.name}-${c}`, title: `${b.name}: ${c}`, description: `One rule per key, for ${c}` });
        }
        for (const p of (await listPages(caller.workspace.id, b.slug)).pages) {
          resources.push({
            uri: pageUri(b.slug, p.slug),
            name: `brand-page-${b.slug}-${p.slug}`,
            title: `${b.name}: ${p.title}`,
            description: `The ${p.title} page as Markdown${p.hidden ? " (hidden from readers)" : ""}`,
            mimeType: "text/markdown",
          });
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
          {
            uriTemplate: pageUri("{brand}", "{page}"),
            name: "brand-page",
            title: "A brand page",
            description: "The page as Markdown: what it says and the rules it shows",
            mimeType: "text/markdown",
          },
        ],
      });
    case "resources/read": {
      const uri = String(params.uri ?? "");
      if (uri === PLAYBOOK_URI) return result(id, { contents: [{ uri, mimeType: "text/markdown", text: PLAYBOOK }] });
      const m = uri.match(/^artbucket:\/\/(?:brand|brands\/([^/?#]+))\/rules(?:\/([^/?#]+))?$/);
      const page = uri.match(/^artbucket:\/\/brands\/([^/?#]+)\/pages\/([^/?#]+)$/);
      try {
        if (page) {
          const { markdown } = await getPage(caller.workspace.id, decodeURIComponent(page[1]), decodeURIComponent(page[2]));
          return result(id, { contents: [{ uri, mimeType: "text/markdown", text: markdown }] });
        }
        if (!m) return error(id, -32002, `Resource not found: ${uri}`);
        const data = await rulesFor(caller.workspace.id, m[2] && decodeURIComponent(m[2]), m[1] && decodeURIComponent(m[1]));
        return result(id, { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }] });
      } catch (err) {
        if (err instanceof AssetError) return error(id, -32602, err.message);
        throw err;
      }
    }
    case "tools/call": {
      const name = String(params.name);
      const t = Object.hasOwn(TOOLS, name) ? TOOLS[name as ToolName] : undefined;
      if (!t) return error(id, -32602, `Unknown tool: ${String(params.name)}`);
      if (!can(caller, t.action)) {
        return result(id, toolResult({ error: `This key's scope is ${caller.scope ?? "none"}; ${params.name} needs ${needs(t.action)}` }, true));
      }
      const args = t.input.safeParse(params.arguments ?? {});
      // One line per problem with its path, as core's own refusals read: ops[1].section.props.chanel: Unrecognized key.
      if (!args.success) return result(id, toolResult({ error: issues(args.error).join("\n") }, true));
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
