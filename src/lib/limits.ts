import { z } from "zod";

/**
 * What an organization may use, set by whoever runs the server, never by the
 * organization's own admins: in the environment for every organization
 * (LIMIT_*), or in the database for one (docs: configuration/limits).
 * Everything is unlimited until someone says otherwise.
 *
 * lib/core/limits.ts checks them, at the moment something would go over:
 * an upload, a grant or an invitation, a new workspace, brand, domain, key or link.
 *
 * Relative imports only: `pnpm test` runs this under plain Node.
 */

/** What can be switched off for an organization. Off, nobody there can make new ones, or set it up. */
export const FEATURES = ["agents", "shares", "sso", "branding", "domains"] as const;
export type Feature = (typeof FEATURES)[number];

const UNITS: Record<string, number> = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12 };

/** "10GB", "500 mb", "1.5TB" or a plain number of bytes; null when it is none of those. */
export function parseSize(v: string | number): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
  const m = v.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb)?$/);
  return m ? Math.floor(Number(m[1]) * UNITS[m[2] ?? "b"]) : null;
}

/** 1234567 as "1.2 MB": for messages and Settings, in the same units parseSize reads. */
export function formatSize(bytes: number) {
  // From 999.5 of a unit, which would round to "1000", it reads as 1 of the next.
  const [unit, n] = Object.entries(UNITS).reverse().find(([, n]) => bytes >= n * 0.9995) ?? ["b", 1];
  const v = bytes / n;
  return `${unit === "b" ? v : v.toFixed(v < 10 ? 1 : 0).replace(/\.0$/, "")} ${unit.toUpperCase()}`;
}

const size = z.union([z.number(), z.string()]).transform((v, ctx) => {
  const n = parseSize(v);
  if (n === null) ctx.addIssue({ code: "custom", message: `Not a size: "${v}". Say 10GB, 500MB, or a number of bytes` });
  return n ?? z.NEVER;
});
const count = z.number().int().nonnegative();

export const Limits = z.object({
  /** Bytes of assets, summed over the organization's workspaces. */
  storage: size.nullable(),
  /** People with write or admin anywhere in it, invitations to that included. */
  editors: count.nullable(),
  workspaces: count.nullable(),
  /** Brands, over all its workspaces. */
  brands: count.nullable(),
  /** Custom domains, the app's and its portals', verified or not. */
  domains: count.nullable(),
  /** What it may use; null is everything. */
  features: z.array(z.enum(FEATURES)).nullable(),
  /** Nothing changes: every caller is held to read. */
  readOnly: z.boolean(),
  /**
   * Suspended by the operator, and why (`true` gives no reason): nothing of it
   * reaches the public, and it is read-only. Only ever in the database.
   */
  suspended: z
    .union([z.string(), z.boolean()])
    .nullable()
    .transform((v) => (v === true ? "Suspended" : v || null)),
});
export type Limits = z.infer<typeof Limits>;

export const UNLIMITED: Limits = {
  storage: null,
  editors: null,
  workspaces: null,
  brands: null,
  domains: null,
  features: null,
  readOnly: false,
  suspended: null,
};

/** The limits as they hold: a suspended organization is read-only too, so its people keep their data and change nothing. */
export const held = (l: Limits): Limits => (l.suspended ? { ...l, readOnly: true } : l);

type Env = Record<string, string | undefined>;

/** LIMIT_STORAGE=10GB, LIMIT_EDITORS=5, LIMIT_WORKSPACES, LIMIT_BRANDS, LIMIT_DOMAINS, LIMIT_FEATURES=agents,shares (or none): every organization's. */
export function limitsFromEnv(env: Env): Limits | null {
  const out: Record<string, unknown> = {};
  if (env.LIMIT_STORAGE?.trim()) out.storage = env.LIMIT_STORAGE.trim();
  for (const [k, name] of [["editors", "LIMIT_EDITORS"], ["workspaces", "LIMIT_WORKSPACES"], ["brands", "LIMIT_BRANDS"], ["domains", "LIMIT_DOMAINS"]] as const) {
    if (env[name]?.trim()) out[k] = Number(env[name]);
  }
  const f = env.LIMIT_FEATURES?.trim();
  if (f) out.features = f === "none" ? [] : f.split(",").map((s) => s.trim()).filter(Boolean);
  return Object.keys(out).length ? Limits.parse({ ...UNLIMITED, ...out }) : null;
}

/**
 * Where an organization's admin can take a plan (BILLING_URL), while the
 * organization runs on the server's own limits: no limits row of its own,
 * so no plan yet. Null for everyone else, and on a server that sells none.
 */
export const upgradeUrl = (billing: string | undefined, admin: boolean, limitsFrom: string) =>
  billing && admin && limitsFrom !== "organization" ? billing : null;

/**
 * LIMIT_ORGANIZATIONS, per person: how many organizations on the server's own
 * limits (no limits row of their own, so no plan) someone may be admin of and
 * still make another. Null: no limit. The one made at sign-up is never refused.
 */
export function organizationsFromEnv(env: Env): number | null {
  const v = env.LIMIT_ORGANIZATIONS?.trim();
  return v ? count.parse(Number(v)) : null;
}

/** Whether adding `adding` to `used` goes past `limit`; no limit is never over. */
export const over = (limit: number | null, used: number, adding = 1) => limit !== null && used + adding > limit;
