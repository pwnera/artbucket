import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { recordAudit } from "@/lib/core/audit";
import { AssetError } from "@/lib/core/errors";
import { env } from "@/lib/env";
import { can, needs } from "@/lib/permissions";
import {
  SETTING_CONTEXTS,
  merge,
  present,
  resolve,
  seal,
  sealed,
  SETTING_KEYS,
  SETTINGS,
  unseal,
  type SettingContext,
  type SettingKey,
} from "@/lib/settings";

/**
 * The settings store: what lib/settings.ts defines, kept per organization or
 * workspace. Reading and changing an organization's settings takes admin on
 * the organization; a workspace's, admin on the workspace.
 */

type Place = { organizationId: string; workspaceId?: string | null };

/** `?context=organization` (the default) or `workspace`: which place's settings. */
export const contextOf = (req: Request): SettingContext => {
  const c = new URL(req.url).searchParams.get("context") ?? "organization";
  if (!(SETTING_CONTEXTS as readonly string[]).includes(c)) throw new AssetError("invalid", `context is ${SETTING_CONTEXTS.join(" or ")}`);
  return c as SettingContext;
};


const secret = env.BETTER_AUTH_SECRET;
const where = (key: SettingKey, organizationId: string, workspaceId: string | null) =>
  and(
    eq(settings.key, key),
    eq(settings.organizationId, organizationId),
    workspaceId ? eq(settings.workspaceId, workspaceId) : isNull(settings.workspaceId),
  );

/**
 * What a place overrides for a key, secrets opened; null when nothing. A
 * secret that no longer opens (BETTER_AUTH_SECRET changed) reads as unset.
 */
async function stored(key: SettingKey, organizationId: string, workspaceId: string | null): Promise<Record<string, unknown> | null> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(where(key, organizationId, workspaceId));
  if (!row) return null;
  const parsed = SETTINGS[key].schema.partial().safeParse(sealed(key, row.value, (s) => unseal(s, secret)));
  return parsed.success ? parsed.data : null;
}

/** The value that applies at a place, with its secrets: for code that uses it, never for a response. */
export async function effective<K extends SettingKey>(key: K, place: Place) {
  const [organization, workspace] = await Promise.all([
    stored(key, place.organizationId, null),
    place.workspaceId ? stored(key, place.organizationId, place.workspaceId) : null,
  ]);
  return resolve(key, { organization, workspace }, process.env);
}

function placeOf(caller: Caller, context: SettingContext) {
  const action = context === "organization" ? "organization.manage" : "workspace.manage";
  if (!can(caller, action)) throw new AssetError("forbidden", `Settings of the ${context} take ${needs(action)}`);
  return { organizationId: caller.workspace.organizationId, workspaceId: context === "workspace" ? caller.workspace.id : null };
}

const described = async (key: SettingKey, context: SettingContext, place: Required<Place>) => {
  const layers = {
    organization: await stored(key, place.organizationId, null),
    workspace: context === "workspace" ? await stored(key, place.organizationId, place.workspaceId!) : null,
  };
  const { value, source, sources } = resolve(key, layers, process.env);
  const own = context === "workspace" ? layers.workspace : layers.organization;
  return {
    key,
    label: SETTINGS[key].label,
    context,
    ...present(key, value),
    source,
    sources,
    /** Set here, so resetting it falls back to what is above. */
    own: !!own && Object.keys(own).length > 0,
  };
};

/** The settings that can be set in this context, each as it applies here and where that comes from. */
export async function listSettings(caller: Caller, context: SettingContext) {
  const place = placeOf(caller, context);
  return Promise.all(SETTING_KEYS.filter((k) => SETTINGS[k].contexts.includes(context)).map((k) => described(k, context, place)));
}

function settable(key: string, context: SettingContext): SettingKey {
  if (key in SETTINGS && "operator" in SETTINGS[key as SettingKey]) {
    throw new AssetError("forbidden", `${SETTINGS[key as SettingKey].label} are set by whoever runs this server`);
  }
  if (!(SETTING_KEYS as string[]).includes(key)) throw new AssetError("not_found", `No setting "${key}". Settings: ${SETTING_KEYS.join(", ")}`);
  if (!SETTINGS[key as SettingKey].contexts.includes(context)) throw new AssetError("invalid", `${key} is set on the ${SETTINGS[key as SettingKey].contexts.join(" or ")}, not the ${context}`);
  return key as SettingKey;
}

/**
 * Change a setting here: only what the change names is stored as this
 * place's own, so everything else keeps coming from above.
 */
export async function updateSetting(caller: Caller, context: SettingContext, rawKey: string, patch: Record<string, unknown>) {
  const key = settable(rawKey, context);
  const place = placeOf(caller, context);
  const before = await stored(key, place.organizationId, place.workspaceId);
  const { value: current } = await effective(key, place);
  let next;
  try {
    next = merge(key, before, patch);
    // What applies after the change must still make sense as a whole.
    resolve(key, { ...(context === "workspace" && { organization: await stored(key, place.organizationId, null) }), [context]: next }, process.env);
  } catch (err) {
    throw new AssetError("invalid", `Not a valid ${key} setting`, (err as { issues?: unknown }).issues);
  }
  const value = sealed(key, next, (s) => seal(s, secret));
  await db
    .insert(settings)
    .values({ ...place, key, value, updatedBy: caller.actor })
    .onConflictDoUpdate({
      target: [settings.organizationId, settings.workspaceId, settings.key],
      set: { value, updatedBy: caller.actor, updatedAt: sql`now()` },
    });
  // Which properties changed, never their values: some are secrets.
  const changed = Object.keys(patch).filter((k) => patch[k] !== undefined && JSON.stringify(patch[k]) !== JSON.stringify((current as Record<string, unknown>)[k]));
  await recordAudit(caller, "setting.changed", SETTINGS[key].label, { key, context, changed }, { workspaceId: place.workspaceId });
  return described(key, context, place);
}

/** Forget this place's own value, so what is above it applies again. */
export async function resetSetting(caller: Caller, context: SettingContext, rawKey: string) {
  const key = settable(rawKey, context);
  const place = placeOf(caller, context);
  await db.delete(settings).where(where(key, place.organizationId, place.workspaceId));
  await recordAudit(caller, "setting.reset", SETTINGS[key].label, { key, context }, { workspaceId: place.workspaceId });
  return described(key, context, place);
}
