import type { z } from "zod";
import { ThemeSettings, type ThemePatch } from "./brand-theme.ts";
import {
  applyOps,
  type Audience,
  boundKeys,
  canon,
  checkTree,
  issues,
  MAX_PAGES,
  PageOp,
  type PageLayout,
  type PagePatch,
  type PageText,
  pageSlug,
  parseSections,
  pickText,
  type Section,
} from "./pages.ts";
import { RULE_SPEC, RuleInput } from "./rules.ts";
import type { NavPage, PageView, ViewPage, ViewRule } from "./site.ts";

/**
 * The builder's state and the changes made to it (build spec 3.5.1). Every
 * change is an op: an edit_page op on one page, a page made or deleted, a
 * batch of rules, a theme patch. Each applies here exactly as the server
 * applies it (the same applyOps), inverts against the state before it, and
 * turns into the request that sends it, so the canvas, undo and the API never
 * disagree. The hook (components/builder/use-builder.ts) holds it in React.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

/** A page as the builder lists it: GET .../pages's row (its tree fields, `hidden`, the keys it shows), without the section count. */
export type NavEntry = {
  slug: string;
  title: string;
  position: number;
  hidden: boolean;
  parent: string | null;
  eyebrow: string | null;
  lede: string | null;
  cover: string | null;
  icon: string | null;
  audience: Audience;
  tabs: boolean;
  layout: PageLayout;
  aliases: string[];
  translations?: Record<string, PageText> | null;
  updatedAt: string | null;
  /** The rules its sections show; a loaded page's own sections say it better (shownOn). */
  keys: string[];
};

/** A rule version, by key and context (null: the default). */
export type RuleRef = { key: string; context: string | null };

type Patch = z.output<typeof ThemePatch>;

export type Op =
  /** One edit_page op on a loaded page (a `page` op works on any page): PATCH .../pages/{page}. */
  | { kind: "page"; page: string; op: PageOp }
  /** A new page, its fields left out take the defaults: PUT .../pages/{slug}. */
  | { kind: "add-page"; page: Pick<NavEntry, "slug" | "title"> & Partial<NavEntry>; sections: Section[] }
  /** A loaded page with no pages under it: DELETE .../pages/{slug}. */
  | { kind: "delete-page"; page: string }
  /** Rule versions made or changed whole, and removed: PATCH /brand/rules (set_rules). */
  | { kind: "rules"; set: ViewRule[]; remove: RuleRef[] }
  /** Theme settings: null clears one. PATCH .../theme. */
  | { kind: "theme"; set: Patch };

/** What the loaded views brought that the builder doesn't edit: the brand, media, collections, publishes, signatures. */
export type Base = Pick<PageView, "brand" | "version" | "lang" | "media" | "collections" | "updates" | "signed">;

export type BuilderState = {
  /** Every page, by position. */
  nav: NavEntry[];
  /** The sections of the pages loaded so far, by slug. */
  pages: Map<string, Section[]>;
  /** Every rule and context version, in the brand's order. */
  rules: ViewRule[];
  theme: ThemeSettings;
  selection: { page: string; section: string | null; rule: string | null };
  /** The context rules resolve for on the canvas; null is the default. */
  context: string | null;
  preview: boolean;
  /** The language the canvas shows; null: as written. */
  lang: string | null;
  base: Base;
};

export type Init = {
  nav: NavEntry[];
  /** The page on show, as GET .../view?page=&edit=1 gives it: its sections and the media around them. */
  view: PageView;
  /** Every rule (GET /brand/rules), its assets described as a view describes them. */
  rules: ViewRule[];
  theme: ThemeSettings;
};

export function initState({ nav, view, rules, theme }: Init): BuilderState {
  const { brand, version, lang, media, collections, updates, signed } = view;
  const page = view.page;
  return {
    nav,
    pages: new Map(page ? [[page.slug, page.sections]] : []),
    rules,
    theme,
    selection: { page: page?.slug ?? nav[0]?.slug ?? "", section: null, rule: null },
    context: view.context,
    preview: false,
    lang: null,
    base: { brand, version, lang, media, collections, updates, signed },
  };
}

