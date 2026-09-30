/**
 * Links to the server's Git integration (GIT_CONNECT_URL, /api/v1/me `git`):
 * the template with {brand} filled in. A brand's slug connects that brand;
 * none brings a new brand in from a repository.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */
export const gitLink = (template: string, brand?: string) => template.replaceAll("{brand}", brand ? encodeURIComponent(brand) : "");

/** Where the integration sends a person back to: the builder, with ?git=connected. */
export const GIT_RETURN = "connected";
