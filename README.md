<div align="center">

# artbucket

**Agent-first, headless-by-design asset management.**

A brand knowledge graph with a blob store attached - not a blob store with tags.

[![CI](https://github.com/pwnera/artbucket/actions/workflows/ci.yml/badge.svg)](https://github.com/pwnera/artbucket/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

</div>

---

> **Status: v0.4, early.** Upload, content-addressed dedupe, on-the-fly
> renditions, metadata extraction and write-back, custom fields, collections,
> faceted search, saved searches, scoped API keys, an OpenAPI spec, an MCP
> server and a CLI. The API is not stable until v1.0.
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
| `GET` | `/api/v1/assets` | List or search assets, with tag facet counts |
| `POST` | `/api/v1/assets` | Promote a staged upload (`token`), or ingest one from a `url` |
| `GET` | `/api/v1/assets/{id}` | Fetch one asset |
| `PATCH` | `/api/v1/assets/{id}` | Edit `tags`, `fields`, `title`, `description`, `creator`, `copyright`; review with `status`, `proposedTags` |
| `DELETE` | `/api/v1/assets/{id}` | Delete an asset |
| `POST` | `/api/v1/assets/{id}/proposed-tags` | Suggest tags, for a person to accept |
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
wait in `proposedTags`. `GET /api/v1/assets?review=true` lists everything
waiting, and so does Review in the sidebar. Approving is a plain `PATCH`:
`{"status":"active"}` for a file, moving a tag from `proposedTags` into `tags`
for a suggestion.

### Search

```
/api/v1/assets?q=fox her                   every word, as a prefix
/api/v1/assets?tag=mascot&tag=autumn       assets carrying every tag
```

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
not an empty result. Each response carries `facets`: tag counts, and value
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

### Your metadata, in your files

`/a/{id}` is always the exact bytes you uploaded. `/a/{id}?download` is the same
file with the library's title, description, creator, copyright and tags written
in as XMP, spliced in without re-encoding a pixel. JPEG and PNG today; other
formats download as stored, and `X-Metadata-Embedded: false` says so.

## Agents

`/api/v1/mcp` is an MCP server over Streamable HTTP, built on the same
`lib/core` as the REST API. Give an agent a `propose` key:

```bash
claude mcp add --transport http artbucket http://localhost:3000/api/v1/mcp \
  --header "Authorization: Bearer ab_..."
```

| Tool | Scope | |
|---|---|---|
| `search_assets` | read | Full text, tags, collections, field filters; its description lists your fields and collections |
| `describe_asset` | read | The same description as `/a/{id}` with `Accept: application/json` |
| `rendition_url` | read | A URL for a width, height, fit, format and quality; says when it would need to upscale |
| `ingest_asset` | propose | Fetch a public URL into the library, as `proposed` |
| `propose_tags` | propose | Suggest tags for a person to accept |

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

Every component in use is on the living reference at `/design`.

## Contributing

Issues and PRs welcome - read [CONTRIBUTING.md](CONTRIBUTING.md) first. The
roadmap is opinionated on purpose; if you want to build something on it, open an
issue before writing the code.

## License

[AGPL-3.0](LICENSE). Run it, modify it, self-host it. If you offer it as a
network service, publish your changes.
