/**
 * The frozen v1 contract (lib/contract.ts), kept in contract/.
 *
 *   pnpm contract:freeze          # take in what was added; refuses a break
 *   pnpm contract:freeze --break  # take in a break too: only while decision 0017 sets the freeze aside
 *   pnpm contract:check [dir]     # the current API against a frozen copy, e.g. the base branch's
 *
 * A break taken in is written to contract/breaks.txt, so the check against
 * the base branch (CI) passes for exactly the breaks declared there and no
 * other: a pull request that breaks v1 says so in its diff.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { apiBreaks, toolBreaks } from "../src/lib/contract.ts";
import { toolSchemas } from "../src/lib/mcp-tools.ts";
import { DOCS_SERVER, openapi } from "../src/lib/openapi.ts";

const args = process.argv.slice(2);
const allowBreak = args.includes("--break");
const [cmd = "check", dir = join(import.meta.dirname, "..", "contract")] = args.filter((a) => a !== "--break");
const files = { api: join(dir, "api-v1.json"), mcp: join(dir, "mcp-v1.json") };
const current = {
  api: JSON.parse(JSON.stringify(openapi(DOCS_SERVER).paths)),
  mcp: JSON.parse(JSON.stringify(toolSchemas())),
};
const read = (f: string) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null);
const frozen = { api: read(files.api), mcp: read(files.mcp) };

const own = join(import.meta.dirname, "..", "contract", "breaks.txt");
const declared = new Set(existsSync(own) ? readFileSync(own, "utf8").split("\n").filter((l) => l && !l.startsWith("#")) : []);
const found = [
  ...(frozen.api ? apiBreaks(frozen.api, current.api) : []),
  ...(frozen.mcp ? toolBreaks(frozen.mcp, current.mcp) : []),
];
const breaks = cmd === "check" ? found.filter((b) => !declared.has(b)) : found;
if (breaks.length && !(cmd === "freeze" && allowBreak)) {
  console.error(`Breaks the v1 contract in ${dir}:\n${breaks.map((b) => `  - ${b}`).join("\n")}\nA break waits for v2: add alongside instead, and deprecate.`);
  process.exit(1);
}
if (cmd === "freeze") {
  if (breaks.length) {
    const head = "# Breaks of v1 taken in on purpose (pnpm contract:freeze --break), while decision 0017 sets the freeze aside.\n";
    writeFileSync(own, head + [...new Set([...declared, ...breaks])].join("\n") + "\n");
  }
  writeFileSync(files.api, JSON.stringify(current.api, null, 2) + "\n");
  writeFileSync(files.mcp, JSON.stringify(current.mcp, null, 2) + "\n");
  console.log(`Frozen: ${Object.keys(current.api).length} paths, ${Object.keys(current.mcp).length} tools`);
} else {
  console.log("The v1 contract holds");
}
