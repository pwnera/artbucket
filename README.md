<div align="center">

<img src="public/icon.svg" width="96" height="96" alt="Artbucket logo">

# artbucket

**Agent-first, headless-by-design asset management.**

A brand knowledge graph with a blob store attached - not a blob store with tags.

[![CI](https://github.com/pwnera/artbucket/actions/workflows/ci.yml/badge.svg)](https://github.com/pwnera/artbucket/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

</div>

---

> **Status: v1.0, stable.** `/api/v1` and the MCP tools are frozen: what
> works against them keeps working on every 1.x release
> ([Stability](docs/developers/stability.mdx)). Upload, content-addressed
> dedupe, on-the-fly renditions, metadata extraction and write-back, custom
> fields, collections, faceted search, scoped API keys, an MCP server, a CLI,
> brand rules as queryable data, rights and provenance with C2PA, `/check`: a
> yes or no on a use, with reasons and what to use instead, teams with single
> sign-on and access down to one asset, share links, brand portals with
> their own look and domain, white-labeling down to email and the app's own
> domain, an audit log, versions
> and a lifecycle enforced at delivery, limits and usage per organization.
> Searching 100,000 assets takes 5 to 100 ms
> ([Benchmarks](docs/developers/benchmarks.mdx)). See [ROADMAP.md](ROADMAP.md)
> and the [docs](docs/).

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

Requires Node 22+, pnpm, and Docker. Optional: `ffmpeg` on the PATH, for video
thumbnails, and LibreOffice (`soffice`), for Word, Excel and PowerPoint previews
beyond the thumbnail a file was saved with. PDF, Illustrator, Photoshop, HEIC,
Sketch, XD, Keynote, InDesign and EPS previews need nothing extra. Figma and
Google Docs, Sheets, Slides and Drive files are added as links.

```bash
git clone https://github.com/pwnera/artbucket.git
cd artbucket
pnpm install
cp .env.example .env
docker compose up -d      # postgres + S3-compatible storage
pnpm dev                  # migrates the database, then serves
```

No Node on the machine? `docker compose --profile app up -d` runs the app too,
from the published image (set `BETTER_AUTH_SECRET` in `.env` first). For a
server, see the [installation guides](docs/installation/): Docker Compose,
Docker, Fly, Coolify, or a plain VPS.

Open http://localhost:3000 and make the first account: it is the admin of
everything, and until it exists nothing else works, in the app or the API.
Then drop in a file.

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
key is canonical, and a size bigger than the image is its own size. Renditions
are generated once and kept for 30 days; the URL is immutable, so a CDN in
front serves them from there.

## API

| Method | Path | |
|---|---|---|
| `POST` | `/api/v1/uploads` | Create a presigned upload ticket |
| `GET` | `/api/v1/assets` | List or search assets, with tag facet counts and the `total` |
| `POST` | `/api/v1/assets` | Promote a staged upload (`token`), or ingest one from a `url` |
| `GET` | `/api/v1/assets/{id}` | Fetch one asset |
| `PATCH` | `/api/v1/assets/{id}` | Edit `tags`, `fields`, `title`, `description`, `creator`, `copyright`, `rights`, provenance, `supersededBy`; review and archive with `status`, `reviewNote`, `proposedTags` |
| `GET` | `/api/v1/assets/{id}/versions` | Its stack of versions, newest first, `current` marked |
| `POST` | `/api/v1/assets/{id}/versions/{n}/current` | Roll back (or forward): make version `n` current |
| `DELETE` | `/api/v1/assets/{id}` | Delete an asset; restorable for 30 days |
| `POST` | `/api/v1/assets/{id}/restore` | Bring a deleted asset back |
| `POST` | `/api/v1/assets/{id}/proposed-tags` | Suggest tags, for a person to accept |
| `POST` | `/api/v1/check` | May this asset be used like this? `{ allowed, reasons, suggest }` |
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
| `GET` | `/api/v1/keys` | The workspace's API keys, without their secrets |
| `POST` | `/api/v1/keys` | Mint a `{ name, scope }` key for this workspace; the secret is in this response only |
| `DELETE` | `/api/v1/keys/{id}` | Revoke one |
| `GET` | `/api/v1/me` | Who is calling, in which workspace, with what scope, and where else they can go |
| `GET` | `/api/v1/organizations` | Your organizations |
| `POST` | `/api/v1/organizations` | Make one, with a first workspace; you are its admin |
| `PATCH` | `/api/v1/organizations/{id}` | Rename it |
| `DELETE` | `/api/v1/organizations/{id}` | Delete it, with everything in it |
| `GET` | `/api/v1/usage` | What the organization uses, against its limits, and 30 days of delivery traffic |
| `GET` | `/api/v1/workspaces` | The organization's workspaces you can open, with your scope in each |
| `POST` | `/api/v1/workspaces` | Make one |
| `PATCH` | `/api/v1/workspaces/{id}` | Rename it |
| `DELETE` | `/api/v1/workspaces/{id}` | Delete it, with everything in it; not the last one |
| `GET` | `/api/v1/members` | People, their grants, and invitations waiting; `?in=workspace` for this workspace's |
| `POST` | `/api/v1/grants` | Give a member a `scope` on the organization, a workspace, a collection or an asset |
| `DELETE` | `/api/v1/grants/{id}` | Take it away; the last organization admin stays |
| `POST` | `/api/v1/invitations` | Invite an `email` to a scope on something; the link is in this response only |
| `DELETE` | `/api/v1/invitations/{id}` | Withdraw one |
| `POST` | `/api/v1/invitations/{id}/resend` | Send it again: a new link and a new week |
| `GET` | `/api/v1/invite/{token}` | What an invitation offers |
| `POST` | `/api/v1/invite/{token}` | Accept it, signed in |
| `GET` | `/api/v1/shares` | Share links |
| `POST` | `/api/v1/shares` | A `view` or `upload` link, with an optional `password` and `expiresAt` |
| `DELETE` | `/api/v1/shares/{id}` | Revoke one |
| `POST` | `/api/v1/shares/{id}/send` | Email it to `{ emails }` |
| `GET` | `/api/v1/shared/{token}` | A share link's contents, for its holder; a password goes in `X-Share-Password` |
| `POST` | `/api/v1/shared/{token}/uploads` | An upload link's presigned PUT |
| `POST` | `/api/v1/shared/{token}/assets` | Hand the upload in, as a proposal |
| `GET` | `/api/v1/audit` | Who changed who may do what; page with `before` |
| `GET` | `/api/v1/settings` | Settings of the `context` (organization or workspace), and where each value comes from |
| `PATCH` | `/api/v1/settings/{key}` | Change one; only what is named is kept as this place's own |
| `DELETE` | `/api/v1/settings/{key}` | Forget this place's own, so what is above applies |
| `POST` | `/api/v1/email/test` | Send a test through the organization's email |
| `POST` | `/api/v1/mcp` | The MCP server |
| `GET` | `/api/v1/openapi.json` | This table, as OpenAPI 3.1 |
| `GET` | `/a/{id}[/{transform}]` | Original or rendition bytes |
| `GET` | `/api/v1/assets/{id}/description` | The asset's description |
| `GET` | `/a/{id}?download` | The original with current metadata written in |

The spec at `/api/v1/openapi.json` is generated from the Zod schemas the
handlers validate with, and a test fails if a route exists that it doesn't
describe. The web UI calls nothing outside this table, but for signing in and
out at `/api/auth` ([better-auth](https://better-auth.com)'s own endpoints).

### Keys and scopes

Send `Authorization: Bearer ab_...`. A key works in one workspace, with one
scope, and each scope includes the ones before it:

| Scope | May |
|---|---|
| `read` | search, list, describe |
| `propose` | upload and suggest tags; what it adds lands `proposed` |
| `write` | edit, delete, approve, share links, and manage collections, fields, searches |
| `admin` | mint and revoke keys, and manage people |

An unknown or revoked key is a `401`, never a fallback to anonymous.
Rendition bytes stay public, so they can be embedded anywhere.

```bash
curl -X POST localhost:3000/api/v1/keys -H 'content-type: application/json' \
  -d '{"name":"claude","scope":"propose"}'
```

A request with neither a key nor a session gets `ANONYMOUS_SCOPE`, which
unset is nothing: `read` makes a public library. Before the first account
exists every request is a `403 setup_required`, whatever it carries.

### People and access

People sign in with an email and a password, or with any OpenID Connect
provider (`OIDC_*`: Okta, Entra ID, Google Workspace, Keycloak, Authentik...).
Single sign-on is free here, and stays free. Accounts are by invitation: the
first account made on a fresh install is the admin of everything, anyone
else needs an invitation link, and people from the OIDC provider arrive with
no access until an admin gives them some.

An **organization** is a team; a **workspace** is a library of its own inside
one: assets, collections, fields, brands, saved searches and keys. Nothing
crosses between workspaces but identical bytes in storage. Switch between
them at the top of the sidebar.

What a person may do is their **grants**: a scope from the ladder above, on
the organization, a workspace, a collection or one asset. Grants add up and
reach down: admin on the organization is admin in every workspace, editor on
the "Autumn 26" collection is editor on every asset in it. Someone with
grants on a few collections only sees those, and their assets; that is how a
contractor or an agency gets exactly its part of the library. The
organization always keeps an admin.

Every thing someone can do has a name (`asset.edit`, `collection.share`,
`brand.edit`, `member.manage`...) in `src/lib/permissions.ts`, with the scope
it takes and what that scope must be on. Routes, MCP tools and core check
those names, and the web app shows a control only when its request would be
allowed, asking by the same name (`<Can do="asset.edit" on={asset}>`), so
the API and the UI can't disagree: a viewer sees no Upload, no Edit, and a
read-only asset dialog.

**Team** (in the sidebar) is who is in and who is invited. **People and
invitations** lists the organization's people and their access, changes it,
and makes invitations: **Invite people** takes an email and a scope on
something, and gives a link that works once, for a week. With email on it
is sent to them too. Invitations waiting stay listed, to **Copy link** (the
token is kept sealed, never in the clear), **Send again** (a new link and a
new week) or withdraw. A workspace's own members, whoever can open it and
what each may do there, are in its Settings, Members. ⌘K has Invite people
too.

```bash
curl -X POST localhost:3000/api/v1/invitations -H 'content-type: application/json' \
  -H 'Authorization: Bearer ab_...' \
  -d '{"email":"sam@agency.example","resource":"collection","resourceId":"{id}","scope":"write"}'
```

### Share links

For people without an account. **Request uploads** makes a link anyone can
send files through, a photographer or an agency: they land `proposed`, in
that collection, and wait in Review like an agent's. **Share** shows a
collection's approved assets, with downloads, at `/s/{token}`; so does
**Share** in an asset's dialog, for one. Request uploads is in the Upload menu, into the collection open or the
workspace; Share is an icon on a collection's page. Both are in a
collection's menu in the sidebar, and on Team, **Share and upload links**, which
lists every link to copy, **Send** by email, or revoke. With email on, a
link can go straight to people as it is made. Either can end on a date and ask for a password
(kept as a salted scrypt hash), and revoking one stops it at once. Making or
revoking a link takes write on what it shares.

```bash
pnpm artbucket share {collection-id} --password dragon --expires 2027-01-31
pnpm artbucket share {collection-id} --upload --name "Photographer drop"
```

### Settings

Settings (at the bottom of the sidebar) is how things are configured; who
gets in, and the links for people without an account, are on Team. It is in
sections grouped by what they apply to: the
**workspace** you are in (its name, members, custom fields), its
**organization** (name, workspaces, email), and your
**account** (name, password). Each section shows to whoever may use it.

Behind it, settings are definitions (`src/lib/settings.ts`): where each may
be set, its shape, its secrets and its environment variables. Each place
keeps only what it overrides, and a value resolves property by property
from the narrowest place that says something: workspace, then
organization, then the server's environment, then the default. So a server
configured once serves every organization, and one of them can change its
sender and keep using the server's API key without ever holding it.
`GET /api/v1/settings?context=organization` says where each value comes
from. Secret properties are encrypted at rest with a key derived from
`BETTER_AUTH_SECRET`, and never returned.

### Email

Off by default. Turn it on for the whole server with `EMAIL_*`, or for one
organization in Settings, Email. It sends invitations, password resets
(Forgot your password? appears on the sign-in page once some email can go
out) and a test message. Providers are HTTP APIs, no SMTP: `resend`,
`postmark`, `sendgrid`, and `console`, which prints to the server's log for
trying it out. Adding one is an entry in `src/lib/email.ts`. A message that
fails never fails what sent it: the invitation link is still shown, and the
failure is in the audit log.

```bash
EMAIL_PROVIDER=resend
EMAIL_FROM="Acme Assets <assets@acme.example>"
EMAIL_API_KEY=re_...
```

### Audit log

Every sign-up and sign-in, grant given or taken, invitation made, withdrawn
or accepted, key minted or revoked, share link made or revoked, and
workspace made or renamed, and settings change, is on Team, **Audit log**, and at
`GET /api/v1/audit`, with who, when and from where. An organization admin
reads the organization's, with its members' sign-ins; a workspace admin, the
workspace's. Asset changes stay on Activity.

### Review

What a `propose` key (or person, or upload link) adds is not final. An upload
lands with `status: "proposed"` and stays out of the library and search;
suggested tags wait in `proposedTags`. Each proposal records who made it
(`proposedBy`: the key's name, the person's, or the upload link's). `GET /api/v1/assets?review=true` lists everything waiting, and so
does the Review tab, whose count also shows on Assets in the sidebar. A proposal may leave required fields
empty; the person approving fills them in.

Approving is a plain `PATCH`: `{"status":"active"}` for a file (a `422` names
any required field still empty), moving a tag from `proposedTags` into `tags`
for a suggestion. Rejecting is `{"status":"rejected","reviewNote":"..."}`: the
file is kept, out of the library and the queue, so the agent that proposed it
can read why (MCP `my_proposals`) and do better next time. Review lists
what waits as a table, with who suggested it and when; approve or reject a
row in place, or a whole selection at once.

### Lifecycle and versions

An asset moves from `draft` to `proposed` (in review) to `active` (approved),
and on to `archived` when it is retired; `rejected` is the review's other
outcome. Expired is not a status but a date: an approved asset past its
`rights.expires` reads `state: "expired"` the next day, with nothing to run.
Upload with `"status": "draft"` to keep work in progress out of the library;
submitting a draft (`"proposed"`) takes write, and approving, archiving or
unarchiving takes write with the approve ability. The library, search and
agents see approved, unexpired assets unless asked for others:
`GET /api/v1/assets?status=draft&status=archived`, or the Status filter.

A new file for the same thing is a new version, not a new asset:
`POST /api/v1/assets` with `"versionOf": "{id}"` (or New version in the
asset's dialog, `artbucket ingest file.png --version-of {id}`, MCP
`ingest_asset` with `versionOf`) files it where the old one is, with its tags
and fields. Once approved it becomes the stack's current version: the library
shows only that one, a share link made for any version serves it, and every
other approved version is `supersededBy` it, so `/check` refuses them and
names it. Archiving the current version hands over to the newest approved one
left; `POST /api/v1/assets/{id}/versions/{n}/current` rolls back. The dialog
compares any two versions side by side.

What happens at `/a/{id}` follows: only an approved, unexpired asset out of
embargo is public. Expired, archived or deleted, its URLs, renditions
included, answer `410 Gone`; a draft, a proposal or an embargoed asset is a `404`.
People who can see it in the library still get it, uncached. Public bytes
are cached for an hour at most and never past the last day of use, with an
`ETag` for cheap revalidation, so a takedown reaches caches on time. Select
assets to submit, approve, archive or unarchive them, or set their last day
of use, in one go.

Deleting is soft: a deleted asset leaves the library, its collections, its
links and its stack at once, and stays restorable for 30 days (the Status
filter's Deleted, Restore in the dialog or the selection bar, Undo on the
toast, `POST /api/v1/assets/{id}/restore`). Then the sweeper, which runs in
the app every six hours, purges it, and its file once no asset in any
workspace holds the same bytes. Deleting a workspace or an organization goes
the same way, at once.

Every addition, suggestion, decision and deletion, and every brand rule
change, is on the Activity tab and at `GET /api/v1/activity`, by actor: a
person's name, an API key's (`agent: true`), or `web` for the app without an
account. Press ⌘K anywhere to find an asset, a
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

A workspace defines its own fields (Settings, Custom fields), and required
ones must be filled at upload:

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

```bash
curl localhost:3000/api/v1/assets/{id}/description
```

It returns what a client needs to decide whether and how to use the asset:
title, credit, tags, effective field values, its `rights`, its `provenance`,
what replaced it (`supersededBy`), its URLs, the transforms it allows
(`constraints`), and ready-made rendition URLs (`alternatives`).

### May I use this?

Knowing an asset's rights is half the job; applying them is the other half.
`/api/v1/check` takes an asset and a use, and answers:

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

It refuses an asset that isn't approved; one that was replaced, naming the
replacement; one used before its embargo or after its last day, outside its
territories or channels; one with people and no model release, outside
`editorial`; and, with a `context`, a rule's default asset where the brand has
a variant for that context (the light logo on dark backgrounds), suggesting
the variant. A restriction the use says nothing about is a reason that doesn't
block: give the `territory` and `channel` to settle it. `date` defaults to
today. It is MCP's `check_use`, and `pnpm artbucket check {id} --channel web`,
which exits 1 on a refusal.

Rights live on the asset and are edited in its dialog or by `PATCH`:

```json
"rights": {
  "license": "Getty, rights-managed",
  "territories": ["DE", "AT"],
  "channels": ["web", "print"],
  "embargo": "2026-10-01",
  "expires": "2027-03-31",
  "modelRelease": "released"
}
```

Territories are two-letter country codes, channels are slugs; empty means
unrestricted. `expires` is the last day of use: after it the asset is
expired, and its URLs answer 410. `supersededBy` marks what replaced an
asset; the gallery badges replaced, expired and archived assets.

### Provenance

Every asset can say where it came from: `origin` (`shot`, `licensed` or
`generated`), `parentAssetId` (what it was made from), `generator` (the tool or
model) and `prompt`. Set them at upload, on `ingest_asset`, or by `PATCH`.

C2PA Content Credentials are read on ingest (JPEG, PNG, WebP) into `c2pa`: the
signer, the app that signed, the actions, the model, and IPTC's digital source
type. A file made by a model sets `origin: generated` and `generator` unless the
uploader said otherwise. Credentials are read, not verified. They are
preserved: `/a/{id}` serves the signed bytes as uploaded, and `?download`
leaves such a file as it is rather than write metadata that would break its
signature. Renditions are new pixels and carry none.

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
formats, and files with Content Credentials, download as stored, and
`X-Metadata-Embedded: false` says so.

## Agents

`/api/v1/mcp` is an MCP server over Streamable HTTP, built on the same
`lib/core` as the REST API. One URL connects every agent: chat apps (Claude,
ChatGPT, Perplexity, Gemini), coding agents, app builders (Lovable, v0, Bolt,
Replit) and Figma take the URL and send you to a consent screen, where you
pick what the agent may do: Suggest, Read or Edit. What it gets is a key bound
to you: never more than you can do, and gone with your access.
[`/agents`](http://localhost:3000/agents) has the setup for each, waits for
the first call, and lists Connected agents: last seen, calls, what each left
in Review, and a button to disconnect it.

```bash
claude mcp add --transport http artbucket http://localhost:3000/api/v1/mcp
```

That is OAuth 2.1 with PKCE and dynamic client registration, discovered from
`/.well-known/oauth-protected-resource` and
`/.well-known/oauth-authorization-server` (`lib/core/oauth.ts`). Keys an
admin makes still work for anything headless (n8n, Make, scripts):
`Authorization: Bearer ab_...`.

The CLI signs in through the browser with the device flow, and keeps its key
in `~/.config/artbucket/credentials.json`:

```bash
ARTBUCKET_URL=https://assets.example.com pnpm artbucket login
```

The skill in [`plugin/skills/artbucket`](plugin/skills/artbucket/SKILL.md)
teaches an agent the workflow (brand rules first, `check_use` before
publishing, provenance on anything generated), over MCP or the CLI:
`npx skills add pwnera/artbucket`. In Claude Code, the plugin brings the MCP
server and the skill together:

```bash
/plugin marketplace add pwnera/artbucket
/plugin install artbucket@artbucket
```

| Tool | Scope | |
|---|---|---|
| `search_assets` | read | Full text, tags, collections (by name), field filters, lifecycle `status`, and the `total`; its description lists your fields and collections |
| `describe_asset` | read | The same description as `/api/v1/assets/{id}/description`, plus the brand rules that point at it |
| `check_use` | read | `/api/v1/check`: may it run here, now, in this context; if not, why, and what to use instead |
| `rendition_url` | read | A URL for a width, height, fit, format and quality; says when it would need to upscale |
| `ingest_asset` | propose | Fetch a public URL into the library, as `proposed`, with its provenance and rights; `versionOf` files it as a new version |
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
pnpm artbucket check {id} --channel paid-social --territory DE
pnpm artbucket ingest ./hero.png https://example.com/logo.png --tag launch
pnpm artbucket review
pnpm artbucket approve {id}
pnpm artbucket reject {id} --reason "off-brand colors"
pnpm artbucket rules --context instagram-story
pnpm artbucket keys create claude --scope propose
pnpm artbucket whoami
pnpm artbucket invite sam@agency.example --scope write --collection {id}
pnpm artbucket share {collection-id} --upload
pnpm artbucket audit
```

It reads `ARTBUCKET_URL` (default `http://localhost:3000`) and `ARTBUCKET_KEY`,
whose workspace it works in, and `--json` prints raw responses. `pnpm link --global` puts `artbucket` on
your path.

## Configuration

Copy `.env.example` to `.env`. Any S3-compatible storage works - AWS S3,
Cloudflare R2, Backblaze B2, MinIO, Garage, SeaweedFS.

On start the app applies any database migration it has that the database
doesn't (so upgrading is starting the new version), creates the bucket, allows browser PUTs from `APP_URL`
(CORS), and, when the bucket has no lifecycle rules, expires `staging/` after
1 day and `renditions/` after 30. A key that can't change bucket settings
(R2's object tokens can't) logs a warning: set those three in the provider's
console.

| Variable | |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `S3_ENDPOINT` `S3_REGION` `S3_BUCKET` | Storage location |
| `S3_ACCESS_KEY_ID` `S3_SECRET_ACCESS_KEY` | Storage credentials |
| `S3_FORCE_PATH_STYLE` | `true` for most non-AWS providers |
| `APP_URL` | Public origin; also the CORS origin for browser uploads, and the only origin cookie-signed writes are taken from |
| `BETTER_AUTH_SECRET` | Signs sessions; required in production (`openssl rand -base64 32`) |
| `OIDC_ISSUER` `OIDC_CLIENT_ID` `OIDC_CLIENT_SECRET` | Single sign-on with an OpenID Connect provider; its redirect URI is `{APP_URL}/api/auth/callback/oidc` |
| `OIDC_NAME` | The button's label: "Sign in with {OIDC_NAME}" (default `SSO`) |
| `EMAIL_PROVIDER` | `resend`, `postmark`, `sendgrid` or `console`: email for every organization that doesn't set its own. Unset: off |
| `EMAIL_FROM` `EMAIL_REPLY_TO` `EMAIL_API_KEY` | The sender, where replies go, and the provider's key |
| `ANONYMOUS_SCOPE` | What a request without a key or a session may do, once the first account exists: `none` (the default), `read`, `propose`, `write`, `admin` |
| `S3_PUBLIC_ENDPOINT` | Where browsers reach storage, when the server reaches it elsewhere (Docker Compose); default `S3_ENDPOINT` |
| `SIGNUP` | `invite` (the default), or `open`: anyone may make an account, with an organization of their own |
| `RATE_LIMIT` | `/api` requests per minute per client (default 1200); `0` turns it off |
| `LIMIT_STORAGE` `LIMIT_EDITORS` `LIMIT_WORKSPACES` `LIMIT_BRANDS` `LIMIT_FEATURES` | Every organization's limits; unset is unlimited |

### Limits and usage

Whoever runs the server can limit what an organization uses: storage, editors,
workspaces, brands, features (agents, share links), or make it read-only. For
every organization with `LIMIT_*`, for one with a `limits` row in the
database ([docs](docs/configuration/limits.mdx)); never by the organization's
own admins, who see their limits next to their usage in Settings, Usage:
storage, and what asset URLs served, per workspace, over 30 days. Everything
is unlimited until someone says otherwise.

### Hardening

`/api` is rate limited per client, share link passwords allow ten wrong
guesses in ten minutes, pages carry a strict Content-Security-Policy (HSTS
too on `https`), and uploaded files are served under a sandbox, so an SVG
opened directly runs nothing. Artbucket has no telemetry.

## Docs

`docs/` is the documentation site ([Mintlify](https://mintlify.com), MDX and
`docs.json`), changed in the same pull request as the code it describes. Its
API reference is `docs/openapi.json`, generated from the Zod schemas by
`pnpm docs:openapi`; a test fails when it is out of date. Preview it with
`npx mint dev` in `docs/`.

## Stack

Next.js 16 · React 19 · Postgres + Drizzle · S3-compatible storage · sharp ·
better-auth · Tailwind 4 · DM Sans.

No monorepo, no job queue, no Redis, no search cluster. Renditions are pure
functions, so generate-on-first-request plus a cache removes the entire job
system. Things get added when something measurably hurts - see the deferred
list in [ROADMAP.md](ROADMAP.md).

## Design

The interface is stock [shadcn/ui](https://ui.shadcn.com) (new-york, neutral)
with Google green (#34A853) as the primary, [Tabler icons](https://tabler.io/icons)
and DM Sans. The mark is Tabler's tipped paint bucket. Restyle through the
tokens in `src/app/globals.css`, not per component.

Every component in use is on the living reference at `/design`, linked from
Settings, Development while developing (`pnpm dev`), and not served in
production.

## Contributing

Issues and PRs welcome - read [CONTRIBUTING.md](CONTRIBUTING.md) first. The
roadmap is opinionated on purpose; if you want to build something on it, open an
issue before writing the code.

## License

[AGPL-3.0](LICENSE). Run it, modify it, self-host it. If you offer it as a
network service, publish your changes.
