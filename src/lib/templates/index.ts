import type { BrandBook } from "../fixtures/brand-book.ts";
import blender from "./blender.json" with { type: "json" };
import firefox from "./firefox.json" with { type: "json" };
import rust from "./rust.json" with { type: "json" };

/**
 * Brands to start from, taken from the showcase brands on production over
 * MCP: their rules, theme and pages as set_rules, set_theme and save_page take
 * them. Asset ids are production's; `assets` says where each came from, so a
 * new brand ingests its own copy and the ids are swapped for the new ones.
 */
export type BrandTemplate = BrandBook & {
  name: string;
  /** Production asset id: the public file it was ingested from. */
  assets: Record<string, { url: string; filename: string }>;
  /** Google Fonts families the font rules name. */
  fonts: string[];
};

export const TEMPLATES = { firefox, rust, blender } as unknown as Record<TemplateId, BrandTemplate>;
export type TemplateId = "firefox" | "rust" | "blender";
