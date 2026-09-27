import { ingestFromUrl, type Asset } from "@/lib/core/assets";
import { AssetError } from "@/lib/core/errors";
import { fetchPublic, FetchError } from "@/lib/fetch-public";
import { fontFileName, googleFontsCss, parseCatalog, parseFontFaces, searchCatalog, type GoogleFamily } from "@/lib/font";
import { pool } from "@/lib/pool";

/**
 * Google Fonts: search its catalog, import a family's files. Imported fonts
 * are ordinary assets served from /a/{id}; nothing a viewer loads calls Google.
 */

const CATALOG = "https://fonts.google.com/metadata/fonts";
const DAY = 24 * 60 * 60 * 1000;

// ponytail: per-process cache of an unofficial endpoint (2.7 MB, ~2000 families).
// Move to the keyed Web Fonts Developer API if Google ever changes it.
let catalog: { at: number; list: Promise<GoogleFamily[]> } | null = null;

function googleCatalog() {
  if (!catalog || Date.now() - catalog.at > DAY) {
    const list = fetchPublic(CATALOG, { maxBytes: 16 * 1024 * 1024 }).then((r) => parseCatalog(r.bytes.toString("utf8")));
    catalog = { at: Date.now(), list };
    list.catch(() => (catalog = null)); // a failed fetch is retried next time, not cached
  }
  return catalog.list;
}

export async function searchGoogleFonts({ q, category, limit = 30 }: { q?: string; category?: string; limit?: number }) {
  let list;
  try {
    list = await googleCatalog();
  } catch (err) {
    throw new AssetError("invalid", `Couldn't reach Google Fonts: ${(err as Error).message}`);
  }
  const found = searchCatalog(list, { q, category });
  return { data: found.slice(0, limit).map(({ family, category, styles }) => ({ family, category, styles })), total: found.length };
}

/**
 * One asset per style the family has, fetched once and served from here
 * after. Google's names are case-sensitive; the catalog turns "ibm plex sans"
 * into "IBM Plex Sans", and without it the name goes as typed.
 */
export async function importGoogleFont(
  input: Omit<Parameters<typeof ingestFromUrl>[0], "url" | "filename"> & { family: string },
): Promise<{ family: string; assets: Asset[] }> {
  const { family, ...rest } = input;
  const known = await googleCatalog().catch(() => []);
  const name = known.find((f) => f.family.toLowerCase() === family.toLowerCase())?.family ?? family;

  let css;
  try {
    css = (await fetchPublic(googleFontsCss(name), { maxBytes: 1024 * 1024 })).bytes.toString("utf8");
  } catch (err) {
    if (err instanceof FetchError && err.message.endsWith("returned 400")) {
      throw new AssetError("not_found", `Google Fonts has no family named "${family}"`);
    }
    throw new AssetError("invalid", `Couldn't reach Google Fonts: ${(err as Error).message}`);
  }

  const faces = parseFontFaces(css);
  const out: Asset[] = new Array(faces.length);
  await pool([...faces.entries()], 4, async ([i, face]) => {
    out[i] = (await ingestFromUrl({ ...rest, url: face.url, filename: fontFileName(name, face) })).asset;
  });
  return { family: name, assets: out };
}
