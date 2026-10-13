/**
 * An answer of the server's assistant (ASSISTANT_URL), read into what the
 * panel draws (components/assistant-answer.tsx): a small Markdown, and blocks
 * of the assistant's own in [[...]]. Nothing the model writes becomes markup:
 * it is read into text and the shapes below, and the blocks take only what
 * they check (an asset's id, a HEX color, a place in the app). Pure, so
 * `pnpm test` runs it under plain Node.
 *
 * Blocks, as the server teaches its model them:
 *   [[asset:ID|name]]                 an asset, inline: its thumbnail and name
 *   [[assets:ID|name;ID|name;...]]    a grid of assets, on a line of its own
 *   [[color:#RRGGBB|name]]            a swatch, inline; a click copies its HEX
 *   [[verdict:yes|no|conditions|why]] may it be used: a banner, on a line of its own
 *   [[font:Family|role|asset ID]]     a typeface in its own face, on a line of its own
 *   [[open:asset/ID|label]]           a place in the app (asset/ID, brand/SLUG[/TAB], brand/SLUG/guidelines/PAGE[/edit],
 *                                     catalog[/ID[/TAB]], site/ID[/requests], settings[/CONTEXT/SECTION],
 *                                     insights[/activity|checks], team[/TAB], review, collections, brands, activity,
 *                                     sites, connections, library), inline; lib/assistant-place.ts says where it may go
 *   [[action:ID]]                     a change waiting for the person's approval, on a line of its own
 *   [[facts:Label|value;...]]         a key and value grid, up to 8 rows, values may hold inline blocks; own line
 *   [[date:YYYY-MM-DD|until]]         a date in the person's locale, inline; "until" or "since" adds the word
 *   [[next:Question;Question]]        up to 3 questions to tap, the answer's last line, drawn once it has ended
 *   [[brand:SLUG|name]], [[collection:ID|name]], [[person:ID|name]]   chips, inline
 * And Markdown: **bold**, *italic*, `code`, links, "- " and "1. " lists, "#"-"###" section labels (all one size),
 * tables (4 columns at most), ``` code blocks, "> " notes ("> ⚠" a warning, 2 lines at most).
 * A block that fails its check is drawn as its words, never as brackets.
 */

import { BRAND_TABS, CATALOG_TABS, TEAM_TABS } from "./assistant-place.ts";

export type Inline =
  | { t: "text"; text: string }
  | { t: "code"; text: string }
  | { t: "strong"; children: Inline[] }
  | { t: "em"; children: Inline[] }
  | { t: "link"; href: string; children: Inline[] }
  | { t: "asset"; id: string; name: string }
  | { t: "color"; hex: string; name: string }
  | { t: "place"; path: string; label: string }
  | { t: "date"; iso: string; word: DateWord | null }
  | { t: "brand"; slug: string; name: string }
  | { t: "collection"; id: string; name: string }
  | { t: "person"; id: string; name: string };

export type DateWord = "until" | "since";

export type Verdict = "yes" | "no" | "conditions";

export type Block =
  | { t: "p"; inline: Inline[] }
  | { t: "h"; inline: Inline[] }
  | { t: "list"; ordered: boolean; items: Inline[][] }
  | { t: "code"; text: string }
  | { t: "table"; head: Inline[][]; rows: Inline[][][] }
  | { t: "callout"; warn: boolean; lines: Inline[][] }
  | { t: "assets"; items: { id: string; name: string }[]; more: number }
  | { t: "verdict"; kind: Verdict; why: Inline[] }
  | { t: "font"; family: string; role: string; asset: string | null }
  | { t: "action"; id: string }
  | { t: "facts"; rows: { label: string; value: Inline[] }[] }
  | { t: "next"; items: string[] };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const IS_UUID = new RegExp(`^${UUID}$`, "i");
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const TABS = ["overview", ...BRAND_TABS];
const PLACES: Record<string, string> = {
  library: "/",
  review: "/review",
  collections: "/collections",
  brands: "/brands",
  activity: "/activity",
  insights: "/insights",
  sites: "/sites",
  team: "/team",
  catalog: "/catalog",
  connections: "/connections",
  settings: "/settings",
};
/** A grid shows this many; the rest are counted. */
export const GRID_MAX = 12;
/** Facts rows, questions to tap, a table's columns, a warning's lines: past these the rest is dropped. */
export const FACTS_MAX = 8;
export const NEXT_MAX = 3;
export const TABLE_MAX = 4;
export const WARN_MAX = 2;
const PERSON = /^[\w-]{1,64}$/;

