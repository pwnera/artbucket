import { ok, route } from "@/lib/api";
import { PLAYBOOK } from "@/lib/playbook";

/** GET /api/v1/brand/playbook - what a good brand site is, for an agent about to build one, as Markdown. */
export const GET = route("brand.read", async () => ok({ data: { markdown: PLAYBOOK } }));
