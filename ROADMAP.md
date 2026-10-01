# artbucket - Roadmap

Agent-first, headless-by-design asset management. A brand knowledge graph with a
blob store attached - not a blob store with tags.

One maintainer. Every milestone below is independently shippable and demoable.
Estimates assume evenings and weekends, and are guesses.

**Status:** v0.1 to v1.6 shipped. v1.7 in progress (current release 1.7.0).

---

## How this order was chosen

Three rules, in priority order:

1. **Vertical slices, not layers.** Never "all the backend, then all the UI."
   Each version works end to end.
2. **Enforce the API rule before the code grows.** The UI-is-a-client-of-the-API
   constraint (v0.3) lands early. Retrofitting it later means rewriting everything.
3. **Ship the differentiator before the table stakes.** MCP (v0.4) and the canon
   (v0.5–0.6) come *before* multi-user auth (v0.7), because they are what makes
   the project worth looking at. Auth is a time sink that proves nothing.

---

## v0.1 - Walking skeleton
**Question it answers:** can a file get in, and come back out in any shape?

- `docker compose up` → Postgres + MinIO + app
- Upload an image (presigned PUT, direct to S3 - server never proxies bytes)
- SHA-256 content hash, dedupe on collision
- Rendition delivery: `/a/{id}/w_800,f_webp` - generated on first request via
  sharp, cached to S3, served thereafter
- Minimal grid UI: Tailwind 4 + shadcn + DM Sans
- Single user, no auth

**Not in this one:** metadata, search, tags, anything multi-user.
**Done when:** a fresh clone reaches a visible thumbnail in under five minutes.
_~2 weekends._

---

## v0.2 - It becomes a DAM
**Question:** can you find the thing again?

- EXIF / IPTC / XMP extraction on ingest (exifreader)
- Write metadata *back* into file on download - portability is the anti-lock-in promise
- Custom field schemas, required-at-upload fields
- Tags, collections, collection→asset field inheritance
- Postgres FTS across filename, metadata, tags, custom fields
- Faceted filtering, saved searches

**Not in this one:** semantic/vector search. Postgres FTS until it visibly fails.
**Done when:** 1,000 assets are searchable and a query returns in <100ms.
_~3 weekends._

---

## v0.3 - The API becomes the product
**Question:** is the public API good enough to build the product on?

- `/api/v1` - the only write path, versioned, public
- **Every private endpoint deleted.** The web UI may call nothing else.
- All logic moves to `lib/core/`; the API is a thin adapter over it
- API keys, scoped
- OpenAPI spec generated from Zod schemas
- Content negotiation: `Accept: application/json` on an asset URI returns the
  *description* (rights, constraints, alternatives), not the bytes

**Not in this one:** new features. This milestone is entirely structural.
**Done when:** the UI has zero endpoints of its own, and the OpenAPI spec is complete.
_~2 weekends. Painful, non-negotiable, and cheap only if done now._

---

## v0.4 - Agent surface
**Question:** can Claude or Cursor use this without a human?

- MCP server, same `lib/core/` as REST - a second adapter, not an integration
- Tools: search, describe, resolve rendition URL, ingest, propose tags
- Agent writes land in `proposed` state; a human promotes them
- `artbucket` CLI (thin client over the same API)

**Not in this one:** a chatbot in the sidebar. The agent lives in the user's
editor, not in this app.
**Done when:** an agent finds an asset and returns a correctly-sized URL, unaided.
_~2 weekends. This is the launch-worthy milestone._

---

## v0.5 - The canon
**Question:** can the brand itself be queried?

- Brand rules as structured records, not documents: `color.primary.hex`,
  `logo.minClearSpace`, `logo.neverDo[]`, `tone.avoid[]`, `type.scale`
- Guidelines page *rendered from* that data - inverting Frontify, who author
  documents and try to extract data
- `GET /brand/rules?context=instagram-story` → actionable constraints
- Exposed as MCP resources

**Done when:** an agent asks "what's our primary blue for dark backgrounds"
and gets a hex code with its usage rule.
_~3 weekends._

---

## v0.6 - Verdict and provenance
**Question:** can something else decide whether a use is allowed?

