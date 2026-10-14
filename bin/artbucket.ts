#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * artbucket - a thin client over /api/v1. Everything it does, curl can do.
 *
 *   ARTBUCKET_URL   the server; without it, the one `artbucket login <server>`
 *                   last signed in to, or else http://localhost:3000
 *   ARTBUCKET_KEY   an API key (ab_...), if the server wants one; it
 *                   decides the project. Without one, the key
 *                   `artbucket login` saved for this server
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { hostname, homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { crc32, deflateRawSync } from "node:zlib";

const HELP = `artbucket <command>

  login [server] [--scope read|propose|write]
                          sign in through the browser (app.artbucket.io: https is
                          assumed) and save a key, propose unless --scope says
                          otherwise (brand push takes write); later commands use
                          that server
  logout [server]         forget it
  search [words] [--tag t]... [--collection id] [--status s]... [--review] [--limit n]
                          --status draft|proposed|active|expired|archived|rejected|deleted
  describe <id>
  check <id> [--channel c] [--territory CC] [--date YYYY-MM-DD] [--context c] [--brand b]
                          may it be used like this? exits 1 when it may not
  url <id> [--width n] [--height n] [--fit cover|contain|inside] [--format webp|avif|jpeg|png] [--quality n]
  ingest <file-or-url>... [--tag t]... [--collection id]
         [--origin shot|licensed|generated] [--generator g] [--prompt text] [--version-of id]
                          what a model made: say so, and with what and how;
                          --version-of files it as that asset's next version
  propose-tags <id> <tag>...
  review                  what waits on a human
  approve <id>            promote a proposed asset and accept its suggested tags
  reject <id> [--reason text]
                          turn down a proposed asset (kept, with the reason,
                          for whoever proposed it), or dismiss its suggested tags
  catalog search [words] [--type t,t] [--project p] [--status s]...
                          search every type at once; words take filters too
                          (logo status:current uses:acme/corporate/brand/acme)
  catalog show <address-or-id>
                          one object: what it is, where, and what uses it
  catalog lineage <address-or-id> [--direction up|down] [--depth n]
                          what it comes from and what uses it, and what
                          changing it reaches
  catalog access <address-or-id>
                          who reaches it, and the grant behind each role
  brands                  list brands; the default is starred
  sites                   list the project's sites: their kind, address and URL
  site push [dir] --site <address> [--path /docs] [--kind docs] [--preview pr-12]
                          deploy a built site: dir (dist/ by default) zipped and
                          sent, live at --path (/ by default) once checked;
                          --preview keeps it as that preview, at an address of
                          its own, never live (a pull request's build)
  site new <dir> --brand <b> [--kind landing|docs|guidelines] [--site <address>] [--create]
                          start a site from the brand: plain HTML and a build script,
                          deployed with npm run deploy to --site (dir's name by
                          default); --create makes that site, for members
  site eject <dir> --brand <b> [--site <address>] [--create]
                          eject to code: the brand's released pages as a
                          guidelines site of its own, built with the kit
  site check [dir]        check a build hosted anywhere, from its CI: what it uses
                          of the library, and why any of it may not be shown;
                          exits 1 when something may not
  site scan [dir] --site <address> [--packages @acme/ui,...]
                          record what an external site's code uses, from its CI
                          at the repository's root: the components it imports
                          (from the project's Storybooks, at the version its
                          code is) and the assets it links or copies; in
                          lineage and Fixes; exits 1 when some may not be used.
                          Packages are followed only when named in --packages;
                          one that imports a component's name is pointed out
  rules [--brand b] [--context c]
                          a brand's rules; with a context, what applies there
  rules set <key> <value> --type color|text|number|list [--context c] [--usage text] [--asset id[:rendition]]...
                          add or replace one; a list is comma-separated
  rules set <file.json> [--brand b]
                          many at once, as one version: [rule, ...] or { set, remove }
  rules delete <id>
  templates               the section templates brand pages are built from
  pages [--brand b]       a brand's pages, as a tree
  pages generate [--brand b]
                          lay out a brand with no pages from its rules
  page <slug> [--brand b] [--context c]
                          a page as Markdown; its warnings go to stderr
  page save <slug> <file.json> [--brand b]
                          make or replace a page whole: { title, parent?, sections, ... }
  page edit <slug> <ops.json> [--brand b]
                          change it op by op, all or none: [{ "op": "add", "section": {...} }, ...]
  page rm <slug> [--brand b]
  theme [--brand b]       how the brand's pages look; theme set <file.json> merges
                          settings into it, and null clears one
  publish [--brand b] [--note text]
                          put the brand's pages, rules and theme in front of site visitors
  brand pull [dir] [--brand b] [--assets] [--force]
                          the brand as files in dir (brand/ by default): brand.yaml,
                          rules/, pages/; a file that says the same is left as it is.
                          A file changed here since the last pull or push (or, before
                          the first, one git holds uncommitted) is never written over
                          or removed, unless --force.
                          --assets fetches the files it points at into assets/ too;
                          a folder whose assets/ holds files always does, and they
                          keep their paths
  brand push [dir] [--brand b] [--create] [--dry-run] [--replace] [--publish] [--note text]
                          take the brand from its files, uploading what assets/ adds,
                          as one version. What changed in the app since this folder's
                          last pull or push (or a Git integration's last sync) is kept;
                          --replace takes the files whole.
                          --publish releases it after; --note says what changed, and
                          releases it too. --create makes the brand when there is none
  brand diff [dir] [--brand b]
                          what push would change; exits 1 on problems in the files,
                          not on files under assets/ that push would upload
  brand export [dir] [--brand b] [--release live|n]
                          the release readers see (or release n) for a site's build,
                          into dir (.brand/ by default): brand.json (its rules),
                          tokens.css, and the files they point at under assets/
                          The brand is --brand, or the slug: in brand.yaml (pull
                          writes it), never the project's default
  history [--brand b]     the brand's versions, newest first
  history <n> [--brand b] what changed in version n
  restore <n> [--brand b] put version n back (itself a new version)
  keys                    list the project's API keys
  keys create <name> --scope read|propose|write|admin
  keys revoke <id>
  whoami                  the key, its project and its scope
  members                 people, their access, and invitations waiting (admin)
  invite <email> --scope s [--collection id]
                          an invitation link to the project, or one collection (admin)
  share <address> --to <project>
                          share a brand, collection or asset into another project:
                          its members read it, kept and edited where it is
  share <collection-or-asset-id> [--upload] [--password p] [--expires YYYY-MM-DD] [--name n]
                          a link for someone without an account: to look and
                          download, or with --upload to send files in for review
  shares                  share links; shares revoke <id>
  audit                   who changed who may do what (admin)

  --json   print the raw API response`;

/**
 * Keys `artbucket login` saved, one per server, and `default`: the server it
 * signed in to last. Only this user can read the file. A key is a string
 * (an older login's, or one that doesn't renew), or a token that lapses with
 * what renews it.
 */
const CREDENTIALS = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "artbucket", "credentials.json");
type Login = { token: string; refresh: string; client: string; expires: number };
const readSaved = async (): Promise<Record<string, string | Login>> => JSON.parse(await readFile(CREDENTIALS, "utf8").catch(() => "{}"));
const saved = await readSaved();
const save = async () => {
  await mkdir(dirname(CREDENTIALS), { recursive: true });
  await writeFile(CREDENTIALS, JSON.stringify(saved, null, 2), { mode: 0o600 });
};

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    tag: { type: "string", multiple: true },
    collection: { type: "string" },
    review: { type: "boolean" },
    limit: { type: "string" },
    project: { type: "string" },
    to: { type: "string" },
    site: { type: "string" },
    packages: { type: "string", multiple: true },
    path: { type: "string" },
    kind: { type: "string" },
    direction: { type: "string" },
    depth: { type: "string" },
    width: { type: "string" },
    height: { type: "string" },
    fit: { type: "string" },
    format: { type: "string" },
    quality: { type: "string" },
    scope: { type: "string" },
    type: { type: "string" },
    context: { type: "string" },
    brand: { type: "string" },
    usage: { type: "string" },
    asset: { type: "string", multiple: true },
    reason: { type: "string" },
    channel: { type: "string" },
    territory: { type: "string" },
    date: { type: "string" },
    upload: { type: "boolean" },
    password: { type: "string" },
    expires: { type: "string" },
    name: { type: "string" },
    origin: { type: "string" },
    generator: { type: "string" },
    prompt: { type: "string" },
    "version-of": { type: "string" },
    assets: { type: "boolean" },
    "dry-run": { type: "boolean" },
    create: { type: "boolean" },
    replace: { type: "boolean" },
    force: { type: "boolean" },
    publish: { type: "boolean" },
    note: { type: "string" },
    release: { type: "string" },
    preview: { type: "string" },
    status: { type: "string", multiple: true },
    json: { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});
const [cmd, ...args] = positionals;

/** A server as given: app.artbucket.io is https://app.artbucket.io. */
const origin = (s: string) => (/^https?:\/\//.test(s) ? s : `https://${s}`).replace(/\/+$/, "");
const BASE = origin((cmd === "login" || cmd === "logout") && args[0] ? args[0] : (process.env.ARTBUCKET_URL ?? (saved.default as string | undefined) ?? "http://localhost:3000"));
/** Set as a command starts (main): ARTBUCKET_KEY, else the one `login` saved, renewed first when it is about to lapse. */
let KEY: string | undefined;

/**
 * The saved key for BASE. A token is renewed a minute before it lapses: the
 * server answers a new pair and ends the old one, so the new one is saved
 * at once. ponytail: renewed once per command, so one running past the hour
 * gets a 401; renew on a 401 too if commands ever run that long.
 */
async function savedKey(): Promise<string | undefined> {
  const s = saved[BASE];
  if (typeof s !== "object") return s;
  if (s.expires - 60_000 > Date.now()) return s.token;
  const t = await oauth("/api/v1/oauth/token", { grant_type: "refresh_token", refresh_token: s.refresh, client_id: s.client });
  if (!t.ok) {
    // Another command renewed it a moment ago, and saved what it got: that one works.
    const now = (await readSaved())[BASE];
    if (typeof now === "object" && now.refresh !== s.refresh) return (saved[BASE] = now).token;
    throw new Error(`Signed out of ${BASE} (${t.json.error_description ?? t.json.error}). Run artbucket login again.`);
  }
  saved[BASE] = loginOf(t.json, s.client);
  await save();
  return t.json.access_token;
}

/** A token answer as it is saved: a key that lapses with what renews it, or a plain key. */
const loginOf = (t: { access_token: string; refresh_token?: string; expires_in?: number }, client: string): string | Login =>
  t.refresh_token && t.expires_in ? { token: t.access_token, refresh: t.refresh_token, client, expires: Date.now() + t.expires_in * 1000 } : t.access_token;

/**
 * A folder as a zip, deflated, hidden files left out: what site push sends.
 * Written here, as the CLI is one file with no dependencies.
 */
const MANIFEST = "artbucket.site.json";

async function zipFolder(dir: string, extra: Record<string, Buffer> = {}, only?: string[]) {
  const names: string[] = only ? [...only] : [];
  const walk = async (d: string, rel: string) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(join(d, e.name), r);
      else if (e.isFile()) names.push(r);
    }
  };
  if (!only) await walk(dir, "");
  if (!names.length) throw new Error(`${dir} holds no files: build the site first`);
  for (const name of Object.keys(extra)) if (!names.includes(name)) names.push(name);
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const name of names) {
    const data = extra[name] ?? (await readFile(join(dir, name)));
    const packed = deflateRawSync(data);
    const crc = crc32(data) >>> 0;
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(n.length, 26);
    parts.push(local, n, packed);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(20, 6);
    head.writeUInt16LE(0x0800, 8);
    head.writeUInt16LE(8, 10);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(packed.length, 20);
    head.writeUInt32LE(data.length, 24);
    head.writeUInt16LE(n.length, 28);
    head.writeUInt32LE(offset, 42);
    central.push(head, n);
    offset += 30 + n.length + packed.length;
  }
  const dirBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(dirBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return { zip: Buffer.concat([...parts, dirBytes, end]), files: names.length };
}

