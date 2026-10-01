import { canonical, type BrandState } from "./brand-files.ts";
import type { SnapRule } from "./history.ts";
import { canon, type SnapPage } from "./pages.ts";

/**
 * Two-way sync's merge: the brand changed in the app and in its repository
 * since they last agreed (`base`), and both sides' changes are kept. Done
 * the way Git merges lines, a piece at a time: each rule (key and context),
 * each page (slug), each theme setting, the name, and the order of rules and
 * of pages. A piece only one side changed takes that side; one both changed
 * alike is that change; one both changed differently is a conflict, and the
 * repository's side wins, since what lands on its branch was reviewed there.
 * The app's side is not lost: it is in the brand's history, a restore away.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

export type Conflict = { what: string; ours: unknown; theirs: unknown };
export type Merged = { state: BrandState; conflicts: Conflict[] };

const ruleId = (r: { key: string; context: string | null }) => (r.context ? `${r.key} (${r.context})` : r.key);
const same = (a: unknown, b: unknown) => canon(a ?? null) === canon(b ?? null);

/** One piece: the side that changed it, or the repository's when both did, differently. */
function pick<T>(what: string, base: T | undefined, ours: T | undefined, theirs: T | undefined, conflicts: Conflict[]): T | undefined {
  if (same(ours, theirs)) return ours;
  if (same(base, ours)) return theirs;
  if (same(base, theirs)) return ours;
  conflicts.push({ what, ours: ours ?? null, theirs: theirs ?? null });
  return theirs;
}

/**
 * An order both may have changed: the side that moved something, else the
 * repository's (adding or removing is not moving); then only what is still
 * there, and what is new on the other side after its neighbour.
 */
function order(base: string[], ours: string[], theirs: string[], present: Set<string>) {
  const moved = (side: string[]) => !same(base.filter((x) => side.includes(x)), side.filter((x) => base.includes(x)));
  const chosen = moved(theirs) || !moved(ours) ? theirs : ours;
  const other = chosen === theirs ? ours : theirs;
  const out = chosen.filter((x) => present.has(x));
  for (const x of other) {
    if (!present.has(x) || out.includes(x)) continue;
    // After what came before it on its own side, so a new rule lands among its neighbours.
    const i = other.indexOf(x);
    const before = other.slice(0, i).reverse().find((y) => out.includes(y));
    out.splice(before === undefined ? 0 : out.indexOf(before) + 1, 0, x);
  }
  for (const x of present) if (!out.includes(x)) out.push(x);
  return out;
}

const keyOrder = (rules: SnapRule[]) => [...new Set([...rules].sort((a, b) => a.position - b.position).map((r) => r.key))];
const pageOrder = (pages: SnapPage[]) => [...pages].sort((a, b) => a.position - b.position).map((p) => p.slug);
/** A page as merged: its words, sections and place in the tree, but not its position among all pages, which the order decides. */
const pagePiece = (p: SnapPage): Omit<SnapPage, "position"> => {
  const piece: Partial<SnapPage> = { ...p };
  delete piece.position;
  delete piece.updatedAt;
  return piece as Omit<SnapPage, "position">;
};
const rulePiece = (r: SnapRule): Omit<SnapRule, "position"> => {
  const piece: Partial<SnapRule> = { ...r };
  delete piece.position;
  return piece as Omit<SnapRule, "position">;
};

