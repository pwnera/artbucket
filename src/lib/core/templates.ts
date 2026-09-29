import type { z } from "zod";
import type { Caller } from "@/lib/core/access";
import { ingestFromUrl } from "@/lib/core/assets";
import { createBrand, setRules } from "@/lib/core/brand";
import { deleteBrand } from "@/lib/core/brands";
import { importGoogleFont } from "@/lib/core/fonts";
import { savePage } from "@/lib/core/pages";
import { setTheme } from "@/lib/core/theme";
import { ThemePatch } from "@/lib/brand-theme";
import { PageInput } from "@/lib/pages";
import { pool } from "@/lib/pool";
import { RuleInput } from "@/lib/rules";
import type { BrandCreate } from "@/lib/schemas";
import { TEMPLATES } from "@/lib/templates";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/** A new brand: empty, a copy of another (`from`), or a template's rules, theme and pages (`template`). */
export async function makeBrand(caller: Caller, input: z.output<typeof BrandCreate>) {
  const { template, ...rest } = input;
  if (!template) return createBrand(caller, rest);
  const t = TEMPLATES[template];

  // The files first, into this workspace's library: one that won't fetch leaves no half-made brand behind.
  const ids = new Map<string, string>();
  await pool(Object.entries(t.assets), 4, async ([id, { url, filename }]) => {
    ids.set(id, (await ingestFromUrl(caller, { url, filename, tags: [template] })).asset.id);
  });
  for (const family of t.fonts) await importGoogleFont(caller, { family });
  const book: Pick<typeof t, "rules" | "theme" | "pages"> = JSON.parse(
    JSON.stringify({ rules: t.rules, theme: t.theme, pages: t.pages }).replace(UUID, (id) => ids.get(id) ?? id),
  );

  const made = await createBrand(caller, rest);
  try {
    // One actor, back to back: history folds these into the version after the baseline.
    await setRules(caller, made.slug, { set: book.rules.map((r) => RuleInput.parse(r)) });
    await setTheme(caller, made.slug, ThemePatch.parse(book.theme));
    for (const { slug, ...page } of book.pages) await savePage(caller, made.slug, slug, PageInput.parse(page));
  } catch (err) {
    await deleteBrand(caller.workspace.id, made.slug).catch(() => {});
    throw err;
  }
  return { ...made, rules: book.rules.length };
}
