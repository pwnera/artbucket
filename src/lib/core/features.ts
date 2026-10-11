import { createHmac, randomBytes } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys, featureSwitches, organizations, projects } from "@/lib/db/schema";
import type { Caller, Project } from "@/lib/core/access";
import { recordAudit } from "@/lib/core/audit";
import { AssetError } from "@/lib/core/errors";
import { createField, listFields } from "@/lib/core/fields";
import { hashKey } from "@/lib/core/keys";
import { limitsOf } from "@/lib/core/usage";
import { catalog, decide, featureById, ruleOf, type BuiltinFeature, type FeatureDef, type From, type Level, type Rule, type State } from "@/lib/features";
import { memo } from "@/lib/memo";
import { can, needs } from "@/lib/permissions";

/**
 * Features turned on and off (lib/features.ts), kept in feature_switches: a
 * row for the organization's switch, one per project where it lets each
 * decide. Every key presented and most pages ask, so an organization's rows
 * are kept a minute (lib/memo.ts) and forgotten here when changed.
 *
 * A feature from the server's file is told by its hook, signed, when it is
 * turned on or off in a project, and may refuse being turned on (no plan for
 * it, say): the switch then stays off and the admin reads why. The core makes
 * the key it asked for and hands it over in that call, and revokes it when it
 * is turned off; it makes the fields it writes to, if missing.
 */

type Place = { organizationId: string; projectId?: string | null };
type Row = typeof featureSwitches.$inferSelect;

const rowsOf = memo(60_000, (organizationId: string) => db.select().from(featureSwitches).where(eq(featureSwitches.organizationId, organizationId)));

const pick = (rows: Row[], feature: string, projectId: string | null) => rows.find((r) => r.feature === feature && r.projectId === projectId) ?? null;

/** Whether it is on there, where that comes from, and the switch that says so (null for the default). */
function stateIn(def: FeatureDef, rows: Row[], projectId: string | null) {
  const org = pick(rows, def.id, null);
  const own = projectId ? pick(rows, def.id, projectId) : null;
  const d = decide(def, org?.state ?? null, own?.state ?? null);
  return { ...d, row: d.from === "organization" ? org : d.from === "project" ? own : null };
}

/** "Agents and API keys are", "Intelligence is". */
const be = (def: FeatureDef) => (/ and |s$/.test(def.name) ? "are" : "is");

/** Whether a feature is on in a project. An unknown one is off. */
export async function featureOn(id: string, place: Place) {
  const def = featureById(id);
  if (!def) return false;
  return stateIn(def, await rowsOf(place.organizationId), place.projectId ?? null).on;
}

/** The features off in a project: for /me, so the app leaves out what they bring. */
export async function offIn(place: Place) {
  const rows = await rowsOf(place.organizationId);
  return catalog()
    .filter((f) => !stateIn(f, rows, place.projectId ?? null).on)
    .map((f) => f.id);
}

/** Refuse what a feature turned off there would do, saying which and who turned it off. */
export async function requireFeature(id: BuiltinFeature, place: Place) {
  const def = featureById(id)!;
  const s = stateIn(def, await rowsOf(place.organizationId), place.projectId ?? null);
  if (s.on) return;
  const where = s.from === "project" ? "in this project" : "in this organization";
  const by = s.row ? ` by ${s.row.updatedBy}` : "";
  throw new AssetError("feature_off", `${def.name} ${be(def)} turned off ${where}${by}`, {
    feature: id,
    level: s.from,
    by: s.row?.updatedBy ?? null,
    at: s.row?.updatedAt ?? null,
  });
}

// ---- Settings -----------------------------------------------------------------

function mayManage(caller: Caller, context: Level) {
  const action = context === "organization" ? "organization.manage" : "project.manage";
  if (!can(caller, action)) throw new AssetError("forbidden", `Features of the ${context} take ${needs(action)}`);
}

const projectsIn = (organizationId: string) =>
  db.select({ id: projects.id, slug: projects.slug, name: projects.name }).from(projects).where(eq(projects.organizationId, organizationId)).orderBy(asc(projects.createdAt));

const setBy = (row: Row | null) => (row ? { by: row.updatedBy, at: row.updatedAt.toISOString() } : null);