/**
 * A Storybook build's components' code, hashed: each component's stories and
 * source as its index.json names them, read from where Storybook ran (here).
 * Put in artbucket.site.json's `fingerprints`, so the server makes a new
 * version of a component when its code changes, not only its stories.
 * Nothing when the folder isn't a Storybook or the sources aren't here.
 */
async function storybookFingerprints(dir: string, root = process.cwd()): Promise<Record<string, string>> {
  const index = await readFile(join(dir, "index.json"), "utf8").then(JSON.parse, () => null);
  const entries = index && typeof index === "object" ? (index.entries ?? index.stories) : null;
  if (!entries || typeof entries !== "object") return {};
  const files = new Map<string, Set<string>>();
  for (const e of Object.values(entries) as { id?: unknown; importPath?: unknown; componentPath?: unknown }[]) {
    if (typeof e?.id !== "string" || !e.id.includes("--")) continue;
    const slug = e.id.split("--")[0];
    const set = files.get(slug) ?? new Set<string>();
    for (const f of [e.importPath, e.componentPath]) if (typeof f === "string") set.add(f);
    files.set(slug, set);
  }
  const out: Record<string, string> = {};
  for (const [slug, set] of files) {
    const hash = await codeHash([...set], root);
    if (hash) out[slug] = hash;
  }
  return out;
}

/** A component's code as one hash: its files, as index.json names them, read from `root`; null when none is there. */
async function codeHash(files: string[], root: string) {
  const hash = createHash("sha256");
  let read = 0;
  for (const f of [...files].sort()) {
    const data = await readFile(resolve(root, f)).catch(() => null);
    if (data) {
      hash.update(f).update(data);
      read++;
    }
  }
  return read ? hash.digest("hex") : null;
}

/** The files a scan reads: what git tracks under dir, so builds and dependencies stay out; else every file but node_modules and hidden ones. */
async function scanned(dir: string): Promise<string[]> {
  const tracked = await new Promise<string[] | null>((done) =>
    execFile("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: dir, maxBuffer: 64 << 20 }, (err, out) => done(err ? null : out.split("\0").filter(Boolean))),
  );
  // Only what is there as a file: not a deletion git hasn't seen yet, nor a submodule.
  if (tracked) return (await Promise.all(tracked.map(async (f) => ((await stat(join(dir, f)).catch(() => null))?.isFile() ? f : null)))).filter((f): f is string => !!f);
  const names: string[] = [];
  const walk = async (d: string, rel: string) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(join(d, e.name), r);
      else if (e.isFile()) names.push(r);
    }
  };
  await walk(dir, "");
  return names;
}

const CODE = /\.(m?[jt]sx?|cjs|vue|svelte|astro|mdx)$/;
const STORY = /\.(stories|story)\.[^/]+$/;
const TEST = /\.(test|spec)\.[^/]+$|(^|\/)__tests__\//;
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+|^\s*export\s+\*\s+from\s*)["']([^"']+)["']/gm;
const RESOLVES = ["", ".tsx", ".ts", ".jsx", ".js", ".mjs", ".vue", ".svelte", "/index.tsx", "/index.ts", "/index.jsx", "/index.js"];

/** tsconfig's (or jsconfig's) paths at `root`, as [prefix, folders]: `@/*` to `./src/*` is ["@/", [root/src/]]. */
async function aliasesAt(root: string): Promise<[string, string[]][]> {
  for (const name of ["tsconfig.json", "jsconfig.json"]) {
    const raw = await readFile(join(root, name), "utf8").catch(() => null);
    if (!raw) continue;
    try {
      // JSON with comments and trailing commas, as tsconfig allows: strings kept as they are.
      const c = JSON.parse(raw.replace(/("(?:\\.|[^"\\])*")|\/\/.*$|\/\*[\s\S]*?\*\//gm, (_m, str) => str ?? "").replace(/,(\s*[}\]])/g, "$1"));
      const base = resolve(root, c?.compilerOptions?.baseUrl ?? ".");
      return Object.entries((c?.compilerOptions?.paths ?? {}) as Record<string, string[]>).map(([k, v]) => [k.replace(/\*$/, ""), v.map((t) => resolve(base, t.replace(/\*$/, "")))]);
    } catch {
      return [];
    }
  }
  return [];
}

type Component = { address: string; name: string; version: number; files: string[] };

/**
 * The Storybook components a codebase imports: each import in its code
 * (stories aside) resolved as the bundler would, relatively or through
 * tsconfig's paths, against each component's source as its Storybook names
 * it, relative to `root`, where Storybook ran. With each, the hash of the code
 * it has here, so the server names the version that is.
 *
 * Imports through a package's name (`@acme/ui`) are followed only for the
 * packages asked (`--packages`): by the names imported (`{ Button }`, or a
 * subpath's last segment), at the version whose code it is when the
 * component's source is here too (a monorepo), else the current one. A
 * package not asked that imports a component's name is said in `skipped`,
 * so the scan can say how to follow it.
 */
async function importedComponents(dir: string, files: string[], components: Component[], root: string, packages: string[] = []) {
  const aliases = await aliasesAt(root);
  const targetsOf = (spec: string, from: string) =>
    (spec.startsWith(".")
      ? [resolve(dirname(from), spec)]
      : aliases.flatMap(([prefix, dirs]) => ((prefix.endsWith("/") ? spec.startsWith(prefix) : spec === prefix) ? dirs.map((d) => resolve(d, spec.slice(prefix.length))) : []))
    ).flatMap((b) => RESOLVES.map((x) => b + x));
  const sources = new Map<string, Component>();
  for (const c of components) {
    const src = c.files.find((f) => !STORY.test(f));
    if (src) sources.set(resolve(root, src), c);
  }
  // A stories file that names no component (several in one) stands for those it imports from its own folder, but one documented on its own.
  for (const c of components.filter((x) => x.files.every((f) => STORY.test(f)) && x.files.length)) {
    const story = resolve(root, c.files[0]);
    const text = await readFile(story, "utf8").catch(() => "");
    for (const m of text.matchAll(IMPORT))
      for (const t of targetsOf(m[1], story))
        if (!sources.has(t) && dirname(t) === dirname(story) && (await stat(t).catch(() => null))?.isFile()) sources.set(t, c);
  }
  const used = new Map<Component, string[]>();
  const foundIn = (c: Component, file: string) => used.set(c, [...new Set([...(used.get(c) ?? []), file])]);
  const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const byName = new Map(components.map((c) => [key(c.name), c]));
  const skipped = new Map<string, { names: Set<string>; files: Set<string>; byPath: boolean }>();
  // Stories, tests and Storybook's own config (.storybook) aren't the app: no use of a component.
  for (const file of files.filter((f) => CODE.test(f) && !STORY.test(f) && !TEST.test(f) && !/(^|\/)\./.test(f))) {
    const at = resolve(dir, file);
    // Code only: an import in a comment (an example in a doc comment) is none.
    const text = (await readFile(at, "utf8").catch(() => "")).replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "");
    for (const m of text.matchAll(IMPORT)) {
      const hit = targetsOf(m[1], at).find((t) => sources.has(t));
      // A component's own files importing each other aren't a use of it.
      const c = hit && sources.get(hit);
      if (c && !sources.has(at)) foundIn(c, file);
    }
    for (const m of text.matchAll(PACKAGE_IMPORT)) {
      const [, clause, spec] = m;
      if (targetsOf(spec, at).length) continue;
      const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
      const names = importedNames(clause);
      const sub = spec.slice(pkg.length + 1).split("/").pop();
      const bySub = sub ? byName.get(key(sub)) : undefined;
      const found = [...names.map((n) => byName.get(key(n))), bySub].filter((c): c is Component => !!c);
      if (!found.length) continue;
      if (packages.includes(pkg)) for (const c of found) foundIn(c, file);
      else {
        const s = skipped.get(pkg) ?? { names: new Set<string>(), files: new Set<string>(), byPath: false };
        for (const c of found) s.names.add(c.name);
        s.files.add(file);
        s.byPath ||= !!bySub;
        skipped.set(pkg, s);
      }
    }
  }
  return {
    used: await Promise.all([...used].map(async ([c, by]) => ({ component: c.address, fingerprint: await codeHash(c.files, root), name: c.name, by }))),
    // ponytail: one name alone (an icon called Book) is taken for a collision; a package named in --packages is followed whatever it brings in.
    skipped: [...skipped].filter(([, s]) => s.byPath || s.names.size > 1).map(([pkg, s]) => ({ pkg, names: [...s.names], files: s.files.size })),
  };
}

/** `import Button, { Card as C, type Props } from "x"`: the clause and the package. Relative and aliased ones are skipped where it is read. */
const PACKAGE_IMPORT = /\bimport\s+(?:type\s+)?([\w$]+\s*,?\s*(?:\{[^}]*\})?|\{[^}]*\})\s*from\s*["']([^"'./][^"']*)["']/g;

/** The names an import clause brings in, as the package exports them: the default's own name, and each named one before `as`. */
const importedNames = (clause: string) =>
  clause
    .replace(/[{}]/g, ",")
    .split(",")
    .map((n) => n.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0])
    .filter((n) => /^[\w$]+$/.test(n));

