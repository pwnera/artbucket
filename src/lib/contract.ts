/**
 * The v1 promise, as code: what /api/v1 and the MCP tools looked like when
 * they were frozen (contract/), compared with what they are now. Adding is
 * free: a new route, a new optional input, a new output property, a new value
 * in an output enum. Anything a client written against the frozen version
 * could trip on is a break, and lib/contract.test.ts fails on it.
 *
 * Relative imports only, and none at all: `pnpm test` runs this under plain Node.
 */

type Schema = Record<string, unknown>;
type Mode = "input" | "output";

const SCOPES = ["read", "propose", "write", "admin"];

const obj = (v: unknown): Schema => (v && typeof v === "object" && !Array.isArray(v) ? (v as Schema) : {});
const arr = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A schema's alternatives: anyOf and oneOf branches, or itself. */
const variants = (s: Schema): Schema[] => {
  const alts = arr<Schema>(s.anyOf ?? s.oneOf);
  return alts.length ? alts.flatMap(variants) : [s];
};

/** The JSON types a schema admits; empty is anything. */
function types(s: Schema): Set<string> {
  const t = new Set<string>(s.type === undefined ? [] : arr<string>([s.type].flat()));
  if (t.has("number")) t.add("integer");
  if (s.const !== undefined) t.add(s.const === null ? "null" : typeof s.const === "number" ? "number" : typeof s.const);
  return t;
}
const typeLabel = (s: Schema) => [...types(s)].filter((t) => t !== "integer" || !types(s).has("number")).join("|") || "any";

const subset = (a: Set<string>, b: Set<string>) => [...a].every((x) => b.has(x));

/** Values an input may take, when it is a closed list. */
const choices = (s: Schema): unknown[] | null => (s.const !== undefined ? [s.const] : Array.isArray(s.enum) ? s.enum : null);

/** A tighter bound on an input: fewer things accepted than before. */
const TIGHTER: [key: string, tighter: (old: number, now: number) => boolean][] = [
  ["maxLength", (o, n) => n < o],
  ["minLength", (o, n) => n > o],
  ["maximum", (o, n) => n < o],
  ["minimum", (o, n) => n > o],
  ["exclusiveMaximum", (o, n) => n < o],
  ["exclusiveMinimum", (o, n) => n > o],
  ["maxItems", (o, n) => n < o],
  ["minItems", (o, n) => n > o],
];

/**
 * How `now` breaks a client of `old`. For an input, everything `old` accepted
 * must still be accepted; for an output, everything `now` returns must be
 * something `old` promised.
 */
export function schemaBreaks(old: Schema, now: Schema, mode: Mode, at: string): string[] {
  if (same(old, now)) return [];
  const [ov, nv] = [variants(old), variants(now)];
  if (ov.length > 1 || nv.length > 1) {
    // Input: each old shape still accepted by some new one. Output: each new shape was promised by some old one.
    const [from, to] = mode === "input" ? [ov, nv] : [nv, ov];
    const out: string[] = [];
    for (const f of from) {
      if (to.some((t) => (mode === "input" ? single(f, t, mode, at) : single(t, f, mode, at)).length === 0)) continue;
      const alike = to.filter((t) => same([...types(t)].sort(), [...types(f)].sort()));
      if (alike.length === 1) out.push(...(mode === "input" ? single(f, alike[0], mode, at) : single(alike[0], f, mode, at)));
      else out.push(mode === "input" ? `${at}: no longer accepts ${typeLabel(f)}` : `${at}: may now be ${typeLabel(f)}`);
    }
    return out;
  }
  return single(old, now, mode, at);
}

function single(old: Schema, now: Schema, mode: Mode, at: string): string[] {
  const out: string[] = [];
  const [ot, nt] = [types(old), types(now)];
  if (mode === "input" ? nt.size > 0 && (ot.size === 0 || !subset(ot, nt)) : ot.size > 0 && (nt.size === 0 || !subset(nt, ot))) {
    return [`${at}: type ${typeLabel(old)} became ${typeLabel(now)}`];
  }

  if (mode === "input") {
    const [oc, nc] = [choices(old), choices(now)];
    const lost = nc && (oc ?? []).filter((v) => !nc.some((n) => same(n, v)));
    if (nc && !oc) out.push(`${at}: now only takes ${nc.map((v) => JSON.stringify(v)).join(", ")}`);
    else if (lost?.length) out.push(`${at}: no longer takes ${lost.map((v) => JSON.stringify(v)).join(", ")}`);
    for (const [k, tighter] of TIGHTER) {
      const [o, n] = [old[k], now[k]];
      if (typeof n === "number" && (typeof o !== "number" || tighter(o, n))) out.push(`${at}: ${k} went from ${o ?? "none"} to ${n}`);
    }
    if (now.pattern !== undefined && now.pattern !== old.pattern) out.push(`${at}: pattern changed`);
    if (now.format !== undefined && now.format !== old.format) out.push(`${at}: format is now ${now.format}`);
  }

  const [op, np] = [obj(old.properties), obj(now.properties)];
  const [or, nr] = [new Set(arr<string>(old.required)), new Set(arr<string>(now.required))];
  for (const [k, s] of Object.entries(op)) {
    if (!(k in np)) {
      out.push(`${at}.${k}: removed`);
      continue;
    }
    if (mode === "output" && or.has(k) && !nr.has(k)) out.push(`${at}.${k}: may now be missing`);
    out.push(...schemaBreaks(obj(s), obj(np[k]), mode, `${at}.${k}`));
  }
  if (mode === "input") for (const k of nr) if (!or.has(k)) out.push(`${at}.${k}: newly required`);

  for (const k of ["items", "additionalProperties"]) {
    if (typeof old[k] === "object" && typeof now[k] === "object") out.push(...schemaBreaks(obj(old[k]), obj(now[k]), mode, `${at}[]`));
  }
  const [oi, ni] = [arr<Schema>(old.prefixItems), arr<Schema>(now.prefixItems)];
  oi.forEach((s, i) => out.push(...(ni[i] ? schemaBreaks(s, ni[i], mode, `${at}[${i}]`) : [`${at}[${i}]: removed`])));
  return out;
}

