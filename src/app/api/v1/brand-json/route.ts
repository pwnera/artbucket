import { ok, route } from "@/lib/api";
import { pickBrand, readBrandJson } from "@/lib/core/brand-json";
import { AssetError } from "@/lib/core/errors";

/**
 * GET /api/v1/brand-json?domain=acme.com - what a brand made from that
 * domain's AdCP brand.json would have, before making it (POST /api/v1/brands
 * with `domain`): each brand it holds, and the one `pick`ed when no `brand`
 * is named. The New brand dialog's preview.
 */
export const GET = route("brand.edit", async (req) => {
  const domain = new URL(req.url).searchParams.get("domain") ?? "";
  if (!domain.trim()) throw new AssetError("invalid", "domain: which domain's brand.json, e.g. ?domain=acme.com");
  const read = await readBrandJson({ domain });
  const pick = (() => {
    try {
      return pickBrand(read.brands, { domain: read.domain }).id;
    } catch {
      return null;
    }
  })();
  const brands = read.brands.map((b) => {
    const own = b.rules.filter((r) => !r.context);
    return {
      id: b.id,
      name: b.name,
      slug: b.slug,
      domain: b.domain,
      tagline: own.flatMap((r) => (r.key === "brand.tagline" && r.type === "text" ? [r.value] : []))[0] ?? null,
      colors: own.flatMap((r) => (r.type === "color" ? [r.value] : [])).slice(0, 8),
      fonts: [...new Set(own.flatMap((r) => (r.type === "font" ? [typeof r.value === "string" ? r.value : r.value.family] : [])))],
      logos: new Set(b.rules.filter((r) => r.key.startsWith("logo.")).flatMap((r) => r.assets ?? [])).size,
      rules: b.rules.length,
      files: Object.keys(b.files).length,
      dropped: b.dropped,
    };
  });
  return ok({ data: { domain: read.domain, pick, brands, skipped: read.skipped } });
});
