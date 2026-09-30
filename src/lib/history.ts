import { canon, hiddenSlugs, type SnapPage } from "./pages.ts";
import type { RuleAsset, RuleSpec, RuleType, RuleValue } from "./rules.ts";

/**
 * A brand's history, Google Docs style: every change lands in a version that
 * holds the whole rule set as it stood after it. Rule sets are small, so full
 * snapshots cost little and make the two things history is for trivial: show
 * what changed between any two versions, and put an old one back.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

/** A rule as history keeps it: everything but its row id, which a restore renews. */
export type SnapRule = {
  key: string;
  context: string | null;
  type: RuleType;
  value: RuleValue;
  usage: string | null;
  position: number;
  assets: RuleAsset[];
  /** Kept only when set, so versions from before labels and specs read the same. */
  label?: string | null;
  spec?: RuleSpec | null;
};

export type VersionKind = "baseline" | "edit" | "restore";

/** Edits by the same hand this close together are one version, as in a doc. */
export const MERGE_WINDOW_MS = 10 * 60 * 1000;

/**
 * Whether a change extends the latest version or starts a new one. Only a
 * plain, unnamed, unpublished edit by the same actor, within the window, is
 * extended: a named or published version is a checkpoint, and a restore
 * stands on its own.
 */
export function extendsLatest(
  latest: { kind: VersionKind; name: string | null; actor: string; updatedAt: Date; publishedAt?: Date | null } | undefined,
  actor: string,
  now: Date,
) {
  return (
    !!latest &&
    latest.kind === "edit" &&
    latest.name === null &&
    // What was published stays as it was published: portals show it.
    !latest.publishedAt &&
    latest.actor === actor &&
    now.getTime() - latest.updatedAt.getTime() < MERGE_WINDOW_MS
  );
}

export type FieldChange = { field: "type" | "label" | "value" | "spec" | "usage" | "assets"; before: unknown; after: unknown };

export type RuleChange =
  | { change: "added"; key: string; context: string | null; after: SnapRule }
  | { change: "removed"; key: string; context: string | null; before: SnapRule }
  | { change: "changed"; key: string; context: string | null; fields: FieldChange[]; moved: boolean }
  | { change: "moved"; key: string; context: string | null };

const id = (r: { key: string; context: string | null }) => `${r.key}\u0000${r.context ?? ""}`;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Where each key sits among the keys: a reorder is a change of rank, not of the raw number. */
function ranks(rules: SnapRule[]) {
  const keys = [...new Set([...rules].sort((a, b) => a.position - b.position || a.key.localeCompare(b.key)).map((r) => r.key))];
  return new Map(keys.map((k, i) => [k, i]));
}

/**
 * What changed from `before` to `after`, rule by rule, in `after`'s order
 * with removals last. A rule is its key and context; renaming a key reads as
 * one removed and one added, which is what it is to anyone reading by key.
 */
export function diffRules(before: SnapRule[], after: SnapRule[]): RuleChange[] {
  const was = new Map(before.map((r) => [id(r), r]));
  const is = new Map(after.map((r) => [id(r), r]));
  // Moved: a key whose rank among the keys both versions share changed.
  const shared = (rules: SnapRule[]) => rules.filter((r) => was.has(id(r)) && is.has(id(r)));
  const [rankBefore, rankAfter] = [ranks(shared(before)), ranks(shared(after))];
  const out: RuleChange[] = [];

  const ordered = [...after].sort((a, b) => a.position - b.position || a.key.localeCompare(b.key));
  for (const r of ordered) {
    const old = was.get(id(r));
    const where = { key: r.key, context: r.context };
    if (!old) {
      out.push({ change: "added", ...where, after: r });
      continue;
    }
    // Missing reads as null: a snapshot leaves out an unset label or spec.
    const fields = (["type", "label", "value", "spec", "usage", "assets"] as const)
      .filter((f) => !same(old[f] ?? null, r[f] ?? null))
      .map((f) => ({ field: f, before: old[f] ?? null, after: r[f] ?? null }));
    const moved = rankBefore.get(r.key) !== rankAfter.get(r.key);
    if (fields.length) out.push({ change: "changed", ...where, fields, moved });
    else if (moved) out.push({ change: "moved", ...where });
  }
  for (const r of before) if (!is.has(id(r))) out.push({ change: "removed", key: r.key, context: r.context, before: r });
  return out;
}

