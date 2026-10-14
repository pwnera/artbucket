import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

/**
 * The CLI as a person runs it, against a server that answers what the test
 * says: what it tells someone whose key from `login` can't do a thing.
 */

const CLI = join(import.meta.dirname, "artbucket.ts");

/** A server answering every request with `answer`, and the paths it was asked. */
async function server(answer: (req: IncomingMessage, res: ServerResponse) => void) {
  const asked: string[] = [];
  const s = createServer((req, res) => {
    asked.push(`${req.method} ${req.url}`);
    answer(req, res);
  });
  await new Promise<void>((done) => s.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  return { url, asked, close: () => new Promise((done) => s.close(done)) };
}

/** A 403 for a key's scope, as the API words it. */
const refuse = (message: string) => (_req: IncomingMessage, res: ServerResponse) => {
  res.writeHead(403, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: { code: "forbidden", message } }));
};

/** Runs the CLI with a key `login` saved for `url`, and no ARTBUCKET_KEY; answers what it printed on stderr. */
const cli = (url: string, ...args: string[]) => run(url, ...args).then((r) => r.err);

/** The same, answering stdout too. */
function run(url: string, ...args: string[]): Promise<{ out: string; err: string }> {
  const config = mkdtempSync(join(tmpdir(), "artbucket-cli-"));
  mkdirSync(join(config, "artbucket"));
  writeFileSync(join(config, "artbucket", "credentials.json"), JSON.stringify({ [url]: "ab_test", default: url }));
  const env: NodeJS.ProcessEnv = { ...process.env, XDG_CONFIG_HOME: config, ARTBUCKET_URL: url };
  delete env.ARTBUCKET_KEY;
  return new Promise((done) =>
    execFile(process.execPath, ["--experimental-strip-types", "--no-warnings", CLI, ...args], { env }, (_e, out, err) => done({ out, err })),
  );
}

test("a key from login refused admin is told signing in never gives it, not to log in again", async () => {
  const s = await server(refuse("This key's scope is write; this needs admin on the project"));
  try {
    const err = await cli(s.url, "keys", "create", "ci", "--scope", "write");
    assert.match(err, /this needs admin on the project\. Signing in never gives admin: use a key an admin makes in Connections \(API keys\), as ARTBUCKET_KEY/);
    assert.doesNotMatch(err, /Log in again/);
  } finally {
    await s.close();
  }
});

test("a server that already says where admin comes from isn't repeated", async () => {
  const s = await server(refuse("This key's scope is write; this needs admin on the project. Signing in never gives admin: use a key an admin makes in Connections (API keys)"));
  try {
    const err = await cli(s.url, "keys", "create", "ci", "--scope", "write");
    assert.equal(err.match(/never gives admin/g)?.length, 1);
    assert.match(err, /Connections \(API keys\), as ARTBUCKET_KEY/);
  } finally {
    await s.close();
  }
});

test("a key from login short of write is told to log in again with write", async () => {
  const s = await server(refuse("This key's scope is propose; this needs write on this asset"));
  try {
    const err = await cli(s.url, "approve", "00000000-0000-0000-0000-000000000000");
    assert.match(err, /Log in again with --scope write: artbucket login --scope write/);
  } finally {
    await s.close();
  }
});

test("login --scope admin refuses before signing in, and so does a scope login doesn't know", async () => {
  const s = await server(refuse("unreachable"));
  try {
    assert.match(await cli(s.url, "login", s.url, "--scope", "admin"), /Signing in never gives admin: use a key an admin makes in Connections \(API keys\), as ARTBUCKET_KEY/);
    assert.match(await cli(s.url, "login", s.url, "--scope", "owner"), /--scope is read, propose or write; got "owner"/);
    assert.deepEqual(s.asked, [], "no device flow started");
  } finally {
    await s.close();
  }
});

test("url names the link after the asset, in the format asked", async () => {
  const asset = { id: "00000000-0000-0000-0000-000000000000", filename: "IMG_2034.JPG", mime: "image/jpeg", metadata: { title: "Summer hero" }, probe: {} };
  const s = await server((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: asset }));
  });
  try {
    const at = `${s.url}/a/${asset.id}`;
    assert.equal((await run(s.url, "url", asset.id)).out.trim(), `${at}/summer-hero.jpg`);
    assert.equal((await run(s.url, "url", asset.id, "--width", "800", "--format", "webp")).out.trim(), `${at}/w_800,f_webp/summer-hero.webp`);
    assert.equal((await run(s.url, "url", asset.id, "--width", "800")).out.trim(), `${at}/w_800/summer-hero.jpg`);
  } finally {
    await s.close();
  }
});

