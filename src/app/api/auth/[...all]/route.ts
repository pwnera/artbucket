import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

/**
 * better-auth: sign up, sign in, sign out, sessions, OIDC. Its own surface,
 * documented by better-auth, and the one thing the web UI calls outside
 * /api/v1: who someone is. What they may do is /api/v1.
 */
export const { GET, POST } = toNextJsHandler(auth);
