# Changelog

Every release after 1.8.0 is written here by the release pull request, from the commit subjects
([GOVERNANCE.md](GOVERNANCE.md#versions-and-releases)). The earlier ones are summarized by hand,
from [ROADMAP.md](ROADMAP.md).

## [1.10.1](https://github.com/pwnera/artbucket/compare/v1.10.0...v1.10.1) (2026-10-06)


### Fixes

* **pages:** an edit made from an older page is refused, not written over a colleague's ([b14bf54](https://github.com/pwnera/artbucket/commit/b14bf5411a85881910b7bdb4843cbc8728c3a56c))
* **pages:** refuse an edit made from an older page instead of writing over it ([11b8bd1](https://github.com/pwnera/artbucket/commit/11b8bd1136369507c8cd7b869ce81a34e328f37c))

## [1.10.0](https://github.com/pwnera/artbucket/compare/v1.9.0...v1.10.0) (2026-10-06)


### Features

* **auth:** SETUP_TOKEN for the first account ([320e9e2](https://github.com/pwnera/artbucket/commit/320e9e2cf5b4ef60dac72894eb523601e224fb95))


### Fixes

* **auth:** keep a session to the origin it was made at ([ab62fec](https://github.com/pwnera/artbucket/commit/ab62feca847cc6149102bb5452113a4edd790ec1))


### Documentation

* Pwnera SAS runs the project; no weekend estimates on the roadmap ([7713e3c](https://github.com/pwnera/artbucket/commit/7713e3c4356991edcca30c797528bbd2485cb2ff))
* Pwnera SAS runs the project; no weekend estimates on the roadmap ([2b443d5](https://github.com/pwnera/artbucket/commit/2b443d5c7d2b0fb0d8eacad86787e288b72188ed))
* **roadmap:** the status line through 1.9 ([865b571](https://github.com/pwnera/artbucket/commit/865b5713c29fc6ac52899cec92e83f7a28a51f96))
* **stability:** MCP tools refuse arguments they don't take, since 1.8.0 ([3ef0c38](https://github.com/pwnera/artbucket/commit/3ef0c385d916f88889fc7ffd5b62851f43053ac1))
* **stability:** say MCP tools refuse arguments they don't take, since 1.8.0 ([6fa90e8](https://github.com/pwnera/artbucket/commit/6fa90e8a69b40ea3ce1203d2d15734f9a7c4db9f))

## [1.9.0](https://github.com/pwnera/artbucket/compare/v1.8.1...v1.9.0) (2026-10-05)


### Features

* an operator can suspend an organization ([6c39c60](https://github.com/pwnera/artbucket/commit/6c39c60a7d5d33b3136ff648db8e5e92e1180a0c))
* an operator can suspend an organization ([6e39642](https://github.com/pwnera/artbucket/commit/6e39642b58b5a246242cc5515ac2144448d87b16))
* **app:** a Help menu, in the account menu and the command palette ([acfd3f0](https://github.com/pwnera/artbucket/commit/acfd3f0854456b556dc01a3af2100f2f1c201113))
* **app:** a Help menu, in the account menu and the command palette ([20a92c4](https://github.com/pwnera/artbucket/commit/20a92c47b722ca58c093f791148aa790040ac84f))
* **auth:** a proof of work on sign-up where Turnstile isn't ([efb9fda](https://github.com/pwnera/artbucket/commit/efb9fda4d77c0758a20e13e6a81a457d89cecf87))
* **auth:** a sign-up check, Turnstile on APP_URL, a proof of work elsewhere ([08865e8](https://github.com/pwnera/artbucket/commit/08865e8ffae0806166a933e4d0615fa61d956b1f))
* **auth:** optional Cloudflare Turnstile on sign-up ([397e353](https://github.com/pwnera/artbucket/commit/397e35379671aefded464d8f9ed9bd2c775f098d))
* **auth:** sign-up says it agrees to the operator's terms (TERMS_URL, PRIVACY_URL) ([01a4667](https://github.com/pwnera/artbucket/commit/01a4667712b4e6ab08554f43228d66343db34a1e))
* **auth:** where an account is made, it says going on agrees to the operator's terms ([0ac1c41](https://github.com/pwnera/artbucket/commit/0ac1c41d6d28eb957ef5cd9d7dae7e7da0a614bf))
* **hub:** BrandHub's footer links the server's privacy policy ([298edbf](https://github.com/pwnera/artbucket/commit/298edbfe0789561c32321553469dae14846eba6f))
* **login:** /login?mode=up opens on making an account, where sign-up is open ([4468282](https://github.com/pwnera/artbucket/commit/4468282bbf4b0bb99899928c1ca650e0b0aac3b0))
* **pages:** an embed loads its frame when the reader asks ([f181bd7](https://github.com/pwnera/artbucket/commit/f181bd79c8466ecf34e8d3220b7ad102afe6b94f))
* **portals:** privacy notice, request retention and click-to-load embeds for visitors ([d281300](https://github.com/pwnera/artbucket/commit/d2813001e7b7e7d1dc9cea3fa8fb9be314f74a27))
* **portals:** the sweeper forgets portal requests 90 days after their last use ([099695a](https://github.com/pwnera/artbucket/commit/099695ad9fdcd2207dcd72cfb6f27b1454f7520d))
* **portals:** visitors see where their data goes, and the privacy policy ([270c179](https://github.com/pwnera/artbucket/commit/270c17906403f63dc01f8658cae58f810fde6654))


### Fixes

* **access:** a caller who can open no workspace is told none, not the oldest one's name ([7c4c588](https://github.com/pwnera/artbucket/commit/7c4c588090ae305e2eae33bf9acbaa8a5228e3ad))
* **access:** joining by email domain or single sign-on lands in one workspace ([4ebe450](https://github.com/pwnera/artbucket/commit/4ebe45013937b246ecb9d4ff1403d101a7dd72c5))
* **access:** joining by email domain or single sign-on lands in one workspace ([6aab3cc](https://github.com/pwnera/artbucket/commit/6aab3cce0a10d22d2d4c48eb7fa6a49db60b87cc))
* **assets:** fetch URL imports outside the upload gate ([9e1a6b5](https://github.com/pwnera/artbucket/commit/9e1a6b59ca6608e70945eb67774d3cad69ccb06a))
* audit P0s: a fallback workspace kept private, hub share cards, the default brand off the count, sign-up links, plugin on Cloud ([f67bd05](https://github.com/pwnera/artbucket/commit/f67bd051cb752696978473600fb4ee3311b0058e))
* **audit:** sign-ins are shown only to the person who signed in ([4144b6d](https://github.com/pwnera/artbucket/commit/4144b6d1be4ff6ce9f7bcfff0cfea549a6733b3c))
* **auth:** an unbiased secret number for the proof of work ([38661c9](https://github.com/pwnera/artbucket/commit/38661c90bf15543bbbf52ad1df4cfb0a1b80123a))
* cap each organization's email a day; fetch URL imports outside the upload gate ([f964cfe](https://github.com/pwnera/artbucket/commit/f964cfeba84cd9c28d6098d8b88f51ed5e7606a6))
* **domains:** re-prove verified domains, unverify one whose TXT record is gone a week ([75bd6eb](https://github.com/pwnera/artbucket/commit/75bd6eb21213b5e85912ad27d13cf8a92c55d242))
* **hub:** share cards unfurl from the hub's host, and the sitemap is read at request time ([7fdd6c6](https://github.com/pwnera/artbucket/commit/7fdd6c6a92a52e435f8ba1338eaf2dbee66d018c))
* **hub:** start from a listing copies only files it hands out ([ae3ac4c](https://github.com/pwnera/artbucket/commit/ae3ac4c6444a20cfc592de2bb6c23c9cc67b4eed))
* **limits:** an untouched default brand does not take the plan's brand slot ([1253734](https://github.com/pwnera/artbucket/commit/1253734ec68b468d9185c79ba7f2f7cd73fc6fb6))
* **mail:** cap each organization's email a day ([507f79a](https://github.com/pwnera/artbucket/commit/507f79a3a0db944b23f9f4758651f6fb452962ed))
* **mail:** take the daily email cap from the organization's limits ([b2acc38](https://github.com/pwnera/artbucket/commit/b2acc38e31e761b743b6ee0aab5300b0340ef848))
* **mcp:** say what each scope does with an upload, and refuse self-approval ([f6e574d](https://github.com/pwnera/artbucket/commit/f6e574d6cfe702fd0cd0d3a546c3f214f8a8be5a))
* oversized uploads answer too_large in MB; verified domains are re-proved ([d8823cf](https://github.com/pwnera/artbucket/commit/d8823cf09782b106fd6c548c264d2bb518059d44))
* **plugin:** the Claude Code plugin connects to Artbucket Cloud unless ARTBUCKET_URL says otherwise ([816d536](https://github.com/pwnera/artbucket/commit/816d536582fb48307cd6884635add89483080c89))
* **portals:** count wrong portal passwords per address ([bde3a63](https://github.com/pwnera/artbucket/commit/bde3a63ed0c6699ebd91c8cab5416042a1a5cd02))
* **portals:** light by default, and the brand's dark logo in dark mode ([606c05b](https://github.com/pwnera/artbucket/commit/606c05b00852518482f61b5c1d6380211d30b2cd))
* **previews:** run converters without the server's environment ([d6a0f2a](https://github.com/pwnera/artbucket/commit/d6a0f2adc301e327613deaa28e9bb801efa3b2e7))
* **print:** draw at most two brand pages at once ([295c459](https://github.com/pwnera/artbucket/commit/295c4596a171ae54712de8f03969dcba0610ac66))
* **renditions:** bound what a URL alone can make ([61de5dc](https://github.com/pwnera/artbucket/commit/61de5dce2bddab7fe06fea34dbb84eadfdcd9a2f))
* **renditions:** bound what a URL alone can make ([8d81977](https://github.com/pwnera/artbucket/commit/8d81977e01f798509e9ba05361deb46769859f4c))
* scope-accurate agent review, and install docs that pin real releases ([c8ea785](https://github.com/pwnera/artbucket/commit/c8ea7851befe4eb66e7ffd2c94b656efc6689bc6))
* **sites:** light by default, logos that show, readable fades, links first ([cf8ac52](https://github.com/pwnera/artbucket/commit/cf8ac527d058a286e0e304d1db435adda96660cd))
* **sites:** quiet text that reads on both ends of a fade, and the name said once ([31f5e02](https://github.com/pwnera/artbucket/commit/31f5e02b4ac6516f57d4c931bb0b1bf14e34d186))
* **sites:** the brand's links first, GitHub leading, extra links in a menu ([6e46064](https://github.com/pwnera/artbucket/commit/6e46064a2b7b8d4960c9b88eacfbe3fc97fa72e7))
* **uploads:** refuse a file past 512 MB as too_large, in MB ([157320d](https://github.com/pwnera/artbucket/commit/157320d8613b3ef1ecb23cff0a3c3906cc4be8fe))


### Documentation

* **install:** pin releases and image tags that exist ([6924e78](https://github.com/pwnera/artbucket/commit/6924e7848ac807045479f465f9aa01fdc3c86ab1))
* no braces in a code span across lines, which MDX reads as an expression ([267874f](https://github.com/pwnera/artbucket/commit/267874f47b05c673b7ad57c65441e8908f7e9af8))
* regenerate openapi.json after merging main ([ca7b874](https://github.com/pwnera/artbucket/commit/ca7b874193a80bf6bee6d0f0461b65bcad44d999))
* suspending keeps the row's writer, lifting drops an empty row ([ca2f87b](https://github.com/pwnera/artbucket/commit/ca2f87bb7968269b1004bf4871e523e0e52742a7))

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