/** artbucket.site.json with a Storybook's fingerprints added, to send in its place; nothing for any other folder. */
async function withFingerprints(dir: string): Promise<Record<string, Buffer>> {
  const prints = await storybookFingerprints(resolve(dir));
  if (!Object.keys(prints).length) return {};
  const own = await readFile(join(resolve(dir), MANIFEST), "utf8").then(JSON.parse, () => ({}));
  return { [MANIFEST]: Buffer.from(JSON.stringify({ ...own, fingerprints: prints })) };
}

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
      ...(KEY ? { authorization: `Bearer ${KEY}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw failed(res, json, `${method} ${path}`);
  return json;
}

/** Admin never comes from signing in (the server's lib/oauth.ts grants up to write): only a key an admin makes. As the server says it (ADMIN_KEY). */
const ADMIN = "Signing in never gives admin: use a key an admin makes in Connections (API keys)";

/**
 * What to do about a key from `login` whose scope can't do this ("This key's
 * scope is propose; this needs write on ..."): log in again asking for what it
 * needs, unless that is admin. An older server's 403 doesn't say where admin
 * comes from, so the CLI does.
 */
const scopeHint = (message: string) => {
  const need = /^This key's scope is \w+; this needs (\w+)/.exec(message)?.[1];
  if (!need) return "";
  if (need === "admin") return `${message.includes(ADMIN) ? "" : `. ${ADMIN}`}, as ARTBUCKET_KEY`;
  return `. Log in again with --scope ${need}: artbucket login --scope ${need}`;
};

/** An API error as a person reads it: a key from `login` that can't do this can be swapped for one that can. */
const failed = (res: Response, json: { error?: { message?: string } } | null, what: string) =>
  new Error(
    (json?.error?.message ?? `${what}: ${res.status}`) +
      (res.status === 403 && !process.env.ARTBUCKET_KEY ? scopeHint(json?.error?.message ?? "") : ""),
  );

type Asset = { id: string; filename: string; status: string; width: number | null; height: number | null; tags: string[]; proposedTags: string[] };
const line = (a: Asset) =>
  [
    a.id,
    a.status === "proposed" ? "[proposed]" : null,
    a.filename,
    a.width && a.height ? `${a.width}x${a.height}` : null,
    a.tags.length ? `#${a.tags.join(" #")}` : null,
    a.proposedTags.length ? `(suggested: ${a.proposedTags.join(", ")})` : null,
  ]
    .filter(Boolean)
    .join("  ");

const out = (json: unknown, human: () => string) => console.log(opt.json ? JSON.stringify(json, null, 2) : human());
const need = (v: string | undefined, what: string) => {
  if (!v) throw new Error(`Missing ${what}. artbucket --help`);
  return v;
};

/** The brand a command acts on: --brand, or the project's default. */
const brandSlug = async (): Promise<string> =>
  opt.brand ?? (await api("GET", "/api/v1/brands")).data.find((b: { default: boolean }) => b.default).slug;
const brandPath = async (slug?: string) => `/api/v1/brands/${encodeURIComponent(slug ?? (await brandSlug()))}`;
const readJson = async (file: string | undefined, what: string) => JSON.parse(await readFile(need(file, what), "utf8"));

/** What a page write answers: where to read it, then what a reader would trip on. */
type Written = { page: { slug: string }; warnings: string[]; url: string };
const written = (verb: string, d: Written) => [`${verb} ${d.page.slug}  ${d.url}`, ...d.warnings.map((w) => `  ! ${w}`)].join("\n");

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".avif": "image/avif", ".gif": "image/gif", ".svg": "image/svg+xml", ".tif": "image/tiff",
  ".tiff": "image/tiff", ".pdf": "application/pdf", ".mp4": "video/mp4", ".mov": "video/quicktime",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf",
};

async function ingest(source: string) {
  const extra = {
    tags: opt.tag,
    collections: opt.collection ? [opt.collection] : undefined,
    origin: opt.origin,
    generator: opt.generator,
    prompt: opt.prompt,
    versionOf: opt["version-of"],
  };
  if (/^https?:\/\//.test(source)) return api("POST", "/api/v1/assets", { url: source, ...extra });
  // A local file goes straight to storage, like the web UI's uploads.
  const filename = basename(source);
  const mime = MIME[extname(source).toLowerCase()] ?? "application/octet-stream";
  const { size } = await stat(source);
  const ticket = await api("POST", "/api/v1/uploads", { filename, mime, size });
  const put = await fetch(ticket.uploadUrl, { method: "PUT", headers: { "content-type": mime }, body: await readFile(source) });
  if (!put.ok) throw new Error(`Upload to storage failed: ${put.status}`);
  return api("POST", "/api/v1/assets", { token: ticket.token, filename, mime, ...extra });
}

// ---- brand as code ---------------------------------------------------------------

type Problem = { file: string; line?: number; message: string };
type Diff = {
  name: { before: string; after: string } | null;
  rules: { change: string; key: string; context: string | null; before?: unknown; after?: unknown }[];
  pages: { change: string; slug: string; fields?: string[]; sections?: { change: string; id: string; template: string; title: string; fields?: string[] }[] }[];
  theme: string[];
  reordered: boolean;
};
const MARK: Record<string, string> = { added: "+", removed: "-", changed: "~", moved: ">" };

/** The brand's own files in `dir`: brand.yaml and the YAML in rules/ and pages/. */
async function brandFiles(dir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const f of ["brand.yaml", "brand.yml"]) {
    const text = await readFile(join(dir, f), "utf8").catch(() => null);
    if (text !== null) files[f] = text;
  }
  for (const sub of ["rules", "pages"]) {
    for (const f of await readdir(join(dir, sub)).catch(() => [] as string[])) {
      if (/\.ya?ml$/.test(f)) files[`${sub}/${f}`] = await readFile(join(dir, sub, f), "utf8");
    }
  }
  return files;
}

/** The brand files are for: --brand, or the slug: in their brand.yaml. Never the project's default. */
const filesBrand = (files: Record<string, string>, dir: string) =>
  need(
    opt.brand ?? /^slug:\s*["']?([a-z0-9-]+)["']?\s*(#.*)?$/m.exec(files["brand.yaml"] ?? files["brand.yml"] ?? "")?.[1],
    `the brand: --brand acme, or slug: acme in ${join(dir, "brand.yaml")}`,
  );

/** Every file under assets/, by its path in the brand, with the SHA-256 of its bytes. */
async function assetFiles(dir: string, sub = "assets"): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const e of await readdir(join(dir, sub), { withFileTypes: true }).catch(() => [])) {
    const path = `${sub}/${e.name}`;
    if (e.isDirectory()) Object.assign(out, await assetFiles(dir, path));
    else if (e.isFile()) out[path] = createHash("sha256").update(await readFile(join(dir, path))).digest("hex");
  }
  return out;
}

const value = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
const clip = (s: string) => (s.length > 60 ? `${s.slice(0, 57)}...` : s);
function diffLines(d: Diff): string[] {
  const at = (r: { key: string; context: string | null }) => `${r.key}${r.context ? ` [${r.context}]` : ""}`;
  return [
    ...(d.name ? [`  ~ name  ${d.name.before} -> ${d.name.after}`] : []),
    ...d.rules.map((r) =>
      r.change === "added"
        ? `  + ${at(r)}  ${clip(value(r.after))}`
        : r.change === "removed"
          ? `  - ${at(r)}`
          : `  ~ ${at(r)}${value(r.before) === value(r.after) ? "" : `  ${clip(value(r.before))} -> ${clip(value(r.after))}`}`,
    ),
    ...(d.reordered ? ["  ~ the rules' order"] : []),
    ...d.pages.flatMap((p) => [
      `  ${MARK[p.change] ?? "~"} page ${p.slug}${p.change === "moved" ? " (moved)" : ""}${p.fields?.length ? `: ${p.fields.join(", ")}` : ""}`,
      // Inside a changed page, each section that changed: its id, what it is, and which of its fields.
      ...(p.sections ?? []).map(
        (x) =>
          `      ${MARK[x.change] ?? "~"} ${x.id} (${x.template}${x.title ? `, "${clip(x.title)}"` : ""})${x.change === "moved" ? " moved" : ""}${x.fields?.length ? `: ${x.fields.join(", ")}` : ""}`,
      ),
    ]),
    ...(d.theme.length ? [`  ~ theme: ${d.theme.join(", ")}`] : []),
  ];
}
const problemLine = (p: Problem) => `${p.file}${p.line ? `:${p.line}` : ""}: ${p.message}`;

/** POST that answers a 422's detail instead of throwing it: the problems in the files are the answer. */
async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", ...(KEY ? { authorization: `Bearer ${KEY}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (res.status === 422 && json?.error?.detail?.errors) return { ok: false as const, problems: json.error.detail as { errors: Problem[]; warnings: Problem[]; missing: string[] } };
  if (!res.ok) throw failed(res, json, `POST ${path}`);
  return { ok: true as const, data: json.data };
}

/**
 * The brand's files as this folder last agreed with the server: written by a
 * pull, and by a push (the files it sent). Kept beside the key, not in the
 * folder: a push sends them so the server keeps what changed in the app
 * since, and a pull reads them to know which files hold work not yet pushed.
 */
const baseFile = (dir: string, slug: string) =>
  join(dirname(CREDENTIALS), "bases", `${createHash("sha256").update(`${BASE}\0${resolve(dir)}\0${slug}`).digest("hex").slice(0, 32)}.json`);
async function readBase(dir: string, slug: string): Promise<Record<string, string> | null> {
  return JSON.parse(await readFile(baseFile(dir, slug), "utf8").catch(() => "null"));
}
async function writeBase(dir: string, slug: string, files: Record<string, string>) {
  await mkdir(dirname(baseFile(dir, slug)), { recursive: true });
  await writeFile(baseFile(dir, slug), JSON.stringify(files));
}

/** Files under `dir` with changes git holds uncommitted (staged or not), and files it doesn't track: none outside a repository. */
async function uncommittedIn(dir: string) {
  const git = (...args: string[]) =>
    new Promise<string[]>((done) => execFile("git", ["-C", dir, ...args], (err, out) => done(err ? [] : out.split("\0").filter(Boolean))));
  const [changed, staged, untracked] = await Promise.all([
    git("ls-files", "-z", "--modified"),
    git("diff", "--cached", "--name-only", "--relative", "-z"),
    git("ls-files", "-z", "--others", "--exclude-standard"),
  ]);
  return { changed: new Set([...changed, ...staged]), untracked: new Set(untracked) };
}

/**
 * A link's name, as the server names its own (src/lib/asset-url.ts withName):
 * the asset's title or file name, then the extension of the bytes, `format`
 * for a rendition (null: the file's own format where /a/ renders it, else a
 * JPEG). The server reads nothing of it, so this copy can only read worse.
 */
