import { createHmac, randomBytes } from "node:crypto";
import { and, asc, eq, gt, inArray, isNotNull, isNull, or, sql, type SQLWrapper } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys, brands, brandVersions, domains, featureSwitches, organizations, portals, projects, shareLinks } from "@/lib/db/schema";
import type { Caller, Project } from "@/lib/core/access";
import { recordAudit } from "@/lib/core/audit";
import { AssetError } from "@/lib/core/errors";
import { createField, listFields } from "@/lib/core/fields";
import { hashKey } from "@/lib/core/keys";
import { effective } from "@/lib/core/settings";
import { limitsOf } from "@/lib/core/usage";
import { catalog, decide, featureById, onApp, ruleOf, type BuiltinFeature, type FeatureDef, type From, type Level, type Rule, type State } from "@/lib/features";
import { memo } from "@/lib/memo";
import { ago } from "@/lib/time";
import { signerOpen } from "@/lib/core/signers";
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

/**
 * Whether it is on there, where that comes from, and the switch that says so (null for the default or the plan).
 * `planned`: the organization has a plan, for a feature that takes one.
 */
function stateIn(def: FeatureDef, rows: Row[], projectId: string | null, planned = true) {
  const org = pick(rows, def.id, null);
  const own = projectId ? pick(rows, def.id, projectId) : null;
  const d = decide(def, org?.state ?? null, own?.state ?? null, planned);
  return { ...d, row: d.from === "organization" ? org : d.from === "project" ? own : null };
}

/**
 * The organization is on a plan, as a feature taking one asks (FEATURES_FILE's `paid`): limits of its own (billing
 * writes them), not read-only or suspended. A plan whose payment failed keeps its limits, and this, while that is
 * sorted out. As limits are read: a minute late at most.
 */
async function plannedOf(organizationId: string) {
  const { value, source } = await effective("limits", { organizationId });
  return source === "organization" && !value.readOnly && !value.suspended;
}
/** Whether the organization's plan matters to any of these, and if so, whether it has one. */
const plannedFor = async (defs: FeatureDef[], organizationId: string) => (defs.some((d) => d.paid) ? plannedOf(organizationId) : true);

/** "Agents and API keys are", "Intelligence is". */
const be = (def: FeatureDef) => (/ and |s$/.test(def.name) ? "are" : "is");

/** Whether a feature is on in a project. An unknown one is off. */
export async function featureOn(id: string, place: Place) {
  const def = featureById(id);
  if (!def) return false;
  return stateIn(def, await rowsOf(place.organizationId), place.projectId ?? null, await plannedFor([def], place.organizationId)).on;
}

/** A project's organization, which never changes: kept, as every file served asks whether usage is counted. */
const orgOf = memo(10 * 60_000, async (projectId: string) => {
  const [p] = await db.select({ id: projects.organizationId }).from(projects).where(eq(projects.id, projectId));
  return p?.id ?? null;
});

/** Whether a feature is on in a project, known by its id alone: for what a visitor or a file served is about. */
export async function featureOnIn(id: string, projectId: string) {
  const organizationId = await orgOf(projectId);
  return !!organizationId && featureOn(id, { organizationId, projectId });
}

/**
 * SQL: the organization `organizationId` names hasn't turned `feature` off
 * for itself: for what the public sees of a feature switched on the
 * organization alone (BrandHub), as notSuspended is for suspension.
 */
export const notSwitchedOff = (feature: BuiltinFeature, organizationId: SQLWrapper) =>
  sql`not exists (select 1 from ${featureSwitches} fs where fs.organization_id = ${organizationId} and fs.project_id is null
    and fs.feature = ${feature} and fs.state = 'off')`;

/** The features off in a project: for /me, so the app leaves out what they bring. */
export async function offIn(place: Place) {
  const [rows, planned] = await Promise.all([rowsOf(place.organizationId), plannedFor(catalog(), place.organizationId)]);
  return catalog()
    .filter((f) => !stateIn(f, rows, place.projectId ?? null, planned).on)
    .map((f) => f.id);
}