/** A real day as YYYY-MM-DD: 2026-02-30 isn't one. */
export function isDay(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** Splits at `sep` outside nested blocks: a facts value may hold [[asset:ID|name]], whose | and ; are its own. */
export function split(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.startsWith("[[", i)) {
      depth++;
      i++;
    } else if (s.startsWith("]]", i) && depth) {
      depth--;
      i++;
    } else if (s[i] === sep && !depth) {
      out.push(s.slice(from, i));
      from = i + 1;
    }
  }
  out.push(s.slice(from));
  return out;
}
export const VERDICTS: Record<Verdict, string> = { yes: "May use", conditions: "May use, with conditions", no: "May not use" };

/** A place as the model names it (asset/ID, brand/SLUG/TAB, review), as the app's path; null when it isn't one. */
export function placePath(spec: string): string | null {
  const p = String(spec).split("/").filter(Boolean);
  if (p[0] === "asset") return p.length === 2 && IS_UUID.test(p[1]) ? `/?asset=${p[1].toLowerCase()}` : null;
  if (p[0] === "brand" && SLUG.test(p[1] || "")) {
    if (p.length === 2 || (p.length === 3 && p[2] === "overview")) return `/brands/${p[1]}`;
    if (p.length === 4 && p[2] === "guidelines" && SLUG.test(p[3])) return `/brands/${p[1]}/guidelines?page=${p[3]}`;
    if (p.length === 5 && p[2] === "guidelines" && SLUG.test(p[3]) && p[4] === "edit") return `/brands/${p[1]}/guidelines?page=${p[3]}&ways=1`;
    if (p.length === 3 && TABS.includes(p[2])) return `/brands/${p[1]}/${p[2]}`;
    return null;
  }
  if (p[0] === "catalog" && p.length > 1) {
    if (!IS_UUID.test(p[1]) || p.length > 3 || (p[2] && !CATALOG_TABS.includes(p[2]))) return null;
    return `/catalog?o=${p[1].toLowerCase()}${p[2] ? `&tab=${p[2]}` : ""}`;
  }
  if (p[0] === "site") return IS_UUID.test(p[1] || "") && (p.length === 2 || (p.length === 3 && p[2] === "requests")) ? `/sites?${p[2] ? "open" : "edit"}=${p[1].toLowerCase()}` : null;
  if (p[0] === "settings" && p.length > 1) return p.length === 3 && ["project", "organization", "account"].includes(p[1]) && /^[a-z][a-z-]{0,40}$/.test(p[2]) ? `/settings/${p[1]}/${p[2]}` : null;
  if (p[0] === "insights" && p.length > 1) return p.length === 2 && ["activity", "checks"].includes(p[1]) ? `/insights/${p[1]}` : null;
  if (p[0] === "team" && p.length > 1) return p.length === 2 && TEAM_TABS.includes(p[1]) ? `/team?tab=${p[1]}` : null;
  return p.length <= 1 && Object.hasOwn(PLACES, p[0] || "library") ? PLACES[p[0] || "library"] : null;
}

type Rule = { re: RegExp; make: (m: RegExpExecArray) => Inline | null };

/**
 * A line's marks, earliest first (the first rule listed wins a tie): code keeps what is inside it as it is, the
 * blocks are taken whole, and bold, italic and a link's label are read again for what they hold.
 */
