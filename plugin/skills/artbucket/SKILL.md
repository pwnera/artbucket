---
name: artbucket
description: Use the brand's asset library (artbucket) whenever work touches the brand - making anything with its colors, logo, type or tone, finding or embedding an image, logo or font, generating an image with any model or design tool, or publishing an asset somewhere. Read the brand rules before making anything, file what you generate with its provenance, and check a use before it ships.
---

# artbucket

artbucket holds the brand: its assets (logos, photos, fonts, generated images) and its rules (colors,
logo use, type scale, tone), per context. Treat it as the source of truth. Never guess a hex code, a
font or which logo to use, and never work from a screenshot of the guidelines.

Two ways in, same tools:

- **MCP** (preferred): the `artbucket` server's tools below.
- **CLI**, when there is no MCP here: `artbucket <command>`, signed in with `artbucket login`
  (it opens the browser to approve a code; `ARTBUCKET_URL` picks the server). Add `--json` for
  output to parse. `artbucket --help` lists everything.

## The workflow

1. **Rules first.** Before making anything on-brand, read the rules for the context you are working in:
   `brand_rules({"context": "instagram-story"})` (CLI: `artbucket rules --context instagram-story`).
   Leave the context out for every rule. Each rule has a `value` and a `usage`: follow the usage too.
2. **Find, then describe.** `search_assets({"q": "logo"})`, then `describe_asset` on the one you
   pick: it says what it is, its rights, whether something replaced it, and the brand rules that
   point at it (CLI: `artbucket search logo`, `artbucket describe <id>`).
3. **Hand out URLs, not bytes.** `rendition_url({"id": ..., "width": 800, "format": "webp"})`
   returns a stable, cached URL for exactly that size (CLI: `artbucket url <id> --width 800 --format webp`).
   Renditions never upscale.
4. **Check before it ships.** Before an asset is published, sent or handed out, ask
   `check_use({"id": ..., "channel": "instagram", "territory": "FR", "context": "dark-background"})`
   (CLI: `artbucket check <id> --channel instagram --territory FR --context dark-background`, which
   exits 1 when it may not). `allowed: false` comes with reasons and a `suggest`ion: use that instead,
   and tell the person why.
5. **What you add is a suggestion.** `ingest_asset` and `propose_tags` land in Review for a person
   to approve. `my_proposals` says what they decided and why. Don't treat a proposed asset as final.

## Filing what a model made

Anything generated (by you, or by a tool you called) goes in with its provenance, so people can
tell it from photography and see how it was made:

```
ingest_asset({
  "url": "https://.../image.png",
  "origin": "generated",
  "generator": "recraft-v3",
  "prompt": "Four line icons for ... in #1A2B3C on white",
  "parentAssetId": "<the library asset it started from, if any>"
})
```

CLI: `artbucket ingest ./image.png --origin generated --generator recraft-v3 --prompt "..."`.
A local file works with the CLI; the MCP tool takes a public http(s) URL.

## Generators and design tools (Canva, Adobe, Recraft, Ideogram, Krea, ChatGPT, Gemini)

These have their own MCP servers or live in the chat; they can't call artbucket. You carry things
between them:

1. `brand_rules` for the context: palette, type, logo rules, tone.
2. Put them in the generator's prompt as exact values: hex codes, font names, what never to do.
   If it takes a reference image, pass a `rendition_url` of the logo or a brand photo.
3. Ingest the result with `origin: "generated"`, the `generator`, and the prompt you used.
4. `check_use` it for where it will run before you say it's ready.

## Fonts

A brand rule may name a Google font that isn't in the library yet: `import_google_font({"family": "IBM Plex Sans"})`
adds every style, proposed like any upload.
