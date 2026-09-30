import type { Caller } from "@/lib/core/access";
import { ingestBytes, type Asset } from "@/lib/core/assets";
import { AssetError } from "@/lib/core/errors";
import { fetchPublic, FetchError } from "@/lib/fetch-public";
import {
  ICONIFY,
  iconSvg,
  iconTitle,
  parseSetIcons,
  parseSets,
  searchIcons,
  searchSets,
  type IconData,
  type IconGroup,
  type IconSet,
} from "@/lib/icons";
import { pool } from "@/lib/pool";

/**
 * Open source icon packs, through Iconify: browse its sets, look through a
 * set's icons, import the ones the brand uses. Imported icons are SVG assets
 * served from /a/{id}; nothing a viewer loads calls Iconify.
 */

const DAY = 24 * 60 * 60 * 1000;
/** Sets whose names are held at once; a set is a few hundred KB of names at most. */
const HELD = 24;

/** Iconify's failure as the API says it: a set it doesn't have is a 404, the rest a 400 naming what went wrong. */
const reach = (err: unknown, prefix?: string) =>
  err instanceof AssetError
    ? err
    : prefix && err instanceof FetchError && err.message.endsWith("returned 404")
      ? new AssetError("not_found", `Iconify has no icon set "${prefix}"`)
      : new AssetError("invalid", `Couldn't reach Iconify: ${(err as Error).message}`);

async function fetchJson(url: string, maxBytes: number) {
  return (await fetchPublic(url, { maxBytes })).bytes.toString("utf8");
}

// ponytail: per-process caches, a day old at most, like Google Fonts' catalog (core/fonts.ts).
let catalog: { at: number; list: Promise<IconSet[]> } | null = null;
function iconCatalog() {
  if (!catalog || Date.now() - catalog.at > DAY) {
    const list = fetchJson(`${ICONIFY}/collections`, 4 * 1024 * 1024).then(parseSets);
    catalog = { at: Date.now(), list };
    list.catch(() => (catalog = null)); // a failed fetch is retried next time, not cached
  }
  return catalog.list;
}

type Names = ReturnType<typeof parseSetIcons>;
const held = new Map<string, { at: number; names: Promise<Names> }>();
function setNames(prefix: string) {
  const got = held.get(prefix);
  if (got && Date.now() - got.at < DAY) {
    // Most recently used last: the first is the one to let go.
    held.delete(prefix);
    held.set(prefix, got);
    return got.names;
  }
  const names = fetchJson(`${ICONIFY}/collection?prefix=${prefix}&info=true`, 8 * 1024 * 1024).then(parseSetIcons);
  held.set(prefix, { at: Date.now(), names });
  names.catch(() => held.delete(prefix));
  while (held.size > HELD) held.delete(held.keys().next().value!);
  return names;
}

/** Icon data for up to ~100 names in one request; Iconify answers with what it has. */
async function iconData(prefix: string, names: string[]): Promise<IconData> {
  const out: IconData = { prefix, icons: {}, aliases: {} };
  for (let i = 0; i < names.length; i += 100) {
    const part = JSON.parse(
      await fetchJson(`${ICONIFY}/${prefix}.json?icons=${names.slice(i, i + 100).join(",")}`, 4 * 1024 * 1024),
    ) as IconData | number;
    // An unknown set answers with its status as the body.
    if (typeof part !== "object" || !part?.icons) throw new AssetError("not_found", `Iconify has no icon set "${prefix}"`);
    out.width ??= part.width;
    out.height ??= part.height;
    out.left ??= part.left;
    out.top ??= part.top;
    Object.assign(out.icons, part.icons);
    Object.assign(out.aliases!, part.aliases);
  }
  return out;
}

export async function searchIconSets({ q, group, limit = 60 }: { q?: string; group?: IconGroup; limit?: number }) {
  const list = await iconCatalog().catch((err) => Promise.reject(reach(err)));
  const found = searchSets(list, { q, group });
  return { data: found.slice(0, limit), total: found.length };
}

/**
 * A set's few samples, each drawn as the SVG an import would store: what the
 * picker shows a set by, so a viewer's browser never calls Iconify for them.
 * A few KB a set, held a day for every set asked about.
 */
