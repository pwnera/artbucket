/**
 * Sites (PRD part 2): one object with an address, access and deployments.
 * A `portal` is managed: Artbucket renders it from the brand (lib/portal.ts,
 * the `portals` table it lives in). The other kinds are builds: static files
 * made anywhere, uploaded as deployments, mounted at a path of the site.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

export const SITE_KINDS = ["portal", "guidelines", "landing", "docs", "storybook"] as const;
export type SiteKind = (typeof SITE_KINDS)[number];

/** The kinds that are static files someone built: every kind but the managed portal. */
export const BUILD_KINDS = SITE_KINDS.filter((k): k is Exclude<SiteKind, "portal"> => k !== "portal");
export type BuildKind = (typeof BUILD_KINDS)[number];

export const SITE_KIND_LABEL: Record<SiteKind, string> = {
  portal: "Brand portal",
  guidelines: "Guidelines",
  landing: "Landing",
  docs: "Docs",
  storybook: "Storybook",
};

export const DEPLOYMENT_STATES = ["checking", "live", "failed", "replaced"] as const;
export type DeploymentState = (typeof DEPLOYMENT_STATES)[number];

/**
 * A mount path: `/`, or `/` and lowercase segments (`/docs`, `/storybook/v2`),
 * no trailing slash. Null when it isn't one.
 */
export function mountPath(raw: string): string | null {
  const p = raw.trim().replace(/\/+$/, "") || "/";
  return p === "/" || /^(\/[a-z0-9][a-z0-9-]{0,62}){1,4}$/.test(p) ? p : null;
}
