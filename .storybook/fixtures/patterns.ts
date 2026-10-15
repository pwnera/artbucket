/// <reference types="vite/client" />
import type { ColorRow } from "@/lib/color-table";
import type { FieldDef } from "@/lib/fields";
import font from "./nunito-sans.woff2?url";

/**
 * What the shared patterns' stories draw (App/Patterns/*): a project's custom fields, a brand's colors as the
 * Rules tab's table has them, tags with their counts, and a font file (Nunito Sans, OFL, from Storybook's own
 * assets) for the font previews. Made-up names only.
 */

/** Every field type the asset editor renders, required and optional. */
export const fieldDefs: FieldDef[] = [
  { key: "campaign", label: "Campaign", type: "text", options: [], required: true },
  { key: "views", label: "Views", type: "number", options: [], required: false },
  { key: "shot_on", label: "Shot on", type: "date", options: [], required: false },
  { key: "channel", label: "Channel", type: "select", options: ["Web", "Print", "Social", "Out of home"], required: false },
  { key: "approved", label: "Approved", type: "boolean", options: [], required: true },
  { key: "embargo", label: "Embargoed", type: "boolean", options: [], required: false },
];

/** A light value, a dark one and a contrast for each grade: AAA, AA, AA large and a failing one. */
export const colorRows: ColorRow[] = [
  {
    key: "color.paper",
    group: "Ground",
    light: { hex: "#ffffff", own: true, ratio: null },
    dark: { hex: "#14121f", own: true, ratio: null },
  },
  {
    key: "color.ink",
    group: "Ground",
    light: { hex: "#14121f", own: true, ratio: 18.2 },
    dark: { hex: "#f4f2ff", own: true, ratio: 16.9 },
  },
  {
    key: "color.violet",
    group: "Brand",
    light: { hex: "#6d4aff", own: true, ratio: 5.1 },
    dark: { hex: "#6d4aff", own: false, ratio: 3.4 },
  },
  {
    key: "color.nightMuted",
    group: "Brand",
    light: { hex: "#b8b4cc", own: true, ratio: 2.1 },
    dark: { hex: "#8e89a8", own: true, ratio: 5.6 },
  },
];

/** The library's tags with how many assets carry each, as GET /api/v1/facets answers. */
export const tagCounts = [
  { value: "logo", count: 128 },
  { value: "print", count: 64 },
  { value: "social", count: 41 },
  { value: "spring", count: 12 },
  { value: "archive", count: 1_204 },
];

/** A font file the browser can read, for FontFace and the previews. */
export const fontUrl = font;
