import type { FieldDef, FieldValue } from "@/lib/fields";

/**
 * Custom field filters, as query parameters:
 *
 *   f.channel=web&f.channel=print     channel is web OR print
 *   f.approved=true                   booleans are true / false
 *   f.budget.gte=10&f.budget.lte=99   number and date ranges, inclusive
 *
 * Different fields AND together; repeated values of one field OR. Filters
 * match the effective value: the asset's own, else what it inherits.
 */
export type FieldFilter =
  | { key: string; op: "in"; values: FieldValue[] }
  | { key: string; op: "gte" | "lte"; value: FieldValue };

export class FilterError extends Error {}

const PARAM = /^f\.([a-z][a-z0-9_]*)(?:\.(gte|lte))?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function coerce(def: FieldDef, raw: string): FieldValue {
  switch (def.type) {
    case "number": {
      const n = Number(raw);
      if (raw.trim() === "" || !Number.isFinite(n)) throw new FilterError(`${def.key}: "${raw}" is not a number`);
      return n;
    }
    case "boolean":
      if (raw !== "true" && raw !== "false") throw new FilterError(`${def.key}: use true or false`);
      return raw === "true";
    case "date":
      if (!DATE.test(raw)) throw new FilterError(`${def.key}: dates are YYYY-MM-DD`);
      return raw;
    case "select":
      if (!def.options.includes(raw)) throw new FilterError(`${def.key}: "${raw}" is not an option`);
      return raw;
    case "text":
      return raw;
  }
}

/** Pull `f.*` parameters out of a query string and type them against the schema. */
export function parseFieldFilters(params: URLSearchParams, defs: FieldDef[]): FieldFilter[] {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const out = new Map<string, FieldFilter>();
  for (const [name, raw] of params) {
    if (!name.startsWith("f.")) continue;
    const m = name.match(PARAM);
    const def = m && byKey.get(m[1]);
    if (!m || !def) {
      const known = defs.map((d) => d.key).join(", ");
      throw new FilterError(`No field "${m?.[1] ?? name.slice(2)}" to filter on. ${known ? `Fields: ${known}` : "The library has no custom fields"}`);
    }
    const op = m[2] as "gte" | "lte" | undefined;
    if (op) {
      if (def.type !== "number" && def.type !== "date") {
        throw new FilterError(`${def.key}: ranges work on number and date fields`);
      }
      out.set(name, { key: def.key, op, value: coerce(def, raw) });
    } else {
      const f = out.get(name) as Extract<FieldFilter, { op: "in" }> | undefined;
      const value = coerce(def, raw);
      if (f) f.values.push(value);
      else out.set(name, { key: def.key, op: "in", values: [value] });
    }
  }
  return [...out.values()];
}

/** Fields worth counting values of: a short, known set of values. */
export const isFacetable = (d: FieldDef) => d.type === "select" || d.type === "boolean";

/**
 * What an asset is, as `type=image&type=font` filters it (repeat to OR).
 * Derived from its media type, so nobody has to set it.
 */
export const ASSET_TYPES = ["image", "video", "audio", "font", "document", "other"] as const;
