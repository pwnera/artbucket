import { route } from "@/lib/api";
import { listRules } from "@/lib/core/brand";
import { releasedRules } from "@/lib/core/portals";
import { env } from "@/lib/env";
import { BrandTokenQuery } from "@/lib/schemas";
import { TOKEN_FORMATS, type TokenRule, withoutFontFaces } from "@/lib/tokens";

/**
 * GET /api/v1/brand/tokens?format=css&brand=acme&context=dark-background -
 * the brand as design tokens in one of lib/tokens.ts's formats. Without a context, the default
 * of each rule; with one, what that context resolves to. `version=live` (or a
 * release's number) reads a release instead of the draft, as a site built
 * from the brand shows it, with only the files that may leave the team.
 * `fonts=none` leaves out the @font-face rules, for a site with its own fonts.
 */
export const GET = route("brand.read", async (req, _p, caller) => {
  const q = new URL(req.url).searchParams;
  const { format, context, version, fonts } = BrandTokenQuery.parse(Object.fromEntries(q));
  const ws = caller.project.id;
  let all: (TokenRule & { context: string | null })[];
  let slug: string;
  if (version === undefined) {
    const rules = await listRules(ws, { brand: q.get("brand") ?? undefined, context });
    [all, slug] = [rules, rules[0]?.brand ?? q.get("brand") ?? "brand"];
  } else {
    const r = await releasedRules(ws, q.get("brand") ?? undefined, version, context);
    // A brand with no history at all reads as it stands, which is what its first release will be.
    [all, slug] = [r.data, r.version ? `${r.slug}@${r.version.number}` : r.slug];
  }
  const rules = context ? all : all.filter((r) => r.context === null);
  const headers = { "Cache-Control": "private, no-cache" };

  const title = `${slug} design tokens${context ? ` for ${context}` : ""}, from Artbucket. Generated ${new Date().toISOString()}.`;
  const f = TOKEN_FORMATS[format];
  const text = f.render(rules, { origin: env.APP_URL, title });
  return new Response(fonts === "none" ? withoutFontFaces(text) : text, {
    headers: { ...headers, "Content-Type": `${f.mime}; charset=utf-8` },
  });
});