- `POST /check` → `{allowed, reasons[], suggest}` - the primitive no DAM has
- Rights fields: license, territory, channel, embargo, expiry, model releases
- Provenance columns: `origin` (shot / licensed / generated), `parent_asset_id`,
  `generator`, prompt
- C2PA manifest read and preserve

**Done when:** `/check` correctly refuses a superseded logo and names its replacement.
_~3 weekends. This is the moat._

---

## v0.7 - Multi-user
**Question:** can a team use it?

- better-auth: email + OIDC. **OIDC stays free forever** - no SSO tax.
- Organizations, workspaces
- RBAC: org → workspace → collection → asset
- Share links with expiry and password; guest collect-upload links
- Audit log (also free - cheap trust)

**Not in this one:** SAML, SCIM. Those are the eventual commercial line.
_~4 weekends. Deliberately deferred: single-user validates the thesis fine._

---

## v0.7.5 - Every agent
**Question:** can any agent a person already uses get the brand in under a minute?

Modeled on [Postiz](https://postiz.com): one MCP server, one skill, one CLI, and a
setup page per agent. Supporting an agent is a snippet, not code.

- **OAuth on `/api/v1/mcp`** (MCP authorization spec, on the v0.7 better-auth):
  chat apps (Claude.ai / Desktop / Cowork, ChatGPT, Perplexity, Gemini Spark)
  take a URL and a consent screen, not a pasted header. The consent screen is the
  scope picker: Suggest, Read, Edit. Keys stay for headless use
- **Generate where you chat:** the most-used image models live inside chat apps
  (GPT Image in ChatGPT, Nano Banana in Gemini). Connected, the same chat reads
  the brand, generates, and files the result in artbucket with its provenance
- **`artbucket login`** via device authorization, so the CLI needs no pasted key
- **Skill:** a `SKILL.md` teaching the workflow (brand rules first, `check_use`
  before publishing), installable with `npx skills add`. Covers agents without
  MCP (Codex, OpenClaw, Hermes) through the CLI
- **One-click installs:** Cursor deeplink, VS Code `mcp/install` link, Claude Code
  plugin bundling the MCP config and the skill
- **App builders as a first-class group:** Lovable, v0, Bolt, Replit. "Your
  vibe-coded app is on-brand" is the pitch no DAM and no scheduler can make
- **Design tools as a group:** Figma (the Figma agent and Figma Make take custom
  MCP connectors) connects straight to artbucket, so designs start from the real
  logo, palette and type scale instead of a screenshot of the guidelines
- **Generation tools, through the agent:** Canva, Adobe for Creativity
  (Firefly, Photoshop, Express), Recraft (native SVG), Ideogram (text in images)
  and Krea (one connection to Flux, Kling, Ideogram and more) have official MCP
  *servers*, not clients, so they cannot call artbucket. The agent holds both
  connections: brand rules and tokens in, generated file out, ingested with
  `origin: generated`, `generator` and `prompt`, then `check_use` before it
  ships. The skill carries this as a recipe; the picker shows it as "use with"
  pairs, not as a connect button
- **Automations:** n8n, Make, Zapier via their MCP client nodes or the OpenAPI
  spec. Snippets only
- **Agents page becomes a picker:** a grid grouped by chat apps, coding agents,
  app builders, design tools, generators, automations, anything else. One data array of
  `{name, icon, group, auth, snippet}`, no per-agent components
- **"Waiting for first call"** on setup, green when the new client first hits
  the API (keys track last use)
- **Keys become "Connected agents":** last seen, call count, proposals waiting
  in Review, revoke. Fed by the v0.7 audit log

**Not in this one:** custom n8n / Make / Zapier nodes, marketplace listings,
per-agent marketing pages (those go on the v0.9 docs site), a sidebar chatbot.
Midjourney until it ships an official MCP server (only relays exist). Video
generators (Veo, Kling, Seedance) wait on video renditions.
**Done when:** a person connects Claude.ai and ChatGPT by pasting one URL, with
no key, and sees each appear in Connected agents after its first call; and an
image generated in Recraft lands in Review with its generator and prompt.
_~2 weekends._

---

## v0.8 - Lifecycle
**Question:** can the wrong version stop leaking out?

- Version stacks with a "current approved" pointer, rollback, side-by-side compare
- States: draft → in review → approved → expired → archived
- **Expiry enforced at delivery** - rendition URLs 410 and caches purge
- Bulk operations

_~3 weekends._

---

## v0.9 - Hardening
**Question:** can a stranger run this in production without paging you?

- Migration path guarantees across versions
- S3 lifecycle rules: `staging/` expires after a day, `renditions/` after 30
- **Limits per organization:** one `limits` setting (storage, editors,
  workspaces, brands, features, read-only), unlimited by default, checked by one
  `checkLimit` at upload, grant and invitation, workspace, brand and API key
  creation. Settable only by the operator (environment or database), never by
  the organization's own admins
- **Usage accounting:** storage as the sum of asset sizes per organization,
  traffic as a daily per-workspace counter written by the delivery route, both
  shown in Settings
- Upload tickets know their workspace, so a quota is checked before any bytes
  move and again, authoritatively, at finalize
- **Soft delete:** a deleted asset keeps its bytes for 30 days, then a sweeper
  removes originals nothing references. Undo, and no race with an identical
  upload in another workspace
- Deleting a workspace or an organization, through the same path, so no bytes
  are orphaned
- Open sign-up as an option (`SIGNUP=open`): a new account gets its own
  organization. Closed stays the default
- Rate limits, CSP, security headers
- Docs site on [Mintlify](https://mintlify.com), modeled on
  [Postiz docs](https://docs.postiz.com/general/introduction), served at a custom
  domain (`docs.<domain>`), sidebar grouped into sections, one page per topic
  - **General:** introduction, quickstart, how it works (API, MCP, canon), support
  - **Installation:** one-click Render, Docker Compose, Docker, Fly, Kubernetes,
    Coolify, bare VPS
  - **Configuration:** every env var in one reference table, storage, auth providers
  - **Guides:** assets, canon, `/check`, portals
  - **Developers:** API reference generated from the v0.3 OpenAPI spec, MCP tools, CLI
  - Lives in `docs/` as MDX + `docs.json` in this repo, so docs change in the same
    PR as the code; Mintlify deploys from the GitHub app. Plain MDX keeps it portable
    if the hosted plan stops fitting
- Telemetry **off by default**

_~6 weekends. The unglamorous one that decides adoption._

---

## v1.0 - Stable contract
**Question:** can someone integrate and trust it?

- `/api/v1` frozen - semver, deprecation policy, no breaking changes without v2
- MCP tool signatures frozen
- SECURITY.md, CONTRIBUTING.md, ADRs for the load-bearing decisions
- AGPLv3 core; `ee/` reserved but empty
- Published benchmarks on a 100k-asset library

**v1.0 means one thing:** a promise not to break your integration.

---

## v1.1 - Brand portals
**Question:** can people outside the team self-serve the right assets?

- Public or login-gated portals per workspace: a curated, branded front door
  onto chosen collections (press kit, partner hub, retailer assets)
- Theming: logo, colors, custom domain, intro copy
- Only approved, unexpired assets show; expiry and lifecycle rules from v0.8
  apply unchanged
- Preset rendition downloads (web, print, social) instead of raw originals
- Access via v0.7 share-link rules: expiry, password, guest request-access
- Built as a plain API client, same as the main UI - no private endpoints

**Not in this one:** portal page builder. Portal usage lands in v1.7 analytics.
_~3 weekends._

---

## v1.2 - Full white-labeling
**Question:** can an agency or reseller run it as their own product?

- Per-org branding across the whole app, not just portals: logo, colors,
  favicon, product name, login screen
- Custom domains for the app itself, with automatic TLS
- Branded transactional email: sender name, domain, templates
- No artbucket marks anywhere a user or guest can see, including share links,
  downloads, and error pages
- One theme source of truth, reused by portals from v1.1

**Not in this one:** branded API docs, branded MCP server names.
_~3 weekends._

---

## v1.3 - Server email and brands in portals
**Question:** can a hosted server keep its email, and can portals carry a brand?

- Email set on the server is the server's alone; no organization overrides it
- Sign-up confirms the address with a six-digit code
- Portals publish brands beside collections: each brand's guidelines, read-only
- v1.3.1: `DOMAIN_TARGET`, the CNAME an organization's domain points to

---

## v1.4 - Private assets
**Question:** can an asset be seen only by the people it is meant for?

- `/a/{id}` serves people who can see the asset; anyone else needs a signed URL
  or the asset made public. Share links and portals sign what they show
- Domains verified by TXT and CNAME, several per organization, one per portal
- Agents propose custom field values, reviewed like tags

---

## v1.5 - Brand editing in place
**Question:** can the guidelines be edited where they are read?

- Notion-style editing: no Edit mode, "/" adds a rule or block, drag to
  reorder, autosave, undo
- Specimens: swatches, contrast pairings, type specimens, logo tiles
- A UX pass over the whole app
- v1.5.1 security fixes, v1.5.2 hardening

---

## v1.6 - Brand pages and the builder
**Question:** can a brand's guidelines become a site people read, built by a
person or an agent?

Shipped in 1.6.0.

- Pages over the rules: a page tree of sections from templates that show rules
  by key, so a rule changed once changes on every page
- The site wears the brand: theme with contrast guardrails, rules in depth
  (print palettes, type roles, logo kits, diagrams), icons
- The builder: edit pages where they read, layers, multi-select, a library
  panel, Cmd+K, changes since the last publish, review comments on sections
- Start blank, from the rules, or from a template
- Portals publish pages; publishing is a version, drafts never leak
- Buildable end to end over MCP
- Brand as code: the brand as YAML in a Git repository, changed on either
  side and merged a rule at a time, with previews of a proposed change

---

## v1.7 - Analytics
**Question:** which assets actually get used, where, and by whom?

In progress: 1.6.0 ships its foundation, the `events` table and the Insights
page (brand answers, release adoption, the use-check log, "Used in").

Modeled on [DataFast](https://datafa.st): one screen, real-time, cookieless,
and every number tied to the thing you care about. There it is revenue; here it
is the asset.

- **Asset-first, not pageview-first:** every chart drills down to an asset, and
  every asset page shows its own usage. The question is "is this logo pulling its
  weight", not "how many sessions"
- **Delivery is the tracker:** rendition requests (v0.1) and downloads are logged
  server side, with referrer, format, and size. No script, no cookies, nothing an
  ad blocker can drop, and embeds on third-party sites show up for free
- **Attribution by channel:** UI, API key, MCP agent, CLI, share link, portal
  (v1.1). Agent vs human usage side by side, the number no other DAM shows
- **Where it lives:** top referring domains per asset, so you find the partner
  site still hot-linking last year's logo
- **Real-time view:** live feed of fetches and downloads as they happen
- **Goals and funnels:** portal visit, search, preview, download; and `/check`
  (v0.6) refusals by reason, so the canon's gaps show up as data
- **Dead weight report:** assets never fetched in N days, a direct input to
  archive decisions (v0.8)
- **Weekly digest:** top assets, new referrers, blocked uses, by email
- Stored in Postgres, rolled up daily, raw events pruned on a schedule; IPs
  hashed with a rotating salt, never stored. Same `/api/v1` and MCP surface as
  everything else, so an agent can ask "what did partners download last month"

**Not in this one:** third-party web analytics, cross-site visitor tracking,
revenue attribution. This is first-party usage data, separate from the v0.9
telemetry, which stays off.
**Done when:** you can name the ten most-used assets this month, the channel
each came through, and every external domain embedding a superseded logo.
_~3 weekends._

---

## v1.8 - Migration
**Question:** can a team leave their current DAM in an afternoon?

A complete switching strategy, not a pile of one-off scripts.

- **Sources:** Brandfolder, Bynder, Canto, Frontify, plus a generic
  folder + CSV/JSON sidecar format that anything else can export to
- **One pipeline:** each source is an adapter that emits a common manifest;
  ingest, dedupe, and metadata mapping are shared, and go through `/api/v1`
  like every other client
- **Field mapping:** source fields map to v0.2 custom schemas, with a saved,
  reusable mapping file; unmapped fields are kept, not dropped
- **Structure preserved:** collections, tags, versions, rights and expiry
  (v0.6, v0.8), and original IDs stored for cross-reference
- **Canon import:** Frontify guidelines and brand portal colors, fonts, and
  logos land as v0.5 brand rules, as `proposed` records a human promotes
- **Safe to run:** dry-run report first (counts, conflicts, unmappable
  fields), resumable after failure, idempotent on rerun thanks to SHA-256 dedupe
- **Delta sync:** rerun against the old system during a cutover window to
  pick up late changes, so teams can run both side by side
- **Link continuity:** redirect map from old public URLs to artbucket
  rendition URLs, so embedded links keep working
- Available from the CLI (v0.4) and a migration page in the UI; docs get a
  per-source migration guide

**Not in this one:** two-way sync, migrating *out* beyond the standard export.
**Done when:** a 10k-asset Brandfolder export imports with zero lost metadata
and a clean dry-run diff on rerun.
_~4 weekends._

---

## v1.9 - Bring your own bucket
**Question:** can an organization keep its files in its own bucket, on a
server someone else runs?

The open-source promise, extended to Cloud: your metadata is already yours,
now the bytes can be too. Also the answer to data residency (an EU bucket, an
R2 jurisdiction) and to contractual isolation.

- **Storage is a setting:** one `storage` setting on the organization
  (endpoint, public endpoint, region, bucket, path style, keys sealed like
  every other secret). Unset, the server's `S3_*` bucket stays the default, so
  self-hosters notice nothing
- **`storageFor(org)` replaces the singleton:** delivery, uploads, previews,
  renditions, usage and the sweeper take their client from the asset's
  organization. No other code learns about buckets
- **Dedup per bucket:** identical bytes are stored once per bucket, not once
  per server. The byte lock, the sweeper and its marker work per bucket, so
  two organizations never sweep each other's files
- **Connect, then prove it:** saving the setting runs a test PUT, GET, HEAD and
  DELETE, checks CORS for browser uploads, and sets the `staging/` and
  `renditions/` lifecycle rules or says exactly which to add
- **Moving in and out:** switching buckets copies originals to the new one,
  resumable and checked by hash, and flips only when every byte is there. The
  old bucket is left untouched until a person confirms. Renditions regenerate
- **Safe on a shared server:** the endpoint must be public HTTPS, never a
  private or link-local address, so a setting can't point the server at its
  own network. Who may set it is the operator's call: operator-only by
  default, organization admins when the server allows it
- **Usage still counts:** storage stays the sum of asset sizes in Postgres,
  wherever the bytes live. An operator can leave bytes in an organization's own
  bucket out of its storage limit

**Not in this one:** a bucket per workspace, storage classes and cold tiers,
client-side encryption, non-S3 backends.
**Done when:** an organization on a shared server points at its own R2 bucket,
moves a 10k-asset library there with zero lost files, and the server's bucket
holds none of its bytes afterwards.
_~3 weekends._

---

## Later - Backup and restore
**Question:** can a lost file or a dropped table come back?

Planned, not scheduled. Picked up when a hosted server holds data someone
cannot lose.

- Postgres first: without it the bucket is a pile of hashes. Point-in-time
  recovery where the host offers it, plus a nightly `pg_dump` to another provider
- Originals only: they are content-addressed and never overwritten, so a nightly
  `rclone copy` of `assets/` to a second provider is incremental. `copy`, not
  `sync`, with a key that cannot delete, so a deletion never propagates.
  Renditions regenerate and staging is transient, so neither is backed up
- Deleted originals pruned from the backup after the soft-delete window, so
  erasure has a stated deadline
- A restore that is actually tested, documented step by step

_~2 weekends._

---

## Non-goals

PIM. Project management. A CMS. Video editing. Custom model training.
A sidebar chatbot. Integrate or skip.

## Deferred, with triggers

| Thing | Add when |
|---|---|
| pgvector / CLIP semantic search | Postgres FTS visibly fails on real queries |
| Job queue | Rendition p99 hurts |
| Video renditions, posters, transcripts | Someone actually asks |
| Elasticsearch / Typesense | Never, probably |
| SAML, SCIM | First paying customer requires it |
| Approval routing, annotations | After v1.0, if the thesis held |
