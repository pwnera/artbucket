import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { Feature as PlanFeature } from "@/lib/limits";

/**
 * Features an organization's admins turn on and off (Settings, Features), as
 * GCP's APIs are: the core's own, and the server's, from FEATURES_FILE. Each
 * is switched for the organization, for each project, or both: on both, the
 * organization turns it on or off everywhere, or lets each project decide.
 *
 * The plan (lib/limits.ts) says what an organization may use; a switch, what
 * it does use. Off means off everywhere at once: the app, the API, MCP, the
 * CLI. Nothing is deleted: turned back on, it is as it was.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

export const LEVELS = ["organization", "project"] as const;
export type Level = (typeof LEVELS)[number];
export type State = "on" | "off";
/** What else a server's feature may ask its hook to be told of: a new asset (an upload, a new version, an import). */
export const FEATURE_EVENTS = ["asset.created"] as const;
export type FeatureEvent = (typeof FEATURE_EVENTS)[number];

/** What a feature from the server's file brings into a project it is turned on in, and how it is told. */
const Hook = z.strictObject({
  /** Called (POST, signed) when the feature is turned on or off in a project: a refusal keeps it off. */
  url: z.string().url(),
  /** The environment variable holding the secret the call is signed with (lib/core/features.ts). */
  secret: z.string().regex(/^[A-Z][A-Z0-9_]*$/, "The name of an environment variable, e.g. INTELLIGENCE_HOOK_SECRET"),
  /** Told too, in the projects it is on in (lib/core/features.ts tellFeatures). */
  events: z.array(z.enum(FEATURE_EVENTS)).default([]),
});

export const FeatureEntry = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/, "Lowercase letters, digits and dashes, e.g. intelligence"),
  name: z.string().min(1).max(60),
  description: z.string().min(1).max(300),
  /** What turning it off does, under the switch. */
  off: z.string().max(300).optional(),
  /** One of the icons Settings knows (components/settings/features.tsx); a switch otherwise. */
  icon: z.string().optional(),
  levels: z.array(z.enum(LEVELS)).min(1).default(["organization", "project"]),
  default: z.enum(["on", "off"]).default("off"),
  /**
   * Takes a plan: an organization with one of its own (its limits row, as billing writes it), not read-only or
   * suspended. Without one it reads as off everywhere and Settings shows the way to a plan; its switches are kept, so it
   * comes back as it was with the plan.
   */
  paid: z.boolean().default(false),
  /** A key the core makes for it in each project it is on in, handed over by the hook, and revoked when it is off. */
  key: z.strictObject({ name: z.string().min(1).max(80), scope: z.enum(["read", "propose", "write"]) }).optional(),
  /** Custom fields it writes to, made in a project when it is turned on there, if missing. Never removed. */
  fields: z
    .array(
      z.strictObject({
        key: z.string().regex(/^[a-z][a-z0-9_]*$/),
        label: z.string().min(1),
        type: z.enum(["text", "number", "date", "select", "boolean"]),
        options: z.array(z.string()).optional(),
      }),
    )
    .default([]),
  hook: Hook.optional(),
  /**
   * Its own view, under Manage on its card while it is on (usage, actions of its own): the address the app reads it
   * from and posts its actions to, on the app's origin (components/settings/feature-manage.tsx). The app draws it.
   */
  manage: z.string().url().optional(),
  /**
   * Said in the app's confirmation before it is turned off (`off`: what stops) or on (`on`: what the admin agrees to, say
   * that content goes to an AI provider), beside the projects it changes.
   */
  confirm: z.strictObject({ on: z.string().max(300).optional(), off: z.string().max(300).optional() }).optional(),
  /** What of the server's it brings into the app (ASSISTANT_URL, BRAND_IMPORT_URL): shown only where it is on. */
  gates: z.array(z.enum(["assistant", "brandImport"])).default([]),
});
export type FeatureEntry = z.infer<typeof FeatureEntry>;

export const FeaturesFile = z.strictObject({ features: z.array(FeatureEntry).default([]) });

export type FeatureDef = Omit<FeatureEntry, "default" | "paid"> & {
  default: State;
  paid?: boolean;
  builtin: boolean;
  /** The plan's feature it takes (lib/limits.ts): a plan without it shows the way to one instead of a switch. */
  plan?: PlanFeature;
};

