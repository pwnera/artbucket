/**
 * The published benchmark (docs: developers/benchmarks): a 100,000-asset
 * library, searched through the real API.
 *
 *   createdb artbucket_bench
 *   BENCH_DATABASE_URL=postgres://.../artbucket_bench pnpm bench seed
 *   DATABASE_URL=postgres://.../artbucket_bench RATE_LIMIT=0 PORT=3100 pnpm start
 *   BENCH_DATABASE_URL=postgres://.../artbucket_bench BENCH_URL=http://localhost:3100 pnpm bench run
 *
 * `seed` migrates the database and fills its first project with synthetic
 * rows: filenames, tags from a long-tailed vocabulary, custom fields, 100
 * collections, a mix of states. No bytes: this measures search, filters,
 * facets and the verdict, not storage. It refuses a database that already has
 * people in it, so it can't fill a real library.
 */

import { createHash, randomBytes } from "node:crypto";
import { cpus, platform, totalmem } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const N = Number(process.env.BENCH_ASSETS ?? 100_000);
const RUNS = Number(process.env.BENCH_RUNS ?? 200);
const DB = process.env.BENCH_DATABASE_URL;
const URL_ = process.env.BENCH_URL ?? "http://localhost:3100";
if (!DB) {
  console.error("Set BENCH_DATABASE_URL to a database the benchmark may fill");
  process.exit(1);
}
const sql = postgres(DB, { max: 4, onnotice: () => {} });

