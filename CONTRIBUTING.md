# Contributing

Thanks for looking. This project has one maintainer, so a short
conversation before a large PR saves us both time.

## Before you write code

- **Bug fix?** Open a PR directly.
- **Anything larger?** Open an issue first. The [roadmap](ROADMAP.md) is
  deliberately opinionated about ordering, and some features are deferred on
  purpose with a stated trigger for adding them.
- **Looking for a way in?** Issues labeled `good first issue` are small and
  well described; `help wanted` ones are accepted and nobody is on them. Say
  you're taking one. Who decides what is in [GOVERNANCE.md](GOVERNANCE.md).

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

## The v1 contract

`/api/v1` and the MCP tools are frozen ([Stability](docs/developers/stability.mdx)).
Add, never change: a new optional input, a new response field, a new route.
When you add to the API or a tool:

```bash
pnpm docs:openapi      # the docs' API reference
pnpm contract:freeze   # takes the addition into contract/; refuses a break
```

`pnpm test` fails on a break, and CI checks your branch against the base
branch's contract too. If something truly has to go, deprecate it and open an
issue: it waits for v2.

## Decisions

The load-bearing ones are in [docs/decisions](docs/decisions/). A change that
goes against one needs a new record that replaces it, in the same PR.

## Database changes

```bash
pnpm db:generate   # writes a migration into drizzle/
pnpm db:migrate
```

Commit the generated SQL. Never edit an already-released migration: add a new
one. The app applies migrations in order when it starts, so any release
upgrades from any earlier one, and CI holds that promise three ways: the
schema must match the migrations, a migration on `main` can't change, and the
base branch's database, filled from `scripts/upgrade-fixture.sql`, must migrate
to yours. A migration that changes a table changes that fixture too.

## Contributor terms

Artbucket is under the [AGPLv3](LICENSE), and Pwnera SAS, which holds its
copyright, also licenses it commercially. For that to keep working, everyone
whose commits a pull request carries signs the
[Contributor License Agreement](CLA.md) once: a bot asks on your first pull
request, and you sign by posting the comment it gives. In short:

- You keep the copyright in your contribution.
- You give Pwnera SAS a perpetual, irrevocable, worldwide, royalty-free,
  non-exclusive license to use, copy, change and distribute your
  contribution, and to license it to others under any terms, the AGPLv3 and
  commercial licenses included, together with a license under any patent
  claims of yours that your contribution would otherwise infringe.
- Pwnera SAS keeps your contribution available under the AGPLv3 (or another
  open-source license) for as long as it distributes it.
- You have the right to give these licenses: the work is yours, or whoever
  owns it, such as your employer, has agreed.

Each commit's author must be linked to a GitHub account (its email added to
your GitHub settings), so the bot can tell who signed.

## Commits

Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`). Keep the
subject under 72 characters. CI checks every commit in a pull request, because
the changelog and the next version are made from them: a `fix:` is a patch, a
`feat:` a minor, and its subject is the line people read in the release notes.
Write it for them.

## Releases

Nobody bumps a version by hand. Each push to `main` updates the release pull
request, `chore: release x.y.z`; merging it tags the version and publishes the
release, the images and the CLI. How versions and support work is in
[GOVERNANCE.md](GOVERNANCE.md#versions-and-releases).
