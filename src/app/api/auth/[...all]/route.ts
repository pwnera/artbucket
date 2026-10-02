import { authAt } from "@/lib/auth";

/**
 * better-auth: sign up, sign in, sign out, sessions, OIDC. Its own surface,
 * documented by better-auth, and the one thing the web UI calls outside
 * /api/v1: who someone is. What they may do is /api/v1.
 */
const handler = async (req: Request) => (await authAt(req.headers.get("x-forwarded-host") ?? req.headers.get("host"))).handler(req);

export { handler as GET, handler as POST };
