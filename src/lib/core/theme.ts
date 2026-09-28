import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, brands } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { listRules, refuse, tracked, type BrandRule } from "@/lib/core/brand";
import { resolveBrand } from "@/lib/core/brands";
import { brandTheme, COLOR_SLOTS, FONT_SLOTS, ThemeSettings } from "@/lib/brand-theme";
import { issues } from "@/lib/pages";

/**
 * How a brand's pages look (lib/brand-theme.ts ThemeSettings): read, and
 * patched a key at a time. The settings are versioned with the rules and
 * pages, so portals, which serve a publish, never wear a draft look (D7).
 */

/** A change to the settings: a key left out keeps its value, and null clears it. */
export type ThemePatch = { [K in keyof ThemeSettings]?: ThemeSettings[K] | null };

/** Each setting that names what isn't there, or isn't the kind it needs, as [setting, problem]. */
async function unmet(ws: string, s: ThemeSettings, rules: BrandRule[]): Promise<[string, string][]> {
  const out: [string, string][] = [];
  const named = (slot: string, key: string | null | undefined, type: "color" | "font") => {
    if (!key || rules.some((r) => r.key === key && r.type === type)) return;
    const have = [...new Set(rules.filter((r) => r.type === type).map((r) => r.key))];
    out.push([slot, `${slot}: no ${type} rule "${key}"${have.length ? `; this brand has ${have.slice(0, 12).join(", ")}` : ""}`]);
  };
  for (const k of COLOR_SLOTS) named(k, s[k], "color");
  for (const k of FONT_SLOTS) named(k, s[k], "font");
  if (s.logo && !rules.some((r) => r.key === s.logo && r.assets.length)) out.push(["logo", `logo: no rule "${s.logo}" with a picture`]);
  if (s.device) {
    const [a] = await db
      .select({ mime: assets.mime })
      .from(assets)
      .where(and(eq(assets.id, s.device), eq(assets.workspaceId, ws), isNull(assets.deletedAt)));
    if (!a?.mime.startsWith("image/")) out.push(["device", a ? `device: ${s.device} is ${a.mime}, not an image` : `device: no asset ${s.device}`]);
  }
  return out;
}

/** The settings, the look they give (W1: from the rules alone), and a warning for each mapping whose rule has gone since. */
async function view(ws: string, brand: string, settings: ThemeSettings, rules: BrandRule[]) {
  return {
    brand,
    settings,
    theme: brandTheme(rules),
    // W3: contrast checks on the derived theme, one row per pair.
    checks: [],
    warnings: (await unmet(ws, settings, rules)).map(([, problem]) => `${problem}; the default is used`),
  };
}

export async function getTheme(ws: string, slug?: string) {
  const brand = await resolveBrand(ws, slug);
  return view(ws, brand.slug, brand.theme, await listRules(ws, { brand: brand.slug }));
}

/**
 * Merge a patch into the brand's settings, as a draft in its history. Only what
 * the patch names is checked against the rules: a mapping whose rule went since
 * falls back to the default with a warning, and never blocks an unrelated change.
 */
export async function setTheme(caller: Caller, slug: string | undefined, patch: ThemePatch) {
  const ws = caller.workspace.id;
  const brand = await resolveBrand(ws, slug);
  const rules = await listRules(ws, { brand: brand.slug });
  return tracked(brand.id, caller.actor, [], async (tx) => {
    const [row] = await tx.select({ theme: brands.theme }).from(brands).where(eq(brands.id, brand.id));
    // Stored without nulls or defaults (D5): a cleared key is gone, so the canon is the same as never set.
    const merged = Object.fromEntries(Object.entries({ ...row.theme, ...patch }).filter(([, v]) => v !== null && v !== undefined));
    const parsed = ThemeSettings.safeParse(merged);
    refuse(parsed.success ? [] : issues(parsed.error));
    const settings = parsed.data!;
    const written = new Set(Object.entries(patch).flatMap(([k, v]) => (v === null || v === undefined ? [] : [k])));
    refuse((await unmet(ws, settings, rules)).flatMap(([k, problem]) => (written.has(k) ? [problem] : [])));
    await tx.update(brands).set({ theme: settings }).where(eq(brands.id, brand.id));
    return view(ws, brand.slug, settings, rules);
  });
}
