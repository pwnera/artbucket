import { body, ok, route } from "@/lib/api";
import { createRule, listContexts, listRules } from "@/lib/core/brand";
import { RuleInput } from "@/lib/schemas";

/**
 * GET /api/v1/brand/rules?context=instagram-story - without a context, every
 * rule and variant; with one, one rule per key, the context's own first.
 * `?asset={id}`: only the rules that point at that asset.
 */
export const GET = route("read", async (req) => {
  const q = new URL(req.url).searchParams;
  const opts = { context: q.get("context") ?? undefined, asset: q.get("asset") ?? undefined };
  const [data, contexts] = await Promise.all([listRules(opts), listContexts()]);
  return ok({ data, contexts });
});

/** POST /api/v1/brand/rules - one per key and context; 409 when it exists. */
export const POST = route("write", async (req) =>
  ok({ data: await createRule(await body(req, RuleInput)) }, { status: 201 }),
);
