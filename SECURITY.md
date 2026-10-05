# Security Policy

## Supported versions

| Version | Security fixes |
|---|---|
| Latest 1.x minor | Yes |
| Previous 1.x minor | For three months after the next one ships |
| 0.x | No: upgrade to 1.x, which any 0.x reaches by starting it |

A fix never waits for a minor: it ships as a patch on each supported line.

## Reporting a vulnerability

**Please do not open a public issue.**

Report privately through GitHub Security Advisories:
https://github.com/pwnera/artbucket/security/advisories/new

Include reproduction steps and the affected version or commit. You'll get an
acknowledgement within 72 hours and an assessment within seven days. Fixes ship
as soon as they're ready; credit is given unless you'd rather stay anonymous.

## Scope

In scope: authentication and authorization flaws, unauthenticated access to
assets, SSRF, RCE (notably via image decoding), presigned-URL scope escapes, and
resource exhaustion through the rendition pipeline.

Out of scope: findings that require a malicious administrator, missing hardening
headers with no exploit path, and issues in a deployment's own infrastructure.

## Notes for operators

- The rendition endpoint decodes untrusted images with libvips. Keep `sharp`
  current, and put a CDN or rate limiter in front of `/a/*` on a public install:
  the built-in rate limit (`RATE_LIMIT`) covers `/api` only, and counts per
  process.
- Uploaded files are served from the app's origin under a sandboxing
  Content-Security-Policy, so an SVG or HTML upload opened directly runs no
  script. PDFs are exempt, since browsers show them in a viewer the sandbox
  would stop.
- A fresh install does nothing until its first account is made, and that
  account is the admin: make it before exposing the server, or set
  `SETUP_TOKEN`, which the first account then has to give; otherwise whoever
  gets there first owns it. Until then the API answers `403 setup_required`, API
  keys from an earlier version included; only asset bytes at `/a/{id}` stay
  served, so links already out in the world keep working.
- Set `BETTER_AUTH_SECRET` to a random value (`openssl rand -base64 32`); the
  app refuses to start in production without one. It also encrypts secrets
  kept in settings (an email provider's API key): change it and those have to
  be entered again.
- Cookie-signed writes are only taken from `APP_URL`'s origin; set it to the
  address people actually use.
- Rendition and original bytes at `/a/{id}` are public to anyone holding the
  URL, by design. Access control covers the API: search, descriptions, edits.
- Invitation links and share links are capabilities: whoever holds one can
  use it. Invitations work once and expire in a week; give share links a
  password and an end date when what they show matters.
