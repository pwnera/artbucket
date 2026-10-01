import type { z } from "zod";
import type { Caller } from "@/lib/core/access";
import { ingestFromUrl } from "@/lib/core/assets";
import { createBrand, publishBrand, setRules } from "@/lib/core/brand";
import { pickBrand, readBrandJson } from "@/lib/core/brand-json";
import { deleteBrand, setHub } from "@/lib/core/brands";
import { AssetError } from "@/lib/core/errors";
import { startFrom } from "@/lib/core/hub";
import { importGoogleFont } from "@/lib/core/fonts";
import { savePage } from "@/lib/core/pages";
import { setTheme } from "@/lib/core/theme";
import type { BrandJsonFile } from "@/lib/brand-json";
import { ThemePatch } from "@/lib/brand-theme";
import { env } from "@/lib/env";
import { PageInput } from "@/lib/pages";
import { can, needs } from "@/lib/permissions";
import { pool } from "@/lib/pool";
import { RuleInput } from "@/lib/rules";
import type { BrandCreate } from "@/lib/schemas";
import { TEMPLATES, type BrandTemplate } from "@/lib/templates";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/**
 * A new brand: empty, a copy of another (`from`), a BrandHub brand's (`from`:
 * {org}/{brand}@n), a template's rules, theme and pages (`template`), or an
 * AdCP brand.json's (`domain`, `brandJson`). Then, when asked, published and
 * made public: a script creates, releases and lists a brand in one call, or
 * gets no brand at all.
 */
export async function makeBrand(caller: Caller, input: z.output<typeof BrandCreate>) {
  const { publish, visibility, ...start } = input;
  if (publish && !can(caller, "brand.publish")) throw new AssetError("forbidden", `publish takes ${needs("brand.publish")}`);
  if (visibility === "public" && !env.HUB_URL) throw new AssetError("invalid", "visibility: this server has no BrandHub (HUB_URL)");
  const made = await startBrand(caller, start);
  if (!publish) return made;
  try {
    const release = await publishBrand(caller, made.slug, publish === true ? {} : publish);
    const hub = visibility ? await setHub(caller, made.slug, { visibility }) : null;
    return { ...made, visibility: hub?.visibility ?? made.visibility, published: release.number, hub: hub ? { visibility: hub.visibility, url: hub.url } : release.hub };
  } catch (err) {
    await deleteBrand(caller.workspace.id, made.slug).catch(() => {});
    throw err;
  }
}

async function startBrand(caller: Caller, input: Omit<z.output<typeof BrandCreate>, "publish" | "visibility">) {
  const { template, domain, brandJson, brand, ...rest } = input;
  // The schema asks for a name unless the brand comes from a brand.json.
  const name = rest.name!;
  // A public BrandHub brand: {org}/{brand}@n.
  if (rest.from?.includes("/")) return startFrom(caller, { ...rest, name, from: rest.from });
  if (domain || brandJson) {
    const read = await readBrandJson({ domain, document: brandJson });
    const b = pickBrand(read.brands, { id: brand, domain: read.domain });
    const book = { rules: b.rules, theme: {}, pages: [], fonts: [], assets: b.files };
    const made = await fromBook(caller, { name: rest.name ?? b.name, slug: rest.slug ?? b.slug, domain: b.domain ?? read.domain }, book, { tag: b.slug, lenient: true });
    return { ...made, skipped: [...read.skipped, ...made.skipped], dropped: b.dropped };
  }
  if (template) return fromBook(caller, { ...rest, name, domain: TEMPLATES[template].domain }, TEMPLATES[template], { tag: template });
  return createBrand(caller, { ...rest, name });
}

type Book = Pick<BrandTemplate, "rules" | "theme" | "pages" | "fonts"> & { assets: Record<string, BrandJsonFile> };

/**
 * A brand from a book: its files ingested first, into this workspace's
 * library, then its rules, theme and pages with the files' new ids. A file
 * that won't fetch leaves no half-made brand behind; with `lenient` (a
 * brand.json's files, from anywhere) it is left out of its rules instead,
 * and named in `skipped`.
 */
async function fromBook(caller: Caller, input: { name: string; slug?: string; domain?: string | null }, book: Book, { tag, lenient = false }: { tag: string; lenient?: boolean }) {
  const ids = new Map<string, string>();
  const skipped: string[] = [];
  await pool(Object.entries(book.assets), 4, async ([id, { url, filename, title }]) => {
    try {
      ids.set(id, (await ingestFromUrl(caller, { url, filename, tags: [tag], via: "import", ...(title && { described: { title } }) })).asset.id);
    } catch (err) {
      if (!lenient || !(err instanceof AssetError) || !["invalid", "unsupported", "too_large"].includes(err.code)) throw err;
      skipped.push(`${url}: ${err.message}`);
    }
  });
  for (const family of book.fonts) await importGoogleFont(caller, { family });
  const seed: Pick<Book, "rules" | "theme" | "pages"> = JSON.parse(
    JSON.stringify({ rules: book.rules, theme: book.theme, pages: book.pages }).replace(UUID, (id) => ids.get(id) ?? id),
  );
  // Two files may be the same bytes, stored once: a rule points at it once. One left out leaves its rules.
  const rules = seed.rules.map(({ assets, ...r }) => {
    const kept = [...new Map((assets ?? []).map((a) => [typeof a === "string" ? a : a.id, a])).entries()].filter(([id]) => !(id in book.assets));
    return RuleInput.parse(assets ? { ...r, assets: kept.map(([, a]) => a) } : r);
  });

  const made = await createBrand(caller, input);
  try {
    // One actor, back to back: history folds these into the version after the baseline.
    await setRules(caller, made.slug, { set: rules });
    await setTheme(caller, made.slug, ThemePatch.parse(seed.theme));
    for (const { slug, ...page } of seed.pages) await savePage(caller, made.slug, slug, PageInput.parse(page));
  } catch (err) {
    await deleteBrand(caller.workspace.id, made.slug).catch(() => {});
    throw err;
  }
  return { ...made, rules: rules.length, skipped };
}
