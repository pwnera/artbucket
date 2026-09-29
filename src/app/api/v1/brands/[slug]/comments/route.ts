import { body, ok, route } from "@/lib/api";
import { createComment, listComments } from "@/lib/core/brand-comments";
import { CommentCreate } from "@/lib/schemas";

type P = { slug: string };

/**
 * GET /api/v1/brands/{slug}/comments?page=logo - its review comments as
 * threads, open ones first, each with its replies. `page`: that page's only,
 * by an old slug too.
 */
export const GET = route<P>("brand.read", async (req, { slug }, caller) => {
  const page = new URL(req.url).searchParams.get("page") || undefined;
  return ok({ data: await listComments(caller, slug, { page }) });
});

/** POST /api/v1/brands/{slug}/comments - `{ page, section?, body }` starts a thread, `{ parent, body }` replies in one; 201. */
export const POST = route<P>("brand.comment", async (req, { slug }, caller) =>
  ok({ data: await createComment(caller, slug, await body(req, CommentCreate)) }, { status: 201 }),
);
