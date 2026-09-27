import { serverMetadata } from "@/lib/core/oauth";

/** GET /.well-known/oauth-authorization-server (rewritten here): RFC 8414 metadata. */
export const GET = () => Response.json(serverMetadata());
