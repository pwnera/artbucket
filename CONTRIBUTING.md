# Contributing

Thanks for looking. This is a young project with one maintainer, so a short
conversation before a large PR saves us both time.

## Before you write code

- **Bug fix?** Open a PR directly.
- **Anything larger?** Open an issue first. The [roadmap](ROADMAP.md) is
  deliberately opinionated about ordering, and some features are deferred on
  purpose with a stated trigger for adding them.

## Setup

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm dev
```

## Before you push

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## House rules

These are the conventions the codebase already follows.

1. **All logic lives in `src/lib/core/`.** The REST API, the MCP server and the
   CLI are thin adapters over it. If business logic appears in a route handler,
   it's in the wrong place.
2. **No private endpoints.** The web UI may only call `/api/v1`. If the UI needs
   something the public API can't do, extend the API.
3. **Prefer deleting to adding.** A new dependency needs to beat a few lines of
   standard library. A new abstraction needs a second caller.
4. **Non-trivial logic ships with a test.** One `node:test` file next to the
   code, asserting the thing that would break. No frameworks, no fixtures.
5. **Trust boundaries are never simplified.** Input validation, auth, and
   resource caps get the careful version, always.
6. **Deliberate shortcuts get a `ponytail:` comment** naming the ceiling and the
   upgrade path, e.g. `// ponytail: buffers the whole file; stream when video lands`.

## Database changes

```bash
pnpm db:generate   # writes a migration into drizzle/
pnpm db:migrate
```

Commit the generated SQL. Never edit an already-released migration.

## Commits

Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`). Keep the
subject under 72 characters.