function linkName(a: { filename: string; mime: string; metadata?: { title?: string | null } | null }, format?: string | null) {
  const own = a.filename.match(/\.([a-z0-9]{1,10})$/i)?.[1] ?? "";
  const name = a.metadata?.title || a.filename;
  const stem = own && name.toLowerCase().endsWith(`.${own.toLowerCase()}`) ? name.slice(0, -own.length - 1) : name;
  const asIs = a.mime.replace(/^image\//, "");
  const ext = format === undefined ? own : (format ?? (["png", "webp", "avif"].includes(asIs) ? asIs : "jpeg")).replace("jpeg", "jpg");
  const slug = stem.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").slice(0, 60).replace(/^-+|-+$/g, "");
  return slug && ext ? `${slug}.${ext.toLowerCase()}` : null;
}

/** A file's extension from what the server says it is, for the files a site build copies. */
const EXTENSIONS: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/avif": "avif", "image/gif": "gif", "image/svg+xml": "svg",
  "font/woff2": "woff2", "font/woff": "woff", "font/ttf": "ttf", "font/otf": "otf", "application/pdf": "pdf",
};

/**
 * A brand's release, as a site's build reads it: brand.json (its rules, each
 * file's path under assets/), tokens.css with its files' URLs pointing there,
 * and the files themselves, fetched with this key. Only files that may leave
 * the team come with a release. The folder is the build's to read, never to
 * edit: a new export replaces it.
 */
async function brandExport(dir: string) {
  const slug = await brandSlug();
  const version = opt.release ?? "live";
  if (version !== "live" && !/^\d+$/.test(version)) throw new Error('--release is "live" or a release number');
  const q = new URLSearchParams({ brand: slug, version });
  const [{ data: rules, contexts, release }, tokens, { data: brands }] = await Promise.all([
    api("GET", `/api/v1/brand/rules?${q}`).catch((err: Error) => {
      throw /isn't published yet/.test(err.message) ? new Error(`${err.message}: a site shows a release. Release it first (artbucket publish --brand ${slug})`) : err;
    }),
    fetch(`${BASE}/api/v1/brand/tokens?${new URLSearchParams({ ...Object.fromEntries(q), format: "css" })}`, { headers: KEY ? { authorization: `Bearer ${KEY}` } : {} }).then(async (r) => {
      if (!r.ok) throw failed(r, await r.json().catch(() => null), "tokens");
      return r.text();
    }),
    api("GET", "/api/v1/brands"),
  ]);
  const out = resolve(dir);
  // A new export replaces the last one, and nothing else: a file, or a folder holding anything but an export, is left alone.
  const there = await stat(out).catch((err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") return null;
    throw err;
  });
  if (there && !there.isDirectory()) throw new Error(`${dir} is a file: pick a folder (.brand by default)`);
  const was = await readFile(join(out, "brand.json"), "utf8").then((t) => JSON.parse(t).exportedAt, () => undefined);
  if (there && !was && (await readdir(out)).length) throw new Error(`${dir} isn't empty and holds no export: pick another folder (.brand by default)`);
  // Written beside it, then swapped in whole: an export that fails halfway leaves the last one as it was.
  const tmp = `${out}.partial`;
  await rm(tmp, { recursive: true, force: true });
  await mkdir(join(tmp, "assets"), { recursive: true });
  try {
    // Each file once, by the path it is fetched at: an asset as itself, or one of its renditions.
    const files: Record<string, string> = {};
    const fetched = new Map<string, Promise<string>>();
    const local = (id: string, rendition: string | null) => {
      if (!/^[0-9a-f-]{36}$/i.test(id) || (rendition !== null && !/^[a-z0-9_,.]+$/i.test(rendition))) throw new Error(`Not a file of the library: ${id}${rendition ? `/${rendition}` : ""}`);
      const path = `/a/${id}${rendition ? `/${rendition}` : ""}`;
      if (!fetched.has(path)) {
        fetched.set(
          path,
          (async () => {
            const res = await fetch(`${BASE}${path}`, { headers: KEY ? { authorization: `Bearer ${KEY}` } : {} });
            if (!res.ok) throw new Error(`Couldn't fetch ${path}: ${res.status}`);
            const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
            const name = `assets/${id}${rendition ? `-${rendition.replace(/[^a-z0-9_-]+/gi, "-")}` : ""}.${EXTENSIONS[type] ?? "bin"}`;
            await writeFile(join(tmp, name), Buffer.from(await res.arrayBuffer()));
            files[name] = id;
            return name;
          })(),
        );
      }
      return fetched.get(path)!;
    };
    type Exported = { assets: { id: string; rendition: string | null; file?: string }[] };
    for (const r of rules as Exported[]) for (const a of r.assets) a.file = await local(a.id, a.rendition);
    // The server's /a/ URLs, signed for a day, on its own address (which may not be the one asked): in tokens.css
    // (@font-face, a logo) and in rules' text alike, the same files here, so the built site never points at a link that lapses.
    // A rendition and a name (summer-hero.webp, read by nobody: the segment with a dot) may follow the id.
    const pattern = /https?:\/\/[^/"')\s\\]+\/a\/([0-9a-f-]{36})((?:\/[\w,.%-]+){0,2})(?:\?[^"')\s\\]*)?/gi;
    const localized = async (text: string) => {
      const found = [...text.matchAll(pattern)];
      const names = await Promise.all(found.map((m) => local(m[1], m[2].split("/").find((s) => s && !s.includes(".")) ?? null)));
      let i = 0;
      return text.replace(pattern, () => names[i++]);
    };
    const css = await localized(tokens);
    const ruled = JSON.parse(await localized(JSON.stringify(rules)));
    const name = (brands as { slug: string; name: string }[]).find((b) => b.slug === slug)?.name ?? slug;
    await writeFile(join(tmp, "tokens.css"), css);
    await writeFile(join(tmp, "brand.json"), JSON.stringify({ slug, name, release, server: BASE, exportedAt: new Date().toISOString(), contexts, rules: ruled, files }, null, 2) + "\n");
    await rm(out, { recursive: true, force: true });
    await rename(tmp, out);
    const n = Object.keys(files).length;
    return `Exported ${name}${release ? ` release ${release.number}` : " (no history yet: as it stands)"} into ${dir}/: ${rules.length} rules, ${n} file${n === 1 ? "" : "s"}`;
  } catch (err) {
    await rm(tmp, { recursive: true, force: true });
    throw err;
  }
}

const SITE_KINDS = ["landing", "docs", "guidelines"];

/** The starters (starters/ in the repository, beside artbucket.js in the package). */
async function starters() {
  for (const at of ["./starters/", "../starters/"]) {
    const url = new URL(at, import.meta.url);
    if (await stat(url).then((s) => s.isDirectory(), () => false)) return url;
  }
  throw new Error("This artbucket has no starters: install it from npm (npx artbucket site new)");
}

/** Every file under a folder, by its path in it. */
async function filesIn(root: URL | string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(new URL(rel, root), { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...(await filesIn(root, `${rel}${e.name}/`)));
    else out.push(`${rel}${e.name}`);
  }
  return out;
}

/**
 * A new site from a starter (starters/: the shared build, then the kind's
 * pages over it), wired to the brand and to the site it deploys to. It
 * writes into an empty or new folder only. --create makes the site in
 * Artbucket, for members until someone opens it.
 */
async function siteNew(dir: string, pages?: (target: string, brand: string) => Promise<string>) {
  const kind = opt.kind ?? "landing";
  if (!SITE_KINDS.includes(kind)) throw new Error(`--kind is ${SITE_KINDS.join(", ")}`);
  const target = resolve(dir);
  if ((await readdir(target).catch(() => [])).length) throw new Error(`${dir} isn't empty: pick a new folder`);
  const slug = await brandSlug();
  const address = opt.site ?? basename(target).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  // Reading the sites takes a key that manages them; without one, the site is just not known yet.
  const sites = ((await api("GET", "/api/v1/sites").catch(() => ({ data: [] }))).data ?? []) as { slug: string; kind: string; url: string }[];
  let site = sites.find((x) => x.slug === address);
  if (!site && opt.create) site = (await api("POST", "/api/v1/sites", { name: basename(target), slug: address, kind, access: "members" })).data;
  const root = await starters();
  const own = JSON.parse(await readFile(new URL("../package.json", root), "utf8").catch(() => readFile(new URL("./package.json", import.meta.url), "utf8")));
  const words: Record<string, string> = { NAME: basename(target), KIND: kind, BRAND: slug, SITE: address, SERVER: BASE.replace(/^https:\/\//, "") };
  // A function, not a string: a folder named a$'b stays a$'b.
  const fill = (text: string) => text.replace(/__(NAME|KIND|BRAND|SITE|SERVER)__/g, (_, w: string) => words[w]);
  for (const from of [new URL("common/", root), new URL(`${kind}/`, root)]) {
    for (const rel of await filesIn(from)) {
      // npm leaves .gitignore out of a package: the starter keeps it as gitignore.
      const to = join(target, rel === "gitignore" ? ".gitignore" : rel);
      await mkdir(dirname(to), { recursive: true });
      await writeFile(to, fill(await readFile(new URL(rel, from), "utf8")));
    }
  }
  const pkg = {
    name: address,
    private: true,
    type: "module",
    scripts: {
      brand: `artbucket brand export .brand --brand ${slug}`,
      build: "npm run brand && node build.mjs",
      check: "npm run build && artbucket site check dist",
      deploy: `npm run build && artbucket site push dist --site ${address}`,
    },
    devDependencies: { artbucket: `^${own.version}`, "@artbucket/brand": `^${own.version}`, "@artbucket/ui": `^${own.version}` },
    engines: { node: ">=22" },
  };
  await writeFile(join(target, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  // Eject: the brand's own pages in place of the starter's.
  let made: string | null = null;
  if (pages) {
    await rm(join(target, "src", "pages"), { recursive: true, force: true });
    await mkdir(join(target, "src", "pages"), { recursive: true });
    made = await pages(target, slug);
  }
  return [
    `Made ${dir}/: a ${kind} site for ${slug}, deploying to ${site ? site.url : `the site ${address}`}.`,
    made,
    site ? null : `There is no site ${address} yet: make it in Sites (a built site with that address), or run this again with --create.`,
    "",
    `  cd ${dir}`,
    "  npm install",
    "  npm run deploy",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/** Text for a page the starter's build fills: escaped, and no {{ left for it to read as a slot. */
const pageText = (v: unknown) => String(v ?? "").replace(/[&<>"'{}]/g, (c) => `&#${c.charCodeAt(0)};`);

/** A link a page may keep: a page of the site, an anchor, https or mail. */
const keptLink = (href: string) => (/^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(href) ? href : null);

/** Markdown, as brand pages write it (paragraphs, lists, headings, bold, italics, code and links), as HTML. */
function markdownHtml(md: string) {
  const inline = (t: string) =>
    pageText(t)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])[*_](?!\s)(.+?)[*_](?=[\s).,;:!?]|$)/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, text: string, href: string) => {
        const to = keptLink(href.replace(/&#38;/g, "&"));
        return to ? `<a href="${pageText(to)}">${text}</a>` : text;
      });
  return md
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((l) => /^\s*[-*] /.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*] /, ""))}</li>`).join("")}</ul>`;
      if (lines.every((l) => /^\s*\d+\. /.test(l))) return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+\. /, ""))}</li>`).join("")}</ol>`;
      const heading = block.match(/^(#{1,6}) (.*)$/);
      if (heading && lines.length === 1) return `<h3>${inline(heading[2])}</h3>`;
      return `<p>${lines.map(inline).join("<br>")}</p>`;
    })
    .join("\n");
}

