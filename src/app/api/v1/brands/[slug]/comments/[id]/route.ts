import { body, ok, route } from "@/lib/api";
import { deleteComment, updateComment } from "@/lib/core/brand-comments";
import { CommentPatch } from "@/lib/schemas";

type P = { slug: string; id: string };

/** PATCH /api/v1/brands/{slug}/comments/{id} - `{ body?, resolved? }`: edit your own, resolve or reopen a thread. */
export const PATCH = route<P>("brand.comment", async (req, { slug, id }, caller) =>
  ok({ data: await updateComment(caller, slug, id, await body(req, CommentPatch)) }),
);

/** DELETE /api/v1/brands/{slug}/comments/{id} - yours, or anyone's with brand.edit; a thread's first comment takes its replies. */
export const DELETE = route<P>("brand.comment", async (_req, { slug, id }, caller) => {
  await deleteComment(caller, slug, id);
  return ok({ data: { deleted: true } });
});