/**
 * The feature a request is made for, when it says so (`Artbucket-Feature:
 * intelligence`, as the assistant's calls do) and this server has it; null
 * otherwise. It only ever narrows: such a call reaches the projects where the
 * feature is on, of those its caller may open (access.ts callerFrom,
 * catalog.ts reachOf, /a/{id}). One this server doesn't list is ignored.
 */
export function featureOf(req: Request) {
  const id = req.headers.get("artbucket-feature")?.trim().toLowerCase();
  return id && featureById(id) ? id : null;
}

/** Refuse what a feature turned off there would do, saying which and who turned it off. */
export async function requireFeature(id: BuiltinFeature | (string & {}), place: Place) {
  const def = featureById(id)!;
  const s = stateIn(def, await rowsOf(place.organizationId), place.projectId ?? null, await plannedFor([def], place.organizationId));
  if (s.on) return;
  if (s.from === "plan") throw new AssetError("feature_off", `${def.name} ${be(def) === "are" ? "aren't" : "isn't"} part of this organization's plan`, { feature: id, level: "plan", by: null, at: null });
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
async function describe(def: FeatureDef, caller: Caller, context: Level, rows: Row[], plan: string[] | null, spaces: { id: string }[], planned: boolean) {
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
    // The plan doesn't have it (or there is no plan, for one taking any): Settings shows the way to one that does.
    available: def.paid ? planned : !def.plan || !plan || plan.includes(def.plan),
    manage: def.manage ? onApp(def.manage, process.env.APP_URL) : null,
  };
  if (context === "organization") {
    const on = spaces.filter((p) => stateIn(def, rows, p.id, planned).on).length;
    return { ...base, rule: ruleOf(def, org?.state ?? null) as Rule, projects: { on, total: spaces.length }, set: setBy(org), on: null, from: null, editable: def.levels.includes("organization") };
  }
  const s = stateIn(def, rows, caller.project.id, planned);
  return { ...base, rule: ruleOf(def, org?.state ?? null) as Rule, projects: null, set: setBy(s.row), on: s.on, from: s.from as From, editable: def.levels.includes("project") && s.from !== "organization" };
}

/** GET /api/v1/features?context=: every feature, as it is switched there. */
export async function listFeatures(caller: Caller, context: Level) {
  mayManage(caller, context);
  const org = caller.project.organizationId;
  rowsOf.forget(org);
  const [rows, limits, spaces, planned] = await Promise.all([rowsOf(org), limitsOf(org), context === "organization" ? projectsIn(org) : [], plannedFor(catalog(), org)]);
  return Promise.all(catalog().map((def) => describe(def, caller, context, rows, limits.features, spaces, planned)));
}

/**
 * PUT /api/v1/features/{id}?context=: turn it on or off for the organization
 * (every project), give the choice back to each project ("projects"), or
 * turn it on or off in the caller's project where the organization lets it.
 * The projects whose state changes are told, through the feature's hook.
 */
export async function switchFeature(caller: Caller, context: Level, id: string, state: Rule) {
  const { def, org, limits, planned, before, projectId, spaces, was } = await prepare(caller, context, id, state);

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
  const changed = spaces.filter((p) => stateIn(def, after, p.id, planned).on !== was.get(p.id));
  const on = changed.filter((p) => stateIn(def, after, p.id, planned).on);
  const off = changed.filter((p) => !stateIn(def, after, p.id, planned).on);
  // Turned on where it was off: each project's hook may refuse, and then nothing changes anywhere.
  const organization = (await db.select({ id: organizations.id, slug: organizations.slug, name: organizations.name }).from(organizations).where(eq(organizations.id, org)))[0];
  const { done, failed } = await pool(on, (p) => enableIn(def, caller, organization, p));
  if (failed) {
    await write(previous?.state ?? null);
    await pool(done, (p) => disableIn(def, caller, organization, p));
    throw failed;
  }
  await pool(off, (p) => disableIn(def, caller, organization, p));

  // What portals and links handed out asks again at once, here (lib/core/signers.ts).
  if (def.id === "portals" || def.id === "shares") signerOpen.forget();
  await recordAudit(caller, "feature.switched", def.name, { feature: def.id, context, state, projects: changed.length }, { projectId });
  return describe(def, caller, context, after, limits.features, context === "organization" ? spaces : [], planned);
}

