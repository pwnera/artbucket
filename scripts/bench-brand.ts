/**
 * The brand site benchmark: does an agent building through Artbucket make a
 * site a designer would be proud of? Claude builds one brand per brief
 * (bench/brand/briefs/*.md) over MCP, with the playbook, exactly as a
 * person's agent would; every page is then drawn (GET .../preview) at desktop
 * and phone width, and a second Claude with eyes scores each site on a
 * rubric (bench/brand/rubric.md). Reference pictures (a raw single-file
 * build of the same brief, BENCH_REFERENCE=dir of {brief}.jpg) are scored
 * on the same rubric beside them: the bar the product is measured against.
 *
 *   pnpm dev                                          # or pnpm build && pnpm start
 *   ANTHROPIC_API_KEY=... pnpm bench:brand            # every brief
 *   pnpm bench:brand rust                             # one brief
 *   BENCH_KEEP=1 pnpm bench:brand                     # keep the brands to look at
 *
 * Needs the server's database (DATABASE_URL, from .env) for a key of its
 * own, as scripts/mcp-eval.ts does. Writes bench/brand/runs/{stamp}/ (the
 * pictures, every transcript, results.json) and rewrites
 * bench/brand/results.md, the table the docs cite. Spends money: a brief is
 * around forty model turns; the cost is printed at the end.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";
import postgres from "postgres";
import { z } from "zod";

const URL_ = process.env.ARTBUCKET_URL ?? "http://localhost:3000";
const MODEL = process.env.BENCH_MODEL ?? "claude-opus-5-5";
const JUDGE = process.env.BENCH_JUDGE ?? MODEL;
/** Turns a brief may take; a build that hasn't stopped by then is scored as it stands. */
const MAX_TURNS = Number(process.env.BENCH_TURNS ?? 60);
const ROOT = join(import.meta.dirname, "..", "bench", "brand");
/** Claude Opus 5.5, per MTok, for the cost line. */
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };

if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL to the server's database: the bench makes itself a key there.");
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const client = new Anthropic();

const run = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
const secret = `ab_${randomBytes(32).toString("base64url")}`;
const hash = createHash("sha256").update(secret).digest("hex");
const auth = { Authorization: `Bearer ${secret}` };

async function http<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${URL_}${path}`, { method, headers: { ...auth, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

let rpcId = 0;
async function rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const { result, error } = await http<{ result: T; error?: { message: string } }>("POST", "/api/v1/mcp", { jsonrpc: "2.0", id: ++rpcId, method, params });
  if (error) throw new Error(`${method}: ${error.message}`);
  return result;
}

type McpTool = { name: string; description: string; inputSchema: Anthropic.Tool.InputSchema };
type McpResult = { content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[]; isError?: boolean };

// ---- the build: Claude over MCP, as a person's agent would ---------------------

/** A tool's answer as Claude's tool_result: its text, and its picture when it drew one. */
const asResult = (r: McpResult): Anthropic.ToolResultBlockParam["content"] =>
  r.content.map((c) => (c.type === "image" ? { type: "image" as const, source: { type: "base64" as const, media_type: c.mimeType as "image/jpeg", data: c.data } } : { type: "text" as const, text: c.text }));

type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };
const add = (u: Usage, m: Anthropic.Message) => {
  u.input += m.usage.input_tokens;
  u.output += m.usage.output_tokens;
  u.cacheRead += m.usage.cache_read_input_tokens ?? 0;
  u.cacheWrite += m.usage.cache_creation_input_tokens ?? 0;
};
const cost = (u: Usage) => (u.input * PRICE.input + u.output * PRICE.output + u.cacheRead * PRICE.cacheRead + u.cacheWrite * PRICE.cacheWrite) / 1e6;

async function build(brand: string, brief: string, tools: Anthropic.Tool[], log: (line: string) => void) {
  const system =
    "You are a brand designer building a brand site in Artbucket over its MCP tools, for the person who wrote the brief below. " +
    "Read brand_playbook first and follow it. Work only in the brand named in the brief, which exists and is empty. " +
    "Build the whole site: rules, theme with a look, assets you can fetch, six to eight pages. After each page, read its warnings and fix them, then preview_page it and fix what looks wrong. " +
    "Do not publish and do not make a portal. When the site is done, stop and say in one line what you made.";
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: brief }];
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let calls = 0;
  let turns = 0;
  for (; turns < MAX_TURNS; turns++) {
    const message = await client.messages
      .stream({
        model: MODEL,
        max_tokens: 32000,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        tools,
        messages,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
      })
      .finalMessage();
    add(usage, message);
    messages.push({ role: "assistant", content: message.content });
    for (const b of message.content) if (b.type === "text" && b.text.trim()) log(`> ${b.text.trim()}`);
    if (message.stop_reason !== "tool_use") {
      if (message.stop_reason !== "end_turn") log(`stopped: ${message.stop_reason}`);
      break;
    }
    const uses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const results = await Promise.all(
      uses.map(async (u) => {
        calls++;
        const args = u.input as Record<string, unknown>;
        log(`  ${u.name}(${JSON.stringify(args).slice(0, 160)})`);
        const r = await rpc<McpResult>("tools/call", { name: u.name, arguments: args });
        if (r.isError) log(`    refused: ${r.content[0]?.type === "text" ? r.content[0].text.slice(0, 200) : ""}`);
        return { type: "tool_result" as const, tool_use_id: u.id, content: asResult(r), ...(r.isError && { is_error: true }) };
      }),
    );
    messages.push({ role: "user", content: results });
  }
  return { usage, calls, turns, done: turns < MAX_TURNS };
}

// ---- the pictures ---------------------------------------------------------------

type Shot = { page: string; width: "desktop" | "phone"; file: string };

async function shoot(brand: string, dir: string): Promise<Shot[]> {
  const { data: pages } = await http<{ data: { slug: string; hidden: boolean }[] }>("GET", `/api/v1/brands/${brand}/pages`);
  const shots: Shot[] = [];
  for (const p of pages.filter((p) => !p.hidden)) {
    for (const width of ["desktop", "phone"] as const) {
      const res = await fetch(`${URL_}/api/v1/brands/${brand}/pages/${encodeURIComponent(p.slug)}/preview?width=${width}`, { headers: auth });
      if (!res.ok) throw new Error(`preview ${p.slug} ${width}: ${res.status} ${await res.text()}`);
      const file = join(dir, `${p.slug}-${width}.jpg`);
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
      shots.push({ page: p.slug, width, file });
    }
  }
  return shots;
}

/** A reference page (a raw single-file build) drawn the same way, so the judge compares like with like. */
async function shootFile(html: string, dir: string, name: string): Promise<Shot[]> {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] } : { channel: "chrome" });
  const shots: Shot[] = [];
  try {
    for (const [width, px] of [["desktop", 1280], ["phone", 390]] as const) {
      const tab = await browser.newPage({ viewport: { width: px, height: 900 }, reducedMotion: "reduce" });
      await tab.goto(`file://${html}`, { waitUntil: "networkidle", timeout: 45_000 });
      await tab.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += 700) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
        window.scrollTo(0, 0);
        await document.fonts.ready;
      });
      const height = Math.min(10_000, await tab.evaluate(() => document.documentElement.scrollHeight));
      const file = join(dir, `${name}-${width}.jpg`);
      await writeFile(file, await tab.screenshot({ type: "jpeg", quality: 80, clip: { x: 0, y: 0, width: px, height }, fullPage: true }));
      await tab.close();
      shots.push({ page: name, width, file });
    }
  } finally {
    await browser.close();
  }
  return shots;
}

