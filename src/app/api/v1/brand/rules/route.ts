import { body, ok, route } from "@/lib/api";
import { createRule, listContexts, listRules, refuse, setRules } from "@/lib/core/brand";
import { AssetError } from "@/lib/core/errors";
import { releasedRules } from "@/lib/core/portals";
import { issues } from "@/lib/pages";
import { ReleaseRef, RuleBatch, RuleInput } from "@/lib/schemas";

const brandOf = (req: Request) => new URL(req.url).searchParams.get("brand") ?? undefined;

/**
 * GET /api/v1/brand/rules?brand=acme&context=instagram-story - the default
 * brand's rules unless one is named. Without a context, every rule and
 * version; with one, one rule per key, the context's own first.
 * `?asset={id}`: only the rules that point at that asset, across every brand
 * unless one is named. `?version=live` (or a release's number): that
 * release's rules instead of the draft, and `release` says which. Anyone
 * with access to part of the project may read its guidelines.
 */
export const GET = route("brand.read", async (req, _p, caller) => {
  const ws = caller.project.id;
  const q = new URL(req.url).searchParams;
  const opts = { brand: brandOf(req), context: q.get("context") ?? undefined, asset: q.get("asset") ?? undefined, who: caller };
  if (q.has("version")) {
    // A release, as a site built from the brand shows it: only the files that may leave the team.
    const v = ReleaseRef.safeParse(q.get("version"));
    if (!v.success) throw new AssetError("invalid", 'version is "live" or a release number');
    if (opts.asset) throw new AssetError("invalid", "asset reads the draft: leave version out");
    const r = await releasedRules(ws, opts.brand, v.data, opts.context);
    return ok({ data: r.data, contexts: r.contexts, release: r.version });
  }
  const [data, contexts] = await Promise.all([
    listRules(ws, opts),
    opts.asset && !opts.brand ? Promise.resolve([]) : listContexts(ws, opts.brand),
  ]);
  return ok({ data, contexts });
});

/** POST /api/v1/brand/rules?brand=acme - one per key and context; 409 when it exists. */
export const POST = route("brand.edit", async (req, _p, caller) =>
  ok({ data: await createRule(caller, brandOf(req), await body(req, RuleInput)) }, { status: 201 }),
);

/**
 * PATCH /api/v1/brand/rules?brand=acme - set_rules: `set` makes or changes
 * rules by key and context, `remove` deletes them. All or none, and every
 * problem comes back at once as a 422 with its path.
 */
export const PATCH = route("brand.edit", async (req, _p, caller) => {
  const batch = RuleBatch.safeParse(await req.json());
  refuse(batch.success ? [] : issues(batch.error));
  return ok({ data: await setRules(caller, brandOf(req), batch.data!) });
});
