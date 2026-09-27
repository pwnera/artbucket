<div align="center">

# artbucket

**Agent-first, headless-by-design asset management.**

A brand knowledge graph with a blob store attached - not a blob store with tags.

[![CI](https://github.com/pwnera/artbucket/actions/workflows/ci.yml/badge.svg)](https://github.com/pwnera/artbucket/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

</div>

---

> **Status: v0.5, early.** Upload, content-addressed dedupe, on-the-fly
> renditions, metadata extraction and write-back, custom fields, collections,
> faceted search, saved searches, scoped API keys, an OpenAPI spec, an MCP
> server, a CLI, and brand rules as queryable data. The API is not stable until v1.0.
> See [ROADMAP.md](ROADMAP.md).

## Why

Commercial DAM costs $25k–$50k a year, is quoted only by sales, and charges per
seat - so every contractor and agency partner raises the bill. The open-source
alternatives are all a decade old.

Meanwhile AI changed what the job is. Finding files is a solved, commoditized
problem. The hard part now is **authority**: which logo is current, which photo
is still licensed for paid social in Germany, what the brand's actual rules are.
No agent can infer that from pixels. It has to be written down and served.

So artbucket is built API-first for agents as much as people:

- **Renditions are pure functions of a URL.** `/a/{id}/w_1200,f_webp`. No export
  step, no download button, no prior round trip.
- **The UI is a client of the public API.** Zero private endpoints. If the web
  app needs something the API can't do, the API isn't finished.
- **Content-addressed storage.** Upload the same bytes twice, get one asset.
- **Your metadata stays yours.** IPTC/XMP written back into the file on
  download, so leaving costs nothing.
- **MCP server as a first-class surface**, not a bolted-on integration. Agents
  search, describe, size and ingest; what they add waits for a person.

## Quick start

Requires Node 22+, pnpm, and Docker.

```bash
git clone https://github.com/pwnera/artbucket.git
cd artbucket
pnpm install
cp .env.example .env
docker compose up -d      # postgres + S3-compatible storage
pnpm db:migrate
pnpm dev
```

Open http://localhost:3000 and drop in a file.

## Using it

```bash
# 1. Get a presigned upload URL - bytes never touch the app server
curl -X POST localhost:3000/api/v1/uploads \
  -H 'content-type: application/json' \
  -d '{"filename":"hero.png","mime":"image/png","size":20135}'

# 2. PUT the file straight to storage using the returned uploadUrl

# 3. Promote it to an asset (idempotent - identical bytes dedupe)
curl -X POST localhost:3000/api/v1/assets \
  -H 'content-type: application/json' \
  -d '{"token":"<token>","filename":"hero.png","mime":"image/png"}'
```

Then build any rendition URL you like, no API call needed:

```
/a/{id}                                    original
/a/{id}/w_800,f_webp                       800px wide, WebP
/a/{id}/w_1200,h_630,fit_cover,q_82,f_jpeg OG image
```

Transforms: `w` `h` (1–8000), `fit` (cover, contain, inside, outside, fill),
`q` (1–100), `f` (jpeg, png, webp, avif). Key order doesn't matter - the cache
key is canonical. Renditions are generated once and cached forever.

## API

| Method | Path | |
|---|---|---|
| `POST` | `/api/v1/uploads` | Create a presigned upload ticket |
| `GET` | `/api/v1/assets` | List or search assets, with tag facet counts and the `total` |
| `POST` | `/api/v1/assets` | Promote a staged upload (`token`), or ingest one from a `url` |
| `GET` | `/api/v1/assets/{id}` | Fetch one asset |
| `PATCH` | `/api/v1/assets/{id}` | Edit `tags`, `fields`, `title`, `description`, `creator`, `copyright`; review with `status`, `reviewNote`, `proposedTags` |
| `DELETE` | `/api/v1/assets/{id}` | Delete an asset |
| `POST` | `/api/v1/assets/{id}/proposed-tags` | Suggest tags, for a person to accept |
| `GET` | `/api/v1/brand/tokens` | The brand as design tokens: `format=css` (custom properties, `@font-face`) or `json` (W3C DTCG) |
| `GET` | `/api/v1/fonts/google` | Search the Google Fonts catalog: `q`, `category` |
| `POST` | `/api/v1/fonts/google` | Import a Google Fonts `family`, one asset per style |
| `GET` | `/api/v1/fields` | The custom field schema |
| `POST` | `/api/v1/fields` | Define a field |
| `PATCH` | `/api/v1/fields/{key}` | Change its label, options, required, position |
| `DELETE` | `/api/v1/fields/{key}` | Remove it, and every value stored under it |
| `GET` | `/api/v1/collections` | Collections, with member counts |
| `POST` | `/api/v1/collections` | Create one, with an `icon` and the `fields` its members inherit |
| `PATCH` | `/api/v1/collections/{id}` | Rename it, change its `icon` or its `fields` |
| `DELETE` | `/api/v1/collections/{id}` | Delete it; its assets stay |
| `POST` | `/api/v1/collections/{id}/assets` | `{ "add": [...], "remove": [...] }` |
| `GET` | `/api/v1/searches` | Saved searches |
| `POST` | `/api/v1/searches` | Save a `{ name, query }` |
| `DELETE` | `/api/v1/searches/{id}` | Forget one |
| `GET` | `/api/v1/brand/rules` | Brand rules; `?context=` resolves one per key, `?asset=` only those pointing at it |
| `POST` | `/api/v1/brand/rules` | Add a `{ key, context, type, value, usage, assets }` rule |
| `PUT` | `/api/v1/brand/rules/order` | `{ "keys": [...] }` in page order |
| `PATCH` | `/api/v1/brand/rules/{id}` | Change its `value`, `usage` or `context` |
| `DELETE` | `/api/v1/brand/rules/{id}` | Delete one |
| `GET` | `/api/v1/brands` | Brands, the default first |
| `POST` | `/api/v1/brands` | Make one, empty or `from` another |
| `PATCH` | `/api/v1/brands/{slug}` | Rename it, or `{ "default": true }` |
| `DELETE` | `/api/v1/brands/{slug}` | Delete it with its rules and history; not the default |
| `GET` | `/api/v1/brands/{slug}/versions` | Its history, newest first |
| `GET` | `/api/v1/brands/{slug}/versions/{n}` | A version's rules and diff; `?against=` a number or `current` |
| `PATCH` | `/api/v1/brands/{slug}/versions/{n}` | `{ name }` keeps it as a checkpoint |
| `POST` | `/api/v1/brands/{slug}/versions/{n}/restore` | Put it back, as a new version |
| `GET` | `/api/v1/activity` | Who did what, newest first: asset events and brand rule changes; page with `before` |
| `GET` | `/api/v1/keys` | API keys, without their secrets |
| `POST` | `/api/v1/keys` | Mint a `{ name, scope }` key; the secret is in this response only |
| `DELETE` | `/api/v1/keys/{id}` | Revoke one |
| `POST` | `/api/v1/mcp` | The MCP server |
| `GET` | `/api/v1/openapi.json` | This table, as OpenAPI 3.1 |
| `GET` | `/a/{id}[/{transform}]` | Original or rendition bytes |
| `GET` | `/a/{id}` with `Accept: application/json` | The asset's description |
| `GET` | `/a/{id}?download` | The original with current metadata written in |

The spec at `/api/v1/openapi.json` is generated from the Zod schemas the
handlers validate with, and a test fails if a route exists that it doesn't
describe. The web UI calls nothing outside this table.

### Keys and scopes

Send `Authorization: Bearer ab_...`. A key has one scope, and each includes
the ones before it:

| Scope | May |
|---|---|
| `read` | search, list, describe |
| `propose` | upload and suggest tags; what it adds lands `proposed` |
| `write` | edit, delete, approve, and manage collections, fields, searches |
| `admin` | mint and revoke keys |

A request without a key gets `ANONYMOUS_SCOPE`, which defaults to `admin`: a
single user on localhost needs no key at all. Before exposing the app, mint
the keys you need, then set `ANONYMOUS_SCOPE=read` (or `none`). An unknown or
revoked key is a `401`, never a fallback to anonymous. Rendition bytes stay
public, so they can be embedded anywhere; the web UI has no login until v0.7
and runs as anonymous.

```bash
curl -X POST localhost:3000/api/v1/keys -H 'content-type: application/json' \
  -d '{"name":"claude","scope":"propose"}'
```

### Review

What a `propose` key adds is not final. An upload lands with
`status: "proposed"` and stays out of the library and search; suggested tags
wait in `proposedTags`. Each proposal records who made it (`proposedBy`, the
key's name). `GET /api/v1/assets?review=true` lists everything waiting, and so
does the Review tab, whose count also shows on Assets in the sidebar. A proposal may leave required fields
empty; the person approving fills them in.

Approving is a plain `PATCH`: `{"status":"active"}` for a file (a `422` names
any required field still empty), moving a tag from `proposedTags` into `tags`
for a suggestion. Rejecting is `{"status":"rejected","reviewNote":"..."}`: the
file is kept, out of the library and the queue, so the agent that proposed it
can read why (MCP `my_proposals`) and do better next time. Review lists
what waits as a table, with who suggested it and when; approve or reject a
row in place, or a whole selection at once.

Every addition, suggestion, decision and deletion, and every brand rule
change, is on the Activity tab and at `GET /api/v1/activity`, by actor: an
API key's name, or `web` for the app. Press ⌘K anywhere to find an asset, a
brand rule, a collection or a saved search, or to jump to any page.

### Search

```
/api/v1/assets?q=fox her                   every word, as a prefix
/api/v1/assets?tag=mascot&tag=autumn       assets carrying every tag
/api/v1/assets?collection=Autumn 26        a collection, by id or by name
```

A page is 100 assets (`limit`, up to 200); `total` counts every match, so
page with `offset` until you reach it.

`q` covers the filename, tags, text field values, and the EXIF / IPTC / XMP
read on ingest (title, caption, creator, copyright, camera). Embedded keywords
become the asset's initial tags.

Custom fields filter with `f.`, matching an asset's own value or else the one
it inherits:

```
/api/v1/assets?f.channel=web&f.channel=print   either value
/api/v1/assets?f.approved=true                 booleans
/api/v1/assets?f.budget.gte=10&f.expires.lte=2027-01-31
```

A filter on an unknown field or with a value of the wrong type is a `422`,
not an empty result, and its message lists the fields there are. Each response carries `facets`: tag counts, and value
counts for every select and boolean field, over the same filter. A field's own
facet ignores that field's filter, so the other values stay visible to OR in.

A saved search is a name and one of these query strings, checked when saved.
Running it is a plain `GET /api/v1/assets?{query}`.

On a library of 1,000+ assets every query above answers in under 20ms end to
end, facets included.

### Custom fields

A library defines its own fields, and required ones must be filled at upload:

```bash
curl -X POST localhost:3000/api/v1/fields -H 'content-type: application/json' \
  -d '{"key":"campaign","label":"Campaign","type":"text","required":true}'
```

Types are `text`, `number`, `date` (`YYYY-MM-DD`), `boolean` and `select`
(with `options`). `key` and `type` are fixed once created. Values go in
`fields` when an asset is promoted or patched; a missing required value, a
wrong type or an unknown key is a `422` naming the field, and the staged upload
stays put so the same token can be retried. Text values are searchable.

### Collections

A collection groups assets and can carry field values its members inherit:
file 200 photos into "Autumn 26" and they all read `campaign: Autumn 26`
without anyone typing it 200 times. An asset's own value always wins; across
several collections, the oldest collection wins. Inherited values are
searchable, and they count toward required fields, so an upload aimed at a
collection (`"collections": [id]` on promote) needs only what the collection
doesn't already say. Filter with `/api/v1/assets?collection={id}`.

### Describe an asset

The asset URL answers JSON when asked for it:

```bash
curl -H 'Accept: application/json' localhost:3000/a/{id}
```

It returns what a client needs to decide whether and how to use the asset:
title, credit, tags, effective field values, its URLs, the transforms it
allows (`constraints`), and ready-made rendition URLs (`alternatives`).
`rights` is `null` until v0.6 brings licenses and expiry. Browsers still get
the bytes: only an explicit `application/json` switches it.

### The brand, as data

Brand rules are records, not a PDF: a dotted key, a typed value (`color`,
`text`, `number`, `list` or `font`), a sentence on how to use it, and the assets it
points at (the logo it governs, examples; for a `font`, the family's files). [`/brand`](http://localhost:3000/brand)
(Guidelines, in the sidebar) is the guidelines, drawn from those records and edited in place: click any
value to change it, click a rule's title to rename it, press `/` to add a rule
from a searchable menu of named building blocks (brand color, clear space,
logo don'ts, type scale, words to avoid...) without knowing its key, drag a rule's handle to move it,
and use Assets or Variant on a rule (shown on hover) to attach assets or add a
variant for one context. An
attached asset can name a rendition (`w_512,f_png`, or a standard size like
Open Graph): agents then get that exact URL, not the original. Colors
show their RGB, HSL and WCAG contrast on white and black; a numeric `type.scale`
renders as a specimen; lists named like `neverDo` or `avoid` read as don'ts.
An asset's dialog lists the rules that point at it.

#### Brands and history

A library can hold several brands, each with its own rules; one is the
default, which is what `/brand` and an unqualified `/api/v1/brand/rules` mean.
Name another with `?brand={slug}`. Brands are made, renamed, copied and
promoted from the sidebar or `/api/v1/brands`.

Every change to a brand's rules is kept, as in a shared doc: edits close
together by the same person or key are one version, a named version is a
checkpoint, and History shows what changed in each version (or between it and
now) and restores any of them. A restore is itself a new version, so it can be
undone the same way.

```bash
curl localhost:3000/api/v1/brands/default/versions
curl 'localhost:3000/api/v1/brands/default/versions/3?against=current'
curl -X POST localhost:3000/api/v1/brands/default/versions/3/restore
pnpm artbucket history --brand default
```

```bash
pnpm artbucket rules set color.primary '#34a853' --type color --usage "Buttons, links, the mark's tile"
pnpm artbucket rules set color.primary '#5bc27a' --type color --context dark-background
curl 'localhost:3000/api/v1/brand/rules?context=dark-background'
```

A rule can be scoped to a context. Asking for one returns one rule per key:
the context's own where it has one, the default otherwise.

### Your metadata, in your files

`/a/{id}` is always the exact bytes you uploaded. `/a/{id}?download` is the same
file with the library's title, description, creator, copyright and tags written
in as XMP, spliced in without re-encoding a pixel. JPEG and PNG today; other
formats download as stored, and `X-Metadata-Embedded: false` says so.

## Agents

`/api/v1/mcp` is an MCP server over Streamable HTTP, built on the same
`lib/core` as the REST API. [`/agents`](http://localhost:3000/agents) makes a
key and prints the command with it filled in, for Claude Code, Cursor or any
MCP client. By hand, give an agent a `propose` key:

```bash
claude mcp add --transport http artbucket http://localhost:3000/api/v1/mcp \
  --header "Authorization: Bearer ab_..."
```

| Tool | Scope | |
|---|---|---|
| `search_assets` | read | Full text, tags, collections (by name), field filters, and the `total`; its description lists your fields and collections |
| `describe_asset` | read | The same description as `/a/{id}` with `Accept: application/json`, plus the brand rules that point at it |
| `rendition_url` | read | A URL for a width, height, fit, format and quality; says when it would need to upscale |
| `ingest_asset` | propose | Fetch a public URL into the library, as `proposed` |
| `import_google_font` | propose | A Google Fonts family, one file per style, as `proposed` |
| `propose_tags` | propose | Suggest tags for a person to accept |
| `my_proposals` | propose | What this key proposed and what became of it: approved, waiting, or rejected with the person's reason |
| `brand_rules` | read | A brand's rules for a context, each asset with its title, type and size; its description lists the brands and their contexts |

Brand rules are also MCP resources: `artbucket://brand/rules` for the default
brand, `artbucket://brands/{slug}/rules` for any other, and `/{context}` on
either for one context.

`tools/list` shows a key only the tools its scope can run. `ingest_asset` and
`POST /api/v1/assets` with a `url` fetch public addresses only: loopback,
private and link-local ranges are refused, checked at connect time, on every
redirect.

## CLI

`bin/artbucket.ts` is a thin client over the same API.

```bash
pnpm artbucket search sintel poster
pnpm artbucket url {id} --width 1200 --format webp
pnpm artbucket ingest ./hero.png https://example.com/logo.png --tag launch
pnpm artbucket review
pnpm artbucket approve {id}
pnpm artbucket reject {id} --reason "off-brand colors"
pnpm artbucket rules --context instagram-story
pnpm artbucket keys create claude --scope propose
```

It reads `ARTBUCKET_URL` (default `http://localhost:3000`) and `ARTBUCKET_KEY`,
and `--json` prints raw responses. `pnpm link --global` puts `artbucket` on
your path.

## Configuration

Copy `.env.example` to `.env`. Any S3-compatible storage works - AWS S3,
Cloudflare R2, Backblaze B2, MinIO, Garage, SeaweedFS.

| Variable | |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `S3_ENDPOINT` `S3_REGION` `S3_BUCKET` | Storage location |
| `S3_ACCESS_KEY_ID` `S3_SECRET_ACCESS_KEY` | Storage credentials |
| `S3_FORCE_PATH_STYLE` | `true` for most non-AWS providers |
| `APP_URL` | Public origin; also the CORS origin for browser uploads |
| `ANONYMOUS_SCOPE` | What a request without a key may do: `none`, `read`, `propose`, `write`, `admin` (default) |

## Stack

Next.js 16 · React 19 · Postgres + Drizzle · S3-compatible storage · sharp ·
Tailwind 4 · DM Sans.

No monorepo, no job queue, no Redis, no search cluster. Renditions are pure
functions, so generate-on-first-request plus a cache removes the entire job
system. Things get added when something measurably hurts - see the deferred
list in [ROADMAP.md](ROADMAP.md).

## Design

The interface is stock [shadcn/ui](https://ui.shadcn.com) (new-york, neutral)
with Google green (#34A853) as the primary, [Tabler icons](https://tabler.io/icons)
and DM Sans. The mark is Tabler's tipped paint bucket. Restyle through the
tokens in `src/app/globals.css`, not per component.

Every component in use is on the living reference at `/design`, served while
developing (`pnpm dev`) and not in production.

## Contributing

Issues and PRs welcome - read [CONTRIBUTING.md](CONTRIBUTING.md) first. The
roadmap is opinionated on purpose; if you want to build something on it, open an
issue before writing the code.

## License

[AGPL-3.0](LICENSE). Run it, modify it, self-host it. If you offer it as a
network service, publish your changes.
