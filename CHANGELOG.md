# Changelog

Every release after 1.8.0 is written here by the release pull request, from the commit subjects
([GOVERNANCE.md](GOVERNANCE.md#versions-and-releases)). The earlier ones are summarized by hand,
from [ROADMAP.md](ROADMAP.md).

## [1.8.1](https://github.com/pwnera/artbucket/compare/v1.8.0...v1.8.1) (2026-10-03)


### Fixes

* **ci:** the CLA skips whoever can write here, by permission ([d161adc](https://github.com/pwnera/artbucket/commit/d161adcb9fd7e277788a9a42636769cbcbe4404a))
* **ci:** the terms check asks only those who can't write here ([c268842](https://github.com/pwnera/artbucket/commit/c268842dabd9f0c32aad8ba4d500c66ac19e7299))
* **ci:** the terms check asks only those who can't write here ([63362dd](https://github.com/pwnera/artbucket/commit/63362dd85647d79b3b784657444353ba2d2dc2b9))


### Documentation

* a contributor license agreement, signed once by comment ([0bc5508](https://github.com/pwnera/artbucket/commit/0bc5508f3f1117129f2274b971194d50cb98f1a5))
* a contributor license agreement, signed once by comment ([cced3c3](https://github.com/pwnera/artbucket/commit/cced3c37a6378899af31896fcdc050efde7fd5db))
* **cla:** version 1.0 is in force ([2f65072](https://github.com/pwnera/artbucket/commit/2f650729c267e95529552ba67ec11a710f4b176a))
* **roadmap:** milestones ahead have names, not version numbers ([d75c6ec](https://github.com/pwnera/artbucket/commit/d75c6ecb3a3f244c3fe15bf743cb924dbefe2e48))
* **roadmap:** milestones ahead have names, not version numbers ([9410890](https://github.com/pwnera/artbucket/commit/9410890d8b1d0cecca4ab33b718fad6a3ede1740))

## 1.8.0 (2026-10-03)

- Sign in with Google, and Google or OIDC sign-in at an organization's own domain.
- Any verified domain may serve the app, each turned on in Settings, Domains; one Domains tab, a
  Billing tab and Email sending in settings.
- Who sees an asset, said plainly and chosen at upload; private assets stay private on links,
  portals, uploads and deletes.
- Blocks edited where they read, guidelines that read like a person wrote them, a floating Edit on
  portals and BrandHub for editors.
- BrandHub: stars and follows, a badge that wears the brand.
- Agents across several workspaces, Connections in tabs, a key for MCP clients without OAuth; an
  MCP tool refuses an argument it doesn't take.
- A CLI push keeps what changed in the app, and a pull never eats unpushed work.
- Reliability: storage calls time out, downloads stream, failures say what happened, with Retry.

## 1.7.0 (2026-10-01)

- Analytics begins: the version that opens the roadmap's Analytics milestone, on top of 1.6.1.

## 1.6.1 (2026-10-01)

- Join an organization by its email domain, proved apart from single sign-on, and require single
  sign-on for a domain ([0015](docs/decisions/0015-joining-by-email-domain.mdx)).
- Motion across the app: uploads, releases, Insights, the Brand Agent Score, the builder.

## 1.6.0 (2026-09-30)

- Brand pages and the builder: a page tree of sections over the rules, the site wearing the brand,
  editing where pages read, review comments, buildable over MCP.
- Brand as code: the brand as YAML in a Git repository, merged a rule at a time.
- Releases as pages, BrandHub (listings, trust, claims, the public Brand Agent Score) and Insights
  (release adoption, the use-check log).

## 1.5.2 (2026-09-28)

- Hardening.

## 1.5.1 (2026-09-28)

- Security fixes.

## 1.5.0 (2026-09-28)

- Notion-style brand editing: "/" adds a rule or block, drag to reorder, autosave, undo.
- Specimens: swatches, contrast pairings, type specimens, logo tiles. A UX pass over the whole app.

## 1.4.0 (2026-09-28)

- Private assets: `/a/{id}` serves people who can see the asset, signed URLs for anyone else
  ([0012](docs/decisions/0012-private-delivery.mdx)).
- Domains verified by TXT and CNAME, several per organization. Agents propose field values.

## 1.3.1 (2026-09-28)

- `DOMAIN_TARGET`, the CNAME an organization's domain points to.

## 1.3.0 (2026-09-28)

- Email set on the server is the server's alone. Sign-up confirms the address with a code.
- Portals publish brands beside collections.

## 1.2.2 (2026-09-28)

- Fewer database round trips per request.

## 1.2.1 (2026-09-28)

- Boots behind a proxy and a connection pooler.

## 1.2.0 (2026-09-27)

- Full white-labeling: branding across the app, custom domains, branded email.

## 1.1.0 (2026-09-27)

- Brand portals: public or login-gated, themed, approved assets only, preset downloads.

## 1.0.0 (2026-09-27)

- The stable contract: `/api/v1` and the MCP tools frozen by a test
  ([stability](docs/developers/stability.mdx)). Security policy, contributing guide, decisions.

## 0.9.0 (2026-09-27)

- Hardening: limits per organization, usage accounting, soft delete, open sign-up as an option,
  rate limits and security headers, the docs site.

## 0.8.0 (2026-09-27)

- Lifecycle: version stacks, states from draft to archived, expiry enforced at delivery.

## 0.7.6 (2026-09-27)

- Storage that doesn't leak.

## 0.7.5 (2026-09-27)

- Every agent: OAuth on the MCP endpoint, `artbucket login`, the skill, one-click installs,
  Connected agents.

## 0.7.0 (2026-09-27)

- Multi-user: email and OIDC sign-in, organizations and workspaces, grants, share links, audit log.

## 0.6.0 (2026-09-27)

- Verdict and provenance: `POST /check`, rights fields, provenance, C2PA read and preserve.

## 0.5.0 (2026-09-27)

- The canon: brand rules as structured records, guidelines rendered from them.

## 0.4.0 (2026-09-27)

- The API becomes the product and the agent surface: scoped API keys, OpenAPI, the MCP server,
  review of what agents propose, the CLI.

## 0.2.1 (2026-09-27)

- Bulk actions, zip downloads, renditions, collection icons. Metadata, custom fields, tags,
  collections, search, facets and saved searches.

## 0.1.0 (2026-09-26)

- Walking skeleton: upload, content hashing, renditions by URL, a grid.