type Param = { name: string; in: string; required?: boolean; schema?: Schema };
type Operation = {
  parameters?: Param[];
  requestBody?: { required?: boolean; content?: Record<string, { schema?: Schema }> };
  responses?: Record<string, { content?: Record<string, { schema?: Schema }> }>;
  security?: unknown[];
  "x-scope"?: string;
};
type Paths = Record<string, Record<string, unknown>>;

const METHODS = ["get", "post", "put", "patch", "delete"];
const jsonOf = (c: Record<string, { schema?: Schema }> | undefined) => c?.["application/json"]?.schema;

/** How the current OpenAPI paths break a client of the frozen ones. */
export function apiBreaks(frozen: Paths, current: Paths): string[] {
  const out: string[] = [];
  for (const [path, item] of Object.entries(frozen)) {
    for (const method of METHODS) {
      const was = item[method] as Operation | undefined;
      if (!was) continue;
      const name = `${method.toUpperCase()} ${path}`;
      const is = current[path]?.[method] as Operation | undefined;
      if (!is) {
        out.push(`${name}: removed`);
        continue;
      }
      const params = (op: Operation) => [...arr<Param>(item.parameters), ...arr<Param>(current[path]?.parameters), ...arr<Param>(op.parameters)];
      const [wp, ip] = [params(was), params(is)];
      for (const p of wp) {
        const q = ip.find((x) => x.name === p.name && x.in === p.in);
        if (!q) out.push(`${name}: ${p.in} parameter ${p.name} removed`);
        else out.push(...schemaBreaks(obj(p.schema), obj(q.schema), "input", `${name} ${p.in} ${p.name}`));
      }
      for (const q of ip) if (q.required && !wp.some((p) => p.name === q.name && p.in === q.in)) out.push(`${name}: new required ${q.in} parameter ${q.name}`);

      const [wb, ib] = [jsonOf(was.requestBody?.content), jsonOf(is.requestBody?.content)];
      if (wb && ib) out.push(...schemaBreaks(wb, ib, "input", `${name} body`));
      else if (!wb && is.requestBody?.required) out.push(`${name}: now requires a body`);

      for (const [status, res] of Object.entries(was.responses ?? {})) {
        if (status === "default") continue;
        const now = is.responses?.[status];
        if (!now) {
          out.push(`${name}: no longer answers ${status}`);
          continue;
        }
        const [ws, ns] = [jsonOf(res.content), jsonOf(now.content)];
        if (ws && ns) out.push(...schemaBreaks(ws, ns, "output", `${name} ${status}`));
        else if (ws) out.push(`${name} ${status}: no longer JSON`);
      }

      const open = (op: Operation) => Array.isArray(op.security) && op.security.length === 0;
      if (open(was) && !open(is)) out.push(`${name}: now needs a key`);
      const rank = (op: Operation) => SCOPES.indexOf(op["x-scope"] ?? "");
      if (rank(is) > rank(was)) out.push(`${name}: needs ${is["x-scope"]}, was ${was["x-scope"] ?? "any"}`);
    }
  }
  return out;
}

/** How the current MCP tools break a client of the frozen ones: tools are called by name with these inputs. */
export function toolBreaks(frozen: Record<string, Schema>, current: Record<string, Schema>): string[] {
  return Object.entries(frozen).flatMap(([name, s]) =>
    name in current ? schemaBreaks(s, current[name], "input", `tool ${name}`) : [`tool ${name}: removed`],
  );
}

/** What exists now and isn't frozen yet: `pnpm contract:freeze` adds it, so it can't change after release either. */
export function unfrozen(frozen: Paths, current: Paths): string[] {
  return Object.entries(current).flatMap(([path, item]) =>
    METHODS.filter((m) => item[m] && !frozen[path]?.[m]).map((m) => `${m.toUpperCase()} ${path}`),
  );
}