export function merge(base: BrandState, ours: BrandState, theirs: BrandState): Merged {
  const [b, o, t] = [base, ours, theirs].map(canonical);
  const conflicts: Conflict[] = [];

  const name = pick("name", b.name, o.name, t.name, conflicts) ?? t.name;

  const theme: Record<string, unknown> = {};
  const settings = new Set([...Object.keys(b.theme), ...Object.keys(o.theme), ...Object.keys(t.theme)]);
  for (const k of settings) {
    const v = pick(`theme.${k}`, b.theme[k as keyof typeof b.theme], o.theme[k as keyof typeof o.theme], t.theme[k as keyof typeof t.theme], conflicts);
    if (v !== undefined && v !== null) theme[k] = v;
  }

  const rulesOf = (s: BrandState) => new Map(s.rules.map((r) => [ruleId(r), r]));
  const [br, or, tr] = [b, o, t].map(rulesOf);
  const rules = new Map<string, Omit<SnapRule, "position">>();
  for (const id of new Set([...br.keys(), ...or.keys(), ...tr.keys()])) {
    const piece = (m: Map<string, SnapRule>) => (m.has(id) ? rulePiece(m.get(id)!) : undefined);
    const r = pick(`rule ${id}`, piece(br), piece(or), piece(tr), conflicts);
    if (r) rules.set(id, r);
  }
  const keys = order(keyOrder(b.rules), keyOrder(o.rules), keyOrder(t.rules), new Set([...rules.values()].map((r) => r.key)));

  const pagesOf = (s: BrandState) => new Map(s.pages.map((p) => [p.slug, p]));
  const [bp, op, tp] = [b, o, t].map(pagesOf);
  const pages = new Map<string, Omit<SnapPage, "position">>();
  for (const slug of new Set([...bp.keys(), ...op.keys(), ...tp.keys()])) {
    const piece = (m: Map<string, SnapPage>) => (m.has(slug) ? pagePiece(m.get(slug)!) : undefined);
    const p = pick(`page ${slug}`, piece(bp), piece(op), piece(tp), conflicts);
    if (p) pages.set(slug, p);
  }
  // Two moves can each be fine and close a loop together (ours: A under B, theirs: B under A). The repository's
  // tree has none, so its place wins for each page in one, a conflict, until no loop is left.
  const looped = (slug: string) => {
    const seen = new Set<string>();
    for (let x = pages.get(slug)?.parent; x && !seen.has(x); x = pages.get(x)?.parent) {
      if (x === slug) return true;
      seen.add(x);
    }
    return false;
  };
  for (let loop = [...pages.keys()].filter(looped); loop.length; loop = [...pages.keys()].filter(looped)) {
    for (const slug of loop) {
      const p = pages.get(slug)!;
      const theirs = tp.get(slug)?.parent;
      if (p.parent === theirs) continue;
      conflicts.push({ what: `page ${slug}'s place`, ours: p.parent ?? null, theirs: theirs ?? null });
      pages.set(slug, { ...p, parent: theirs });
    }
  }
  const slugs = order(pageOrder(b.pages), pageOrder(o.pages), pageOrder(t.pages), new Set(pages.keys()));
  // A page whose parent the other side removed sits at the top: a tree has no dangling branches.
  const merged: SnapPage[] = slugs.map((slug, position) => {
    const { parent, ...p } = pages.get(slug)!;
    return { ...p, position, ...(parent && pages.has(parent) && { parent }) } as SnapPage;
  });

  const state = canonical({
    name,
    theme,
    rules: [...rules.values()].map((r) => ({ ...r, position: keys.indexOf(r.key) })),
    pages: merged,
  });
  return { state, conflicts };
}

// ---- what changed ---------------------------------------------------------------

export type StateDiff = {
  name: { before: string; after: string } | null;
  rules: { change: "added" | "removed" | "changed"; key: string; context: string | null; type: SnapRule["type"]; before?: SnapRule["value"]; after?: SnapRule["value"]; fields?: string[] }[];
  /** A page added, removed, changed in what it says, or only moved in the tree. */
  pages: { change: "added" | "removed" | "changed" | "moved"; slug: string; title: string }[];
  /** Theme settings changed, by name. */
  theme: string[];
  /** The order of rules changed. */
  reordered: boolean;
};

/** What `after` changes of `before`, piece by piece, for a person: a pull request's comment, an import's answer. */
export function diffStates(before: BrandState, after: BrandState): StateDiff {
  const [b, a] = [canonical(before), canonical(after)];
  const was = new Map(b.rules.map((r) => [ruleId(r), r]));
  const is = new Map(a.rules.map((r) => [ruleId(r), r]));
  const rules: StateDiff["rules"] = [];
  for (const r of a.rules) {
    const old = was.get(ruleId(r));
    if (!old) rules.push({ change: "added", key: r.key, context: r.context, type: r.type, after: r.value });
    else {
      const fields = (["type", "label", "value", "usage", "spec", "assets"] as const).filter((f) => !same(old[f], r[f]));
      if (fields.length) rules.push({ change: "changed", key: r.key, context: r.context, type: r.type, before: old.value, after: r.value, fields });
    }
  }
  for (const r of b.rules) if (!is.has(ruleId(r))) rules.push({ change: "removed", key: r.key, context: r.context, type: r.type, before: r.value });

  const pw = new Map(b.pages.map((p) => [p.slug, p]));
  const pi = new Map(a.pages.map((p) => [p.slug, p]));
  const pages: StateDiff["pages"] = [];
  for (const p of a.pages) {
    const old = pw.get(p.slug);
    const words = (x: SnapPage) => pagePiece({ ...x, parent: undefined });
    if (!old) pages.push({ change: "added", slug: p.slug, title: p.title });
    else if (!same(words(old), words(p))) pages.push({ change: "changed", slug: p.slug, title: p.title });
    else if (old.parent !== p.parent || pageOrder(b.pages).indexOf(p.slug) !== pageOrder(a.pages).indexOf(p.slug)) pages.push({ change: "moved", slug: p.slug, title: p.title });
  }
  for (const p of b.pages) if (!pi.has(p.slug)) pages.push({ change: "removed", slug: p.slug, title: p.title });

  const theme = [...new Set([...Object.keys(b.theme), ...Object.keys(a.theme)])].filter(
    (k) => !same(b.theme[k as keyof typeof b.theme], a.theme[k as keyof typeof a.theme]),
  );
  const shared = (x: SnapRule[], y: SnapRule[]) => keyOrder(x).filter((k) => y.some((r) => r.key === k));
  return {
    name: b.name === a.name ? null : { before: b.name, after: a.name },
    rules,
    pages,
    theme,
    reordered: !same(shared(b.rules, a.rules), shared(a.rules, b.rules)),
  };
}

/** Whether a diff changes nothing. */
export const unchanged = (d: StateDiff) => !d.name && !d.rules.length && !d.pages.length && !d.theme.length && !d.reordered;