type ViewSection = { template: string; title?: string; eyebrow?: string; lede?: string; body?: string; keys?: string[]; items?: { title?: string; text?: string; link?: string; label?: string; asset?: string; verdict?: "do" | "dont"; caption?: string }[]; hidden?: boolean; props?: Record<string, unknown> };
type View = { nav: { slug: string; title: string; home: boolean }[]; page: { slug: string; title: string; eyebrow: string | null; lede: string | null; sections: ViewSection[] }; rules: { key: string; type: string; context: string | null; assets: { id: string }[] }[]; media: Record<string, { mime: string; filename: string; original: string }> };

/** What the kit draws a rule as, by its type and files: the starter's {{palette}}, {{type}}, {{logos}} or {{rules}}. */
const DRAWN: Record<string, string> = { color: "palette", font: "type" };
/** Templates whose drawing the kit has no match for yet: kept as their words, with a note to draw them. */
const AS_WORDS = new Set(["chart", "pattern", "diagram", "annotated", "request", "updates", "collection", "specs", "copy", "embed"]);

/**
 * One page of a brand as readers see it, as a page of a site built with the
 * kit: its sections in order, their words as HTML, their rules drawn by
 * @artbucket/ui as the build fills the slots. A picture a section shows is
 * fetched once into src/public/assets.
 */
async function pageFile(view: View, target: string, pictures: Map<string, string | null>) {
  const kindOf = (key: string) => {
    const r = view.rules.find((x) => x.key === key && x.context === null);
    if (!r) return null;
    if (r.assets.some((a) => view.media[a.id]?.mime?.startsWith("image/"))) return "logos";
    return DRAWN[r.type] ?? "rules";
  };
  const draw = (keys: string[] = []) => {
    const groups = new Map<string, string[]>();
    for (const k of keys) {
      const kind = kindOf(k);
      if (kind) groups.set(kind, [...(groups.get(kind) ?? []), k]);
    }
    return [...groups].map(([kind, ks]) => `{{${kind}:${ks.join(",")}}}`).join("\n");
  };
  const picture = async (id?: string) => {
    const m = id ? view.media[id] : undefined;
    if (!id || !m?.mime?.startsWith("image/") || !/^[0-9a-f-]{36}$/i.test(id)) return null;
    if (!pictures.has(id)) {
      const res = await fetch(`${BASE}/a/${id}`, { headers: KEY ? { authorization: `Bearer ${KEY}` } : {} });
      if (!res.ok) pictures.set(id, null);
      else {
        const name = `assets/${id}.${EXTENSIONS[(res.headers.get("content-type") ?? "").split(";")[0].trim()] ?? "bin"}`;
        await mkdir(join(target, "src", "public", "assets"), { recursive: true });
        await writeFile(join(target, "src", "public", name), Buffer.from(await res.arrayBuffer()));
        pictures.set(id, `/${name}`);
      }
    }
    return pictures.get(id) ?? null;
  };
  const items = async (s: ViewSection) => {
    if (!s.items?.length) return "";
    if (s.template === "faq") return s.items.map((i) => `<details><summary>${pageText(i.title)}</summary>${markdownHtml(i.text ?? "")}</details>`).join("\n");
    const lis = [];
    for (const i of s.items) {
      const img = await picture(i.asset);
      const alt = pageText(i.caption ?? i.title ?? "");
      if (i.verdict) {
        // As @artbucket/ui draws a do or a don't, so kit.css styles it.
        const dont = i.verdict === "dont";
        lis.push(`<li class="${dont ? "ab-dont" : "ab-do"}">${img ? `<figure class="ab-tile"><img src="${img}" alt="${alt}"></figure>` : ""}<span class="ab-verdict">${dont ? "Don't" : "Do"}</span>${i.title ? `<b>${pageText(i.title)}</b>` : ""}${i.text ? markdownHtml(i.text) : ""}</li>`);
        continue;
      }
      const link = i.link ? keptLink(i.link) : null;
      const title = i.title ? (link ? `<a href="${pageText(link)}"><b>${pageText(i.title)}</b></a>` : `<b>${pageText(i.title)}</b>`) : "";
      lis.push(`<li>${img ? `<img src="${img}" alt="${alt}">` : ""}${title}${i.text ? markdownHtml(i.text) : ""}${i.label && link ? `<a href="${pageText(link)}">${pageText(i.label)}</a>` : ""}</li>`);
    }
    return `<ul class="${s.items.some((i) => i.verdict) ? "ab-dodont" : "cards"}">\n${lis.join("\n")}\n</ul>`;
  };
  const out = [`<section class="hero">`, view.page.eyebrow ? `  <p class="eyebrow">${pageText(view.page.eyebrow)}</p>` : null, `  <h1>${pageText(view.page.title)}</h1>`, view.page.lede ? `  <p>${pageText(view.page.lede)}</p>` : null, `</section>`];
  for (const s of view.page.sections) {
    if (s.hidden) continue;
    const quote = s.template === "statement" || s.template === "quote";
    out.push(
      "",
      `<section class="${s.template}">`,
      AS_WORDS.has(s.template) ? `  <!-- A "${s.template}" section in Artbucket, kept here as its words: draw it as you like. -->` : null,
      s.eyebrow ? `  <p class="eyebrow">${pageText(s.eyebrow)}</p>` : null,
      s.title ? (quote ? `  <blockquote><p>${pageText(s.title).replace(/\n/g, "<br>")}</p></blockquote>` : `  <h2>${pageText(s.title).replace(/\n/g, "<br>")}</h2>`) : null,
      s.lede ? `  <p class="lede">${pageText(s.lede)}</p>` : null,
      s.body ? markdownHtml(s.body) : null,
      s.template === "embed" && typeof s.props?.url === "string" && keptLink(s.props.url) ? `  <p><a href="${pageText(s.props.url)}">${pageText(s.props.url)}</a></p>` : null,
      draw(s.keys) || null,
      (await items(s)) || null,
      `</section>`,
    );
  }
  return out.filter((l) => l !== null).join("\n") + "\n";
}

/**
 * Eject to code: a brand's pages as readers see them (its release), made a
 * guidelines site of its own with the kit, in a new folder. The pages in
 * Artbucket stay as they are; the site is built and deployed like any other.
 */
async function siteEject(dir: string) {
  opt.kind = "guidelines";
  return siteNew(dir, async (target, slug) => {
    const path = `/api/v1/brands/${encodeURIComponent(slug)}/view`;
    const first = (
      await api("GET", `${path}?version=live`).catch((err: Error) => {
        throw /Never released/.test(err.message) ? new Error(`${slug} has no release yet: ejecting takes the pages readers see. Release it first (artbucket publish --brand ${slug})`) : err;
      })
    ).data as View;
    const pictures = new Map<string, string | null>();
    const order: string[] = [];
    for (const p of first.nav) {
      const view = p.slug === first.page.slug ? first : ((await api("GET", `${path}?${new URLSearchParams({ version: "live", page: p.slug })}`)).data as View);
      const name = p.home || order.length === 0 ? "index.html" : `${p.slug}.html`;
      if (order.includes(name)) continue;
      order.push(name);
      await writeFile(join(target, "src", "pages", name), await pageFile(view, target, pictures));
    }
    // The menu keeps the brand's order.
    await writeFile(join(target, "src", "pages", "order.txt"), order.join("\n") + "\n");
    const n = [...pictures.values()].filter(Boolean).length;
    return `Ejected ${order.length} page${order.length === 1 ? "" : "s"} of ${slug}${n ? `, with ${n} picture${n === 1 ? "" : "s"} in src/public/assets` : ""}: they are this site's now, and the brand's pages in Artbucket stay as they are.`;
  });
}

async function brandPull(dir: string) {
  const previous = await brandFiles(dir);
  const slug = filesBrand(previous, dir);
  const [base, uncommitted] = await Promise.all([readBase(dir, slug), uncommittedIn(dir)]);
  // A folder that keeps its assets keeps them: pulled as files, never turned into ids.
  const local = await assetFiles(dir);
  const withAssets = opt.assets || Object.keys(local).length > 0;
  const r = await api("POST", `${await brandPath(slug)}/files/export`, { previous, ...(withAssets && { assets: "files" }) });
  const { files: answered, assets } = r.data as { files: Record<string, string>; assets: Record<string, { sha256: string; url: string }> };
  // The server names files .yaml; a folder that calls one .yml keeps its name, or the next push finds both.
  const yml = (p: string) => p.replace(/\.yaml$/, ".yml");
  // The server names an asset's file by its filename; one already in the folder under another path keeps that path.
  const bySha = new Map(Object.entries(local).map(([p, sha]) => [sha, p]));
  const moved = Object.entries(assets).flatMap(([p, a]) => {
    const mine = bySha.get(a.sha256);
    return mine && mine !== p ? [[p, mine] as const] : [];
  });
  const at = (text: string) => moved.reduce((t, [from, to]) => t.replace(new RegExp(`(?<![\\w./-])${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w./-])`, "g"), to), text);
  const files = Object.fromEntries(Object.entries(answered).map(([p, text]) => [p.endsWith(".yaml") && yml(p) in previous ? yml(p) : p, at(text)]));
  // rules/ and pages/ hold the brand's files alone: one it no longer has goes.
  const gone = Object.keys(previous).filter((p) => !(p in files));
  // Work not yet pushed is never written over: a pull to catch up before a push would lose it.
  const touched = [...Object.keys(files).filter((p) => previous[p] !== files[p]), ...gone];
  // Local work is what differs from the last pull or push. Without that record, what git holds uncommitted: an
  // untracked file only where pull would remove it, since one it writes over may be the last pull's, never committed.
  const unpushed = base
    ? (p: string) => (previous[p] ?? null) !== (base[p] ?? null)
    : (p: string) => uncommitted.changed.has(p) || (gone.includes(p) && uncommitted.untracked.has(p));
  const mine = opt.force ? [] : touched.filter(unpushed);
  if (mine.length)
    throw new Error(
      `${dir} has changes not ${base ? "pushed" : "committed"} that this pull would ${mine.some((p) => gone.includes(p)) ? "remove or " : ""}write over:\n${mine.map((p) => `  ${p}`).join("\n")}\n` +
        (base
          ? `Push them first (artbucket brand push ${dir}: it keeps what changed in the app since), then pull; or pull with --force to take the brand's.`
          : `Push them first (artbucket brand push ${dir}), commit them and pull again to see the brand's side in git diff, or pull with --force to take the brand's.`),
    );
  const wrote: string[] = [];
  for (const [path, text] of Object.entries(files)) {
    if (previous[path] === text) continue;
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), text);
    wrote.push(path);
  }
  for (const p of gone) await rm(join(dir, p));
  for (const [path, a] of withAssets ? Object.entries(assets) : []) {
    if (local[path] === a.sha256 || bySha.has(a.sha256)) continue;
    const res = await fetch(a.url, { headers: KEY ? { authorization: `Bearer ${KEY}` } : {} });
    if (!res.ok) throw new Error(`Couldn't fetch ${path}: ${res.status}`);
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), Buffer.from(await res.arrayBuffer()));
    wrote.push(path);
  }
  await writeBase(dir, slug, await brandFiles(dir));
  return [
    ...wrote.map((p) => `  wrote   ${p}`),
    ...gone.map((p) => `  removed ${p}`),
    wrote.length || gone.length ? `${r.data.brand} is in ${dir}` : `${dir} already says what ${r.data.brand} says`,
  ].join("\n");
}

