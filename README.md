<div align="center">

<img src="public/icon.svg" width="96" height="96" alt="Artbucket logo">

# artbucket

**The self-hosted brand library for people and their AI agents.**

A brand knowledge graph with a blob store attached - not a blob store with tags.

[![CI](https://github.com/pwnera/artbucket/actions/workflows/ci.yml/badge.svg)](https://github.com/pwnera/artbucket/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Status: stable](https://img.shields.io/badge/status-v1%20stable-brightgreen.svg)](docs/developers/stability.mdx)
[![MCP](https://img.shields.io/badge/MCP-server-8A2BE2.svg)](docs/developers/mcp.mdx)

[Docs](docs/) · [Quick start](#quick-start) · [API](docs/developers/api.mdx) · [Roadmap](ROADMAP.md)

</div>

---

Commercial DAM costs $25k-$50k a year, is quoted only by sales, and charges
per seat, so every contractor and agency partner raises the bill. And finding
files is no longer the hard part. The hard part is **authority**: which logo is
current, which photo is still licensed for paid social in Germany, what the
brand's rules actually are. No agent can infer that from pixels. It has to be
written down and served.

Artbucket writes it down and serves it: to people in the web app, and to
agents over MCP, REST and a CLI.

## Why artbucket?

- 🤖 **Agents are first-class.** One MCP URL connects Claude, ChatGPT, Gemini,
  coding agents, Figma, Lovable and the rest. They search, describe, size and ingest; what
  they add waits in Review for a person.
- ✅ **A yes or no on every use.** `/check` says whether an asset may run here,
  now, in this channel and territory, why not, and what to use instead.
- 📐 **The brand, as data.** Colors, type, logo rules and don'ts are typed
  records with history, not a PDF. The guidelines page is drawn from them.
- 🖼️ **Renditions are URLs.** `/a/{id}/w_1200,f_webp`. No export step, no
  download button, no job queue. Identical bytes are stored once.
- 🔐 **Teams, SSO and access down to one asset, free.** Grants add up and reach
  down, so an agency sees exactly its part of the library. OpenID Connect
  single sign-on is never behind a paywall.
- 🏷️ **Portals and white-labeling.** Share links, upload links, brand portals
  with their own look and domain, your name down to the emails.
- 📦 **Your metadata stays yours.** IPTC/XMP written back into the file on
  download, C2PA provenance read on ingest. Leaving costs nothing.
- ⚡ **Fast and boring.** Postgres and an S3 bucket, nothing else. Searching
  100,000 assets takes 5 to 100 ms ([benchmarks](docs/developers/benchmarks.mdx)).

> **Status: v1, stable.** `/api/v1` and the MCP tools are frozen: what works
> against them keeps working on every 1.x release
> ([stability](docs/developers/stability.mdx)).

## Quick start

### 1. Install

Requires Node 22+, pnpm and Docker.

```bash
git clone https://github.com/pwnera/artbucket.git
cd artbucket
pnpm install
cp .env.example .env
docker compose up -d      # postgres + S3-compatible storage
pnpm dev                  # migrates the database, then serves
```

Open http://localhost:3000 and make the first account: it is the admin of
everything, and until it exists nothing else works, in the app or the API.

<details>
<summary><b>No Node on the machine?</b></summary>

Run the published image instead. Set `BETTER_AUTH_SECRET` in `.env` first
(`openssl rand -base64 32`), then:

```bash
docker compose --profile app up -d
```

</details>

<details>
<summary><b>Optional tools for more previews</b></summary>

- `ffmpeg` on the PATH: video thumbnails.
- LibreOffice (`soffice`): Word, Excel and PowerPoint previews beyond the
  thumbnail a file was saved with.

PDF, Illustrator, Photoshop, HEIC, Sketch, XD, Keynote, InDesign and EPS
previews need nothing extra. Figma and Google Docs, Sheets, Slides and Drive
files are added as links.

</details>

<details>
<summary><b>Upgrading</b></summary>

Pull the new version and start it. The app applies any migration the database
doesn't have yet on start. See [upgrading](docs/installation/upgrading.mdx).

</details>

### 2. Add your first asset

Drop a file into the web app, or go through the API. Bytes go straight to
storage, never through the app server:

```bash
# 1. Get a presigned upload URL
curl -X POST localhost:3000/api/v1/uploads \
  -H 'content-type: application/json' \
  -d '{"filename":"hero.png","mime":"image/png","size":20135}'

# 2. PUT the file to the returned uploadUrl

# 3. Promote it to an asset (idempotent: identical bytes dedupe)
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

Transforms: `w` `h` (1-8000), `fit` (cover, contain, inside, outside, fill),
`q` (1-100), `f` (jpeg, png, webp, avif). A photo or other raster image is
never enlarged: asking for more pixels than it has gives it at its own size.
An SVG is drawn at the size asked, up to 8000px, so a 24px icon at `w_512,f_png`
is a sharp 512px PNG. Renditions are generated once and cached. The bytes are private: the URLs work with your key or session, and for
anyone else once signed (`POST /api/v1/assets/{id}/signed-url`) or made public.

### 3. Connect your agents

`/api/v1/mcp` is an MCP server over Streamable HTTP. Give the URL to any
agent: it sends you to a consent screen where you pick what it may do
(Suggest, Read or Edit), and it gets a key bound to you, never more than you
can do.

```bash
claude mcp add --transport http artbucket http://localhost:3000/api/v1/mcp
```

| Tool | Scope | |
|---|---|---|
| `search_assets` | read | Full text, tags, collections, custom fields, status |
| `describe_asset` | read | Everything needed to decide whether and how to use an asset |
| `check_use` | read | May it run here, now, in this context; if not, why, and what instead |
| `rendition_url` | read | A URL for a size, fit, format and quality, signed for outsiders on request |
| `brand_rules` | read | A brand's rules for a context, with the assets they point at |
| `ingest_asset` | propose | Fetch a public URL into the library, with provenance and rights |
| `import_google_font` | propose | A Google Fonts family, one file per style |
| `propose_tags` | propose | Suggest tags for a person to accept |
| `list_fields` | read | The library's custom fields: keys, types, options |
| `propose_fields` | propose | Suggest custom field values for a person to accept |
| `my_proposals` | propose | What this key proposed and what became of it |
| `list_templates`, `list_pages`, `get_page` | read | Brand pages: the templates, the pages, one page with its rules and as Markdown |
| `set_rules` | write | Make, change and remove many brand rules at once |
| `save_page`, `edit_page`, `delete_page`, `generate_pages` | write | Build a brand's guideline pages over its rules |
| `publish` | write, share | Put the pages and rules, as they stand, in front of portal visitors |

The Claude Code plugin brings the MCP server and a skill that teaches the
workflow (brand rules first, `check_use` before publishing, provenance on
anything generated):

```bash
/plugin marketplace add pwnera/artbucket
/plugin install artbucket@artbucket
```

Other agents: `npx skills add pwnera/artbucket`. [`/agents`](http://localhost:3000/agents)
in the app has the setup for each one, and lists what is connected. More in
the [MCP docs](docs/developers/mcp.mdx).

### 4. Write down the brand, then check uses

Brand rules live at [`/brand`](http://localhost:3000/brand): click a value to
change it, press `/` to add a rule. Or from the CLI:

```bash
pnpm artbucket rules set color.primary '#34a853' --type color --usage "Buttons, links"
pnpm artbucket rules set color.primary '#5bc27a' --type color --context dark-background
```

Rights live on each asset (license, territories, channels, embargo, last day
of use, model release). Then ask before publishing:

```bash
curl -X POST localhost:3000/api/v1/check -H 'content-type: application/json' \
  -d '{"asset":"{id}","channel":"paid-social","territory":"DE","context":"dark-background"}'
```

```json
{
  "allowed": false,
  "reasons": [{ "code": "superseded", "message": "Replaced by Blender logo mark", "blocking": true }],
  "suggest": [{ "id": "...", "title": "Blender logo mark", "url": "http://localhost:3000/a/...", "why": "Its replacement" }]
}
```

See [the canon](docs/guides/canon.mdx) and [May I use this?](docs/guides/check.mdx).

### 5. Invite your team

Invite people from **Team**, with a scope on the organization, a workspace, a
collection or one asset. A contractor with grants on two collections sees
those two and nothing else. Sign-in is email and password, or any OpenID
Connect provider (Okta, Entra ID, Google Workspace, Keycloak, Authentik...):

```bash
OIDC_ISSUER=https://login.example.com
OIDC_CLIENT_ID=artbucket
OIDC_CLIENT_SECRET=...
```

People without an account get share links and upload links, with an optional
password and end date. See [sharing](docs/guides/sharing.mdx),
[portals](docs/guides/portals.mdx) and [auth](docs/configuration/auth.mdx).

### 6. Deploy a server

Any S3-compatible storage works: AWS S3, Cloudflare R2, Backblaze B2, MinIO,
Garage, SeaweedFS. Guides for [Docker Compose](docs/installation/docker-compose.mdx),
[Docker](docs/installation/docker.mdx), [Fly](docs/installation/fly.mdx),
[Coolify](docs/installation/coolify.mdx) and a [plain VPS](docs/installation/vps.mdx).
Every variable is in [environment](docs/configuration/environment.mdx).

## Use it from anywhere

The web app is a client of the public API, with zero private endpoints, so
everything it does, you can script.

- **REST:** `/api/v1`, described by a generated OpenAPI spec at
  `/api/v1/openapi.json`. [API reference](docs/developers/api.mdx).
- **MCP:** `/api/v1/mcp`, OAuth 2.1 with PKCE and dynamic client
  registration. [MCP](docs/developers/mcp.mdx).
- **CLI:** a thin client over the same API. [CLI](docs/developers/cli.mdx).

```bash
pnpm artbucket search sintel poster
pnpm artbucket url {id} --width 1200 --format webp
pnpm artbucket check {id} --channel paid-social --territory DE
pnpm artbucket review
```

## Telemetry

None. Artbucket sends nothing anywhere.

## Contributing

Issues and PRs welcome: read [CONTRIBUTING.md](CONTRIBUTING.md) first. The
roadmap is opinionated on purpose; if you want to build something on it, open
an issue before writing the code. The load-bearing choices, and why, are in
the [decision records](docs/decisions/index.mdx).

Built with Next.js 16, React 19, Postgres and Drizzle, sharp, better-auth and
Tailwind 4. No monorepo, no job queue, no Redis, no search cluster.

## License

[AGPL-3.0](LICENSE), copyright Pwnera SAS. Run it, change it, self-host it, for
any purpose. If you offer a changed version as a network service, publish your
changes. Can't take the AGPL? Pwnera SAS also licenses artbucket commercially:
[open an issue](https://github.com/pwnera/artbucket/issues) and ask. `ee/` is
reserved for commercial code. See [decision 0013](docs/decisions/0013-agpl-and-cla.mdx).
