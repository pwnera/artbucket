import { resourceMetadata } from "@/lib/core/oauth";

/** GET /.well-known/oauth-protected-resource (rewritten here): RFC 9728, what an MCP client reads after a 401. */
export const GET = () => Response.json(resourceMetadata());
