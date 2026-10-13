// The npm package is bin/artbucket.ts as JS: Node won't strip types under
// node_modules. Types become spaces, so a stack trace's lines still match.
import { copyFileSync, cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

const at = (path) => new URL(path, import.meta.url);
const source = readFileSync(at("../bin/artbucket.ts"), "utf8").replace(/^#!.*/, "#!/usr/bin/env node");
writeFileSync(at("artbucket.js"), stripTypeScriptTypes(source), { mode: 0o755 });
copyFileSync(at("../LICENSE"), at("LICENSE"));
// The starters `site new` copies (MIT-0, their own LICENSE), beside artbucket.js.
rmSync(at("starters"), { recursive: true, force: true });
cpSync(at("../starters"), at("starters"), { recursive: true });
