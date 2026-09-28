import { ok, route } from "@/lib/api";
import { generatePages, listPages } from "@/lib/core/pages";
import { GeneratePagesInput } from "@/lib/schemas";

type P = { slug: string };

/** GET /api/v1/brands/{slug}/pages - its pages in order, with their tree fields and without their sections. */
export const GET = route<P>("brand.read", async (_req, { slug }, caller) => ok({ data: (await listPages(caller.workspace.id, slug)).pages }));

/**
 * POST /api/v1/brands/{slug}/pages - lay out a first set of pages from the rules; 409 when it has pages.
 * With `{ set: { topic, parent? } }`, one topic's pages beside the ones there are. The body may be left out.
 */
export const POST = route<P>("brand.edit", async (req, { slug }, caller) => {
  const raw = await req.text();
  const { set } = GeneratePagesInput.parse(raw ? JSON.parse(raw) : {});
  return ok({ data: await generatePages(caller, slug, set) }, { status: 201 });
});
