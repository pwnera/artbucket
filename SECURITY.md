# Security Policy

## Supported versions

artbucket is pre-1.0. Only the latest release receives security fixes.

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
  current, and put a CDN or rate limiter in front of `/a/*` on a public install.
- A fresh install does nothing until its first account is made, and that
  account is the admin: make it before exposing the server, or whoever gets
  there first owns it. Until then the API answers `403 setup_required`, API
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