test("site push hashes a Storybook's components' code into artbucket.site.json, beside what it already says", async () => {
  const src = mkdtempSync(join(tmpdir(), "artbucket-sb-src-"));
  writeFileSync(join(src, "button.tsx"), "export const Button = 1");
  const dist = mkdtempSync(join(tmpdir(), "artbucket-sb-"));
  writeFileSync(join(dist, "index.html"), "sb");
  writeFileSync(join(dist, "artbucket.site.json"), JSON.stringify({ brand: "acme" }));
  writeFileSync(
    join(dist, "index.json"),
    JSON.stringify({ v: 5, entries: { "ui-button--primary": { id: "ui-button--primary", title: "UI/Button", componentPath: join(src, "button.tsx"), importPath: join(src, "missing.stories.tsx") } } }),
  );
  let body = Buffer.alloc(0);
  const s = await server((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      if (req.method === "GET") return res.end(JSON.stringify({ data: [{ id: "s1", slug: "sb", url: "http://sb.example" }] }));
      body = Buffer.concat(chunks);
      res.end(JSON.stringify({ data: { path: "/", state: "live" } }));
    });
  });
  try {
    const { err } = await run(s.url, "site", "push", dist, "--site", "sb");
    assert.equal(err, "");
    const { unzip } = await import("../src/lib/zip.ts");
    const manifest = unzip(new Uint8Array(body)).find((e) => e.name === "artbucket.site.json")!;
    const m = JSON.parse(new TextDecoder().decode(await manifest.read()));
    assert.equal(m.brand, "acme");
    assert.match(m.fingerprints["ui-button"], /^[0-9a-f]{64}$/);
  } finally {
    await s.close();
  }
});

test("site scan finds the Storybook components a codebase imports, through tsconfig paths and relative imports, stories aside", async () => {
  const repo = mkdtempSync(join(tmpdir(), "artbucket-scan-"));
  mkdirSync(join(repo, "src", "ui"), { recursive: true });
  mkdirSync(join(repo, "src", "app"), { recursive: true });
  writeFileSync(join(repo, "tsconfig.json"), `{ // the app's\n "compilerOptions": { "paths": { "@/*": ["./src/*"] }, }, }`);
  writeFileSync(join(repo, "src", "ui", "button.tsx"), "export const Button = 1");
  writeFileSync(join(repo, "src", "ui", "button.stories.tsx"), 'import { Button } from "./button";');
  writeFileSync(join(repo, "src", "ui", "card.tsx"), "export const Card = 1");
  // A stories file of several, naming no component: it stands for what it imports from its folder, but Button, documented on its own.
  writeFileSync(join(repo, "src", "ui", "chip.tsx"), "export const Chip = 1");
  writeFileSync(join(repo, "src", "ui", "bits.stories.tsx"), 'import { Chip } from "./chip";\nimport { Button } from "./button";');
  writeFileSync(join(repo, "src", "app", "tags.tsx"), 'import { Chip } from "@/ui/chip";');
  // Through packages: one asked for, one not (said on stderr), one whose names are no component (left alone).
  writeFileSync(join(repo, "src", "app", "shop.tsx"), 'import { Card as Tile, type CardProps } from "@acme/ui";\nimport Button from "@other/kit/button";\nimport { useState } from "react";');
  writeFileSync(join(repo, "src", "app", "page.tsx"), 'import { Button } from "@/ui/button";\nexport default () => null;');
  writeFileSync(join(repo, "src", "app", "other.tsx"), 'const B = await import("../ui/button");');
  const button = { address: "acme/web/site/ui/component/ui-button", name: "Button", version: 2, files: ["./src/ui/button.stories.tsx", "./src/ui/button.tsx"] };
  const card = { address: "acme/web/site/ui/component/ui-card", name: "Card", version: 1, files: ["./src/ui/card.tsx"] };
  const bits = { address: "acme/web/site/ui/component/ui-bits", name: "Bits", version: 1, files: ["./src/ui/bits.stories.tsx"] };
  let body = Buffer.alloc(0);
  const s = await server((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      if (req.url === "/api/v1/sites") return res.end(JSON.stringify({ data: [{ id: "s1", slug: "app", kind: "external" }] }));
      if (req.url === "/api/v1/components") return res.end(JSON.stringify({ data: [bits, button, card] }));
      body = Buffer.concat(chunks);
      res.end(JSON.stringify({ data: { files: 6, uses: [], problems: [] } }));
    });
  });
  try {
    const config = mkdtempSync(join(tmpdir(), "artbucket-cli-"));
    const env: NodeJS.ProcessEnv = { ...process.env, XDG_CONFIG_HOME: config, ARTBUCKET_URL: s.url, ARTBUCKET_KEY: "ab_test" };
    const { out, err } = await new Promise<{ out: string; err: string }>((done) =>
      execFile(process.execPath, ["--experimental-strip-types", "--no-warnings", CLI, "site", "scan", "src", "--site", "app", "--packages", "@acme/ui"], { env, cwd: repo }, (_e, o, e) => done({ out: o, err: e })),
    );
    assert.equal(err, "! @other/kit brings in Button (1 file) and isn't followed. If it is your design system, scan it too: --packages @other/kit\n");
    assert.match(out, /Recorded for app: 6 files, 0 assets of the library, 3 components\n/);
    assert.match(out, / {2}Card +app\/shop\.tsx\n/);
    assert.match(out, / {2}Button +app\/(page|other)\.tsx and 1 more\n/);
    assert.match(out, / {2}Bits +app\/tags\.tsx\n/);
    const { unzip } = await import("../src/lib/zip.ts");
    const manifest = unzip(new Uint8Array(body)).find((e) => e.name === "artbucket.site.json")!;
    const m = JSON.parse(new TextDecoder().decode(await manifest.read()));
    const named = new Map(m.components.map((c: { component: string; fingerprint: string }) => [c.component, c.fingerprint]));
    assert.deepEqual([...named.keys()].sort(), [bits.address, button.address, card.address]);
    assert.match(named.get(button.address) as string, /^[0-9a-f]{64}$/);
  } finally {
    await s.close();
  }
});