/** What a change asks, checked: the feature, where, and each project's state before it. Shared by switching and its dry run. */
async function prepare(caller: Caller, context: Level, id: string, state: Rule) {
  mayManage(caller, context);
  const def = featureById(id);
  if (!def) throw new AssetError("not_found", `No feature "${id}". Features: ${catalog().map((f) => f.id).join(", ")}`);
  if (!def.levels.includes(context)) throw new AssetError("invalid", `${def.name} is switched for the ${def.levels.join(" or ")}, not the ${context}`);
  if (state === "projects" && (context !== "organization" || !def.levels.includes("project"))) {
    throw new AssetError("invalid", `${def.name} can't be left to each project`);
  }
  const org = caller.project.organizationId;
  const limits = await limitsOf(org);
  const planned = await plannedFor([def], org);
  if (state === "on" && ((def.plan && limits.features && !limits.features.includes(def.plan)) || !planned)) {
    throw new AssetError("limit_reached", `${def.name} isn't part of this organization's plan`, { limit: def.plan ?? def.id });
  }
  rowsOf.forget(org);
  const before = await rowsOf(org);
  const projectId = context === "project" ? caller.project.id : null;
  if (context === "project" && stateIn(def, before, projectId, planned).from === "organization") {
    const row = pick(before, def.id, null)!;
    throw new AssetError("forbidden", `${def.name} ${be(def)} turned ${row.state} for the whole organization by ${row.updatedBy}`, { by: row.updatedBy, at: row.updatedAt });
  }
  const spaces = context === "organization" ? await projectsIn(org) : [caller.project];
  const was = new Map(spaces.map((p) => [p.id, stateIn(def, before, p.id, planned).on]));
  return { def, org, limits, planned, before, projectId, spaces, was };
}

/** Their names, a few of them: "Press, Docs and 3 more". */
const named = (list: { name: string }[], few = 3) =>
  list.length <= few + 1 ? list.map((p) => p.name).join(", ").replace(/, ([^,]*)$/, " and $1") : `${list.slice(0, few).map((p) => p.name).join(", ")} and ${list.length - few} more`;
const count = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

/**
 * What switching would do, without doing it: for the app's confirmation. The
 * projects it changes, and for what reaches outside the admin's view (keys in
 * use, links, portals, public listings, counting that can't be made up later,
 * a server's own warning), what will happen, counted. `confirm` is whether to
 * ask first: never when nothing changes, always when the organization
 * overrides projects' own choice.
 */
