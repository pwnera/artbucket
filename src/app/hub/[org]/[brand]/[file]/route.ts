import { record, referrerOf } from "@/lib/core/events";
import { hubBrand, listingBrandJson } from "@/lib/core/hub";
import { hubMoved } from "@/lib/core/hub-claims";
import { env } from "@/lib/env";
import { brandText, hubHome, hubPath, parseRef } from "@/lib/hub";
import { TokenQuery } from "@/lib/schemas";
import { signUrlsIn } from "@/lib/signed";
import { TOKEN_FORMATS, type TokenRule } from "@/lib/tokens";

/**
 * A listing for agents, public and keyless: {org}/{brand}[@n]/brand.json
 * (the brand as AdCP's brand.json, lib/brand-json.ts), /rules.json (every
 * rule, its files as signed URLs), /llms.txt (the same in words), and
 * /tokens?format=css (lib/tokens.ts, as GET /api/v1/brand/tokens; ?context=
 * resolves for one), and /badge.svg for a README ("brand | @4"). Files are
 * signed for a day, so a CDN keeps an answer an hour at most.
 *
 * Each read but the badge's is a `pull` for Insights (lib/core/events.ts): the file, the
 * release it came from, the referrer's host. Nobody signs in here, so the
 * reader is nobody in particular. ponytail: what a CDN answers from its
 * cache never reaches here, so behind one this counts at most one read an
 * hour per URL and edge.
 */
const BASE = { "Cache-Control": "public, max-age=300, s-maxage=3600", "Access-Control-Allow-Origin": "*" };
const missing = (message: string) => Response.json({ error: { code: "not_found", message } }, { status: 404, headers: BASE });

export async function GET(req: Request, { params }: { params: Promise<{ org: string; brand: string; file: string }> }) {
  const { org, brand, file } = await params;
  if (!["brand.json", "rules.json", "llms.txt", "tokens", "badge.svg"].includes(file)) return missing("Not a file of a listing: brand.json, rules.json, llms.txt, tokens or badge.svg");
  const ref = parseRef(brand);
  const q = TokenQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return Response.json({ error: { code: "invalid", message: q.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } }, { status: 400, headers: BASE });
  const b = ref && (await hubBrand(org, ref.slug, { version: ref.version, context: file === "tokens" ? q.data.context : undefined }));
  if (!b) {
    // Claimed by whoever proved its domain: its files lead to theirs, for good.
    const moved = ref && (await hubMoved(org, ref.slug));
    if (!moved) return missing(`Nothing is listed at ${org}/${brand}`);
    const to = `${hubHome("public", env.APP_URL, env.HUB_URL!)}${hubPath(moved.org, moved.brand)}/${file}${new URL(req.url).search}`;
    return new Response(null, { status: 308, headers: { ...BASE, Location: to } });
  }
  // A community listing may not come from the brand's owner: search engines leave its files out, as its page.
  const headers = b.verified ? BASE : { ...BASE, "X-Robots-Tag": "noindex" };
  // Shown on every view of a README, so not a pull: nobody took the brand.
  if (file === "badge.svg") return new Response(badge(`@${b.version}`), { headers: { ...headers, "Content-Type": "image/svg+xml" } });
  record({ workspaceId: b.workspaceId, brandId: b.brandId, kind: "pull", surface: "hub", actor: "anonymous", subject: file, version: b.version, referrer: referrerOf(req) });
  const about = { name: b.name, owner: b.owner, verified: b.verified, version: b.version, url: b.url, guidelines: b.guidelines ?? b.url, terms: b.terms };

  if (file === "llms.txt") {
    return new Response(brandText(about, b.rules, (a) => a.url), { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (file === "tokens") {
    const f = TOKEN_FORMATS[q.data.format];
    const rules = (q.data.context ? b.rules : b.rules.filter((r) => r.context === null)) as TokenRule[];
    const title = `${b.org}/${b.brand}@${b.version} design tokens${q.data.context ? ` for ${q.data.context}` : ""}, from the Artbucket BrandHub (${b.url}).`;
    const text = signUrlsIn(f.render(rules, { origin: env.APP_URL, title }), (id) => b.signed[id] ?? null);
    return new Response(text, { headers: { ...headers, "Content-Type": `${f.mime}; charset=utf-8` } });
  }
  if (file === "brand.json") return Response.json(listingBrandJson(b), { headers });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { signed: _signed, logo: _logo, path: _path, id: _id, brandId: _brandId, workspaceId: _workspaceId, ...out } = b;
  return Response.json({ data: out }, { headers });
}

/** shields.io's flat look, "brand | @4": widths guessed from Verdana 11px, wider for "@" and digits. */
function badge(value: string) {
  const label = "brand";
  const [l, r] = [label.length * 7 + 10, value.length * 8 + 12];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${l + r}" height="20" role="img" aria-label="${label}: ${value}"><title>${label}: ${value}</title>` +
    `<clipPath id="r"><rect width="${l + r}" height="20" rx="3"/></clipPath><g clip-path="url(#r)"><rect width="${l}" height="20" fill="#555"/><rect x="${l}" width="${r}" height="20" fill="#007ec6"/></g>` +
    `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="${l / 2}" y="14">${label}</text><text x="${l + r / 2}" y="14">${value}</text></g></svg>`
  );
}
