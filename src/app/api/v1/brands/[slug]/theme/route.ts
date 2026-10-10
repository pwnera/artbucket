import { ok, route } from "@/lib/api";
import { refuse } from "@/lib/core/brand";
import { getTheme, setTheme } from "@/lib/core/theme";
import { issues } from "@/lib/pages";
import { ThemePatch } from "@/lib/schemas";

type P = { slug: string };

/** GET /api/v1/brands/{slug}/theme - its theme settings and the look they give. */
export const GET = route<P>("brand.read", async (_req, { slug }, caller) => ok({ data: await getTheme(caller.project.id, slug) }));

/** PATCH /api/v1/brands/{slug}/theme - merges: a key left out keeps its value, null clears it. A draft until published. */
export const PATCH = route<P>("brand.edit", async (req, { slug }, caller) => {
  const patch = ThemePatch.safeParse(await req.json());
  refuse(patch.success ? [] : issues(patch.error));
  return ok({ data: await setTheme(caller, slug, patch.data!) });
});
