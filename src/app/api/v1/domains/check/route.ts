import { fail, handle, ok } from "@/lib/api";
import { domainAllowed } from "@/lib/core/domains";

/**
 * GET /api/v1/domains/check?domain={host} - 200 when this server serves the
 * host (a verified portal domain), 404 otherwise. For a reverse proxy that
 * issues TLS certificates on demand: Caddy's `on_demand_tls { ask ... }`.
 */
export async function GET(req: Request) {
  try {
    const host = new URL(req.url).searchParams.get("domain") ?? "";
    return (await domainAllowed(host)) ? ok({ data: { domain: host, served: true } }) : fail(404, "not_found", "Not a domain this server serves");
  } catch (err) {
    return handle(err);
  }
}