export async function featureImpact(caller: Caller, context: Level, id: string, state: Rule) {
  const { def, org, planned, before, projectId, spaces, was } = await prepare(caller, context, id, state);
  // The switch as it would be: this place's row replaced, or gone for "projects".
  const after = before.filter((r) => !(r.feature === def.id && r.projectId === projectId));
  if (state !== "projects") after.push({ ...(pick(before, def.id, projectId) ?? ({} as Row)), organizationId: org, projectId, feature: def.id, state });
  const off = spaces.filter((p) => was.get(p.id) && !stateIn(def, after, p.id, planned).on);
  const on = spaces.filter((p) => !was.get(p.id) && stateIn(def, after, p.id, planned).on);
  const ids = off.map((p) => p.id);
  const says: string[] = [];
  const now = new Date();

  if (context === "organization" && def.levels.includes("project") && (on.length || off.length)) {
    const turn = (k: number) => (k === 1 ? "turns" : "turn");
    if (off.length) says.push(`${off.length} of ${count(spaces.length, "project")} ${turn(off.length)} off: ${named(off)}.`);
    if (on.length) says.push(`${on.length} of ${count(spaces.length, "project")} ${turn(on.length)} on: ${named(on)}.`);
    // Projects that chose for themselves, now overruled; their choice is kept for when each decides again.
    const overruled = state === "projects" ? 0 : before.filter((r) => r.feature === def.id && r.projectId && r.state !== state).length;
    if (overruled) says.push(`This overrides ${count(overruled, "project")} that chose otherwise. Their choice is kept, for when each project decides again.`);
  }

  if (ids.length && def.id === "agents") {
    const keys = await db
      .select({ name: apiKeys.name, agent: apiKeys.userId, lastUsedAt: apiKeys.lastUsedAt })
      .from(apiKeys)
      .where(and(inArray(apiKeys.projectId, ids), isNull(apiKeys.feature), or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now))))
      .orderBy(sql`${apiKeys.lastUsedAt} desc nulls last`);
    const agents = keys.filter((k) => k.agent).length;
    if (keys.length) {
      const latest = keys[0].lastUsedAt ? `, including "${keys[0].name}", last used ${ago(keys[0].lastUsedAt)}` : "";
      const what = [keys.length - agents && count(keys.length - agents, "API key"), agents && count(agents, "connected agent")].filter(Boolean).join(" and ");
      says.push(`${what} will be refused${latest}. Scripts and CI that use them will fail.`);
    }
  }
  if (ids.length && def.id === "shares") {
    const links = await db
      .select({ kind: shareLinks.kind })
      .from(shareLinks)
      .where(and(inArray(shareLinks.projectId, ids), or(isNull(shareLinks.expiresAt), gt(shareLinks.expiresAt, now))));
    const uploads = links.filter((l) => l.kind === "upload").length;
    if (links.length) says.push(`${count(links.length, "link")} stop opening${uploads ? `, ${uploads} of them for uploads` : ""}. They are kept, and open again when this is back on.`);
  }
  if (ids.length && def.id === "portals") {
    const open = await db
      .select({ id: portals.id, kind: portals.kind })
      .from(portals)
      .where(and(inArray(portals.projectId, ids), or(isNull(portals.expiresAt), gt(portals.expiresAt, now))));
    const hosts = open.length
      ? await db.select({ host: domains.host }).from(domains).where(and(inArray(domains.portalId, open.map((p) => p.id)), isNotNull(domains.verifiedAt)))
      : [];
    const kept = open.filter((p) => p.kind === "portal").length;
    const what = [kept && count(kept, "portal"), open.length - kept && count(open.length - kept, "site")].filter(Boolean).join(" and ");
    if (open.length) says.push(`${what} close to visitors${hosts.length ? `, including ${named(hosts.map((h) => ({ name: h.host })))}` : ""}. They are kept as they are, and open again when this is back on.`);
  }
  if (off.length && def.id === "hub") {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(brands)
      .innerJoin(projects, eq(projects.id, brands.projectId))
      .where(
        and(
          eq(projects.organizationId, org),
          eq(brands.visibility, "public"),
          isNull(brands.hubDelisted),
          sql`exists (select 1 from ${brandVersions} v where v.brand_id = ${brands.id} and v.published_at is not null)`,
        ),
      );
    if (n) says.push(`${count(n, "public brand")} leave BrandHub, and ${n === 1 ? "its" : "their"} brand.json stops being served. Your own people see ${n === 1 ? "it" : "them"} as private.`);
  }
  if (off.length && def.id === "insights") says.push("Nothing is counted while it is off: that time stays empty in Insights, and can't be filled in later.");
  if (off.length && def.confirm?.off) says.push(def.confirm.off);
  if (on.length && def.confirm?.on) says.push(def.confirm.on);

  const changes = on.length + off.length;
  // Each project's own state, said for the organization: only the outside effects, or overriding them, ask first.
  const asks = says.some((s) => !/^\d+ of \d+ projects? turns? (on|off):/.test(s));
  const turning = state === "projects" ? "Let each project decide about" : `Turn ${state}`;
  return {
    changes,
    confirm: changes > 0 && (asks || (context === "organization" && state !== "projects")),
    title: `${turning} ${def.name}${context === "organization" && state !== "projects" && def.levels.includes("project") ? " for every project" : ""}?`,
    says,
    action: state === "projects" ? "Let each decide" : `Turn ${state}`,
  };
}

/** Hooks called at once, at most: hundreds of projects turned on together take seconds, not minutes. */
const AT_ONCE = 8;

