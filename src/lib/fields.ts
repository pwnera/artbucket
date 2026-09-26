import { z } from "zod";

/**
 * Custom fields: a library defines its own schema ("campaign", "usage rights",
 * "agency") and every asset carries values for it. Definitions live in the
 * `fields` table; values live on the asset as `{ [key]: value }`.
 *
 * This module is pure: it turns definitions into a validator, so the API, the
 * upload path and any later adapter enforce the same rules.
 */

export const FIELD_TYPES = ["text", "number", "date", "boolean", "select"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  /** Allowed values, for `select` only. */
  options: string[];
  /** Must be set when an asset is uploaded, and can't be cleared afterwards. */
  required: boolean;
};

export type FieldValue = string | number | boolean;
export type FieldValues = Record<string, FieldValue>;

/** Keys are identifiers in URLs and JSON, so they stay boring. */
export const FIELD_KEY = /^[a-z][a-z0-9_]{0,39}$/;

function valueSchema(def: FieldDef): z.ZodType<FieldValue> {
  switch (def.type) {
    case "text":
      return z.string().trim().min(1).max(2000);
    case "number":
      return z.number().finite();
    case "date":
      return z.iso.date();
    case "boolean":
      return z.boolean();
    case "select":
      return z.enum(def.options as [string, ...string[]]);
  }
}

/**
 * Validate incoming values against the schema.
 *
 * - `upload`: a complete set for a new asset. Required fields must be present.
 * - `patch`: a partial update. null clears a field, but never a required one.
 *
 * Unknown keys are rejected: a typo in a key should fail loudly, not vanish.
 */
export function fieldsValidator(defs: FieldDef[], mode: "upload" | "patch") {
  const shape = Object.fromEntries(
    defs.map((d) => {
      const v = valueSchema(d);
      if (mode === "upload") return [d.key, d.required ? v : v.optional()];
      return [d.key, d.required ? v.optional() : v.nullable().optional()];
    }),
  );
  return z.strictObject(shape) as unknown as z.ZodType<Record<string, FieldValue | null>>;
}

/**
 * A required field is satisfied by an inherited value: it is neither demanded
 * at upload nor protected from being cleared on the asset itself.
 */
export const relaxInherited = (defs: FieldDef[], inherited: Record<string, unknown>) =>
  defs.map((d) => (d.key in inherited ? { ...d, required: false } : d));

/** What a client sends to define a field. `key` and `type` are fixed at creation. */
export const FieldDefInput = z
  .strictObject({
    key: z.string().regex(FIELD_KEY, "lowercase letters, digits and _, starting with a letter"),
    label: z.string().trim().min(1).max(80),
    type: z.enum(FIELD_TYPES),
    options: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
    required: z.boolean().default(false),
    position: z.number().int().default(0),
  })
  .refine((d) => (d.type === "select") === d.options.length > 0, {
    message: "select fields need options; other types take none",
    path: ["options"],
  })
  .refine((d) => new Set(d.options).size === d.options.length, {
    message: "options must be unique",
    path: ["options"],
  });

export const FieldDefPatch = z.strictObject({
  label: z.string().trim().min(1).max(80).optional(),
  options: z.array(z.string().trim().min(1).max(80)).min(1).max(100).optional(),
  required: z.boolean().optional(),
  position: z.number().int().optional(),
}).refine((d) => !d.options || new Set(d.options).size === d.options.length, {
  message: "options must be unique",
  path: ["options"],
});
