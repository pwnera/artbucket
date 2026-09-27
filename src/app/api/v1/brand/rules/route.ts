import { body, ok, route } from "@/lib/api";
import { createRule, listContexts, listRules } from "@/lib/core/brand";
import { actorOf } from "@/lib/core/brands";
import { RuleInput } from "@/lib/schemas";

const brandOf = (req: Request) => new URL(req.url).searchParams.get("brand") ?? undefined;

/**
 * GET /api/v1/brand/rules?brand=acme&context=instagram-story - the default
 * brand's rules unless one is named. Without a context, every rule and
 * version; with one, one rule per key, the context's own first.
 * `?asset={id}`: only the rules that point at that asset, across every brand
 * unless one is named.
 */
export const GET = route("read", async (req) => {
  const q = new URL(req.url).searchParams;
  const opts = { brand: brandOf(req), context: q.get("context") ?? undefined, asset: q.get("asset") ?? undefined };
  const [data, contexts] = await Promise.all([
    listRules(opts),
    opts.asset && !opts.brand ? Promise.resolve([]) : listContexts(opts.brand),
  ]);
  return ok({ data, contexts });
});

/** POST /api/v1/brand/rules?brand=acme - one per key and context; 409 when it exists. */
export const POST = route("write", async (req, _p, caller) =>
  ok({ data: await createRule(brandOf(req), await body(req, RuleInput), await actorOf(caller)) }, { status: 201 }),
);