/** `fn` over `items`, AT_ONCE at a time; after a failure no more start. Those done, and the first failure. */
async function pool<T>(items: T[], fn: (item: T) => Promise<void>) {
  const done: T[] = [];
  let failed: unknown = null;
  let next = 0;
  const lane = async () => {
    while (!failed && next < items.length) {
      const item = items[next++];
      try {
        await fn(item);
        done.push(item);
      } catch (err) {
        failed ??= err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, items.length) }, lane));
  return { done, failed };
}

// ---- a server's feature, in one project -------------------------------------------

type Org = { id: string; slug: string; name: string };
type Space = Pick<Project, "id" | "slug" | "name">;
/** Who turned it on or off, as its hook is told: an admin, or whoever made the project. */
type Who = { actor: string; user?: { id: string; name?: string; email?: string } | null };

/**
 * A project just made: each of the server's features on there (the
 * organization turned it on everywhere, or it is on by default) is set up and
 * told, as turning it on would. One that refuses is turned off in the project
 * where projects decide, so it never reads as on without being so; where the
 * organization decides, the refusal is logged.
 */
export async function setUpProject(by: Who, organizationId: string, project: Space) {
  const defs = catalog().filter((f) => !f.builtin);
  if (!defs.length) return;
  rowsOf.forget(organizationId);
  const [rows, planned] = await Promise.all([rowsOf(organizationId), plannedFor(defs, organizationId)]);
  const on = defs.filter((def) => stateIn(def, rows, project.id, planned).on);
  if (!on.length) return;
  const [organization] = await db.select({ id: organizations.id, slug: organizations.slug, name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId));
  for (const def of on) {
    try {
      await enableIn(def, by, organization, project);
    } catch (err) {
      console.error(`feature ${def.id}: not set up in new project ${project.id}`, err);
      if (stateIn(def, rows, project.id, planned).from === "organization" || !def.levels.includes("project")) continue;
      await db.insert(featureSwitches).values({ organizationId, projectId: project.id, feature: def.id, state: "off", updatedBy: by.actor }).onConflictDoNothing();
      rowsOf.forget(organizationId);
    }
  }
}

async function enableIn(def: FeatureDef, caller: Who, organization: Org, project: Space) {
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

async function disableIn(def: FeatureDef, caller: Who, organization: Org, project: Space) {
  if (def.builtin) return;
  // Told, but never asked: turning a feature off is the admin's to do, whatever it answers.
  if (def.hook) await callHook(def, { type: "feature.disabled", ...payload(def, caller, organization, project) }).catch((err) => console.error(`feature ${def.id}: disable hook`, err));
  await revokeKeys(def, project.id);
}

const revokeKeys = (def: FeatureDef, projectId: string) => db.delete(apiKeys).where(and(eq(apiKeys.projectId, projectId), eq(apiKeys.feature, def.id)));

const payload = (def: FeatureDef, caller: Who, organization: Org, project: Space) => ({
  feature: def.id,
  organization,
  project: { id: project.id, slug: project.slug, name: project.name },
  by: { actor: caller.actor, user: caller.user ?? null },
  at: new Date().toISOString(),
});

/**
 * `Artbucket-Signature` for a hook's body, as Stripe signs its webhooks: `t={unix seconds},v1={hex HMAC-SHA256 of
 * "{t}.{body}"}`. The receiver checks it with the secret, and refuses an old `t`. Automations' webhooks too.
 */
export function signHook(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

/**
 * POST to the feature's hook, signed as Stripe signs its webhooks (signHook)
 * with the secret its file names. A 2xx is a yes; anything else is a no,
 * with the reason it gives ({ error: { message } } or { message }) or one of
 * our own when it gives none.
 */
async function callHook(def: FeatureDef, event: Record<string, unknown>) {
  const hook = def.hook!;
  const secret = process.env[hook.secret];
  if (!secret) throw new AssetError("unavailable", `${def.name} isn't set up on this server: ${hook.secret} is missing`);
  const body = JSON.stringify(event);
  const res = await fetch(hook.url, {
    method: "POST",
    headers: { "content-type": "application/json", "artbucket-signature": signHook(secret, body) },
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