/** Another page's view came in: its sections, unless edits already hold them, and its media. */
export function load(s: BuilderState, view: PageView): BuilderState {
  const p = view.page;
  const b = s.base;
  return {
    ...s,
    pages: p && !s.pages.has(p.slug) ? new Map(s.pages).set(p.slug, p.sections) : s.pages,
    base: {
      ...b,
      media: { ...b.media, ...view.media },
      collections: { ...b.collections, ...view.collections },
      signed: { ...b.signed, ...view.signed },
      updates: view.updates ?? b.updates,
    },
  };
}

// ---- applying ---------------------------------------------------------------

type Applied = { state: BuilderState; op: Op; errors: string[] };

const same = (a: RuleRef, b: RuleRef) => a.key === b.key && a.context === b.context;
const byPosition = (a: NavEntry, b: NavEntry) => a.position - b.position || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

/** Pages numbered again from 0, `slug` put at `position`: core/pages.ts place(), so positions match the server's. */
function place(nav: NavEntry[], slug?: string, position?: number): NavEntry[] {
  const sorted = [...nav].sort(byPosition);
  const me = sorted.find((p) => p.slug === slug);
  const order = sorted.filter((p) => p !== me);
  if (me) order.splice(position === undefined ? sorted.indexOf(me) : Math.min(position, order.length), 0, me);
  return order.map((p, i) => (p.position === i ? p : { ...p, position: i }));
}

/** A page op's fields as stored, as core/pages.ts pageMeta writes them: empty text is none, no translations is null. */
const meta = (m: PagePatch): Partial<NavEntry> => ({
  ...(m.title !== undefined && { title: m.title }),
  ...(m.hidden !== undefined && { hidden: m.hidden }),
  ...(m.parent !== undefined && { parent: m.parent }),
  ...(m.eyebrow !== undefined && { eyebrow: m.eyebrow || null }),
  ...(m.lede !== undefined && { lede: m.lede || null }),
  ...(m.cover !== undefined && { cover: m.cover }),
  ...(m.icon !== undefined && { icon: m.icon }),
  ...(m.audience !== undefined && { audience: m.audience }),
  ...(m.tabs !== undefined && { tabs: m.tabs }),
  ...(m.layout !== undefined && { layout: m.layout }),
  ...(m.translations !== undefined && { translations: m.translations && Object.keys(m.translations).length ? m.translations : null }),
});

/** A page's own fields changed: renamed (the old slug an alias, its children following), moved in the tree or the order. */
function patchPage(s: BuilderState, entry: NavEntry, set: PagePatch): { state: BuilderState; errors: string[] } {
  const from = entry.slug;
  const to = set.slug ?? from;
  const renamed = to !== from;
  const errors = renamed && s.nav.some((p) => p.slug === to) ? [`A page "${to}" exists`] : [];
  errors.push(
    ...checkTree(
      s.nav.map((p) =>
        p === entry ? { slug: to, parent: set.parent !== undefined ? set.parent : p.parent } : { slug: p.slug, parent: p.parent === from ? to : p.parent },
      ),
    ),
  );
  if (errors.length) return { state: s, errors };
  let nav = s.nav.map((p) => {
    // The newest 20 old slugs keep working, and a slug taken is no longer anyone's old name.
    if (p === entry) return { ...p, ...meta(set), slug: to, aliases: renamed ? [...new Set([...p.aliases, from])].filter((a) => a !== to).slice(-20) : p.aliases };
    if (!renamed || (p.parent !== from && !p.aliases.includes(to))) return p;
    return { ...p, parent: p.parent === from ? to : p.parent, aliases: p.aliases.filter((a) => a !== to) };
  });
  if (set.position !== undefined) nav = place(nav, to, set.position);
  let pages = s.pages;
  if (renamed && pages.has(from)) {
    pages = new Map(pages).set(to, pages.get(from)!);
    pages.delete(from);
  }
  return { state: { ...s, nav, pages, selection: s.selection.page === from ? { ...s.selection, page: to } : s.selection }, errors: [] };
}

/** A rule as set_rules takes it: text and list rules carry no spec. */
export const ruleInput = (r: ViewRule) => ({
  key: r.key,
  label: r.label,
  context: r.context,
  type: r.type,
  value: r.value,
  usage: r.usage,
  assets: r.assets.map(({ id, rendition }) => ({ id, rendition })),
  ...(r.type in RULE_SPEC && { spec: r.spec }),
});