/** "Edited color.primary and 2 more": a version's line in the history list. */
export function summarize(changed: string[]) {
  if (!changed.length) return "No changes";
  const [first, ...rest] = changed;
  // Pages are named "page:logo" (lib/pages.ts changedPages); the theme is "theme".
  const name = first === "theme" ? "the theme" : first.startsWith("page:") ? `the ${first.slice(5)} page` : first;
  return `Edited ${name}${rest.length ? ` and ${rest.length} more` : ""}`;
}

// ---- what's new ---------------------------------------------------------------

export type Ref = { slug: string; title: string };
export type WhatsNew = {
  rules: { added: string[]; changed: string[]; removed: string[] };
  pages: { added: Ref[]; changed: Ref[]; removed: Ref[] };
};
type Published = { rules: SnapRule[]; pages: SnapPage[] | null };

/** What a reader sees of a page: not where it sits in the tree, its old slugs, when it was written, or its hidden sections. */
const said = (p: SnapPage) =>
  canon({ ...p, slug: undefined, position: undefined, parent: undefined, aliases: undefined, updatedAt: undefined, sections: p.sections.filter((s) => !s.hidden) });

/**
 * What a publish changed for readers since the one before it (null: the
 * first, where everything is new). Rules by key, whatever the context; a
 * reorder is no news. Pages readers can't reach (hidden, or under a hidden
 * page) are left out, so hiding one reads as removed and showing it as added;
 * a renamed page is the same page, found by its old slug.
 */
export function whatsNew(before: Published | null, after: Published): WhatsNew {
  const had = new Set((before?.rules ?? []).map((r) => r.key));
  const has = new Set(after.rules.map((r) => r.key));
  const touched = new Set(diffRules(before?.rules ?? [], after.rules).flatMap((c) => (c.change === "moved" ? [] : c.key)));
  const shown = (ps: SnapPage[] | null) => {
    const hidden = hiddenSlugs(ps ?? []);
    return (ps ?? []).filter((p) => !hidden.has(p.slug));
  };
  const [was, is] = [shown(before?.pages ?? null), shown(after.pages)];
  const now = (p: SnapPage) => is.find((q) => q.slug === p.slug) ?? is.find((q) => q.aliases?.includes(p.slug));
  const kept = new Map(was.flatMap((p) => (now(p) ? [[now(p)!.slug, p] as const] : [])));
  const ref = ({ slug, title }: SnapPage): Ref => ({ slug, title });
  return {
    rules: {
      added: [...has].filter((k) => !had.has(k)),
      changed: [...touched].filter((k) => had.has(k) && has.has(k)),
      removed: [...had].filter((k) => !has.has(k)),
    },
    pages: {
      added: is.filter((p) => !kept.has(p.slug)).map(ref),
      changed: is.filter((p) => kept.has(p.slug) && said(kept.get(p.slug)!) !== said(p)).map(ref),
      removed: was.filter((p) => !now(p)).map(ref),
    },
  };
}

/** A publish, as What's new lists it: `image` is the note's picture, an asset id. */
export type Update = { version: number; publishedAt: string; publishedBy: string | null; note: string | null; image: string | null; changes: WhatsNew };

type Version = Published & { number: number; publishedAt: Date | string | null; publishedBy: string | null; note: string | null; noteImage: string | null };

/**
 * The latest `limit` publishes, newest first, each beside the publish before
 * it: edits and restores between two publishes are passed over, so readers
 * see what changed from what they saw. Give it one publish more than `limit`,
 * or the oldest listed reads as the first, everything new.
 */
export function updatesOf(versions: Version[], limit = 20): Update[] {
  const published = versions.filter((v) => v.publishedAt).sort((a, b) => b.number - a.number);
  return published.slice(0, limit).map((v, i) => ({
    version: v.number,
    publishedAt: new Date(v.publishedAt!).toISOString(),
    publishedBy: v.publishedBy,
    note: v.note,
    image: v.noteImage,
    changes: whatsNew(published[i + 1] ?? null, v),
  }));
}

// ---- what a release changes -----------------------------------------------------