async function seed() {
  await migrate(drizzle(sql), { migrationsFolder: join(import.meta.dirname, "..", "drizzle") });
  const [{ people }] = await sql`select count(*)::int as people from users where id <> 'bench'`;
  if (people) throw new Error("This database has accounts in it: the benchmark only fills an empty one");
  const [ws] = await sql`select id from projects order by created_at limit 1`;
  const [{ have }] = await sql`select count(*)::int as have from assets where project_id = ${ws.id}`;
  if (have >= N) return console.log(`Already ${have} assets`);

  await sql`insert into users (id, name, email) values ('bench', 'Bench', 'bench@example.invalid') on conflict do nothing`;
  await sql`insert into fields (project_id, key, label, type, options, position) values
    (${ws.id}, 'channel', 'Channel', 'select', '["web","print","social","email","ooh"]', 0),
    (${ws.id}, 'region', 'Region', 'select', '["emea","amer","apac"]', 1),
    (${ws.id}, 'year', 'Year', 'number', '[]', 2),
    (${ws.id}, 'campaign', 'Campaign', 'text', '[]', 3)
    on conflict do nothing`;
  await sql`insert into collections (project_id, name) select ${ws.id}, 'Collection ' || i from generate_series(1, 100) i`;

  const t0 = performance.now();
  // Tags: a head of common words everyone uses, and a long tail of clients and products.
  await sql.unsafe(`
    with words as (select array['logo','hero','product','team','event','office','portrait','lifestyle','packaging','banner',
      'poster','icon','illustration','photo','video','social','print','web','campaign','launch','spring','summer','autumn',
      'winter','outdoor','studio','night','city','nature','people','food','travel','sport','tech','fashion','interior',
      'abstract','texture','pattern','mockup'] as w)
    insert into assets (project_id, sha256, filename, mime, size, width, height, tags, fields, metadata, status, created_at)
    select '${ws.id}',
      encode(sha256(('bench' || i)::text::bytea), 'hex'),
      w[1 + i % 40] || '_' || w[1 + (i / 40) % 40] || '_' || i || (array['.jpg','.png','.webp','.svg','.pdf','.mp4'])[1 + i % 6],
      (array['image/jpeg','image/png','image/webp','image/svg+xml','application/pdf','video/mp4'])[1 + i % 6],
      50000 + (i * 7919) % 8000000, 1920, 1080,
      jsonb_build_array(w[1 + i % 40], w[1 + (i * 7) % 40], 'client-' || (i % 400), 'sku-' || (i % 5000)),
      jsonb_build_object('channel', (array['web','print','social','email','ooh'])[1 + i % 5],
        'region', (array['emea','amer','apac'])[1 + i % 3], 'year', 2015 + i % 11, 'campaign', 'Campaign ' || (i % 300)),
      jsonb_build_object('title', initcap(w[1 + i % 40]) || ' ' || w[1 + (i / 40) % 40] || ' ' || i, 'creator', 'Photographer ' || (i % 500)),
      case when i % 20 = 0 then 'archived' when i % 50 = 0 then 'proposed' when i % 97 = 0 then 'draft' else 'active' end,
      now() - make_interval(mins => i)
    from words, generate_series(1, ${N}) i
    on conflict do nothing`);
  await sql`
    insert into collection_assets (collection_id, asset_id)
    select c.id, a.id
    from (select id, row_number() over (order by created_at) - 1 as n from collections where project_id = ${ws.id}) c
    join (select id, row_number() over (order by created_at) as n from assets where project_id = ${ws.id}) a on a.n % 100 = c.n
    on conflict do nothing`;
  await sql`analyze`;
  console.log(`Seeded ${N} assets in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
}

async function key() {
  const [ws] = await sql`select id from projects order by created_at limit 1`;
  const secret = `ab_${randomBytes(32).toString("base64url")}`;
  await sql`delete from api_keys where name = 'bench'`;
  await sql`insert into api_keys (project_id, name, prefix, hash, scope) values
    (${ws.id}, 'bench', ${secret.slice(0, 10)}, ${createHash("sha256").update(secret).digest("hex")}, 'read')`;
  return secret;
}

const pct = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];

async function time(label: string, secret: string, path: string, init?: RequestInit) {
  const call = async () => {
    const t = performance.now();
    const res = await fetch(`${URL_}${path}`, { ...init, headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" } });
    const body = await res.json();
    if (!res.ok) throw new Error(`${label}: ${res.status} ${JSON.stringify(body)}`);
    return [performance.now() - t, body] as const;
  };
  for (let i = 0; i < 10; i++) await call();
  const ms: number[] = [];
  let last: { total?: number } = {};
  for (let i = 0; i < RUNS; i++) {
    const [t, body] = await call();
    ms.push(t);
    last = body;
  }
  ms.sort((a, b) => a - b);
  return { label, path, matches: last.total ?? null, p50: pct(ms, 50), p95: pct(ms, 95), p99: pct(ms, 99) };
}

async function throughput(secret: string, path: string, clients = 8, seconds = 10) {
  let done = 0;
  const end = Date.now() + seconds * 1000;
  await Promise.all(
    Array.from({ length: clients }, async () => {
      while (Date.now() < end) {
        const r = await fetch(`${URL_}${path}`, { headers: { Authorization: `Bearer ${secret}` } });
        await r.arrayBuffer();
        if (r.ok) done++;
      }
    }),
  );
  return done / seconds;
}

async function run() {
  const secret = await key();
  const [{ id: asset }] = await sql`select id from assets where status = 'active' order by created_at desc limit 1`;
  const [{ id: collection }] = await sql`select id from collections order by name limit 1`;
  const [{ version }] = await sql`select current_setting('server_version') as version`;
  const results = [];
  for (const [label, path, init] of [
    ["Newest 100, with facets", "/api/v1/assets"],
    ["One common word", "/api/v1/assets?q=logo"],
    ["Two words", "/api/v1/assets?q=logo%20winter"],
    ["Prefix of a rare word", "/api/v1/assets?q=sku-123"],
    ["Tag", "/api/v1/assets?tag=client-42"],
    ["Field value", "/api/v1/assets?f.channel=print"],
    ["Field range and type", "/api/v1/assets?f.year.gte=2022&type=image"],
    ["Collection", `/api/v1/assets?collection=${collection}`],
    ["Words, tag and field together", "/api/v1/assets?q=hero&tag=studio&f.region=emea"],
    ["Archived only", "/api/v1/assets?status=archived"],
    ["Deep page (offset 10,000)", "/api/v1/assets?offset=10000&limit=50"],
    ["One asset", `/api/v1/assets/${asset}`],
    ["Verdict (POST /check)", "/api/v1/check", { method: "POST", body: JSON.stringify({ asset, channel: "web", territory: "DE" }) }],
  ] as [string, string, RequestInit?][]) {
    results.push(await time(label, secret, path, init));
  }
  const rps = await throughput(secret, "/api/v1/assets?q=logo");
  const [{ assets }] = await sql`select count(*)::int as assets from assets`;

  const f = (n: number) => n.toFixed(0);
  console.log(`\n${assets.toLocaleString("en")} assets. ${RUNS} sequential requests each, after 10 to warm up.`);
  console.log(`${cpus()[0].model}, ${cpus().length} cores, ${Math.round(totalmem() / 1e9)} GB, ${platform()}; Postgres ${version}; ${new Date().toISOString().slice(0, 10)}\n`);
  console.log("| Query | Matches | p50 ms | p95 ms | p99 ms |\n|---|---:|---:|---:|---:|");
  for (const r of results) console.log(`| ${r.label} | ${r.matches?.toLocaleString("en") ?? "-"} | ${f(r.p50)} | ${f(r.p95)} | ${f(r.p99)} |`);
  console.log(`\nThroughput, \`q=logo\` from 8 clients at once: ${f(rps)} requests a second.`);
  await sql`delete from api_keys where name = 'bench'`;
}

const cmd = process.argv[2] ?? "run";
await (cmd === "seed" ? seed() : run());
await sql.end();