/** One feature as Settings shows it, at the organization or in the caller's project. */
async function describe(def: FeatureDef, caller: Caller, context: Level, rows: Row[], plan: string[] | null, spaces: { id: string }[]) {
  const org = pick(rows, def.id, null);
  const base = {
    id: def.id,
    name: def.name,
    description: def.description,
    off: def.off ?? null,
    icon: def.icon ?? null,
    builtin: def.builtin,
    levels: def.levels,
    default: def.default,
    // The plan doesn't have it: Settings shows the way to one that does.
    available: !def.plan || !plan || plan.includes(def.plan),
    manage: def.manage ?? null,
  };
  if (context === "organization") {
    const on = spaces.filter((p) => stateIn(def, rows, p.id).on).length;
    return { ...base, rule: ruleOf(def, org?.state ?? null) as Rule, projects: { on, total: spaces.length }, set: setBy(org), on: null, from: null, editable: def.levels.includes("organization") };
  }
  const s = stateIn(def, rows, caller.project.id);
  return { ...base, rule: ruleOf(def, org?.state ?? null) as Rule, projects: null, set: setBy(s.row), on: s.on, from: s.from as From, editable: def.levels.includes("project") && s.from !== "organization" };
}

/** GET /api/v1/features?context=: every feature, as it is switched there. */
export async function listFeatures(caller: Caller, context: Level) {
  mayManage(caller, context);
  const org = caller.project.organizationId;
  rowsOf.forget(org);
  const [rows, limits, spaces] = await Promise.all([rowsOf(org), limitsOf(org), context === "organization" ? projectsIn(org) : []]);
  return Promise.all(catalog().map((def) => describe(def, caller, context, rows, limits.features, spaces)));
}

/**
 * PUT /api/v1/features/{id}?context=: turn it on or off for the organization
 * (every project), give the choice back to each project ("projects"), or
 * turn it on or off in the caller's project where the organization lets it.
 * The projects whose state changes are told, through the feature's hook.
 */
export async function switchFeature(caller: Caller, context: Level, id: string, state: Rule) {
  mayManage(caller, context);
  const def = featureById(id);
  if (!def) throw new AssetError("not_found", `No feature "${id}". Features: ${catalog().map((f) => f.id).join(", ")}`);
  if (!def.levels.includes(context)) throw new AssetError("invalid", `${def.name} is switched for the ${def.levels.join(" or ")}, not the ${context}`);
  if (state === "projects" && (context !== "organization" || !def.levels.includes("project"))) {
    throw new AssetError("invalid", `${def.name} can't be left to each project`);
  }
  const org = caller.project.organizationId;
  const limits = await limitsOf(org);
  if (state === "on" && def.plan && limits.features && !limits.features.includes(def.plan)) {
    throw new AssetError("limit_reached", `${def.name} isn't part of this organization's plan`, { limit: def.plan });
  }
  rowsOf.forget(org);
  const before = await rowsOf(org);
  const projectId = context === "project" ? caller.project.id : null;
  if (context === "project" && stateIn(def, before, projectId).from === "organization") {
    const row = pick(before, def.id, null)!;
    throw new AssetError("forbidden", `${def.name} ${be(def)} turned ${row.state} for the whole organization by ${row.updatedBy}`, { by: row.updatedBy, at: row.updatedAt });
  }
  const spaces = context === "organization" ? await projectsIn(org) : [caller.project];
  const was = new Map(spaces.map((p) => [p.id, stateIn(def, before, p.id).on]));

  const where = and(eq(featureSwitches.organizationId, org), projectId ? eq(featureSwitches.projectId, projectId) : isNull(featureSwitches.projectId), eq(featureSwitches.feature, def.id));
  const previous = pick(before, def.id, projectId);
  const write = async (s: State | "projects" | null) => {
    if (s === null || s === "projects") await db.delete(featureSwitches).where(where);
    else
      await db
        .insert(featureSwitches)
        .values({ organizationId: org, projectId, feature: def.id, state: s, updatedBy: caller.actor })
        .onConflictDoUpdate({ target: [featureSwitches.organizationId, featureSwitches.projectId, featureSwitches.feature], set: { state: s, updatedBy: caller.actor, updatedAt: new Date() } });
    rowsOf.forget(org);
  };
  await write(state);
  const after = await rowsOf(org);
  const changed = spaces.filter((p) => stateIn(def, after, p.id).on !== was.get(p.id));
  const on = changed.filter((p) => stateIn(def, after, p.id).on);
  const off = changed.filter((p) => !stateIn(def, after, p.id).on);

  // Turned on where it was off: each project's hook may refuse, and then nothing changes anywhere.
  const organization = (await db.select({ id: organizations.id, slug: organizations.slug, name: organizations.name }).from(organizations).where(eq(organizations.id, org)))[0];
  const done: typeof on = [];
  for (const p of on) {
    try {
      await enableIn(def, caller, organization, p);
      done.push(p);
    } catch (err) {
      await write(previous?.state ?? null);
      for (const q of done) await disableIn(def, caller, organization, q);
      throw err;
    }
  }
  for (const p of off) await disableIn(def, caller, organization, p);

  await recordAudit(caller, "feature.switched", def.name, { feature: def.id, context, state, projects: changed.length }, { projectId });
  return describe(def, caller, context, after, limits.features, context === "organization" ? spaces : []);
}