const BLANK: Omit<NavEntry, "slug" | "title" | "position"> = {
  hidden: false,
  parent: null,
  eyebrow: null,
  lede: null,
  cover: null,
  icon: null,
  audience: "everyone",
  tabs: false,
  layout: "book",
  aliases: [],
  updatedAt: null,
  keys: [],
};

/** The top page first in reading order, when it opens on a cover: the book's home, unnumbered. Null until that page is loaded. */
export function homeOf(nav: NavEntry[], pages: Map<string, Section[]>): string | null {
  const first = nav.filter((p) => p.parent === null).sort(byPosition)[0];
  return first && pages.get(first.slug)?.[0]?.template === "cover" ? first.slug : null;
}

/** What the selection points at, still there: a page gone falls back to the first, a section gone to none. */
function settle(s: BuilderState): BuilderState {
  const { page, section } = s.selection;
  const at = s.nav.some((p) => p.slug === page) ? page : ([...s.nav].sort(byPosition)[0]?.slug ?? "");
  const kept = section !== null && at === page && s.pages.get(at)?.some((x) => x.id === section) ? section : null;
  return at === page && kept === section ? s : { ...s, selection: { ...s.selection, page: at, section: kept } };
}

/**
 * Apply an op: the new state, and the op as applied, which is what to send
 * and to invert (an added section carries the id it was given, so the server
 * keeps it). With errors, nothing changed.
 */
export function apply(s: BuilderState, op: Op): Applied {
  const no = (errors: string[]): Applied => ({ state: s, op, errors });
  const ok = (state: BuilderState, done: Op = op): Applied => ({ state: settle(state), op: done, errors: [] });

  if (op.kind === "page") {
    const parsed = PageOp.safeParse(op.op);
    if (!parsed.success) return no(issues(parsed.error, "op"));
    const done = { ...op, op: parsed.data };
    const entry = s.nav.find((p) => p.slug === op.page);
    if (!entry) return no([`No page "${op.page}"`]);
    if (done.op.op === "page") {
      const r = patchPage(s, entry, done.op.set);
      return r.errors.length ? no(r.errors) : ok(r.state, done);
    }
    const stored = s.pages.get(op.page);
    if (!stored) return no([`${op.page} isn't loaded yet`]);
    const { sections, errors } = applyOps(stored, [done.op], op.page);
    if (errors.length) return no(errors);
    if (done.op.op === "add" && !done.op.section.id) {
      const made = sections.find((x) => !stored.some((y) => y.id === x.id))!;
      done.op = { ...done.op, section: { ...done.op.section, id: made.id } };
    }
    return ok({ ...s, pages: new Map(s.pages).set(op.page, sections) }, done);
  }

  if (op.kind === "add-page") {
    const { slug } = op.page;
    const named = pageSlug.safeParse(slug);
    const { sections, errors } = parseSections(op.sections);
    if (!named.success) errors.push(...issues(named.error, "page.slug"));
    if (s.nav.some((p) => p.slug === slug)) errors.push(`A page "${slug}" exists`);
    if (s.nav.length >= MAX_PAGES) errors.push(`A brand holds ${MAX_PAGES} pages at most`);
    const entry: NavEntry = { ...BLANK, position: s.nav.length, ...op.page, keys: [...new Set(sections.flatMap(boundKeys))] };
    errors.push(...checkTree([...s.nav, entry]));
    if (errors.length) return no(errors);
    const nav = place([...s.nav, entry], slug, entry.position);
    const placed = nav.find((p) => p.slug === slug)!;
    return ok({ ...s, nav, pages: new Map(s.pages).set(slug, sections) }, { kind: "add-page", page: placed, sections });
  }

  if (op.kind === "delete-page") {
    const entry = s.nav.find((p) => p.slug === op.page);
    if (!entry) return no([`No page "${op.page}"`]);
    const under = s.nav.filter((p) => p.parent === op.page);
    if (under.length) return no([`${op.page} has pages under it (${under.map((p) => p.slug).join(", ")}): move or delete them first`]);
    // Its undo puts the sections back, so they must be at hand.
    if (!s.pages.has(op.page)) return no([`${op.page} isn't loaded yet`]);
    const pages = new Map(s.pages);
    pages.delete(op.page);
    return ok({ ...s, nav: place(s.nav.filter((p) => p !== entry)), pages });
  }

  if (op.kind === "rules") {
    const errors = op.set.flatMap((r, i) => {
      const got = RuleInput.safeParse(ruleInput(r));
      const had = s.rules.find((x) => same(x, r));
      return [
        ...(got.success ? [] : issues(got.error, `set[${i}]`)),
        ...(had && had.type !== r.type ? [`set[${i}]: ${r.key} is a ${had.type} rule; its type can't change`] : []),
      ];
    });
    op.remove.forEach((x, i) => {
      if (!s.rules.some((r) => same(r, x))) errors.push(`remove[${i}]: no rule ${x.key}${x.context ? ` for ${x.context}` : ""}`);
    });
    if (errors.length) return no(errors);
    // As set_rules does: removes first, a new version beside its key's others, else last. Unchanged rules stay the same objects.
    const rules = s.rules.filter((r) => !op.remove.some((x) => same(r, x)));
    for (const r of op.set) {
      const i = rules.findIndex((x) => same(x, r));
      const beside = rules.map((x) => x.key).lastIndexOf(r.key);
      if (i >= 0) rules[i] = r;
      else rules.splice(beside >= 0 ? beside + 1 : rules.length, 0, r);
    }
    return ok({ ...s, rules });
  }

  // Stored without nulls (D5), as core/theme.ts setTheme merges.
  const merged = Object.fromEntries(Object.entries({ ...s.theme, ...op.set }).filter(([, v]) => v !== null && v !== undefined));
  const parsed = ThemeSettings.safeParse(merged);
  return parsed.success ? ok({ ...s, theme: parsed.data }) : no(issues(parsed.error, "theme"));
}

