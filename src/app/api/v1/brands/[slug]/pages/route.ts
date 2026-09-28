import { ok, route } from "@/lib/api";
import { generatePages, listPages } from "@/lib/core/pages";

type P = { slug: string };

/** GET /api/v1/brands/{slug}/pages - its pages in order, with their tree fields and without their sections. */
export const GET = route<P>("brand.read", async (_req, { slug }, caller) => ok({ data: (await listPages(caller.workspace.id, slug)).pages }));

/** POST /api/v1/brands/{slug}/pages - lay out a first set of pages from the rules; 409 when it has pages. */
export const POST = route<P>("brand.edit", async (_req, { slug }, caller) => ok({ data: await generatePages(caller, slug) }, { status: 201 }));
