#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * artbucket - a thin client over /api/v1. Everything it does, curl can do.
 *
 *   ARTBUCKET_URL   default http://localhost:3000
 *   ARTBUCKET_KEY   an API key (ab_...), if the server wants one
 */
import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { parseArgs } from "node:util";

const HELP = `artbucket <command>

  search [words] [--tag t]... [--collection id] [--review] [--limit n]
  describe <id>
  check <id> [--channel c] [--territory CC] [--date YYYY-MM-DD] [--context c] [--brand b]
                          may it be used like this? exits 1 when it may not
  url <id> [--width n] [--height n] [--fit cover|contain|inside] [--format webp|avif|jpeg|png] [--quality n]
  ingest <file-or-url>... [--tag t]... [--collection id]
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
  rules delete <id>
  history [--brand b]     the brand's versions, newest first
  history <n> [--brand b] what changed in version n
  restore <n> [--brand b] put version n back (itself a new version)
  keys                    list API keys
  keys create <name> --scope read|propose|write|admin
  keys revoke <id>

  --json   print the raw API response`;

const BASE = (process.env.ARTBUCKET_URL ?? "http://localhost:3000").replace(/\/$/, "");
const KEY = process.env.ARTBUCKET_KEY;

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

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".avif": "image/avif", ".gif": "image/gif", ".svg": "image/svg+xml", ".tif": "image/tiff",
  ".tiff": "image/tiff", ".pdf": "application/pdf", ".mp4": "video/mp4", ".mov": "video/quicktime",
};

async function ingest(source: string) {
  const extra = { tags: opt.tag, collections: opt.collection ? [opt.collection] : undefined };
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

async function main() {
  switch (opt.help ? "help" : cmd) {
    case "search":
    case "review": {
      const p = new URLSearchParams();
      if (args.length) p.set("q", args.join(" "));
      for (const t of opt.tag ?? []) p.append("tag", t);
      if (opt.collection) p.set("collection", opt.collection);
      if (opt.review || cmd === "review") p.set("review", "true");
      if (opt.limit) p.set("limit", opt.limit);
      const r = await api("GET", `/api/v1/assets?${p}`);
      return out(r, () => r.data.map(line).join("\n") || "Nothing found.");
    }
    case "describe": {
      const r = await api("GET", `/a/${need(args[0], "asset id")}`);
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
    case "history":
    case "restore": {
      const slug = opt.brand ?? (await api("GET", "/api/v1/brands")).data.find((b: { default: boolean }) => b.default).slug;
      const base = `/api/v1/brands/${slug}/versions`;
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
    default:
      console.log(HELP);
      if (cmd && cmd !== "help") process.exitCode = 1;
  }
}

main().catch((e: Error) => {
  console.error(`artbucket: ${e.message}`);
  process.exitCode = 1;
});
