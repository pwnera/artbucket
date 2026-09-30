import assert from "node:assert/strict";
import { test } from "node:test";
import { brandJsonUrlIn, CHECK_WEIGHTS, domainOf, mcpUrlIn, rulesOf, scoreFound, tokensIn } from "./agent-score.ts";

const NOTHING = { domain: "example.com", llms: null, brandJson: null, listing: null, mcp: null };

test("the checks weigh 100, the shared ones as the app's score weighs them", () => {
  assert.equal(Object.values(CHECK_WEIGHTS).reduce((a, b) => a + b, 0), 100);
  assert.equal(CHECK_WEIGHTS.logo, 20);
});

test("a domain with nothing for agents scores 0, and every check says what raises it", () => {
  const r = scoreFound(NOTHING);
  assert.equal(r.score, 0);
  assert.ok(r.checks.every((c) => !c.done && c.detail.length > 0));
});

test("a verified BrandHub listing counts its rules, tokens and machine-readable rules", () => {
  const rules = [
    { key: "color.primary", type: "color" },
    { key: "type.body", type: "font" },
    { key: "logo.primary", type: "text", assets: [{}] },
    { key: "tone.voice", type: "text" },
  ];
  const r = scoreFound({ ...NOTHING, listing: { url: "https://hub.example/acme/acme", name: "Acme", rules } });
  const done = new Set(r.checks.filter((c) => c.done).map((c) => c.id));
  assert.deepEqual([...done].sort(), ["colors", "logo", "rules", "tokens", "type", "voice"]);
  assert.equal(r.score, 85);
});

test("an llms.txt alone counts for itself and for what it says in words, and names its MCP server", () => {
  const llms = "# Acme\n\nPrimary color #ff5500. Our typeface is Inter. Voice: plain.\n\n- Logo: https://acme.com/logo.svg\n- MCP: https://acme.com/api/mcp\n- Tokens: https://acme.com/tokens.json";
  const r = scoreFound({ ...NOTHING, llms, mcp: { url: mcpUrlIn(llms)!, reachable: true } });
  assert.equal(mcpUrlIn(llms), "https://acme.com/api/mcp");
  assert.equal(r.checks.find((c) => c.id === "rules")!.done, false);
  assert.equal(r.score, 100 - CHECK_WEIGHTS.rules);
});

test("rules found override words: a brand.json without a logo file doesn't get one from its llms.txt", () => {
  const r = scoreFound({ ...NOTHING, llms: "logo https://a.com/logo.svg", brandJson: { url: "https://a.com/brand.json", rules: [{ key: "logo.primary", type: "text" }] } });
  assert.equal(r.checks.find((c) => c.id === "logo")!.done, false);
});

test("links, brand.json and rules are read leniently, and junk is nothing", () => {
  assert.equal(brandJsonUrlIn("- As JSON: https://hub.artbucket.io/rust-lang/rust/brand.json."), "https://hub.artbucket.io/rust-lang/rust/brand.json");
  assert.equal(tokensIn("https://hub.artbucket.io/x/y/tokens?format=css"), true);
  assert.equal(mcpUrlIn("see https://mcp.acme.com/sse"), "https://mcp.acme.com/sse");
  assert.equal(mcpUrlIn("https://acme.com/mcpx"), null);
  assert.deepEqual(rulesOf({ data: { rules: [{ key: "a", type: "color" }, { nope: 1 }] } }), [{ key: "a", type: "color" }]);
  for (const junk of [null, 3, { rules: "x" }, { rules: [] }, {}]) assert.equal(rulesOf(junk), null);
  // An AdCP brand.json stands for its colors, fonts, logos with a file, and voice.
  const adcp = rulesOf({ id: "acme", colors: { primary: "#ff0000" }, fonts: { primary: "Inter" }, logos: [{ url: "https://a/l.svg" }, { variant: "icon" }], tone: { voice: "Plain" } });
  assert.deepEqual(adcp?.map((r) => r.key), ["color.primary", "type.primary", "logo.0", "tone.voice"]);
  assert.deepEqual(scoreFound({ ...NOTHING, brandJson: { url: "https://a/.well-known/brand.json", rules: adcp! } }).checks.filter((c) => c.done).map((c) => c.id).sort(), ["colors", "logo", "rules", "type", "voice"]);
});

test("domainOf takes a domain or a URL and refuses the rest", () => {
  assert.equal(domainOf("https://www.Rust-Lang.org/learn"), "rust-lang.org");
  assert.equal(domainOf("mozilla.org"), "mozilla.org");
  for (const bad of ["", "localhost", "127.0.0.1", "http://[::1]/", "not a domain", "a..b"]) assert.equal(domainOf(bad), null, bad);
});
