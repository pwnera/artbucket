import { SCOPES, type Scope } from "./scopes.ts";

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
 * Relative imports: `pnpm test` runs this under plain Node.
 */

export const RESOURCES = ["organization", "workspace", "collection", "asset"] as const;
export type Resource = (typeof RESOURCES)[number];

export type Narrow = { collections: Record<string, Scope>; assets: Record<string, Scope> };
export type Access = { scope: Scope | null; narrow: Narrow };

export const NONE: Narrow = { collections: {}, assets: {} };

export function highest(...scopes: (Scope | null | undefined)[]): Scope | null {
  let best = -1;
  for (const s of scopes) if (s) best = Math.max(best, SCOPES.indexOf(s));
  return best < 0 ? null : SCOPES[best];
}

/** An asset's scope for this caller: the workspace's, raised by grants on the asset or a collection it is in. */
export const assetScope = (a: Access, asset: { id: string; collections: string[] }) =>
  highest(a.scope, a.narrow.assets[asset.id], ...asset.collections.map((c) => a.narrow.collections[c]));

export const collectionScope = (a: Access, id: string) => highest(a.scope, a.narrow.collections[id]);

/** The most this caller may do anywhere in the workspace. Routes gate on it; core then checks the thing itself. */
export const widest = (a: Access) =>
  highest(a.scope, ...Object.values(a.narrow.collections), ...Object.values(a.narrow.assets));

/** Only some of the workspace: no scope on all of it, but a grant on part of it. */
export const isNarrowed = (a: Access) => a.scope === null && widest(a) !== null;

/** Ids of the collections and assets this caller may at least `need` on, for SQL. */
export function reach(a: Access, need: Scope) {
  const at = SCOPES.indexOf(need);
  const pick = (m: Record<string, Scope>) => Object.keys(m).filter((k) => SCOPES.indexOf(m[k]) >= at);
  return { collections: pick(a.narrow.collections), assets: pick(a.narrow.assets) };
}

/**
 * A user's scope on a workspace and their narrower grants in it, from all of
 * their grants: the organization's and the workspace's make the scope, the
 * rest are narrow.
 */
export function accessIn(
  grants: { resource: Resource; resourceId: string; workspaceId: string | null; scope: Scope }[],
  workspace: { id: string; organizationId: string },
): Access {
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
  return { scope, narrow };
}
