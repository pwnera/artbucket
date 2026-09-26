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
- v0.1 ships **no authentication**. Do not expose it to the internet. Multi-user
  auth and RBAC land in v0.7 - see [ROADMAP.md](ROADMAP.md).
