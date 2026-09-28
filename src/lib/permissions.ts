import { allLevels, allowsOn, assetLevels, collectionLevels, type Ability, type Access } from "./access.ts";
import { allows, type Scope } from "./scopes.ts";

/**
 * Every thing someone can do, by name, with the scope it takes and what that
 * scope must be on. The API's routes and core check these names, and the web
 * UI shows or hides a control by the same name, so the two never disagree.
 * A new feature adds its action here, gates its route with it, and wraps its
 * button in <Can do="...">.
 *
 * What a scope is on:
 *
 *   organization  the workspace's organization
 *   workspace     the whole workspace
 *   collection    one collection; its assets' actions reach it too
 *   asset         one asset, directly or through a collection it is in
 *   anywhere      somewhere in the workspace: a grant on any part will do
 *
 * Asked without a target, a collection or asset action means "on some of
 * them", which is how a route lets a caller in before core checks the thing.
 *
 * `ability`: what a grant can switch off to keep this action from someone
 * whose scope would allow it (lib/access.ts).
 *
 * Relative imports only: `pnpm test` runs this under plain Node.
 */

export type On = "organization" | "workspace" | "collection" | "asset" | "anywhere";

export const ACTIONS = {
  // The library, to look at
  "library.read": { scope: "read", on: "anywhere" },
  "activity.read": { scope: "read", on: "workspace" },
  // Assets
  "asset.read": { scope: "read", on: "asset" },
  "asset.upload": { scope: "propose", on: "collection" },
  /** Uploading into no collection: the workspace itself. */
  "workspace.upload": { scope: "propose", on: "workspace" },
  "asset.propose_tags": { scope: "propose", on: "asset" },
  "asset.propose_fields": { scope: "propose", on: "asset" },
  /** A new version of it: approved with write on it, a proposal with propose. */
  "asset.version": { scope: "propose", on: "asset" },
  "asset.edit": { scope: "write", on: "asset" },
  "asset.review": { scope: "write", on: "asset", ability: "approve" },
  "asset.delete": { scope: "write", on: "asset", ability: "delete" },
  "asset.share": { scope: "write", on: "asset", ability: "share" },
  // Collections
  "collection.read": { scope: "read", on: "collection" },
  "collection.create": { scope: "write", on: "workspace" },
  "collection.edit": { scope: "write", on: "collection" },
  "collection.delete": { scope: "write", on: "workspace", ability: "delete" },
  "collection.share": { scope: "write", on: "collection", ability: "share" },
  "collection.collect": { scope: "write", on: "collection", ability: "share" },
  // The workspace's schema and saved things
  "field.read": { scope: "read", on: "anywhere" },
  "field.manage": { scope: "write", on: "workspace", ability: "setup" },
  "search.read": { scope: "read", on: "anywhere" },
  "search.save": { scope: "write", on: "workspace" },
  "search.delete": { scope: "write", on: "workspace" },
  // The brand
  "brand.read": { scope: "read", on: "anywhere" },
  "brand.edit": { scope: "write", on: "workspace", ability: "setup" },
  /** Put the brand's pages and rules, as they stand, in front of portal visitors. */
  "brand.publish": { scope: "write", on: "workspace", ability: "share" },
  // Sharing, keys, people, settings
  "share.manage": { scope: "write", on: "anywhere", ability: "share" },
  "share.collect_workspace": { scope: "write", on: "workspace", ability: "share" },
  "portal.manage": { scope: "write", on: "workspace", ability: "share" },
  "key.manage": { scope: "admin", on: "workspace" },
  "member.manage": { scope: "admin", on: "workspace" },
  "audit.read": { scope: "admin", on: "workspace" },
  "workspace.manage": { scope: "admin", on: "workspace" },
  "organization.manage": { scope: "admin", on: "organization" },
} as const satisfies Record<string, { scope: Scope; on: On; ability?: Ability }>;

export type Action = keyof typeof ACTIONS;

/** Who: a caller's scopes. The server's Caller and the app's /me both are one. */
export type Who = Access & { orgScope: Scope | null };

/** What an action is done to: a collection by id, an asset with the collections it is in and whether it is private. */
export type Target = { id: string; collections?: string[]; private?: boolean };

/** Whether `who` may do `action`, to `target` when the action is about one thing. */
export function can(who: Who, action: Action, target?: Target | null): boolean {
  const def: { scope: Scope; on: On; ability?: Ability } = ACTIONS[action];
  const { scope, on, ability } = def;
  switch (on) {
    case "organization":
      return allows(who.orgScope, scope);
    case "workspace":
      return allowsOn([{ scope: who.scope, off: who.off.workspace }], scope, ability);
    case "anywhere":
      return allowsOn(allLevels(who), scope, ability);
    case "collection":
      return allowsOn(target ? collectionLevels(who, target.id) : allLevels(who), scope, ability);
    case "asset":
      return allowsOn(target ? assetLevels(who, { ...target, collections: target.collections ?? [] }) : allLevels(who), scope, ability);
  }
}

/** What an action needs, in words, for a 403: "write on this asset". */
export const needs = (action: Action) => {
  const { scope, on } = ACTIONS[action];
  return `${scope} ${on === "anywhere" ? "somewhere in the workspace" : `on ${on === "organization" || on === "workspace" ? "the" : "this"} ${on}`}`;
};
