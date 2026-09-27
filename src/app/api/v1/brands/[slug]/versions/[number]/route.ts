import { body, ok, route } from "@/lib/api";
import { getVersion, nameVersion } from "@/lib/core/brand";
import { AssetError } from "@/lib/core/errors";
import { VersionPatch } from "@/lib/schemas";

type P = { slug: string; number: string };
const missing = "No such version";
const num = (s: string) => (/^\d{1,9}$/.test(s) ? Number(s) : null);

/**
 * GET /api/v1/brands/{slug}/versions/{number}?against=3|current - the rules
 * as they were, and the diff: from the version before (or `against`) to this
 * one, or from this one to now with `against=current`.
 */
export const GET = route<P>("read", async (req, { slug, number }) => {
  const n = num(number);
  if (!n) return null;
  const raw = new URL(req.url).searchParams.get("against");
  const against = raw === null ? undefined : raw === "current" ? "current" : num(raw);
  if (against === null) throw new AssetError("invalid", 'against is a version number or "current"');
  const v = await getVersion(slug, n, against);
  return v && ok({ data: v });
}, missing);

/** PATCH /api/v1/brands/{slug}/versions/{number} - `{ name }` keeps it as a checkpoint. */
export const PATCH = route<P>("write", async (req, { slug, number }) => {
  const n = num(number);
  const v = n ? await nameVersion(slug, n, (await body(req, VersionPatch)).name) : null;
  return v && ok({ data: v });
}, missing);
