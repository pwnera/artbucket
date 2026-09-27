import { route } from "@/lib/api";
import { listRules } from "@/lib/core/brand";
import { env } from "@/lib/env";
import { TokenQuery } from "@/lib/schemas";
import { toCss, toDtcg } from "@/lib/tokens";

/**
 * GET /api/v1/brand/tokens?format=css&brand=acme&context=dark-background -
 * the brand as design tokens (lib/tokens.ts). Without a context, the default
 * of each rule; with one, what that context resolves to.
 */
export const GET = route("read", async (req) => {
  const q = new URL(req.url).searchParams;
  const { format, context } = TokenQuery.parse(Object.fromEntries(q));
  const all = await listRules({ brand: q.get("brand") ?? undefined, context });
  const rules = context ? all : all.filter((r) => r.context === null);
  const slug = rules[0]?.brand ?? q.get("brand") ?? "brand";
  const headers = { "Cache-Control": "private, no-cache" };

  if (format === "json") return Response.json(toDtcg(rules, { origin: env.APP_URL }), { headers });
  const title = `${slug} design tokens${context ? ` for ${context}` : ""}, from artbucket. Generated ${new Date().toISOString()}.`;
  return new Response(toCss(rules, { origin: env.APP_URL, title }), {
    headers: { ...headers, "Content-Type": "text/css; charset=utf-8" },
  });
});
