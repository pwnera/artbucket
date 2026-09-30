import { fromBrandJson, type ImportedBrand } from "@/lib/brand-json";
import { AssetError } from "@/lib/core/errors";
import { FetchError, fetchPublic } from "@/lib/fetch-public";
import { pool } from "@/lib/pool";
import { brandDomain } from "@/lib/portal";

/**
 * Reading AdCP brand.json from the web (lib/brand-json.ts fromBrandJson reads
 * the document): a domain's /.well-known/brand.json, an Authoritative
 * Location Redirect's document, a House Portfolio's children at their own
 * domains. As brand-json.mdx says: https only, a well-known fetch redirected
 * at most to its exact www twin and back, a location fetched exactly with no
 * redirect, one hop of each. fetchPublic keeps it to public hosts, small and
 * quick.
 */

const MAX_BYTES = 512 * 1024;
/** The most children of a House Portfolio read at their own domains. */
const MAX_REFS = 10;

async function getJson(url: string, follow: (to: URL) => boolean) {
  const { bytes } = await fetchPublic(url, { maxBytes: MAX_BYTES, timeoutMs: 10_000, redirects: 3, signal: AbortSignal.timeout(20_000), follow });
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw new FetchError("It is not JSON");
  }
}

const twins = (host: string) => [host, host.startsWith("www.") ? host.slice(4) : `www.${host}`];

/** One domain's document and its brands, its authoritative_location followed once. */
async function read(domain: string, doc?: unknown) {
  const where = doc === undefined ? `https://${domain}/.well-known/brand.json` : "the document";
  try {
    doc ??= await getJson(where, (to) => to.protocol === "https:" && !to.port && twins(domain).includes(to.hostname));
    let got = fromBrandJson(doc, { domain });
    if (got.location) {
      if (!/^https:\/\//i.test(got.location)) throw new FetchError(`its authoritative_location isn't https: ${got.location}`);
      got = fromBrandJson(await getJson(got.location, () => false), { domain });
      if (got.location) throw new FetchError("its authoritative_location points at another");
    }
    return got;
  } catch (err) {
    if (err instanceof FetchError || (err as NodeJS.ErrnoException).code || (err as Error).name === "TimeoutError") {
      throw new AssetError("invalid", `Couldn't read ${where}: ${(err as Error).message}`);
    }
    throw err;
  }
}

/**
 * The brands a domain's brand.json holds, or a document's (`document`, then
 * `domain` is where it came from, if anywhere): its own, and a House
 * Portfolio's children read at their domains. A child that won't read is
 * left out and named in `skipped`.
 */
export async function readBrandJson({ domain: raw, document }: { domain?: string; document?: unknown }) {
  const domain = raw ? brandDomain(raw) : null;
  if (raw && !domain) throw new AssetError("invalid", `domain: not a domain: "${raw}". Say acme.com`);
  if (!domain && document === undefined) throw new AssetError("invalid", "A domain or a brand.json document to read");
  const got = await read(domain ?? "", document);
  if (!got.brands.length && !got.refs.length) throw new AssetError("invalid", `No brand in it: ${got.none ?? "an empty portfolio"}`);
  const skipped: string[] = [];
  const children: ImportedBrand[] = [];
  await pool(got.refs.slice(0, MAX_REFS), 4, async (ref) => {
    try {
      children.push(...(await read(ref.domain)).brands);
    } catch (err) {
      if (!(err instanceof AssetError)) throw err;
      skipped.push(`${ref.domain}: ${err.message}`);
    }
  });
  skipped.push(...got.refs.slice(MAX_REFS).map((r) => `${r.domain}: past the first ${MAX_REFS} brand_refs`));
  return { domain, brands: [...got.brands, ...children], skipped };
}

/**
 * The brand to make of what was read: the one `id` names, else the one at
 * `domain`, else the only one. A 422 names them all when that picks none.
 */
export function pickBrand(brands: ImportedBrand[], { id, domain }: { id?: string; domain?: string | null }) {
  const b = id ? brands.find((x) => x.id === id) : (brands.find((x) => domain && x.domain === domain) ?? (brands.length === 1 ? brands[0] : undefined));
  if (b) return b;
  const list = brands.map((x) => `${x.id} (${x.name})`).join(", ");
  throw new AssetError("invalid", id ? `brand: no brand "${id}" in it. It has ${list}` : `It has ${brands.length} brands: say which with brand: ${list}`);
}
