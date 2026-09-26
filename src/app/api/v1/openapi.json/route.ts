import { env } from "@/lib/env";
import { openapi } from "@/lib/openapi";

/** GET /api/v1/openapi.json - public, so clients and agents can discover the API. */
export const GET = () => Response.json(openapi(env.APP_URL));