/** The op that takes `op` back, from the state before it was applied. `op` is as apply returned it. */
export function invert(op: Op, before: BuilderState): Op {
  if (op.kind === "page") {
    const inner = op.op;
    const stored = before.pages.get(op.page) ?? [];
    const at = (id: string) => stored.findIndex((x) => x.id === id);
    const prev = (id: string) => (at(id) > 0 ? stored[at(id) - 1].id : null);
    if (inner.op === "add") return { ...op, op: { op: "remove", id: inner.section.id! } };
    if (inner.op === "remove") return { ...op, op: { op: "add", section: stored[at(inner.id)] as PageOpAdd["section"], after: prev(inner.id) } };
    if (inner.op === "move") return { ...op, op: { op: "move", id: inner.id, after: prev(inner.id) } };
    if (inner.op === "update") {
      const was = stored[at(inner.id)] as Record<string, unknown>;
      // A new template needs its old props back with it, or they wouldn't parse.
      const keys = [...new Set([...Object.keys(inner.set), ...("template" in inner.set ? ["props"] : [])])].filter((k) => k !== "id");
      return { ...op, op: { op: "update", id: inner.id, set: Object.fromEntries(keys.map((k) => [k, was[k] ?? null])) } };
    }
    const entry = before.nav.find((p) => p.slug === op.page)! as Record<string, unknown>;
    const set = Object.fromEntries(Object.keys(inner.set).map((k) => [k, entry[k] ?? null]));
    return { kind: "page", page: inner.set.slug ?? op.page, op: { op: "page", set } as PageOp };
  }
  if (op.kind === "add-page") return { kind: "delete-page", page: op.page.slug };
  if (op.kind === "delete-page") {
    return { kind: "add-page", page: before.nav.find((p) => p.slug === op.page)!, sections: before.pages.get(op.page)! };
  }
  if (op.kind === "rules") {
    const set: ViewRule[] = [];
    const remove: RuleRef[] = [];
    for (const r of op.set) {
      const had = before.rules.find((x) => same(x, r));
      if (had) set.push(had);
      else remove.push({ key: r.key, context: r.context });
    }
    for (const x of op.remove) set.push(before.rules.find((r) => same(r, x))!);
    return { kind: "rules", set, remove };
  }
  return { kind: "theme", set: Object.fromEntries(Object.keys(op.set).map((k) => [k, before.theme[k as keyof ThemeSettings] ?? null])) as Patch };
}

