<div align="center">

# artbucket

**Agent-first, headless-by-design asset management.**

A brand knowledge graph with a blob store attached - not a blob store with tags.

[![CI](https://github.com/pwnera/artbucket/actions/workflows/ci.yml/badge.svg)](https://github.com/pwnera/artbucket/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

</div>

---

> **Status: v0.2, early.** Upload, content-addressed dedupe, on-the-fly
> renditions, metadata extraction and write-back, custom fields, collections,
> faceted search and saved searches. The API is not stable until v1.0.
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
- **MCP server as a first-class surface**, not a bolted-on integration. *(v0.4)*

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
| `POST` | `/api/v1/assets` | Promote a staged upload |
| `GET` | `/api/v1/assets/{id}` | Fetch one asset |
| `PATCH` | `/api/v1/assets/{id}` | Edit `tags`, `fields`, `title`, `description`, `creator`, `copyright` |
| `DELETE` | `/api/v1/assets/{id}` | Delete an asset |
| `GET` | `/api/v1/fields` | The custom field schema |
| `POST` | `/api/v1/fields` | Define a field |
| `PATCH` | `/api/v1/fields/{key}` | Change its label, options, required, position |
| `DELETE` | `/api/v1/fields/{key}` | Remove it, and every value stored under it |
| `GET` | `/api/v1/collections` | Collections, with member counts |
| `POST` | `/api/v1/collections` | Create one, with the `fields` its members inherit |
| `PATCH` | `/api/v1/collections/{id}` | Rename it or change its `fields` |
| `DELETE` | `/api/v1/collections/{id}` | Delete it; its assets stay |
| `POST` | `/api/v1/collections/{id}/assets` | `{ "add": [...], "remove": [...] }` |
| `GET` | `/api/v1/searches` | Saved searches |
| `POST` | `/api/v1/searches` | Save a `{ name, query }` |
| `DELETE` | `/api/v1/searches/{id}` | Forget one |
| `GET` | `/a/{id}[/{transform}]` | Original or rendition bytes |
| `GET` | `/a/{id}?download` | The original with current metadata written in |

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

### Your metadata, in your files

`/a/{id}` is always the exact bytes you uploaded. `/a/{id}?download` is the same
file with the library's title, description, creator, copyright and tags written
in as XMP, spliced in without re-encoding a pixel. JPEG and PNG today; other
formats download as stored, and `X-Metadata-Embedded: false` says so.

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

## Stack

Next.js 16 · React 19 · Postgres + Drizzle · S3-compatible storage · sharp ·
Tailwind 4 · DM Sans.

No monorepo, no job queue, no Redis, no search cluster. Renditions are pure
functions, so generate-on-first-request plus a cache removes the entire job
system. Things get added when something measurably hurts - see the deferred
list in [ROADMAP.md](ROADMAP.md).

## Design

The interface is stock [shadcn/ui](https://ui.shadcn.com) (new-york, neutral)
with [Tabler icons](https://tabler.io/icons) and Geist. The mark is Tabler's
bucket. Restyle through the tokens in `src/app/globals.css`, not per component.

Every component in use is on the living reference at `/design`.

## Contributing

Issues and PRs welcome - read [CONTRIBUTING.md](CONTRIBUTING.md) first. The
roadmap is opinionated on purpose; if you want to build something on it, open an
issue before writing the code.

## License

[AGPL-3.0](LICENSE). Run it, modify it, self-host it. If you offer it as a
network service, publish your changes.
