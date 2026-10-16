"use client";

import { brandPath } from "@/lib/site";

export type BrandInfo = { id: string; slug: string; name: string; default: boolean; rules: number; private?: boolean };

/** A brand in the app: its Overview, the tab it opens on. */
export const brandHref = (b: { slug: string }) => brandPath(b.slug);
