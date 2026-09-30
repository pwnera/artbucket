#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * artbucket - a thin client over /api/v1. Everything it does, curl can do.
 *
 *   ARTBUCKET_URL   default http://localhost:3000
 *   ARTBUCKET_KEY   an API key (ab_...), if the server wants one; it
 *                   decides the workspace. Without one, the key
 *                   `artbucket login` saved for this server
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { hostname, homedir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { parseArgs } from "node:util";

const HELP = `artbucket <command>

  login                   sign in through the browser; saves a key for ARTBUCKET_URL
  logout                  forget it
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
  brands                  list brands; the default is starred
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
                          put the brand's pages, rules and theme in front of portal visitors
  brand pull [dir] [--brand b] [--assets]
                          the brand as files in dir (brand/ by default): brand.yaml,
                          rules/, pages/; a file that says the same is left as it is.
                          --assets fetches the files it points at into assets/ too
  brand push [dir] [--brand b] [--dry-run] [--replace] [--publish] [--note text]
                          take the brand from its files, uploading what assets/ adds:
                          merged with what changed here since the last push or pull
                          (--replace takes the files whole), as one version
  brand diff [dir] [--brand b]
                          what push would change; exits 1 on problems in the files
  history [--brand b]     the brand's versions, newest first
  history <n> [--brand b] what changed in version n
  restore <n> [--brand b] put version n back (itself a new version)
  keys                    list the workspace's API keys
  keys create <name> --scope read|propose|write|admin
  keys revoke <id>
  whoami                  the key, its workspace and its scope
  members                 people, their access, and invitations waiting (admin)
  invite <email> --scope s [--collection id]
                          an invitation link to the workspace, or one collection (admin)
  share <collection-or-asset-id> [--upload] [--password p] [--expires YYYY-MM-DD] [--name n]
                          a link for someone without an account: to look and
                          download, or with --upload to send files in for review
  shares                  share links; shares revoke <id>
  audit                   who changed who may do what (admin)

  --json   print the raw API response`;

const BASE = (process.env.ARTBUCKET_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Keys `artbucket login` saved, one per server. Only this user can read the file. */
const CREDENTIALS = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "artbucket", "credentials.json");
const saved: Record<string, string> = JSON.parse(await readFile(CREDENTIALS, "utf8").catch(() => "{}"));
const save = async () => {
  await mkdir(dirname(CREDENTIALS), { recursive: true });
  await writeFile(CREDENTIALS, JSON.stringify(saved, null, 2), { mode: 0o600 });
};
const KEY = process.env.ARTBUCKET_KEY ?? saved[BASE];

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    tag: { type: "string", multiple: true },
    collection: { type: "string" },
    review: { type: "boolean" },
    limit: { type: "string" },
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
    replace: { type: "boolean" },
    publish: { type: "boolean" },
    note: { type: "string" },
    status: { type: "string", multiple: true },
    json: { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});
const [cmd, ...args] = positionals;

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
  if (!res.ok) throw new Error(json?.error?.message ?? `${method} ${path}: ${res.status}`);
  return json;
}

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

/** The brand a command acts on: --brand, or the workspace's default. */
const brandSlug = async (): Promise<string> =>
  opt.brand ?? (await api("GET", "/api/v1/brands")).data.find((b: { default: boolean }) => b.default).slug;
const brandPath = async () => `/api/v1/brands/${encodeURIComponent(await brandSlug())}`;
const readJson = async (file: string | undefined, what: string) => JSON.parse(await readFile(need(file, what), "utf8"));

/** What a page write answers: where to read it, then what a reader would trip on. */
type Written = { page: { slug: string }; warnings: string[]; url: string };
const written = (verb: string, d: Written) => [`${verb} ${d.page.slug}  ${d.url}`, ...d.warnings.map((w) => `  ! ${w}`)].join("\n");

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".avif": "image/avif", ".gif": "image/gif", ".svg": "image/svg+xml", ".tif": "image/tiff",
  ".tiff": "image/tiff", ".pdf": "application/pdf", ".mp4": "video/mp4", ".mov": "video/quicktime",
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
  pages: { change: string; slug: string }[];
  theme: string[];
  reordered: boolean;
};

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
    ...d.pages.map((p) => `  ${{ added: "+", removed: "-", changed: "~", moved: ">" }[p.change] ?? "~"} page ${p.slug}${p.change === "moved" ? " (moved)" : ""}`),
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
  if (!res.ok) throw new Error(json?.error?.message ?? `POST ${path}: ${res.status}`);
  return { ok: true as const, data: json.data };
}