/**
 * One line of what a release changes, as the release page lists it and the
 * brand's Overview sums it up: a rule by key and context, or a page readers
 * reach. `mark` is what happened to it; `what` says how, in a few words
 * ("new artwork", "2 sections edited"); a color whose value moved carries
 * both hexes, which the page draws as swatches.
 */
export type ReleaseLine =
  | { kind: "rule"; mark: "added" | "changed" | "removed"; key: string; context: string | null; label: string | null; what: string; before?: string; after?: string }
  | { kind: "page"; mark: "added" | "changed" | "removed"; slug: string; title: string; what: string };

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
/** How a changed field reads on its line. */
const FIELD_WORDS: Record<FieldChange["field"], string> = {
  value: "new value",
  assets: "new artwork",
  usage: "usage edited",
  label: "renamed",
  spec: "details edited",
  type: "kind changed",
};
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * What a release changes from the one before it (null: the first), line by
 * line: rules as diffRules has them (a move is no news), then the pages
 * readers reach as whatsNew has them, a changed page with how many of its
 * shown sections are new, edited or gone.
 */
export function releaseLines(before: Published | null, after: Published): ReleaseLine[] {
  const rules = diffRules(before?.rules ?? [], after.rules).flatMap((c): ReleaseLine[] => {
    if (c.change === "moved") return [];
    const base = { kind: "rule" as const, key: c.key, context: c.context };
    if (c.change === "added") return [{ ...base, mark: "added", label: c.after.label ?? null, what: "new rule" }];
    if (c.change === "removed") return [{ ...base, mark: "removed", label: c.before.label ?? null, what: "removed" }];
    const label = after.rules.find((r) => r.key === c.key && r.context === c.context)?.label ?? null;
    const value = c.fields.find((f) => f.field === "value");
    const color = value && typeof value.before === "string" && typeof value.after === "string" && HEX.test(value.before) && HEX.test(value.after);
    const words = c.fields.filter((f) => !(color && f === value)).map((f) => FIELD_WORDS[f.field]);
    return [{ ...base, mark: "changed", label, what: words.join(", "), ...(color && { before: value.before as string, after: value.after as string }) }];
  });
  const news = whatsNew(before, after).pages;
  const shown = (p: SnapPage | undefined) => (p?.sections ?? []).filter((s) => !s.hidden);
  const pages = [
    ...news.added.map((p): ReleaseLine => ({ kind: "page", mark: "added", ...p, what: "new page" })),
    ...news.changed.map((p): ReleaseLine => {
      const is = after.pages?.find((q) => q.slug === p.slug);
      // The page as it was, by its slug then or an old one it answers to now.
      const was = before?.pages?.find((q) => q.slug === p.slug || is?.aliases?.includes(q.slug));
      const [old, now] = [new Map(shown(was).map((s) => [s.id, canon(s)])), shown(is)];
      const edited = now.filter((s) => old.get(s.id) !== canon(s)).length + [...old.keys()].filter((id) => !now.some((s) => s.id === id)).length;
      return { kind: "page", mark: "changed", ...p, what: edited ? `${plural(edited, "section")} edited` : "edited" };
    }),
    ...news.removed.map((p): ReleaseLine => ({ kind: "page", mark: "removed", ...p, what: "removed" })),
  ];
  return [...rules, ...pages];
}

/**
 * The same, in a few words for a line under the release: the first rules
 * by key, then the pages counted ("logo.primary new artwork, color.ember
 * #E76F51 → #E4572E, 3 pages edited").
 */
export function releaseSummary(lines: ReleaseLine[], rules = 3): string[] {
  const said = lines.flatMap((l) => (l.kind === "rule" ? [`${l.key}${l.context ? ` (${l.context})` : ""} ${l.before ? `${l.before} → ${l.after}` : l.what}`.trim()] : []));
  const pages = (mark: ReleaseLine["mark"]) => lines.filter((l) => l.kind === "page" && l.mark === mark).length;
  return [
    ...said.slice(0, rules),
    ...(said.length > rules ? [`${plural(said.length - rules, "more rule")}`] : []),
    ...(pages("added") ? [plural(pages("added"), "new page")] : []),
    ...(pages("changed") ? [`${plural(pages("changed"), "page")} edited`] : []),
    ...(pages("removed") ? [`${plural(pages("removed"), "page")} removed`] : []),
  ];
}