// ---- the judge --------------------------------------------------------------------

const CRITERIA = ["distinct", "hierarchy", "imagery", "rhythm", "copy", "mobile"] as const;
type Criterion = (typeof CRITERIA)[number];
const Score = z.object({
  scores: z.object(Object.fromEntries(CRITERIA.map((c) => [c, z.number().int().min(1).max(5)])) as Record<Criterion, z.ZodNumber>),
  verdict: z.string().describe("Two sentences: what works, what a designer would change first"),
});
type Scored = z.infer<typeof Score> & { mean: number };

/** The overview at both widths and up to three more pages at desktop width: what a visitor sees first, and whether it holds. */
function pick(shots: Shot[]): Shot[] {
  const first = shots.find((s) => s.width === "desktop")!.page;
  const opening = shots.filter((s) => s.page === first);
  const more = shots.filter((s) => s.page !== first && s.width === "desktop").slice(0, 3);
  return [...opening, ...more];
}

async function judge(rubric: string, brief: string, shots: Shot[]): Promise<Scored> {
  const content: Anthropic.ContentBlockParam[] = [{ type: "text", text: `The brief the site was built from:\n\n${brief}\n\nThe pages, as pictures:` }];
  for (const s of pick(shots)) {
    content.push({ type: "text", text: `${s.page} (${s.width})` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: (await readFile(s.file)).toString("base64") } });
  }
  content.push({ type: "text", text: "Score the site on the rubric. Be as hard as an art director reviewing a junior's work; a 5 is rare." });
  const res = await client.messages.parse({
    model: JUDGE,
    max_tokens: 4000,
    system: [{ type: "text", text: rubric, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(Score) },
  });
  const parsed = res.parsed_output;
  if (!parsed) throw new Error(`The judge answered no score: ${res.stop_reason}`);
  const mean = CRITERIA.reduce((n, c) => n + parsed.scores[c], 0) / CRITERIA.length;
  return { ...parsed, mean: Math.round(mean * 100) / 100 };
}

// ---- the run ----------------------------------------------------------------------

type Result = {
  brief: string;
  brand: string;
  pages: number;
  warnings: number;
  turns: number;
  calls: number;
  done: boolean;
  seconds: number;
  cost: number;
  scored: Scored;
  reference?: Scored;
};

