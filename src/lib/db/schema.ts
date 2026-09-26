import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Assets are content-addressed: `sha256` is the identity of the bytes, and the
 * storage key is derived from it. Uploading the same file twice is a no-op.
 *
 * v0.1 keeps this deliberately flat. Metadata, tags, collections and custom
 * fields arrive in v0.2 — see ROADMAP.md.
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
    /** Freeform probe output (format, pages, colour space). Shaped in v0.2. */
    probe: jsonb("probe").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [index("assets_created_at_idx").on(t.createdAt.desc())],
);

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
