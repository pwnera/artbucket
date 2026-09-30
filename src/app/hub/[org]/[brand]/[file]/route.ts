import { record, referrerOf } from "@/lib/core/events";
import { hubBrand } from "@/lib/core/hub";
import { env } from "@/lib/env";
import { brandText, parseRef } from "@/lib/hub";
import { TokenQuery } from "@/lib/schemas";
import { signUrlsIn } from "@/lib/signed";
import { TOKEN_FORMATS, type TokenRule } from "@/lib/tokens";

/**
 * A listing for agents, public and keyless: {org}/{brand}[@n]/brand.json
 * (every rule, its files as signed URLs), /llms.txt (the same in words), and
 * /tokens?format=css (lib/tokens.ts, as GET /api/v1/brand/tokens; ?context=
 * resolves for one). Files are signed for a day, so a CDN keeps an answer an
 * hour at most.
 *
 * Each read is a `pull` for Insights (lib/core/events.ts): the file, the
 * release it came from, the referrer's host. Nobody signs in here, so the
 * reader is nobody in particular. ponytail: what a CDN answers from its
 * cache never reaches here, so behind one this counts at most one read an
 * hour per URL and edge.
 */
const HEADERS = { "Cache-Control": "public, max-age=300, s-maxage=3600", "Access-Control-Allow-Origin": "*" };
const missing = (message: string) => Response.json({ error: { code: "not_found", message } }, { status: 404, headers: HEADERS });

export async function GET(req: Request, { params }: { params: Promise<{ org: string; brand: string; file: string }> }) {
  const { org, brand, file } = await params;
  if (!["brand.json", "llms.txt", "tokens"].includes(file)) return missing("Not a file of a listing: brand.json, llms.txt or tokens");
  const ref = parseRef(brand);
  const q = TokenQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return Response.json({ error: { code: "invalid", message: q.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } }, { status: 400, headers: HEADERS });
  const b = ref && (await hubBrand(org, ref.slug, { version: ref.version, context: file === "tokens" ? q.data.context : undefined }));
  if (!b) return missing(`Nothing is listed at ${org}/${brand}`);
  record({ workspaceId: b.workspaceId, brandId: b.brandId, kind: "pull", surface: "hub", actor: "anonymous", subject: file, version: b.version, referrer: referrerOf(req) });
  const about = { name: b.name, owner: b.owner, verified: b.verified, version: b.version, url: b.url, guidelines: b.guidelines ?? b.url, terms: b.terms };

  if (file === "llms.txt") {
    return new Response(brandText(about, b.rules, (a) => a.url), { headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (file === "tokens") {
    const f = TOKEN_FORMATS[q.data.format];
    const rules = (q.data.context ? b.rules : b.rules.filter((r) => r.context === null)) as TokenRule[];
    const title = `${b.org}/${b.brand}@${b.version} design tokens${q.data.context ? ` for ${q.data.context}` : ""}, from the Artbucket BrandHub (${b.url}).`;
    const text = signUrlsIn(f.render(rules, { origin: env.APP_URL, title }), (id) => b.signed[id] ?? null);
    return new Response(text, { headers: { ...HEADERS, "Content-Type": `${f.mime}; charset=utf-8` } });
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { signed: _signed, logo: _logo, path: _path, brandId: _brandId, workspaceId: _workspaceId, ...out } = b;
  return Response.json({ data: out }, { headers: HEADERS });
}
