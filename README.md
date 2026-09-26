<div align="center">

# artbucket

**Agent-first, headless-by-design asset management.**

A brand knowledge graph with a blob store attached — not a blob store with tags.

[![CI](https://github.com/pwnera/artbucket/actions/workflows/ci.yml/badge.svg)](https://github.com/pwnera/artbucket/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

</div>

---

> **Status: v0.1, early.** The walking skeleton works — upload, content-addressed
> dedupe, and on-the-fly renditions. The API is not stable until v1.0.
> See [ROADMAP.md](ROADMAP.md).

## Why

Commercial DAM costs $25k–$50k a year, is quoted only by sales, and charges per
seat — so every contractor and agency partner raises the bill. The open-source
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
  download, so leaving costs nothing. *(v0.2)*
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
# 1. Get a presigned upload URL — bytes never touch the app server
curl -X POST localhost:3000/api/v1/uploads \
  -H 'content-type: application/json' \
  -d '{"filename":"hero.png","mime":"image/png","size":20135}'

# 2. PUT the file straight to storage using the returned uploadUrl

# 3. Promote it to an asset (idempotent — identical bytes dedupe)
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
`q` (1–100), `f` (jpeg, png, webp, avif). Key order doesn't matter — the cache
key is canonical. Renditions are generated once and cached forever.

## API

| Method | Path | |
|---|---|---|
| `POST` | `/api/v1/uploads` | Create a presigned upload ticket |
| `GET` | `/api/v1/assets` | List assets |
| `POST` | `/api/v1/assets` | Promote a staged upload |
| `GET` | `/api/v1/assets/{id}` | Fetch one asset |
| `DELETE` | `/api/v1/assets/{id}` | Delete an asset |
| `GET` | `/a/{id}[/{transform}]` | Original or rendition bytes |

## Configuration

Copy `.env.example` to `.env`. Any S3-compatible storage works — AWS S3,
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
Tailwind 4 + shadcn/ui · DM Sans.

No monorepo, no job queue, no Redis, no search cluster. Renditions are pure
functions, so generate-on-first-request plus a cache removes the entire job
system. Things get added when something measurably hurts — see the deferred
list in [ROADMAP.md](ROADMAP.md).

## Contributing

Issues and PRs welcome — read [CONTRIBUTING.md](CONTRIBUTING.md) first. The
roadmap is opinionated on purpose; if you want to build something on it, open an
issue before writing the code.

## License

[AGPL-3.0](LICENSE). Run it, modify it, self-host it. If you offer it as a
network service, publish your changes.
