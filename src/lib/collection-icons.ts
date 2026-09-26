/**
 * The icons a collection can wear, by Tabler name. Names only, so the API can
 * validate against this list without importing React; the UI maps them.
 */
export const COLLECTION_ICONS = [
  "folder",
  "photo",
  "palette",
  "brush",
  "camera",
  "movie",
  "music",
  "star",
  "heart",
  "flag",
  "bookmark",
  "briefcase",
  "building-store",
  "speakerphone",
  "rocket",
  "sparkles",
  "leaf",
  "world",
  "users",
  "archive",
] as const;

export type CollectionIcon = (typeof COLLECTION_ICONS)[number];