type PageOpAdd = Extract<PageOp, { op: "add" }>;

// ---- undo -------------------------------------------------------------------

/** One undo step: the ops it made, and what takes them back, last first. `field` is what typing into it coalesces on. */
export type Step = { redo: Op[]; undo: Op[]; field: string | null; at: number };
export type History = { past: Step[]; future: Step[] };
export const EMPTY: History = { past: [], future: [] };

/**
 * What an op changes, for coalescing: a section's or a page's fields, a
 * rule's fields, theme settings. Null for what is never one step with the
 * next (adding, moving, removing, a new rule).
 */
export function fieldOf(op: Op, before: BuilderState): string | null {
  if (op.kind === "page" && (op.op.op === "update" || op.op.op === "page")) {
    return `${op.page}/${op.op.op === "update" ? op.op.id : ""}:${Object.keys(op.op.set).sort()}`;
  }
  if (op.kind === "theme") return `theme:${Object.keys(op.set).sort()}`;
  if (op.kind === "rules" && op.set.length === 1 && !op.remove.length) {
    const r = op.set[0];
    const had = before.rules.find((x) => same(x, r));
    if (!had) return null;
    const changed = (Object.keys(r) as (keyof ViewRule)[]).filter((k) => canon(r[k]) !== canon(had[k]));
    return `rule:${r.key}@${r.context ?? ""}:${changed.sort()}`;
  }
  return null;
}

/** Record an op. The same field again within a second joins the last step, so typing a title is one undo. */
export function push(h: History, op: Op, inverse: Op, field: string | null, at: number): History {
  const top = h.past.at(-1);
  if (field && top?.field === field && at - top.at < 1000) {
    return { past: [...h.past.slice(0, -1), { ...top, redo: [...top.redo, op], undo: [inverse, ...top.undo], at }], future: [] };
  }
  // ponytail: 200 steps; a byte budget if steps grow large.
  return { past: [...h.past, { redo: [op], undo: [inverse], field, at }].slice(-200), future: [] };
}

/**
 * Undo (`back`) or redo a step: its ops applied in turn, and returned to
 * send. An op that no longer applies (the server refused something since)
 * stops there and drops the history, which no longer matches.
 */
export function travel(s: BuilderState, h: History, back: boolean): { state: BuilderState; history: History; sent: Op[]; errors: string[] } {
  const from = back ? h.past : h.future;
  const step = from.at(-1);
  if (!step) return { state: s, history: h, sent: [], errors: [] };
  let state = s;
  const sent: Op[] = [];
  for (const op of back ? step.undo : step.redo) {
    const r = apply(state, op);
    if (r.errors.length) return { state, history: EMPTY, sent, errors: r.errors };
    state = r.state;
    sent.push(r.op);
  }
  // A step undone or redone never takes more typing.
  const moved = { ...step, field: null };
  const rest = from.slice(0, -1);
  return { state, sent, errors: [], history: back ? { past: rest, future: [...h.future, moved] } : { past: [...h.past, moved], future: rest } };
}

// ---- the server -------------------------------------------------------------

/** A page as the server answers a write (S.BrandPage). */
export type EchoPage = Omit<NavEntry, "keys"> & { sections: Section[] };

/**
 * The server's page after a write, when nothing newer is queued for it:
 * taken as the truth, keeping the objects of whatever it didn't change, so
 * the canvas draws nothing again for an echo of what it shows.
 */
export function echo(s: BuilderState, page: EchoPage): BuilderState {
  const { sections, ...fields } = page;
  const old = s.nav.find((p) => p.slug === page.slug);
  if (!old) return s;
  const entry = { ...old, ...fields, keys: [...new Set(sections.flatMap(boundKeys))] };
  const nav = canon(entry) === canon(old) ? s.nav : s.nav.map((p) => (p === old ? entry : p));
  const had = s.pages.get(page.slug);
  if (!had) return nav === s.nav ? s : { ...s, nav };
  const kept = sections.map((x) => had.find((y) => y.id === x.id && canon(y) === canon(x)) ?? x);
  const unchanged = kept.length === had.length && kept.every((x, i) => x === had[i]);
  return { ...s, nav, pages: unchanged ? s.pages : new Map(s.pages).set(page.slug, kept) };
}

