import { allLevels, allowsOn, assetLevels, brandLevels, collectionLevels, type Access } from "./access.ts";
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
 *   organization  the project's organization
 *   project     the whole project
 *   collection    one collection; its assets' actions reach it too
 *   asset         one asset, directly or through a collection it is in
 *   brand         one brand: the project's role, or a grant on the brand
 *   anywhere      somewhere in the project: a grant on any part will do
 *
 * Asked without a target, a collection or asset action means "on some of
 * them", which is how a route lets a caller in before core checks the thing.
 *
 * Relative imports only: `pnpm test` runs this under plain Node.
 */

export type On = "organization" | "project" | "collection" | "asset" | "brand" | "anywhere";

export const ACTIONS = {
  // The library, to look at
  "library.read": { scope: "read", on: "anywhere" },
  "activity.read": { scope: "read", on: "project" },
  /** The catalog: every project of the organization the caller reaches, each by its own grants (lib/core/catalog.ts). */
  "catalog.read": { scope: "read", on: "anywhere" },
  // Assets
  "asset.read": { scope: "read", on: "asset" },
  "asset.upload": { scope: "propose", on: "collection" },
  /** Uploading into no collection: the project itself. */
  "project.upload": { scope: "propose", on: "project" },
  "asset.propose_tags": { scope: "propose", on: "asset" },
  "asset.propose_fields": { scope: "propose", on: "asset" },
  /** A new version of it: approved with write on it, a proposal with propose. */
  "asset.version": { scope: "propose", on: "asset" },
  "asset.edit": { scope: "write", on: "asset" },
  "asset.review": { scope: "write", on: "asset" },
  "asset.delete": { scope: "write", on: "asset" },
  "asset.share": { scope: "write", on: "asset" },
  // Collections
  "collection.read": { scope: "read", on: "collection" },
  "collection.create": { scope: "write", on: "project" },
  "collection.edit": { scope: "write", on: "collection" },
  "collection.delete": { scope: "write", on: "project" },
  "collection.share": { scope: "write", on: "collection" },
  "collection.collect": { scope: "write", on: "collection" },
  // The project's schema and saved things
  "field.read": { scope: "read", on: "anywhere" },
  "field.manage": { scope: "write", on: "project" },
  "search.read": { scope: "read", on: "anywhere" },
  "search.save": { scope: "write", on: "project" },
  "search.delete": { scope: "write", on: "project" },
  // The brand
  "brand.read": { scope: "read", on: "brand" },
  /** Making a brand: the project's, not one brand's. */
  "brand.create": { scope: "write", on: "project" },
  "brand.edit": { scope: "write", on: "brand" },
  /** With brand.edit: its rules, pages and history go. */
  "brand.delete": { scope: "write", on: "brand" },
  /**
   * Comment on its pages, reply, resolve and reopen a thread, and edit or
   * delete one's own comment; deleting someone else's takes brand.edit.
   * Propose: saying something about the guidelines, not changing them.
   */
  "brand.comment": { scope: "propose", on: "brand" },
  /** Put the brand's pages and rules, as they stand, in front of portal visitors. */
  "brand.publish": { scope: "write", on: "brand" },
  // Sharing, keys, people, settings
  "share.manage": { scope: "write", on: "anywhere" },
  "share.collect_project": { scope: "write", on: "project" },
  "portal.manage": { scope: "write", on: "project" },
  "key.manage": { scope: "admin", on: "project" },
  "member.manage": { scope: "admin", on: "project" },
  "audit.read": { scope: "admin", on: "project" },
  /** What the brand's events say (lib/core/insights.ts): for whoever looks after the project. */
  "insights.read": { scope: "write", on: "project" },
  "project.manage": { scope: "admin", on: "project" },
  "organization.manage": { scope: "admin", on: "organization" },
} as const satisfies Record<string, { scope: Scope; on: On }>;

export type Action = keyof typeof ACTIONS;

/** Who: a caller's scopes. The server's Caller and the app's /me both are one. */
export type Who = Access & { orgScope: Scope | null };

/** What an action is done to: a collection by id, an asset with the collections it is in and whether it is private. */
export type Target = { id: string; collections?: string[]; private?: boolean };

/** Whether `who` may do `action`, to `target` when the action is about one thing. */
export function can(who: Who, action: Action, target?: Target | null): boolean {
  const { scope, on }: { scope: Scope; on: On } = ACTIONS[action];
  switch (on) {
    case "organization":
      return allows(who.orgScope, scope);
    case "project":
      return allows(who.scope, scope);
    case "anywhere":
      return allowsOn(allLevels(who), scope);
    case "collection":
      return allowsOn(target ? collectionLevels(who, target.id) : allLevels(who), scope);
    case "asset":
      return allowsOn(target ? assetLevels(who, { ...target, collections: target.collections ?? [] }) : allLevels(who), scope);
    case "brand":
      // A brand that isn't private reads like the project's other things: any grant in it will do.
      // The project's role or a grant on the brand, never a collection's or a share of something else; without one named, some brand.
      return allowsOn(target ? brandLevels(who, target) : [{ scope: who.scope }, ...Object.values(who.narrow.brands).map((s) => ({ scope: s }))], scope);
  }
}

/** What an action needs, in words, for a 403: "write on this asset". */
export const needs = (action: Action) => {
  const { scope, on } = ACTIONS[action];
  return `${scope} ${on === "anywhere" ? "somewhere in the project" : `on ${on === "organization" || on === "project" ? "the" : "this"} ${on}`}`;
};
