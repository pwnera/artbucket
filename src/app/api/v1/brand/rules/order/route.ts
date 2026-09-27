import { body, ok, route } from "@/lib/api";
import { orderRules } from "@/lib/core/brand";
import { RuleOrder } from "@/lib/schemas";

/** PUT /api/v1/brand/rules/order?brand=acme - `{ keys }` in the order they should appear. */
export const PUT = route("write", async (req, _p, caller) => {
  const brand = new URL(req.url).searchParams.get("brand") ?? undefined;
  await orderRules(caller, brand, (await body(req, RuleOrder)).keys);
  return ok({ data: { ok: true } });
});