/** Which queue an op waits in: ops to the same target go out together, in order. */
export const targetOf = (op: Op): string =>
  op.kind === "page" ? `page:${op.page}` : op.kind === "add-page" ? `page:${op.page.slug}` : op.kind === "delete-page" ? `page:${op.page}` : op.kind;

export type Request = { take: number; method: "PUT" | "PATCH" | "DELETE"; url: string; body?: unknown };

/**
 * The next request for the ops waiting, first in first out: consecutive
 * edits to one page as one PATCH of up to 50 ops, consecutive rule sets as
 * one batch (a key's last version wins), consecutive theme patches as one.
 * Everything else goes alone. `take`: how many ops it sends.
 */
export function request(pending: Op[], brand: string): Request | null {
  const [first] = pending;
  if (!first) return null;
  const b = encodeURIComponent(brand);
  const page = (slug: string) => `/api/v1/brands/${b}/pages/${encodeURIComponent(slug)}`;
  const run = <K extends Op["kind"]>(kind: K, fits: (op: Extract<Op, { kind: K }>, n: number) => boolean) => {
    let n = 0;
    while (n < pending.length && pending[n].kind === kind && fits(pending[n] as Extract<Op, { kind: K }>, n)) n++;
    return pending.slice(0, Math.max(n, 1)) as Extract<Op, { kind: K }>[];
  };

  if (first.kind === "page") {
    const ops = run("page", (op, n) => op.page === first.page && n < 50);
    return { take: ops.length, method: "PATCH", url: page(first.page), body: { ops: ops.map((o) => o.op) } };
  }
  if (first.kind === "add-page") {
    const { slug, title, hidden, position, parent, eyebrow, lede, cover, icon, audience, tabs, layout, translations } = first.page;
    const body = { title, hidden, position, parent, eyebrow, lede, cover, icon, audience, tabs, layout, translations, sections: first.sections };
    return { take: 1, method: "PUT", url: page(slug), body };
  }
  if (first.kind === "delete-page") return { take: 1, method: "DELETE", url: page(first.page) };
  if (first.kind === "rules") {
    // A batch with removes goes alone: set_rules removes before it sets, which would reorder them.
    const ops = first.remove.length ? [first] : run("rules", (op) => !op.remove.length);
    const set = new Map<string, ViewRule>();
    for (const op of ops) for (const r of op.set) set.set(`${r.key}@${r.context ?? ""}`, r);
    const body = { set: [...set.values()].map(ruleInput), ...(first.remove.length && { remove: first.remove }) };
    return { take: ops.length, method: "PATCH", url: `/api/v1/brand/rules?brand=${b}`, body };
  }
  const ops = run("theme", () => true);
  return { take: ops.length, method: "PATCH", url: `/api/v1/brands/${b}/theme`, body: Object.assign({}, ...ops.map((o) => o.set)) };
}

// ---- reading it ---------------------------------------------------------------

/** The pages that show a rule: a loaded page by its sections now, the others by what the server last said. */
export const shownOn = (s: BuilderState, key: string): string[] =>
  s.nav.filter((p) => s.pages.get(p.slug)?.some((x) => boundKeys(x).includes(key)) ?? p.keys.includes(key)).map((p) => p.slug);

/** The nav as the site draws it: every page, hidden ones too (the editor's level), none locked, titled in `lang` when it has them. */
export const navOf = (nav: NavEntry[], home: string | null, lang: string | null): NavPage[] =>
  nav.map((p) => ({ ...(lang ? pickText(p, lang) : p), home: p.slug === home, locked: false }));

/** A page as the canvas draws it, its words in `lang` when it has them. */
export function pageOf(entry: NavEntry, sections: Section[], home: boolean, lang: string | null): ViewPage {
  const p = lang ? pickText(entry, lang) : entry;
  return { ...p, home, sections: lang ? sections.map((x) => pickText(x, lang)) : sections };
}