const samplesHeld = new Map<string, { at: number; data: Promise<{ name: string; svg: string }[]> }>();
export async function iconSetSamples(prefix: string) {
  const got = samplesHeld.get(prefix);
  if (got && Date.now() - got.at < DAY) return { data: await got.data };
  const list = await iconCatalog().catch((err) => Promise.reject(reach(err)));
  const set = list.find((s) => s.prefix === prefix);
  if (!set) throw new AssetError("not_found", `Iconify has no icon set "${prefix}"`);
  const data = (set.samples.length ? iconData(prefix, set.samples) : Promise.resolve(null)).then((icons) =>
    set.samples.flatMap((name) => {
      const svg = icons && iconSvg(icons, name);
      return svg ? [{ name, svg }] : [];
    }),
  );
  samplesHeld.set(prefix, { at: Date.now(), data });
  data.catch(() => samplesHeld.delete(prefix)); // a failed fetch is retried next time, not cached
  return { data: await data.catch((err) => Promise.reject(reach(err, prefix))) };
}

type IconQuery = { q?: string; category?: string; offset?: number; limit?: number };

/** A set, its categories, and a page of its icons' names (matching `q`): no icon data, so no second request. */
export async function findIconNames(prefix: string, { q, category, offset = 0, limit = 96 }: IconQuery) {
  const [list, names] = await Promise.all([
    iconCatalog().catch(() => [] as IconSet[]),
    setNames(prefix).catch((err) => Promise.reject(reach(err, prefix))),
  ]);
  const set = list.find((s) => s.prefix === prefix) ?? names.info;
  if (!set) throw new AssetError("not_found", `Iconify has no icon set "${prefix}"`);
  const found = searchIcons(names.names, { q, category, categories: names.categories });
  return { set, categories: Object.keys(names.categories), total: found.length, names: found.slice(offset, offset + limit) };
}

/** A set, its categories, and a page of its icons (matching `q`), each drawn as the SVG an import would store. */
export async function browseIconSet(prefix: string, query: IconQuery) {
  const { names: page, ...found } = await findIconNames(prefix, query);
  const data = page.length ? await iconData(prefix, page).catch((err) => Promise.reject(reach(err, prefix))) : null;
  return {
    ...found,
    data: page.flatMap((name) => {
      const svg = data && iconSvg(data, name);
      return svg ? [{ name, svg }] : [];
    }),
  };
}

/**
 * The named icons of a set, one SVG asset each, titled from its name, credited
 * to the set's author and carrying its license, tagged `icon` and the set's
 * name. Icons already here dedupe (and are filed where asked). Like any
 * upload, without write they land `proposed`.
 */
export async function importIcons(
  caller: Caller,
  input: { prefix: string; icons: string[]; collections?: string[]; tags?: string[]; fields?: Record<string, unknown> },
): Promise<{ set: IconSet; assets: Asset[]; missing: string[] }> {
  const { prefix, icons, ...rest } = input;
  const [list, data] = await Promise.all([
    iconCatalog().catch(() => [] as IconSet[]),
    iconData(prefix, icons).catch((err) => Promise.reject(reach(err, prefix))),
  ]);
  const set = list.find((s) => s.prefix === prefix) ?? (await setNames(prefix).catch(() => null))?.info;
  if (!set) throw new AssetError("not_found", `Iconify has no icon set "${prefix}"`);
  const files = icons.flatMap((name) => {
    const svg = iconSvg(data, name);
    return svg ? [{ name, svg }] : [];
  });
  const missing = icons.filter((n) => !files.some((f) => f.name === n));
  if (!files.length) throw new AssetError("not_found", `${set.name} has none of those icons`);

  const out: Asset[] = new Array(files.length);
  await pool([...files.entries()], 4, async ([i, f]) => {
    out[i] = (
      await ingestBytes(caller, {
        ...rest,
        bytes: Buffer.from(f.svg, "utf8"),
        mime: "image/svg+xml",
        filename: `${f.name}.svg`,
        via: "import",
        tags: [...(rest.tags ?? []), "icon", set.name],
        described: { title: iconTitle(f.name), ...(set.author && { creator: set.author.name }) },
        origin: "licensed",
        rights: set.license
          ? { license: set.license.title, territories: [], channels: [], embargo: null, expires: null, modelRelease: null }
          : undefined,
      })
    ).asset;
  });
  return { set, assets: out, missing };
}