function table(results: Result[]) {
  const head = ["Brief", ...CRITERIA, "Mean", "Reference", "Pages", "Warnings", "Turns", "Calls", "Min", "USD"];
  const rows = results.map((r) => [
    r.brief + (r.done ? "" : " (cut off)"),
    ...CRITERIA.map((c) => String(r.scored.scores[c])),
    r.scored.mean.toFixed(2),
    r.reference ? r.reference.mean.toFixed(2) : "-",
    String(r.pages),
    String(r.warnings),
    String(r.turns),
    String(r.calls),
    (r.seconds / 60).toFixed(1),
    r.cost.toFixed(2),
  ]);
  return [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}

const only = process.argv.slice(2);
const briefs = (await readdir(join(ROOT, "briefs"))).filter((f) => f.endsWith(".md") && (!only.length || only.includes(f.replace(/\.md$/, "")))).sort();
if (!briefs.length) throw new Error(`No brief${only.length ? ` named ${only.join(", ")}` : ""} in bench/brand/briefs`);
const rubric = await readFile(join(ROOT, "rubric.md"), "utf8");
const out = join(ROOT, "runs", run);
await mkdir(out, { recursive: true });

const [ws] = await sql<{ id: string }[]>`select id from projects order by created_at limit 1`;
if (!ws) throw new Error("No project yet: make the first account");
await sql`insert into api_keys (project_id, name, prefix, hash, scope) values (${ws.id}, ${`bench-brand-${run}`}, ${secret.slice(0, 10)}, ${hash}, 'write')`;
const made: string[] = [];
const results: Result[] = [];

try {
  const { tools: listed } = await rpc<{ tools: McpTool[] }>("tools/list", {});
  // What a person's agent has, less what the bench forbids: it never publishes or opens a door.
  const tools: Anthropic.Tool[] = listed
    .filter((t) => !["publish", "create_portal", "update_portal", "delete_brand", "delete_portal"].includes(t.name))
    .map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));

  for (const file of briefs) {
    const name = file.replace(/\.md$/, "");
    const brand = `bench-${name}-${run}`;
    const dir = join(out, name);
    await mkdir(dir, { recursive: true });
    const lines: string[] = [];
    const log = (line: string) => {
      lines.push(line);
      console.log(`${name}: ${line}`);
    };
    const brief = `${await readFile(join(ROOT, "briefs", file), "utf8")}\n\nThe brand's slug in Artbucket: ${brand}`;
    await http("POST", "/api/v1/brands", { name: name[0].toUpperCase() + name.slice(1), slug: brand });
    made.push(brand);
    const started = Date.now();
    const built = await build(brand, brief, tools, log);
    const seconds = Math.round((Date.now() - started) / 1000);
    await writeFile(join(dir, "transcript.txt"), lines.join("\n"));

    const { data: pages } = await http<{ data: { slug: string; hidden: boolean }[] }>("GET", `/api/v1/brands/${brand}/pages`);
    let warnings = 0;
    for (const p of pages) warnings += (await http<{ data: { warnings: string[] } }>("GET", `/api/v1/brands/${brand}/pages/${encodeURIComponent(p.slug)}`)).data.warnings.length;
    const shots = await shoot(brand, dir);
    log(`drawn ${shots.length} pictures; judging`);
    const scored = await judge(rubric, brief, shots);
    let reference: Scored | undefined;
    const ref = process.env.BENCH_REFERENCE && join(process.env.BENCH_REFERENCE, `${name}.html`);
    if (ref && (await readFile(ref).catch(() => null))) {
      reference = await judge(rubric, brief, await shootFile(ref, dir, "reference"));
    }
    results.push({ brief: name, brand, pages: pages.length, warnings, ...built, seconds, cost: cost(built.usage), scored, reference });
    log(`scored ${scored.mean}${reference ? ` (reference ${reference.mean})` : ""}: ${scored.verdict}`);
  }

  await writeFile(join(out, "results.json"), JSON.stringify(results, null, 2));
  const md = [
    "# Brand site benchmark",
    "",
    `Model ${MODEL}, judge ${JUDGE}, run ${run}. Each brief built over MCP with the playbook, every page drawn at desktop and phone width, scored 1 to 5 on bench/brand/rubric.md. Reference: a raw single-file build of the same brief, scored the same way.`,
    "",
    table(results),
    "",
    ...results.map((r) => `**${r.brief}**: ${r.scored.verdict}${r.reference ? ` Reference: ${r.reference.verdict}` : ""}`),
    "",
  ].join("\n");
  await writeFile(join(ROOT, "results.md"), md);
  console.log(`\n${table(results)}\n\ntotal USD ${results.reduce((n, r) => n + r.cost, 0).toFixed(2)}; pictures and transcripts in ${out}`);
} finally {
  const warn = (what: string) => (err: unknown) => console.error(`Could not ${what}: ${(err as Error).message}`);
  if (process.env.BENCH_KEEP) console.log(`kept ${made.join(", ")}`);
  else for (const b of made) await sql`delete from brands where project_id = ${ws.id} and slug = ${b}`.catch(warn(`delete brand ${b}`));
  await sql`delete from api_keys where hash = ${hash}`.catch(warn("delete the bench's key"));
  await sql.end();
}
