import { body, ok, route } from "@/lib/api";
import { orderRules } from "@/lib/core/brand";
import { RuleOrder } from "@/lib/schemas";

/** PUT /api/v1/brand/rules/order - `{ keys }` in the order they should appear. */
export const PUT = route("write", async (req) => {
  await orderRules((await body(req, RuleOrder)).keys);
  return ok({ data: { ok: true } });
});
