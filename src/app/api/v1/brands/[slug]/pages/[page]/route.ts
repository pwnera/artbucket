import type { z } from "zod";
import { ok, route } from "@/lib/api";
import { refuse } from "@/lib/core/brand";
import { deletePage, editPage, getPage, savePage } from "@/lib/core/pages";
import { issues } from "@/lib/pages";
import { PageEdit, PageInput } from "@/lib/schemas";

type P = { slug: string; page: string };

/** The body, or a 422 listing every problem with its path: the lines MCP gives, not a 400. */
async function input<T extends z.ZodType>(req: Request, schema: T): Promise<z.output<T>> {
  const got = schema.safeParse(await req.json());
  refuse(got.success ? [] : issues(got.error));
  return got.data!;
}

/**
 * GET /api/v1/brands/{slug}/pages/{page}?context=dark-background - the page,
 * the rules it shows resolved for the context, its warnings, as Markdown, and
 * where to read it. A slug it had before a rename finds it too.
 */
export const GET = route<P>("brand.read", async (req, { slug, page }, caller) => {
  const context = new URL(req.url).searchParams.get("context") || undefined;
  return ok({ data: await getPage(caller.workspace.id, slug, page, context) });
});

/** PUT /api/v1/brands/{slug}/pages/{page} - make the page, 201, or replace it whole, 200. */
export const PUT = route<P>("brand.edit", async (req, { slug, page }, caller) => {
  const saved = await savePage(caller, slug, page, await input(req, PageInput));
  return ok({ data: saved }, { status: saved.created ? 201 : 200 });
});

/** PATCH /api/v1/brands/{slug}/pages/{page} - `{ ops }`, applied in order, all or none. */
export const PATCH = route<P>("brand.edit", async (req, { slug, page }, caller) =>
  ok({ data: await editPage(caller, slug, page, (await input(req, PageEdit)).ops) }),
);

/** DELETE /api/v1/brands/{slug}/pages/{page} - 409 while pages sit under it. */
export const DELETE = route<P>("brand.edit", async (_req, { slug, page }, caller) => {
  await deletePage(caller, slug, page);
  return ok({ data: { deleted: true } });
});