/** The core's own. Both start on: until an admin turns one off, nothing changes. */
export const BUILTIN: FeatureDef[] = [
  {
    id: "agents",
    name: "Agents and API keys",
    description: "AI agents connected over MCP, and API keys: the CLI, scripts and your own tools.",
    off: "Agents and keys are refused, and none can be connected or made. Keys a feature uses keep working.",
    icon: "robot",
    levels: ["organization", "project"],
    default: "on",
    plan: "agents",
    fields: [],
    gates: [],
    builtin: true,
  },
  {
    id: "shares",
    name: "Share and upload links",
    description: "Links that open a collection or an asset to anyone who has them, or let them upload.",
    off: "Links stop opening and none can be made. They are kept, and open again when this is back on.",
    icon: "link",
    levels: ["organization", "project"],
    default: "on",
    plan: "shares",
    fields: [],
    gates: [],
    builtin: true,
  },
  {
    id: "portals",
    name: "Portals and sites",
    description: "Brand portals, and the sites you build and deploy, at addresses of their own.",
    off: "Portals and sites close to their visitors, and none can be made. They are kept as they are, and open again when this is back on.",
    icon: "world",
    levels: ["organization", "project"],
    default: "on",
    fields: [],
    gates: [],
    builtin: true,
  },
  {
    id: "hub",
    name: "BrandHub",
    description: "Public brands listed on BrandHub, with their brand.json, for people and agents to find.",
    off: "Public brands leave BrandHub and their brand.json stops being served: your own people see them as private. Listed again when this is back on.",
    icon: "hub",
    levels: ["organization"],
    default: "on",
    fields: [],
    gates: [],
    builtin: true,
  },
  {
    id: "insights",
    name: "Usage insights",
    description: "Counting what gets used, by whom and where: files served, searches, use checks, portal page views and what agents ask.",
    off: "Nothing more is counted. What was counted stays in Insights; Activity, the history of changes, goes on.",
    icon: "chart",
    levels: ["organization", "project"],
    default: "on",
    fields: [],
    gates: [],
    builtin: true,
  },
];
export type BuiltinFeature = "agents" | "shares" | "portals" | "hub" | "insights";

/** The core's own this server offers: BrandHub only where it runs one (HUB_URL). */
const builtins = () => BUILTIN.filter((f) => f.id !== "hub" || !!process.env.HUB_URL);

/**
 * The server's features as its file (or FEATURES) says, checked: a mistake there stops the server rather than
 * half-working. YAML for a .yml or .yaml file, and for FEATURES, which takes either (YAML reads JSON too).
 */
export function parseFeatures(text: string, path = "FEATURES_FILE", yaml = /\.ya?ml$/i.test(path)): FeatureDef[] {
  const raw = yaml ? parseYaml(text) : JSON.parse(text);
  const parsed = FeaturesFile.safeParse(raw ?? {});
  if (!parsed.success) throw new Error(`${path}: ${z.prettifyError(parsed.error)}`);
  // Every id of the core's, offered here or not: a server's feature never takes one.
  const ids = new Set(BUILTIN.map((f) => f.id));
  return parsed.data.features.map((f) => {
    if (ids.has(f.id)) throw new Error(`${path}: "${f.id}" is already a feature`);
    ids.add(f.id);
    return { ...f, builtin: false };
  });
}

let loaded: { key: string; defs: FeatureDef[] } | null = null;

/**
 * Every feature: the core's, then the server's (read once), from FEATURES itself, the way a host's settings travel (a
 * fly.toml's [env], a Render or Kubernetes variable), or from the file FEATURES_FILE names. One or the other.
 */
export function catalog(path = process.env.FEATURES_FILE, inline = process.env.FEATURES): FeatureDef[] {
  if (path && inline) throw new Error("FEATURES and FEATURES_FILE are both set: the server's features come from one of them");
  const key = JSON.stringify([path ?? null, inline ?? null, !!process.env.HUB_URL]);
  if (loaded?.key !== key) {
    const own = inline ? parseFeatures(inline, "FEATURES", true) : path ? parseFeatures(readFileSync(path, "utf8"), path) : [];
    loaded = { key, defs: [...builtins(), ...own] };
  }
  return loaded.defs;
}

export const featureById = (id: string, path?: string) => catalog(path).find((f) => f.id === id) ?? null;

/** Where whether it is on comes from: the organization's switch, the project's, the feature's default, or no plan for it. */
export type From = "organization" | "project" | "default" | "plan";

/**
 * Whether a feature is on in a project, from the organization's switch and
 * the project's (each set or not). The organization's, set, decides for
 * every project; unset, each project's does, or the default.
 */
export function decide(
  def: Pick<FeatureDef, "levels" | "default"> & { paid?: boolean },
  organization: State | null,
  project: State | null,
  planned = true,
): { on: boolean; from: From } {
  if (def.paid && !planned) return { on: false, from: "plan" };
  if (organization && def.levels.includes("organization")) return { on: organization === "on", from: "organization" };
  if (project && def.levels.includes("project")) return { on: project === "on", from: "project" };
  return { on: def.default === "on", from: "default" };
}

/**
 * The organization's rule as Settings shows it: on or off everywhere, or
 * each project decides (its own switch unset). A feature switched only on the
 * organization has no "projects": unset is its default.
 */
export type Rule = State | "projects";
export const ruleOf = (def: Pick<FeatureDef, "levels" | "default">, organization: State | null): Rule =>
  organization ?? (def.levels.includes("project") ? "projects" : def.default);

/**
 * A server's address as the app calls it (ASSISTANT_URL, BRAND_IMPORT_URL, a
 * feature's `manage`): on the app's own origin (APP_URL), on the host the
 * page is on instead (an organization's domain too), so the call never
 * crosses origins; its path alone without a `host`. Elsewhere, as it is.
 */
export function onApp(url: string, appUrl: string | undefined, host?: string | null): string {
  try {
    const u = new URL(url);
    const app = appUrl ? new URL(appUrl) : null;
    if (!app || u.origin !== app.origin) return url;
    const path = `${u.pathname}${u.search}`;
    return host ? `${app.protocol}//${host}${path}` : path;
  } catch {
    return url;
  }
}
