import { body, ok, route } from "@/lib/api";
import { hubOf, resolveBrand, setHub } from "@/lib/core/brands";
import { AssetError } from "@/lib/core/errors";
import { portalsShowing } from "@/lib/core/portals";
import type { Caller } from "@/lib/core/access";
import { can } from "@/lib/permissions";
import { HubPatch } from "@/lib/schemas";

type P = { slug: string };

/** The brand on BrandHub, with the portals it could link, for whoever may pick one. */
async function shown(caller: Caller, slug: string, hub: NonNullable<Awaited<ReturnType<typeof hubOf>>> | null) {
  if (!hub) throw new AssetError("not_found", "This server has no BrandHub");
  const b = await resolveBrand(caller.workspace.id, slug);
  return ok({ data: { ...hub, portals: can(caller, "portal.manage") ? await portalsShowing(caller.workspace.id, b.id) : null } });
}

/** GET /api/v1/brands/{slug}/hub - who sees it on BrandHub, where, what it shows, and the portal it links. */
export const GET = route<P>("brand.read", async (_req, { slug }, caller) => shown(caller, slug, await hubOf(await resolveBrand(caller.workspace.id, slug))));

/** PATCH /api/v1/brands/{slug}/hub - `{ visibility, portal }`: make it public or private, and pick its guidelines. */
export const PATCH = route<P>("brand.publish", async (req, { slug }, caller) => shown(caller, slug, await setHub(caller, slug, await body(req, HubPatch))));
