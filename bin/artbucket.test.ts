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
function cli(url: string, ...args: string[]): Promise<string> {
  const config = mkdtempSync(join(tmpdir(), "artbucket-cli-"));
  mkdirSync(join(config, "artbucket"));
  writeFileSync(join(config, "artbucket", "credentials.json"), JSON.stringify({ [url]: "ab_test", default: url }));
  const env: NodeJS.ProcessEnv = { ...process.env, XDG_CONFIG_HOME: config, ARTBUCKET_URL: url };
  delete env.ARTBUCKET_KEY;
  return new Promise((done) =>
    execFile(process.execPath, ["--experimental-strip-types", "--no-warnings", CLI, ...args], { env }, (_e, _out, err) => done(err)),
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
