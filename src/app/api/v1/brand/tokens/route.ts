import { route } from "@/lib/api";
import { listRules } from "@/lib/core/brand";
import { env } from "@/lib/env";
import { TokenQuery } from "@/lib/schemas";
import { TOKEN_FORMATS } from "@/lib/tokens";

/**
 * GET /api/v1/brand/tokens?format=css&brand=acme&context=dark-background -
 * the brand as design tokens in one of lib/tokens.ts's formats. Without a context, the default
 * of each rule; with one, what that context resolves to.
 */
export const GET = route("brand.read", async (req, _p, caller) => {
  const q = new URL(req.url).searchParams;
  const { format, context } = TokenQuery.parse(Object.fromEntries(q));
  const all = await listRules(caller.workspace.id, { brand: q.get("brand") ?? undefined, context });
  const rules = context ? all : all.filter((r) => r.context === null);
  const slug = rules[0]?.brand ?? q.get("brand") ?? "brand";
  const headers = { "Cache-Control": "private, no-cache" };

  const title = `${slug} design tokens${context ? ` for ${context}` : ""}, from Artbucket. Generated ${new Date().toISOString()}.`;
  const f = TOKEN_FORMATS[format];
  return new Response(f.render(rules, { origin: env.APP_URL, title }), {
    headers: { ...headers, "Content-Type": `${f.mime}; charset=utf-8` },
  });
});