async function brandPull(dir: string) {
  const previous = await brandFiles(dir);
  const r = await api("POST", `${await brandPath()}/files/export`, { previous, ...(opt.assets && { assets: "files" }) });
  const { files, assets } = r.data as { files: Record<string, string>; assets: Record<string, { sha256: string; url: string }> };
  const wrote: string[] = [];
  for (const [path, text] of Object.entries(files)) {
    if (previous[path] === text) continue;
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), text);
    wrote.push(path);
  }
  // rules/ and pages/ hold the brand's files alone: one it no longer has goes.
  const gone = Object.keys(previous).filter((p) => !(p in files) && !(p.replace(/\.yml$/, ".yaml") in files && p.endsWith(".yml")));
  for (const p of gone) await rm(join(dir, p));
  const local = opt.assets ? await assetFiles(dir) : {};
  for (const [path, a] of opt.assets ? Object.entries(assets) : []) {
    if (local[path] === a.sha256) continue;
    const res = await fetch(a.url, { headers: KEY ? { authorization: `Bearer ${KEY}` } : {} });
    if (!res.ok) throw new Error(`Couldn't fetch ${path}: ${res.status}`);
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), Buffer.from(await res.arrayBuffer()));
    wrote.push(path);
  }
  return [
    ...wrote.map((p) => `  wrote   ${p}`),
    ...gone.map((p) => `  removed ${p}`),
    wrote.length || gone.length ? `${r.data.brand} is in ${dir}` : `${dir} already says what ${r.data.brand} says`,
  ].join("\n");
}

async function brandPush(dir: string, dryRun: boolean) {
  const files = await brandFiles(dir);
  if (!files["brand.yaml"] && !files["brand.yml"]) throw new Error(`No brand.yaml in ${dir}. artbucket brand pull ${dir} writes one`);
  const assets = await assetFiles(dir);
  const path = `${await brandPath()}/files/import`;
  const body = { files, assets, ...(opt.replace && { merge: false }) };
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
    process.exitCode = 1;
    return [...errors.map(problemLine), ...missing.map((m) => `${m}: not uploaded yet${dryRun ? " (push uploads it)" : ""}`)].join("\n");
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
  const client = await oauth("/api/v1/oauth/register", {
    client_name: `artbucket CLI on ${hostname()}`,
    grant_types: ["urn:ietf:params:oauth:grant-type:device_code"],
  });
  if (!client.ok) throw new Error(client.json.error_description ?? `Can't reach ${BASE}`);
  const device = await oauth("/api/v1/oauth/device", { client_id: client.json.client_id });
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
      saved[BASE] = t.json.access_token;
      await save();
      return `Signed in to ${BASE}, with ${t.json.scope}. The key is in ${CREDENTIALS}.`;
    }
    if (t.json.error !== "authorization_pending") throw new Error(t.json.error_description ?? t.json.error);
  }
  throw new Error("The code expired. Run artbucket login again.");
}

async function main() {
  switch (opt.help ? "help" : cmd) {
    case "login":
      return console.log(await login());
    case "logout": {
      const had = BASE in saved;
      delete saved[BASE];
      await save();
      // The key still works until it's revoked: Connected agents, or `artbucket keys revoke`.
      return console.log(had ? `Forgot the key for ${BASE}. Disconnect it on the Agents page to revoke it.` : `Not signed in to ${BASE}.`);
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
      // Checked against the asset, so a typo'd id fails here, not in someone's page.
      await api("GET", `/api/v1/assets/${id}`);
      return console.log(`${BASE}/a/${id}${spec.length ? `/${spec.join(",")}` : ""}`);
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
      throw new Error("brand pull, brand push or brand diff. artbucket --help");
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
        `${d.actor}${d.user ? ` <${d.user.email}>` : d.key ? " (API key)" : ""}  ${d.scope ?? (d.narrowed ? "some collections" : "no access")} in ${d.workspace.name} (${d.workspace.organization.name})`,
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
        resource: opt.collection ? "collection" : "workspace",
        resourceId: opt.collection ?? me.workspace.id,
      });
      return out(r, () => `${r.data.url}\n\nShown once. Send it to ${email}; it works for a week.`);
    }
    case "share": {
      const id = need(args[0], "collection or asset id");
      // An id is a collection's if the workspace has one by it; an asset's otherwise.
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
