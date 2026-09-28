import type { Section } from "@/lib/pages";
import type { ViewRule } from "@/lib/site";

/**
 * What a template's renderer is handed: its section, and the rules it binds.
 * Everything else (the page, links, asset URLs, the context) it reads from
 * useSite(), and the section's own text through the slots (slots.tsx).
 */
export type SectionProps = {
  section: Section;
  /** Resolved for the section's active context, in boundKeys order, missing dropped. */
  rules: ViewRule[];
};
