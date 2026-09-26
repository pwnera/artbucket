import { sql } from "drizzle-orm";
import {
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { Metadata } from "@/lib/metadata";

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
        sql`setweight(to_tsvector('simple', regexp_replace(filename, '[._-]+', ' ', 'g')), 'A') || setweight(to_tsvector('simple', tags), 'A') || setweight(jsonb_to_tsvector('simple', coalesce(metadata, '{}'), '["string"]'), 'B')`,
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
  ],
);

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