const RULES: Rule[] = [
  { re: /`([^`]+)`/g, make: (m) => ({ t: "code", text: m[1] }) },
  { re: new RegExp(`\\[\\[asset:(${UUID})(?:\\|([^\\]]*))?\\]\\]`, "gi"), make: (m) => ({ t: "asset", id: m[1].toLowerCase(), name: m[2] || "Asset" }) },
  { re: /\[\[color:(#[0-9a-f]{3,8})(?:\|([^\]]*))?\]\]/gi, make: (m) => (HEX.test(m[1]) ? { t: "color", hex: m[1], name: m[2] ?? "" } : null) },
  {
    re: /\[\[open:([^\]|]+)(?:\|([^\]]*))?\]\]/g,
    make: (m) => {
      const path = placePath(m[1]);
      return path ? { t: "place", path, label: m[2] || "Open it" } : m[2] ? { t: "text", text: m[2] } : null;
    },
  },
  {
    re: /\[\[date:([^\]|]*)(?:\|([^\]]*))?\]\]/g,
    make: (m) => {
      const iso = m[1].trim();
      const word = m[2]?.trim().toLowerCase();
      return isDay(iso) ? { t: "date", iso, word: word === "until" || word === "since" ? word : null } : { t: "text", text: iso };
    },
  },
  {
    re: /\[\[brand:([^\]|]*)(?:\|([^\]]*))?\]\]/g,
    make: (m) => (SLUG.test(m[1].trim()) ? { t: "brand", slug: m[1].trim(), name: m[2]?.trim() || m[1].trim() } : { t: "text", text: m[2]?.trim() || m[1] }),
  },
  {
    re: /\[\[collection:([^\]|]*)(?:\|([^\]]*))?\]\]/g,
    make: (m) => (IS_UUID.test(m[1].trim()) ? { t: "collection", id: m[1].trim().toLowerCase(), name: m[2]?.trim() || "Collection" } : { t: "text", text: m[2]?.trim() || "a collection" }),
  },
  {
    re: /\[\[person:([^\]|]*)(?:\|([^\]]*))?\]\]/g,
    make: (m) => (PERSON.test(m[1].trim()) && m[2]?.trim() ? { t: "person", id: m[1].trim(), name: m[2].trim() } : { t: "text", text: m[2]?.trim() || "someone" }),
  },
  { re: /\*\*([^*]+)\*\*/g, make: (m) => ({ t: "strong", children: inline(m[1]) }) },
  { re: /(?<=^|[\s(])\*([^*\s][^*]*)\*(?=[\s.,;:!?)]|$)/g, make: (m) => ({ t: "em", children: inline(m[1]) }) },
  { re: /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, make: (m) => ({ t: "link", href: m[2], children: inline(m[1]) }) },
  // A bare address, without the punctuation that ends the sentence it is in.
  { re: /(?<=^|[\s(])https?:\/\/[^\s)<]*[^\s)<.,;:!?'"]/g, make: (m) => ({ t: "link", href: m[0], children: [{ t: "text", text: m[0] }] }) },
];

/** A line's words, marked up. */
export function inline(s: string): Inline[] {
  const out: Inline[] = [];
  const text = (t: string) => {
    if (!t) return;
    const last = out.at(-1);
    if (last?.t === "text") last.text += t;
    else out.push({ t: "text", text: t });
  };
  let pos = 0;
  while (pos < s.length) {
    let best: { at: number; end: number; node: Inline } | null = null;
    for (const { re, make } of RULES) {
      re.lastIndex = pos;
      for (let m = re.exec(s); m; m = re.exec(s)) {
        if (best && m.index >= best.at) break;
        const node = make(m);
        if (node) {
          best = { at: m.index, end: m.index + m[0].length, node };
          break;
        }
        // Not one after all (a color that isn't HEX): look further on.
        re.lastIndex = m.index + 1;
      }
    }
    if (!best) break;
    text(s.slice(pos, best.at));
    if (best.node.t === "text") text(best.node.text);
    else out.push(best.node);
    pos = best.end;
  }
  text(s.slice(pos));
  return out;
}

/** A line that is one block, its own brackets matched (a verdict's reason may hold an asset): [kind, body] or null. */
function blockOf(line: string): [string, string] | null {
  const t = line.trim();
  const m = t.match(/^\[\[(action|assets|verdict|font|facts|next):/);
  if (!m) return null;
  let depth = 0;
  for (let i = 0; i < t.length - 1; i++) {
    if (t[i] === "[" && t[i + 1] === "[") {
      depth++;
      i++;
    } else if (t[i] === "]" && t[i + 1] === "]") {
      depth--;
      i++;
      if (depth === 0) return i === t.length - 1 ? [m[1], t.slice(m[0].length, i - 1)] : null;
    }
  }
  return null;
}

function block(kind: string, body: string): Block | null {
  const parts = body.split("|");
  if (kind === "facts") {
    const rows = split(body, ";")
      .map((row) => {
        const [label, ...value] = split(row, "|");
        return { label: label.trim(), value: inline(value.join("|").trim()) };
      })
      .filter((r) => r.label && r.value.length);
    return rows.length ? { t: "facts", rows: rows.slice(0, FACTS_MAX) } : null;
  }
  if (kind === "next") {
    const items = split(body, ";")
      .map((q) => q.trim())
      .filter((q) => q && q.length <= 200 && !q.includes("[["));
    return items.length ? { t: "next", items: items.slice(0, NEXT_MAX) } : null;
  }
  if (kind === "action") return /^[\w-]+$/.test(body) ? { t: "action", id: body } : null;
  if (kind === "assets") {
    const items = body
      .split(";")
      .map((part) => {
        const [id, ...name] = part.split("|");
        return { id: id.trim().toLowerCase(), name: name.join("|").trim() };
      })
      .filter((a) => IS_UUID.test(a.id));
    if (!items.length) return null;
    return { t: "assets", items: items.slice(0, GRID_MAX), more: Math.max(items.length - GRID_MAX, 0) };
  }
  if (kind === "verdict") {
    const v = parts[0].trim().toLowerCase();
    if (!Object.hasOwn(VERDICTS, v)) return null;
    const why = parts.slice(1).join("|").trim();
    return { t: "verdict", kind: v as Verdict, why: why ? inline(why) : [] };
  }
  const family = parts[0].trim();
  if (!family) return null;
  const id = (parts[2] || "").trim();
  return { t: "font", family, role: (parts[1] || "").trim(), asset: IS_UUID.test(id) ? id.toLowerCase() : null };
}

/** A table row's cells, split outside blocks: a [[person:ID|name]] in a cell keeps its |. */
const CELLS = (line: string) => split(line.trim().replace(/^\||\|$/g, ""), "|").map((c) => c.trim());
const SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/**
 * The answer's blocks. `streaming`: the text so far, so a block not yet closed at its end ([[asse...) is left out
 * rather than shown half-written.
 */
export function parseAnswer(md: string, { streaming = false } = {}): Block[] {
  let text = String(md ?? "");
  // The first block not yet closed, nested ones counted: from there on it is still being written.
  if (streaming) {
    const open: number[] = [];
    for (let i = 0; i < text.length - 1; i++) {
      if (text[i] === "[" && text[i + 1] === "[") open.push(i++);
      else if (text[i] === "]" && text[i + 1] === "]" && open.length) {
        open.pop();
        i++;
      }
    }
    if (open.length) text = text.slice(0, open[0]);
  }
  const lines = text.split("\n");
  const out: Block[] = [];
  let list: { ordered: boolean; items: Inline[][] } | null = null;
  const close = () => {
    if (list) out.push({ t: "list", ...list });
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // A code block, to its closing fence (or the end, while it streams).
    if (/^\s*```\s*[\w+-]*\s*$/.test(line)) {
      close();
      const body: string[] = [];
      for (i++; i < lines.length && !/^\s*```\s*$/.test(lines[i]); i++) body.push(lines[i]);
      out.push({ t: "code", text: body.join("\n") });
      continue;
    }
    const item = line.match(/^\s*[-*] (.*)/);
    const numbered = line.match(/^\s*\d+[.)] (.*)/);
    if (item || numbered) {
      const ordered = !item;
      if (list && list.ordered !== ordered) close();
      (list ??= { ordered, items: [] }).items.push(inline((item || numbered)![1]));
      continue;
    }
    close();
    const b = blockOf(line);
    if (b) {
      const made = block(...b);
      // Questions to tap that didn't parse are dropped; facts that didn't are said as "Label: value" lines.
      if (made) out.push(made);
      else if (b[0] === "facts") out.push(...split(b[1], ";").map((row) => ({ t: "p" as const, inline: inline(split(row, "|").join(": ").trim()) })));
      else if (b[0] !== "next") out.push({ t: "p", inline: inline(line) });
      continue;
    }
    // A table: its header, the |---| line, and its rows.
    if (/^\s*\|/.test(line) && i + 1 < lines.length && SEPARATOR.test(lines[i + 1])) {
      // Four columns at most: the panel is narrow.
      const head = CELLS(line).slice(0, TABLE_MAX);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) rows.push(CELLS(lines[i]));
      i--;
      out.push({ t: "table", head: head.map(inline), rows: rows.map((r) => head.map((_, j) => inline(r[j] ?? ""))) });
      continue;
    }
    const title = line.match(/^\s*#{1,6}\s+(.*)/);
    if (title) {
      out.push({ t: "h", inline: inline(title[1]) });
      continue;
    }
    // A note, its lines together; one starting with ⚠ (or "Warning:") is a warning.
    if (/^\s*>/.test(line)) {
      const said: string[] = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) said.push(lines[i].replace(/^\s*>\s?/, ""));
      i--;
      const warn = /^\s*(⚠|warning:)/i.test(said[0] || "");
      out.push({ t: "callout", warn, lines: (warn ? said.slice(0, WARN_MAX) : said).map((l) => inline(l.replace(/^\s*⚠️?\s*/, ""))) });
      continue;
    }
    if (line.trim()) out.push({ t: "p", inline: inline(line) });
  }
  close();
  // Questions to tap: once, as the last thing, and only once the answer has ended.
  return out.filter((b, i) => b.t !== "next" || (!streaming && i === out.length - 1));
}

/** The answer to copy: Markdown as people paste it, the blocks said in words. Inline ones first, so a block holding one reads whole. */
export function plainText(md: string): string {
  return String(md ?? "")
    .split("\n")
    .filter((l) => !/^\s*\[\[(action:[\w-]+|next:[^\]]*)\]\]\s*$/.test(l))
    .join("\n")
    .replace(/\[\[asset:[^|\]]*\|?([^\]]*)\]\]/g, (_, name: string) => name || "an asset")
    .replace(/\[\[(?:brand|collection|person):([^|\]]*)\|?([^\]]*)\]\]/g, (_, id: string, name: string) => name || id)
    .replace(/\[\[color:([^|\]]*)\|?([^\]]*)\]\]/g, (_, hex: string, name: string) => (name ? `${name} ` : "") + hex.toUpperCase())
    .replace(/\[\[date:([^|\]]*)\|?([^\]]*)\]\]/g, (_, iso: string, word: string) => (/^(until|since)$/i.test(word.trim()) ? `${word.trim().toLowerCase()} ` : "") + iso.trim())
    .replace(/\[\[open:([^|\]]*)\|?([^\]]*)\]\]/g, (_, spec: string, label: string) => label || spec)
    .replace(/\[\[assets:([^\]]*)\]\]/g, (_, body: string) =>
      body
        .split(";")
        .map((p) => `- ${p.split("|").slice(1).join("|").trim() || p.split("|")[0].trim()}`)
        .join("\n"),
    )
    .replace(/\[\[facts:([^\]]*)\]\]/g, (_, body: string) =>
      body
        .split(";")
        .map((row) => row.split("|").map((x) => x.trim()).join(": "))
        .join("\n"),
    )
    .replace(/\[\[verdict:([^|\]]*)\|?([^\]]*)\]\]/g, (_, kind: string, why: string) => {
      const k = kind.trim().toLowerCase();
      return (Object.hasOwn(VERDICTS, k) ? VERDICTS[k as Verdict] : kind) + (why ? `: ${why}` : "");
    })
    .replace(/\[\[font:([^|\]]*)\|?([^|\]]*)[^\]]*\]\]/g, (_, family: string, role: string) => family + (role ? ` (${role})` : ""))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** One line of a stream of JSON lines (the server's answers and imports): parsed, or null for a heartbeat or a broken line. */
export function jsonLine(line: string): Record<string, unknown> | null {
  if (!line.trim()) return null;
  try {
    const v = JSON.parse(line);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** Reads a response of JSON lines, one event at a time, until it ends. */
export async function* jsonLines(res: Response): AsyncGenerator<Record<string, unknown>> {
  if (!res.body) return;
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const ev = jsonLine(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
      if (ev) yield ev;
    }
  }
  const last = jsonLine(buf);
  if (last) yield last;
}