// ---- a server's feature, in one project -------------------------------------------

type Org = { id: string; slug: string; name: string };
type Space = Pick<Project, "id" | "slug" | "name">;

async function enableIn(def: FeatureDef, caller: Caller, organization: Org, project: Space) {
  if (def.builtin) return;
  // Its fields, where missing: one of the same key, of any type, is left as it is.
  if (def.fields.length) {
    const have = await listFields(project.id);
    let position = have.length;
    for (const f of def.fields) {
      if (have.some((h) => h.key === f.key)) continue;
      await createField(project.id, { ...f, options: f.options ?? [], required: false, position: position++ }).catch((err) => {
        if (!(err instanceof AssetError && err.code === "conflict")) throw err;
      });
    }
  }
  // Its key, made afresh: one left from before is revoked first.
  let key: { id: string; secret: string; scope: string } | null = null;
  if (def.key) {
    await revokeKeys(def, project.id);
    const secret = `ab_${randomBytes(32).toString("base64url")}`;
    const [row] = await db
      .insert(apiKeys)
      .values({ projectId: project.id, name: def.key.name, scope: def.key.scope, prefix: secret.slice(0, 10), hash: hashKey(secret), feature: def.id })
      .returning({ id: apiKeys.id });
    key = { id: row.id, secret, scope: def.key.scope };
  }
  if (!def.hook) return;
  try {
    await callHook(def, { type: "feature.enabled", ...payload(def, caller, organization, project), key });
  } catch (err) {
    await revokeKeys(def, project.id);
    throw err;
  }
}

async function disableIn(def: FeatureDef, caller: Caller, organization: Org, project: Space) {
  if (def.builtin) return;
  // Told, but never asked: turning a feature off is the admin's to do, whatever it answers.
  if (def.hook) await callHook(def, { type: "feature.disabled", ...payload(def, caller, organization, project) }).catch((err) => console.error(`feature ${def.id}: disable hook`, err));
  await revokeKeys(def, project.id);
}

const revokeKeys = (def: FeatureDef, projectId: string) => db.delete(apiKeys).where(and(eq(apiKeys.projectId, projectId), eq(apiKeys.feature, def.id)));

const payload = (def: FeatureDef, caller: Caller, organization: Org, project: Space) => ({
  feature: def.id,
  organization,
  project: { id: project.id, slug: project.slug, name: project.name },
  by: { actor: caller.actor, user: caller.user },
  at: new Date().toISOString(),
});

/**
 * POST to the feature's hook, signed as Stripe signs its webhooks:
 * `Artbucket-Signature: t={unix seconds},v1={hex HMAC-SHA256 of "{t}.{body}"}`
 * with the secret its file names. A 2xx is a yes; anything else is a no,
 * with the reason it gives ({ error: { message } } or { message }) or one of
 * our own when it gives none.
 */
async function callHook(def: FeatureDef, event: Record<string, unknown>) {
  const hook = def.hook!;
  const secret = process.env[hook.secret];
  if (!secret) throw new AssetError("unavailable", `${def.name} isn't set up on this server: ${hook.secret} is missing`);
  const body = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  const res = await fetch(hook.url, {
    method: "POST",
    headers: { "content-type": "application/json", "artbucket-signature": `t=${t},v1=${signature}` },
    body,
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res) throw new AssetError("unavailable", `${def.name} didn't answer. Try again in a minute`);
  if (res.ok) return;
  const said = (await res.json().catch(() => null)) as { error?: { message?: string; href?: string }; message?: string; href?: string } | null;
  const message = said?.error?.message ?? said?.message;
  const href = said?.error?.href ?? said?.href ?? null;
  if (res.status >= 500 || !message) throw new AssetError("unavailable", `${def.name} couldn't be turned on (${res.status}). Try again in a minute`);
  throw new AssetError("forbidden", message, { feature: def.id, href });
}
