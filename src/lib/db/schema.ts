import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  primaryKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { FieldType, FieldValues } from "@/lib/fields";
import type { Metadata } from "@/lib/metadata";
import type { RuleType, RuleValue } from "@/lib/rules";
import type { Scope } from "@/lib/scopes";

export type AssetStatus = "active" | "proposed";

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

/**
 * Assets are content-addressed: `sha256` is the identity of the bytes, and the
 * storage key is derived from it. Uploading the same file twice is a no-op.
 *
 */
export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sha256: text("sha256").notNull().unique(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
    /** Freeform probe output (format, pages, colour space). */
    probe: jsonb("probe").$type<Record<string, unknown>>(),
    /** EXIF / IPTC / XMP read from the file on ingest. See lib/metadata.ts. */
    metadata: jsonb("metadata").$type<Metadata>(),
    /** Lowercased and deduped by lib/tags.ts before they get here. */
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    /** Values for the library's custom fields, keyed by `fields.key`. */
    fields: jsonb("fields").$type<FieldValues>().notNull().default({}),
    /**
     * Values this asset inherits from its collections, materialized by
     * lib/core/collections.ts whenever membership or a collection changes, so
     * search and filters read one row. The asset's own `fields` win over these.
     */
    inherited: jsonb("inherited").$type<FieldValues>().notNull().default({}),
    /**
     * `proposed` until a human promotes it: what a propose-scoped key (an
     * agent) uploads. Default searches show `active` only.
     */
    status: text("status").$type<AssetStatus>().notNull().default("active"),
    /** Tags an agent suggested, waiting for a human to accept or dismiss. */
    proposedTags: jsonb("proposed_tags").$type<string[]>().notNull().default([]),
    /**
     * Maintained by Postgres, so it cannot drift from the columns it indexes.
     * 'simple' rather than 'english': asset search is names and keywords, where
     * stemming "logos" to "logo" matters less than matching "fox_v3" by "fox".
     * Filenames are split on . _ - first, since the parser keeps "fox_v3.png"
     * as one token.
     */
    search: tsvector("search")
      .notNull()
      .generatedAlwaysAs(
        sql`setweight(to_tsvector('simple', regexp_replace(filename, '[._-]+', ' ', 'g')), 'A') || setweight(to_tsvector('simple', tags), 'A') || setweight(jsonb_to_tsvector('simple', coalesce(metadata, '{}'), '["string"]'), 'B') || setweight(jsonb_to_tsvector('simple', fields || inherited, '["string"]'), 'B')`,
      ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("assets_created_at_idx").on(t.createdAt.desc()),
    index("assets_search_idx").using("gin", t.search),
    index("assets_tags_idx").using("gin", sql`${t.tags} jsonb_path_ops`),
    // Field filters match the effective value, own over inherited: `inherited || fields`.
    index("assets_effective_fields_idx").using("gin", sql`(${t.inherited} || ${t.fields}) jsonb_path_ops`),
    check("assets_status_check", sql`${t.status} in ('active', 'proposed')`),
  ],
);

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;

/** A named set of assets that can carry field values its members inherit. */
export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** A Tabler icon name from lib/collection-icons.ts; null shows a folder. */
  icon: text("icon"),
  fields: jsonb("fields").$type<FieldValues>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const collectionAssets = pgTable(
  "collection_assets",
  {
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.assetId] }),
    // The primary key serves "members of a collection"; this serves "collections of an asset".
    index("collection_assets_asset_idx").on(t.assetId),
  ],
);

/**
 * The library's custom field schema. `key` is the identity: it is what asset
 * values are stored under, so it and `type` never change once created. Make a
 * new field instead.
 */
export const fields = pgTable(
  "fields",
  {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  type: text("type").$type<FieldType>().notNull(),
  options: jsonb("options").$type<string[]>().notNull().default([]),
  required: boolean("required").notNull().default(false),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  },
  (t) => [
    check("fields_type_check", sql`${t.type} in ('text', 'number', 'date', 'boolean', 'select')`),
  ],
);

/**
 * A named query. `query` is the /api/v1/assets query string, validated when
 * saved, so running one is a plain GET any client can make.
 */
export const savedSearches = pgTable("saved_searches", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  query: text("query").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

/**
 * API keys. Only a SHA-256 of the secret is stored: keys are 256 random bits,
 * so a fast hash is enough and a leaked table leaks no usable key. `prefix`
 * is the first characters of the secret, to tell keys apart in a list.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    hash: text("hash").notNull().unique(),
    scope: text("scope").$type<Scope>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [check("api_keys_scope_check", sql`${t.scope} in ('read', 'propose', 'write', 'admin')`)],
);

/**
 * The canon: one brand rule per (key, context). A null context is the default;
 * see lib/rules.ts for how a context resolves. `value` is checked against
 * `type` by lib/rules.ts, and `type` never changes: delete and recreate.
 */
export const brandRules = pgTable(
  "brand_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    context: text("context"),
    type: text("type").$type<RuleType>().notNull(),
    value: jsonb("value").$type<RuleValue>().notNull(),
    usage: text("usage"),
    /** Order on the page. Shared by a key's context versions, so they move together. */
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    unique("brand_rules_key_context_unique").on(t.key, t.context).nullsNotDistinct(),
    check("brand_rules_type_check", sql`${t.type} in ('color', 'text', 'number', 'list')`),
  ],
);

/**
 * Assets a rule points at, in order: the logo it governs, examples of doing it
 * right. Real foreign keys, so deleting an asset drops it from every rule.
 */
export const brandRuleAssets = pgTable(
  "brand_rule_assets",
  {
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => brandRules.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    /** A rendition spec (lib/transform.ts), e.g. w_512,f_png: the rule means this size, not the original. */
    rendition: text("rendition"),
  },
  (t) => [primaryKey({ columns: [t.ruleId, t.assetId] }), index("brand_rule_assets_asset_idx").on(t.assetId)],
);
