import { allows, SCOPES, type Scope } from "./scopes.ts";

/**
 * Who may do what, as pure functions over a caller's grants. Grants reach
 * down: organization, then workspace, then collection, then one asset, and
 * the highest scope on the way wins. So write on a collection is write on
 * every asset in it, and admin on the organization is admin everywhere.
 *
 * A caller carries its scope on the whole workspace, plus the grants that
 * reach further than that on single collections or assets: a contractor with
 * no workspace role and write on "Autumn 26" sees that collection and nothing
 * else. Core narrows searches and checks writes with these.
 *
 * Private collections and assets turn the workspace scope away (admins
 * excepted): only grants on them reach them. Roles are one ladder: nothing
 * is switched off per grant.
 *
 * Relative imports: `pnpm test` runs this under plain Node.
 */

export const RESOURCES = ["organization", "workspace", "collection", "asset"] as const;
export type Resource = (typeof RESOURCES)[number];

export type Narrow = { collections: Record<string, Scope>; assets: Record<string, Scope> };
/**
 * `hidden`: the workspace's private collections. The workspace scope doesn't
 * reach into those, nor into private assets, unless it is admin: only a
 * grant on the thing (or a collection it is in) does.
 */
export type Access = { scope: Scope | null; narrow: Narrow; hidden: string[] };

export const NONE: Narrow = { collections: {}, assets: {} };

export function highest(...scopes: (Scope | null | undefined)[]): Scope | null {
  let best = -1;
  for (const s of scopes) if (s) best = Math.max(best, SCOPES.indexOf(s));
  return best < 0 ? null : SCOPES[best];
}

/** One step on the way down to a thing: a scope there. */
export type Level = { scope: Scope | null };

/** Private: the asset's own flag, or every collection it is in is private. */
export const isPrivate = (a: Access, asset: { collections: string[]; private?: boolean }) =>
  !!asset.private || (asset.collections.length > 0 && asset.collections.every((c) => a.hidden.includes(c)));

/** The workspace's level, as it reaches something: only an admin's reaches something private. */
const top = (a: Access, hidden: boolean): Level => ({ scope: hidden && a.scope !== "admin" ? null : a.scope });

export const collectionLevels = (a: Access, id: string): Level[] => [
  top(a, a.hidden.includes(id)),
  { scope: a.narrow.collections[id] ?? null },
];

export const assetLevels = (a: Access, asset: { id: string; collections: string[]; private?: boolean }): Level[] => [
  top(a, isPrivate(a, asset)),
  { scope: a.narrow.assets[asset.id] ?? null },
  ...asset.collections.map((c) => ({ scope: a.narrow.collections[c] ?? null })),
];

/** Every level: somewhere in the workspace. */
export const allLevels = (a: Access): Level[] => [
  { scope: a.scope },
  ...Object.values(a.narrow.collections).map((scope) => ({ scope })),
  ...Object.values(a.narrow.assets).map((scope) => ({ scope })),
];

/** Whether some level allows `need`. */
export const allowsOn = (levels: Level[], need: Scope) => levels.some((l) => allows(l.scope, need));

/** An asset's scope for this caller: the workspace's, raised by grants on the asset or a collection it is in. */
export const assetScope = (a: Access, asset: { id: string; collections: string[]; private?: boolean }) =>
  highest(...assetLevels(a, asset).map((l) => l.scope));

export const collectionScope = (a: Access, id: string) => highest(...collectionLevels(a, id).map((l) => l.scope));

/** The most this caller may do anywhere in the workspace. Routes gate on it; core then checks the thing itself. */
export const widest = (a: Access) => highest(...allLevels(a).map((l) => l.scope));

/** Only some of the workspace: no scope on all of it, but a grant on part of it. */
export const isNarrowed = (a: Access) => a.scope === null && widest(a) !== null;

/** Ids of the collections and assets this caller's grants reach with at least `need`, for SQL. */
export function reach(a: Access, need: Scope) {
  const at = SCOPES.indexOf(need);
  const pick = (m: Record<string, Scope>) => Object.keys(m).filter((k) => SCOPES.indexOf(m[k]) >= at);
  return { collections: pick(a.narrow.collections), assets: pick(a.narrow.assets) };
}

type GrantRow = { resource: Resource; resourceId: string; workspaceId: string | null; scope: Scope };

/**
 * A user's scope on a workspace and their narrower grants in it, from all of
 * their grants: the organization's and the workspace's make the scope, the
 * rest are narrow. `hidden`: the workspace's private collections.
 */
export function accessIn(grants: GrantRow[], workspace: { id: string; organizationId: string }, hidden: string[] = []): Access {
  const narrow: Narrow = { collections: {}, assets: {} };
  let scope: Scope | null = null;
  for (const g of grants) {
    if (g.resource === "organization") {
      if (g.resourceId === workspace.organizationId) scope = highest(scope, g.scope);
    } else if (g.workspaceId !== workspace.id) continue;
    else if (g.resource === "workspace") scope = highest(scope, g.scope);
    else if (g.resource === "collection") narrow.collections[g.resourceId] = highest(narrow.collections[g.resourceId], g.scope)!;
    else if (g.resource === "asset") narrow.assets[g.resourceId] = highest(narrow.assets[g.resourceId], g.scope)!;
  }
  return { scope, narrow, hidden };
}

/** The lower of two scopes: what an agent may do is what it was granted and its person still can. */
export const lowest = (a: Scope | null, b: Scope | null): Scope | null =>
  a === null || b === null ? null : SCOPES[Math.min(SCOPES.indexOf(a), SCOPES.indexOf(b))];

/** Access held to at most `max` everywhere: a person's, as their agent's key sees it. */
export function capAt(a: Access, max: Scope): Access {
  const cap = (m: Record<string, Scope>) => Object.fromEntries(Object.entries(m).map(([id, s]) => [id, lowest(s, max)!]));
  return { ...a, scope: lowest(a.scope, max), narrow: { collections: cap(a.narrow.collections), assets: cap(a.narrow.assets) } };
}
