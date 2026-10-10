"use client";

import Link from "next/link";
import { IconSitemap } from "@/components/icons";
import { IconButton } from "@/components/icon-button";

/**
 * The way back to the catalog from anything it holds (a collection, an
 * asset, a brand, a portal): its lineage, access and activity live there.
 * `onOpen` instead of the link where leaving must ask first (unsaved edits).
 */
export function CatalogButton({
  id,
  name,
  variant = "outline",
  size = "icon-sm",
  onOpen,
}: {
  id: string;
  name?: string;
  variant?: "outline" | "ghost";
  size?: "icon-sm" | "icon";
  onOpen?: (href: string) => void;
}) {
  const href = `/catalog?o=${id}`;
  const label = name ? `${name} in the catalog` : "Open in the catalog";
  return onOpen ? (
    <IconButton variant={variant} size={size} label={label} onClick={() => onOpen(href)}>
      <IconSitemap />
    </IconButton>
  ) : (
    <IconButton variant={variant} size={size} label={label} asChild>
      <Link href={href}>
        <IconSitemap />
      </Link>
    </IconButton>
  );
}