async function brandPush(dir: string, dryRun: boolean) {
  const files = await brandFiles(dir);
  if (!files["brand.yaml"] && !files["brand.yml"]) throw new Error(`No brand.yaml in ${dir}. artbucket brand pull ${dir} writes one`);
  const slug = filesBrand(files, dir);
  if (opt.create && !dryRun && !(await api("GET", "/api/v1/brands")).data.some((b: { slug: string }) => b.slug === slug)) {
    // Named by its slug for now: the import names it as brand.yaml does.
    await api("POST", "/api/v1/brands", { name: slug, slug });
    console.error(`  made brand ${slug}`);
  }
  const assets = await assetFiles(dir);
  const path = `${await brandPath(slug)}/files/import`;
  // What the folder last agreed on with the brand: edits made in the app since are kept, not undone.
  const base = opt.replace ? null : await readBase(dir, slug);
  const body = { files, assets, ...(opt.replace && { merge: false }), ...(base && { base }) };
  let r = await post(path, { ...body, dryRun: true });
  // Upload what the library lacks, then ask again.
  if (!r.ok && !r.problems.errors.length && r.problems.missing.length && !dryRun) {
    for (const p of r.problems.missing) {
      await ingest(join(dir, p));
      console.error(`  uploaded ${p}`);
    }
    r = await post(path, { ...body, dryRun: true });
  }
  if (!r.ok) {
    const { errors, missing } = r.problems;
    // A diff of files that only add assets isn't a problem: push uploads them. A pull request's check stays green.
    if (errors.length || !dryRun) process.exitCode = 1;
    return [
      ...errors.map(problemLine),
      ...missing.map((m) => `  + ${m}${dryRun ? " (push uploads it)" : ": not uploaded"}`),
      ...(dryRun && !errors.length ? ["The rest of the diff shows once those are in the library: push uploads them first"] : []),
    ].join("\n");
  }
  if (!dryRun) {
    const note = opt.note ?? (opt.publish ? true : undefined);
    r = await post(path, { ...body, ...(note !== undefined && { publish: note }) });
    if (!r.ok) {
      process.exitCode = 1;
      return r.problems.errors.map(problemLine).join("\n");
    }
  }
  const d = r.data as { diff: Diff; conflicts: { what: string }[]; warnings: Problem[]; applied: boolean; version: number | null; published: number | null; pending: boolean };
  if (!dryRun) await writeBase(dir, slug, files);
  const lines = diffLines(d.diff);
  return [
    ...d.warnings.map((w) => `! ${problemLine(w)}`),
    ...d.conflicts.map((c) => `! ${c.what}: changed here and in the files; the files' side is taken`),
    ...(lines.length ? lines : ["  nothing to change"]),
    dryRun ? "(dry run: nothing written)" : d.applied ? `version ${d.version}${d.published ? `, published` : ""}` : "nothing changed",
    ...(d.pending ? ["The brand holds changes these files lack: artbucket brand pull brings them in"] : []),
  ].join("\n");
}

/** An OAuth endpoint: its errors are `{error, error_description}`, which polling reads. */
async function oauth(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, json: await res.json().catch(() => ({})) };
}

/**
 * The device flow (RFC 8628): register, get a code, have a person approve it
 * in the browser, poll until they do. What comes back is a key bound to them.
 */
async function login() {
  // The server would take admin, or a scope it doesn't know, as propose: say so before the browser opens.
  if (opt.scope === "admin") throw new Error(`${ADMIN}, as ARTBUCKET_KEY. login --scope write asks for the most it can give.`);
  if (opt.scope && !["read", "propose", "write"].includes(opt.scope)) throw new Error(`--scope is read, propose or write; got "${opt.scope}"`);
  const client = await oauth("/api/v1/oauth/register", {
    client_name: `Artbucket CLI on ${hostname()}`,
    grant_types: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
  });
  if (!client.ok) throw new Error(client.json.error_description ?? `Can't reach ${BASE}`);
  // Propose by default, as an agent connected anywhere else gets (decision 0005): pushing a brand asks for --scope write.
  const device = await oauth("/api/v1/oauth/device", { client_id: client.json.client_id, scope: opt.scope ?? "propose" });
  if (!device.ok) throw new Error(device.json.error_description ?? "Couldn't start signing in");
  const d = device.json;
  console.log(`Open ${d.verification_uri_complete}\nand check it shows ${d.user_code}. Waiting...`);
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  execFile(opener, [d.verification_uri_complete], () => {});
  const until = Date.now() + d.expires_in * 1000;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, d.interval * 1000));
    const t = await oauth("/api/v1/oauth/token", { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: d.device_code, client_id: client.json.client_id });
    if (t.ok) {
      saved[BASE] = loginOf(t.json, client.json.client_id);
      saved.default = BASE;
      await save();
      return `Signed in to ${BASE}, with ${t.json.scope}. The key is in ${CREDENTIALS}.`;
    }
    if (t.json.error !== "authorization_pending") throw new Error(t.json.error_description ?? t.json.error);
  }
  throw new Error("The code expired. Run artbucket login again.");
}

