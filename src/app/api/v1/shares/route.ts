import { body, narrow, ok, route } from "@/lib/api";
import { createShare, listShares } from "@/lib/core/shares";
import { ShareCreate } from "@/lib/schemas";

/** GET /api/v1/shares - the workspace's share links, on what you may share. */
export const GET = route(narrow("write"), async (_req, _p, caller) => ok({ data: await listShares(caller) }));

/**
 * POST /api/v1/shares - a link for people without an account: `view` a
 * collection or one asset, or `upload` into a collection (or the workspace),
 * as proposals. Optional `password` and `expiresAt`. Needs write on it.
 */
export const POST = route(narrow("write"), async (req, _p, caller) =>
  ok({ data: await createShare(caller, await body(req, ShareCreate)) }, { status: 201 }),
);