async function main() {
  KEY = process.env.ARTBUCKET_KEY ?? (cmd === "login" || cmd === "logout" ? undefined : await savedKey());
  switch (opt.help ? "help" : cmd) {
    case "login":
      return console.log(await login());
    case "logout": {
      const had = BASE in saved;
      delete saved[BASE];
      if (saved.default === BASE) delete saved.default;
      await save();
      // The key still works until it lapses (an hour) or is revoked: Connections, or `artbucket keys revoke`.
      return console.log(had ? `Forgot the key for ${BASE}. Disconnect it on the Connections page to revoke it.` : `Not signed in to ${BASE}.`);
    }
    case "search":
    case "review": {
      const p = new URLSearchParams();
      if (args.length) p.set("q", args.join(" "));
      for (const t of opt.tag ?? []) p.append("tag", t);
      if (opt.collection) p.set("collection", opt.collection);
      for (const s of opt.status ?? []) p.append("status", s);
      if (opt.review || cmd === "review") p.set("review", "true");
      if (opt.limit) p.set("limit", opt.limit);
      const r = await api("GET", `/api/v1/assets?${p}`);
      return out(r, () => r.data.map(line).join("\n") || "Nothing found.");
    }
    case "describe": {
      const r = await api("GET", `/api/v1/assets/${need(args[0], "asset id")}/description`);
      return console.log(JSON.stringify(r, null, 2));
    }
    case "check": {
      const r = await api("POST", "/api/v1/check", {
        asset: need(args[0], "asset id"),
        channel: opt.channel,
        territory: opt.territory,
        date: opt.date,
        context: opt.context,
        brand: opt.brand,
      });
      if (!r.allowed) process.exitCode = 1;
      return out(r, () =>
        [
          `${r.allowed ? "allowed" : "refused"}  ${r.asset.title}`,
          ...r.reasons.map((x: { blocking: boolean; message: string }) => `  ${x.blocking ? "x" : "!"} ${x.message}`),
          ...r.suggest.map((x: { title: string; url: string; why: string }) => `  → ${x.title}  ${x.url}  (${x.why})`),
        ].join("\n"),
      );
    }
    case "url": {
      const id = need(args[0], "asset id");
      const spec = [
        opt.width && `w_${opt.width}`,
        opt.height && `h_${opt.height}`,
        opt.fit && `fit_${opt.fit}`,
        opt.quality && `q_${opt.quality}`,
        opt.format && `f_${opt.format}`,
      ].filter(Boolean);
      // Checked against the asset, so a typo'd id fails here, not in someone's page; named after it.
      const { data: a } = await api("GET", `/api/v1/assets/${id}`);
      const name = linkName(a, spec.length ? (opt.format ?? (typeof a.probe?.preview === "string" ? "png" : null)) : undefined);
      return console.log(`${BASE}/a/${id}${spec.length ? `/${spec.join(",")}` : ""}${name ? `/${name}` : ""}`);
    }
    case "ingest": {
      if (!args.length) need(undefined, "a file or URL");
      for (const source of args) {
        const r = await ingest(source);
        out(r, () => `${r.deduped ? "exists " : "added  "} ${line(r.data)}`);
      }
      return;
    }
    case "propose-tags": {
      const id = need(args[0], "asset id");
      const r = await api("POST", `/api/v1/assets/${id}/proposed-tags`, { tags: args.slice(1) });
      return out(r, () => line(r.data));
    }
    case "approve": {
      const { data: a } = await api("GET", `/api/v1/assets/${need(args[0], "asset id")}`);
      const r = await api("PATCH", `/api/v1/assets/${a.id}`, {
        status: "active",
        tags: [...a.tags, ...a.proposedTags],
        proposedTags: [],
      });
      return out(r, () => `approved  ${line(r.data)}`);
    }
    case "reject": {
      const { data: a } = await api("GET", `/api/v1/assets/${need(args[0], "asset id")}`);
      if (a.status === "proposed") {
        const r = await api("PATCH", `/api/v1/assets/${a.id}`, { status: "rejected", reviewNote: opt.reason ?? null });
        return out(r, () => `rejected  ${a.id}  ${a.filename}`);
      }
      const r = await api("PATCH", `/api/v1/assets/${a.id}`, { proposedTags: [] });
      return out(r, () => `dismissed ${a.proposedTags.join(", ") || "nothing"} on ${a.filename}`);
    }
    case "catalog": {
      const [sub, ...rest] = args;
      const ref = () => encodeURIComponent(need(rest[0], "an address or id"));
      if (sub === "search") {
        const p = new URLSearchParams();
        if (rest.length) p.set("q", rest.join(" "));
        if (opt.type) p.set("type", opt.type);
        if (opt.project) p.set("project", opt.project);
        for (const st of opt.status ?? []) p.append("status", st);
        if (opt.limit) p.set("limit", opt.limit);
        const r = await api("GET", `/api/v1/catalog?${p}`);
        return out(r, () =>
          [
            ...r.items.map((i: { type: string; status: string; address: string }) => `${i.type.padEnd(11)} ${i.status.padEnd(10)} ${i.address}`),
            ...(r.hidden.count ? [`(${r.hidden.example}${r.hidden.count > 1 ? ` ${r.hidden.count - 1} more left out.` : ""})`] : []),
          ].join("\n") || "Nothing found.",
        );
      }
      if (sub === "show") {
        const r = await api("GET", `/api/v1/catalog/${ref()}`);
        return out(r, () =>
          [
            `${r.name}  (${r.type}, ${r.status}${r.release ? ` @${r.release}` : ""})`,
            `  ${r.address}`,
            `  in ${r.project.name}${r.parent ? `, part of ${r.parent.name}` : ""}`,
            `  used by ${r.usedByCount}${r.usedBy.length ? `: ${r.usedBy.map((u: { name: string }) => u.name).join(", ")}${r.usedByCount > r.usedBy.length ? ", ..." : ""}` : ""}`,
          ].join("\n"),
        );
      }
      if (sub === "lineage") {
        const p = new URLSearchParams({ direction: opt.direction ?? "up,down", depth: opt.depth ?? "3" });
        const r = await api("GET", `/api/v1/catalog/${ref()}/lineage?${p}`);
        type N = { id: string; name: string; type: string; address: string };
        return out(r, () => {
          const name = new Map<string, N>(r.nodes.map((n: N) => [n.id, n]));
          return [
            ...r.edges.map((e: { from: string; to: string; kind: string; via: string | null }) => `${name.get(e.from)?.address}  -${e.kind}${e.via ? ` (${e.via})` : ""}->  ${name.get(e.to)?.address}`),
            ...(r.unseen ? [`and ${r.unseen} you can't see`] : []),
            r.impact.line,
          ].join("\n");
        });
      }
      if (sub === "access") {
        const r = await api("GET", `/api/v1/catalog/${ref()}/access`);
        return out(r, () => r.holders.map((h: { who: string; role: string; via: string }) => `${h.role.padEnd(12)} ${h.who.padEnd(28)} ${h.via}`).join("\n"));
      }
      throw new Error("artbucket catalog search|show|lineage|access");
    }
    case "site": {
      const [sub, dir = "dist"] = args;
      if (sub === "new") return console.log(await siteNew(need(args[1], "the new site's folder: artbucket site new acme-docs --brand acme")));
      if (sub === "eject") return console.log(await siteEject(need(args[1], "the new site's folder: artbucket site eject acme-guidelines --brand acme")));
      if (sub === "scan") {
        if (!opt.site) throw new Error("--site: the external site's address, as artbucket sites lists it");
        const site = (await api("GET", "/api/v1/sites")).data.find((x: { slug: string }) => x.slug === opt.site);
        if (!site) throw new Error(`No site ${opt.site} in this project: artbucket sites lists them`);
        if (site.kind !== "external") throw new Error(`${opt.site} is a ${site.kind} site, deployed with site push: scan records what a site hosted elsewhere uses (make one of kind external)`);
        const at = resolve(dir);
        const files = await scanned(at);
        // Storybook names its components' files from where it ran: here, the repository's root as CI runs it.
        const packages = (opt.packages ?? []).flatMap((p) => p.split(",")).map((p) => p.trim()).filter(Boolean);
        const { used, skipped } = await importedComponents(at, files, (await api("GET", "/api/v1/components")).data, process.cwd(), packages);
        // A package not followed that imports a component's name may be the design system: say how to follow it, on stderr, beside the result.
        for (const s of skipped)
          console.error(
            `! ${s.pkg} brings in ${s.names.join(", ")} (${s.files} file${s.files === 1 ? "" : "s"}) and isn't followed. If it is your design system, scan it too: --packages ${s.pkg}`,
          );
        const manifest = Buffer.from(JSON.stringify({ components: used.map(({ component, fingerprint }) => ({ component, fingerprint })) }));
        const { zip } = await zipFolder(at, { [MANIFEST]: manifest }, files);
        const q = new URLSearchParams({ ...(process.env.GITHUB_SHA && { commit: process.env.GITHUB_SHA }), ...(process.env.GITHUB_REF_NAME && { ref: process.env.GITHUB_REF_NAME }) });
        const res = await fetch(`${BASE}/api/v1/sites/${site.id}/uses?${q}`, {
          method: "POST",
          headers: { accept: "application/json", "content-type": "application/zip", ...(KEY ? { authorization: `Bearer ${KEY}` } : {}) },
          body: zip,
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw failed(res, json, "site scan");
        const r = json.data as { files: number; uses: { asset: string }[]; problems: string[] };
        if (r.problems.length) process.exitCode = 1;
        const assets = new Set(r.uses.map((u) => u.asset)).size;
        const by = (f: string[]) => (f.length > 1 ? `${f[0]} and ${f.length - 1} more` : f[0]);
        return out(json, () =>
          [
            `Recorded for ${site.slug}: ${r.files} files, ${assets} asset${assets === 1 ? "" : "s"} of the library, ${used.length} component${used.length === 1 ? "" : "s"}`,
            ...used.map((u) => `  ${u.name.padEnd(20)} ${by(u.by)}`),
            ...r.problems.map((p) => `  x ${p}`),
          ].join("\n"),
        );
      }
      if (sub === "check") {
        const { zip, files } = await zipFolder(resolve(dir), await withFingerprints(dir));
        const res = await fetch(`${BASE}/api/v1/sites/check`, {
          method: "POST",
          headers: { accept: "application/json", "content-type": "application/zip", ...(KEY ? { authorization: `Bearer ${KEY}` } : {}) },
          body: zip,
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw failed(res, json, "site check");
        const r = json.data as { allowed: boolean; uses: { asset: string }[]; problems: string[] };
        if (!r.allowed) process.exitCode = 1;
        const used = new Set(r.uses.map((u) => u.asset)).size;
        return out(json, () =>
          [`${r.allowed ? "allowed" : "refused"}  ${files} files, ${used} asset${used === 1 ? "" : "s"} of the library`, ...r.problems.map((p) => `  x ${p}`)].join("\n"),
        );
      }
      if (sub !== "push") throw new Error("artbucket site push|check|scan [dir] --site <address> [--path /docs] [--kind docs]");
      if (!opt.site) throw new Error("--site: the site's address, as artbucket sites lists it");
      const site = (await api("GET", "/api/v1/sites")).data.find((x: { slug: string }) => x.slug === opt.site);
      if (!site) throw new Error(`No site ${opt.site} in this project: artbucket sites lists them`);
      // A Storybook's components' code, hashed where it was built: a change to one makes a new version of it.
      const { zip, files } = await zipFolder(resolve(dir), await withFingerprints(dir));
      const q = new URLSearchParams({ path: opt.path ?? "/", ...(opt.kind && { kind: opt.kind }), ...(opt.preview && { preview: opt.preview }) });
      const res = await fetch(`${BASE}/api/v1/sites/${site.id}/deployments?${q}`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/zip", ...(KEY ? { authorization: `Bearer ${KEY}` } : {}) },
        body: zip,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw failed(res, json, "site push");
      if (json.data.state === "held") {
        process.exitCode = 1;
        return out(json, () => json.data.error);
      }
      if (json.data.state === "preview") return out(json, () => `Preview: ${json.data.url} (${files} files)`);
      return out(json, () => `Live: ${site.url}${json.data.path === "/" ? "" : json.data.path} (${files} files)`);
    }
    case "sites": {
      const r = await api("GET", "/api/v1/sites");
      return out(r, () => r.data.map((x: { kind: string; slug: string; url: string }) => `${x.kind.padEnd(11)} ${x.slug.padEnd(24)} ${x.url}`).join("\n"));
    }
    case "brands": {
      const r = await api("GET", "/api/v1/brands");
      return out(r, () =>
        r.data
          .map((b: { slug: string; name: string; default: boolean; rules: number }) =>
            `${b.default ? "*" : " "} ${b.slug.padEnd(20)} ${b.name}  (${b.rules} rules)`,
          )
          .join("\n"),
      );
    }
    case "brand": {
      const [sub, dir = "brand"] = args;
      if (sub === "pull") return console.log(await brandPull(dir));
      if (sub === "push") return console.log(await brandPush(dir, !!opt["dry-run"]));
      if (sub === "diff") return console.log(await brandPush(dir, true));
      if (sub === "export") return console.log(await brandExport(args[1] ?? ".brand"));
      throw new Error("brand pull, brand push, brand diff or brand export. artbucket --help");
    }
    case "history":
    case "restore": {
      const base = `${await brandPath()}/versions`;
      if (cmd === "restore") {
        const r = await api("POST", `${base}/${need(args[0], "version number")}/restore`);
        return out(r, () => `restored version ${r.data.restored} as version ${r.data.version}`);
      }
      if (args[0]) {
        const r = await api("GET", `${base}/${args[0]}`);
        return out(r, () =>
          [`v${r.data.number}  ${r.data.name ?? r.data.summary}  (${r.data.actor}, ${r.data.updatedAt})`]
            .concat(
              r.data.diff.map((c: { change: string; key: string; context: string | null }) =>
                `  ${c.change.padEnd(8)} ${c.key}${c.context ? ` [${c.context}]` : ""}`,
              ),
            )
            .join("\n"),
        );
      }
      const r = await api("GET", base);
      return out(r, () =>
        r.data
          .map((v: { number: number; name: string | null; summary: string; actor: string; updatedAt: string }) =>
            `v${String(v.number).padEnd(4)} ${v.updatedAt.slice(0, 16).replace("T", " ")}  ${v.actor.padEnd(10)} ${v.name ? `[${v.name}] ` : ""}${v.summary}`,
          )
          .join("\n"),
      );
    }
    case "rules": {
      type Rule = { id: string; key: string; context: string | null; type: string; value: unknown; usage: string | null; assets: unknown[] };
      const show = (r: Rule) =>
        [
          r.id,
          r.key + (r.context ? ` [${r.context}]` : ""),
          [r.value].flat().join(", "),
          r.usage && `- ${r.usage}`,
          r.assets.length && `(${r.assets.length} asset${r.assets.length > 1 ? "s" : ""})`,
        ]
          .filter(Boolean)
          .join("  ");
      const inBrand = opt.brand ? `?brand=${encodeURIComponent(opt.brand)}` : "";
      // --asset id, or id:w_512,f_png for one rendition of it.
      const ruleAssets = opt.asset?.map((a) => {
        const [id, rendition] = a.split(":");
        return { id, rendition: rendition || null };
      });
      if (args[0] === "set" && args[2] === undefined) {
        const batch = await readJson(args[1], "a rules file");
        const r = await api("PATCH", `/api/v1/brand/rules${inBrand}`, Array.isArray(batch) ? { set: batch } : batch);
        const d = r.data as Record<"created" | "updated" | "removed", string[]>;
        return out(r, () =>
          (["created", "updated", "removed"] as const)
            .filter((verb) => d[verb].length)
            .map((verb) => `${verb} ${d[verb].join(", ")}`)
            .join("\n") || "Nothing changed.",
        );
      }
      if (args[0] === "set") {
        const key = need(args[1], "rule key");
        const raw = need(args[2], "value");
        const type = need(opt.type, "--type");
        const value =
          type === "number" ? Number(raw) : type === "list" ? raw.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (/^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s)) : raw;
        const context = opt.context ?? null;
        const { data } = await api("GET", `/api/v1/brand/rules${inBrand}`);
        const found = (data as Rule[]).find((r) => r.key === key && r.context === context);
        // Same key and type: edit in place. A different type means a new rule.
        if (found && found.type !== type) await api("DELETE", `/api/v1/brand/rules/${found.id}`);
        const r =
          found && found.type === type
            ? await api("PATCH", `/api/v1/brand/rules/${found.id}`, {
                value,
                ...(opt.usage !== undefined && { usage: opt.usage }),
                ...(ruleAssets && { assets: ruleAssets }),
              })
            : await api("POST", `/api/v1/brand/rules${inBrand}`, { key, context, type, value, usage: opt.usage, assets: ruleAssets });
        return out(r, () => show(r.data));
      }
      if (args[0] === "delete") {
        const r = await api("DELETE", `/api/v1/brand/rules/${need(args[1], "rule id")}`);
        return out(r, () => "deleted");
      }
      const q = new URLSearchParams();
      if (opt.brand) q.set("brand", opt.brand);
      if (opt.context) q.set("context", opt.context);
      const r = await api("GET", `/api/v1/brand/rules${q.size ? `?${q}` : ""}`);
      return out(r, () => r.data.map(show).join("\n") || "No brand rules.");
    }
    case "templates": {
      const r = await api("GET", "/api/v1/brand/templates");
      return out(r, () =>
        r.data.templates.map((t: { template: string; use: string }) => `${t.template.padEnd(12)} ${t.use}`).join("\n"),
      );
    }
    case "pages": {
      const base = `${await brandPath()}/pages`;
      if (args[0] === "generate") {
        const r = await api("POST", base);
        return out(r, () => r.data.pages.map((p: { slug: string; title: string }) => `made ${p.slug.padEnd(20)} ${p.title}`).join("\n"));
      }
      type Summary = { slug: string; title: string; parent: string | null; hidden: boolean; sections: number };
      const r = await api("GET", base);
      const pages: Summary[] = r.data;
      // Indented under its parent; one whose parent isn't there shows at the top rather than not at all.
      const under = (parent: string | null, depth: number): string[] =>
        pages
          .filter((p) => (pages.some((x) => x.slug === p.parent) ? p.parent : null) === parent)
          .flatMap((p) => [
            `${"  ".repeat(depth)}${p.slug.padEnd(24 - 2 * depth)} ${p.title}  (${p.sections} section${p.sections === 1 ? "" : "s"}${p.hidden ? ", hidden" : ""})`,
            ...under(p.slug, depth + 1),
          ]);
      return out(r, () => under(null, 0).join("\n") || "No pages. artbucket pages generate lays out a start.");
    }
    case "page": {
      const sub = ["save", "edit", "rm"].includes(args[0]) ? args[0] : null;
      const slug = need(sub ? args[1] : args[0], "page slug");
      const path = `${await brandPath()}/pages/${encodeURIComponent(slug)}`;
      if (sub === "save") {
        const r = await api("PUT", path, await readJson(args[2], "a page file"));
        return out(r, () => written(r.data.created ? "made" : "saved", r.data));
      }
      if (sub === "edit") {
        const ops = await readJson(args[2], "an ops file");
        const r = await api("PATCH", path, Array.isArray(ops) ? { ops } : ops);
        return out(r, () => written("edited", r.data));
      }
      if (sub === "rm") {
        const r = await api("DELETE", path);
        return out(r, () => "deleted");
      }
      const r = await api("GET", `${path}${opt.context ? `?context=${encodeURIComponent(opt.context)}` : ""}`);
      // Warnings on stderr, so the Markdown pipes into a file clean.
      if (!opt.json) for (const w of [...r.data.missing.map((k: string) => `no rule "${k}"`), ...r.data.warnings]) console.error(`! ${w}`);
      return out(r, () => r.data.markdown);
    }
    case "theme": {
      const path = `${await brandPath()}/theme`;
      const r = args[0] === "set" ? await api("PATCH", path, await readJson(args[1], "a theme file")) : await api("GET", path);
      const settings = Object.entries(r.data.settings as Record<string, unknown>);
      return out(r, () =>
        [
          ...(settings.length ? settings.map(([k, v]) => `${k.padEnd(12)} ${v}`) : ["Nothing set: the rules decide every part."]),
          ...(r.data.warnings ?? []).map((w: string) => `  ! ${w}`),
        ].join("\n"),
      );
    }
    case "publish": {
      const r = await api("POST", `${await brandPath()}/publish`, { note: opt.note });
      return out(r, () => `${r.data.unchanged ? "already published" : "published"} ${r.data.brand} as version ${r.data.number}`);
    }
    case "keys": {
      if (args[0] === "create") {
        const r = await api("POST", "/api/v1/keys", { name: need(args[1], "key name"), scope: need(opt.scope, "--scope") });
        return out(r, () => `${r.data.secret}\n\nShown once. ${r.data.scope} key "${r.data.name}" (${r.data.id}).`);
      }
      if (args[0] === "revoke") {
        const r = await api("DELETE", `/api/v1/keys/${need(args[1], "key id")}`);
        return out(r, () => "revoked");
      }
      const r = await api("GET", "/api/v1/keys");
      return out(r, () =>
        r.data.map((k: { id: string; prefix: string; scope: string; name: string }) => `${k.id}  ${k.prefix}...  ${k.scope.padEnd(7)}  ${k.name}`).join("\n") || "No keys.",
      );
    }
    case "whoami": {
      const r = await api("GET", "/api/v1/me");
      const d = r.data;
      return out(r, () =>
        `${d.actor}${d.user ? ` <${d.user.email}>` : d.key ? " (API key)" : ""}  ${d.scope ?? (d.narrowed ? "some collections" : "no access")} in ${d.project.name} (${d.project.organization.name})`,
      );
    }
    case "members": {
      type Grant = { scope: string; resource: string; label: string | null };
      const r = await api("GET", "/api/v1/members");
      return out(r, () =>
        [
          ...r.data.map(
            (m: { name: string; email: string; grants: Grant[] }) =>
              `${m.name} <${m.email}>  ${m.grants.map((g) => `${g.scope} on ${g.resource} ${g.label ?? ""}`.trim()).join(", ")}`,
          ),
          ...r.invitations.map((i: Grant & { email: string }) => `(invited) ${i.email}  ${i.scope} on ${i.resource} ${i.label ?? ""}`.trim()),
        ].join("\n"),
      );
    }
    case "invite": {
      const email = need(args[0], "email");
      const me = (await api("GET", "/api/v1/me")).data;
      const r = await api("POST", "/api/v1/invitations", {
        email,
        scope: need(opt.scope, "--scope"),
        resource: opt.collection ? "collection" : "project",
        resourceId: opt.collection ?? me.project.id,
      });
      return out(r, () => `${r.data.url}\n\nShown once. Send it to ${email}; it works for a week.`);
    }
    case "share": {
      // Into another project: the object, by address or id, read by its members where it is.
      if (opt.to) {
        const d = await api("GET", `/api/v1/catalog/${encodeURIComponent(need(args[0], "an address or id"))}`);
        const r = await api("POST", "/api/v1/grants", { project: opt.to, resource: d.type, resourceId: d.id, scope: "read" });
        return out(r, () => `${d.name} is shared into ${r.data.project.name}, as Viewer: kept and edited in ${d.project.name}`);
      }
      const id = need(args[0], "collection or asset id");
      // An id is a collection's if the project has one by it; an asset's otherwise.
      const collections = (await api("GET", "/api/v1/collections")).data as { id: string }[];
      const isCollection = collections.some((c) => c.id === id);
      const r = await api("POST", "/api/v1/shares", {
        kind: opt.upload ? "upload" : "view",
        ...(isCollection ? { collection: id } : { asset: id }),
        name: opt.name,
        password: opt.password,
        expiresAt: opt.expires ? new Date(`${opt.expires}T23:59:59`).toISOString() : undefined,
      });
      return out(r, () => `${r.data.url}\n\n${opt.upload ? "Uploads land in Review." : "Shows approved assets."}${r.data.password ? " Asks for the password." : ""}`);
    }
    case "shares": {
      if (args[0] === "revoke") {
        const r = await api("DELETE", `/api/v1/shares/${need(args[1], "share id")}`);
        return out(r, () => "revoked");
      }
      const r = await api("GET", "/api/v1/shares");
      return out(r, () =>
        r.data
          .map(
            (x: { id: string; kind: string; name: string | null; url: string; expired: boolean; target: { label: string | null } }) =>
              `${x.id}  ${x.kind.padEnd(6)} ${x.expired ? "[expired] " : ""}${x.name ?? x.target.label ?? ""}  ${x.url}`,
          )
          .join("\n") || "No share links.",
      );
    }
    case "audit": {
      const r = await api("GET", "/api/v1/audit");
      return out(r, () =>
        r.data
          .map((e: { at: string; actor: string; action: string; target: string | null }) =>
            `${e.at.slice(0, 16).replace("T", " ")}  ${e.actor.padEnd(16)} ${e.action.padEnd(20)} ${e.target ?? ""}`,
          )
          .join("\n") || "Nothing yet.",
      );
    }
    default:
      console.log(HELP);
      if (cmd && cmd !== "help") process.exitCode = 1;
  }
}

main().catch((e: Error) => {
  console.error(`artbucket: ${e.message}`);
  process.exitCode = 1;
});
