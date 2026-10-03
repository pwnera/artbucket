# Governance

How Artbucket is run, who decides, and what you can count on.

## Who decides

Artbucket has one maintainer, [@aminekaabachi](https://github.com/aminekaabachi), for
[Pwnera SAS](LICENSE), which holds its copyright. The maintainer decides what lands, in what order,
and when it ships. That is said plainly so nobody has to guess.

Decisions are made in the open:

- **What gets built, and in what order:** [ROADMAP.md](ROADMAP.md). Deferred work names the trigger
  that would bring it in; a feature request that says the trigger happened is the best kind.
- **Why things are the way they are:** [docs/decisions](docs/decisions/). A change that goes against
  a decision needs a new record that replaces it, in the same pull request.
- **What never breaks:** the v1 contract ([stability](docs/developers/stability.mdx)), held by a test.

## How work moves

1. **Issues** start at `needs-triage`. Triage gives each a type, an area and one of `accepted`,
   `needs-info`, `deferred` or `wontfix`, with a sentence saying why. `needs-info` closes itself
   after 14 days without an answer, and an answer reopens it.
2. **Accepted** issues are open to anyone; `help wanted` ones nobody is on, `good first issue` ones
   are small and well described. Say you're on one before starting.
3. **Pull requests** follow [CONTRIBUTING.md](CONTRIBUTING.md). CI checks the code, the migrations,
   the v1 contract, commit subjects (Conventional Commits) and, from anyone outside the
   repository's collaborators, the [Contributor License Agreement](CLA.md), signed once. The
   maintainer reviews every one.
4. **Releases** are cut by merging the release pull request, which collects what landed on `main`
   since the last one (below).

The maintainer aims to answer a new issue or pull request within a week, and a security report
within 72 hours ([SECURITY.md](SECURITY.md)).

## Versions and releases

- [Semantic versioning](https://semver.org). A fix is a patch, an addition a minor. A break of the
  v1 contract would be a major, served beside v1, never instead of it.
- Versions are made from commit subjects: every push to `main` updates one pull request,
  `chore: release x.y.z`, with the next version and [CHANGELOG.md](CHANGELOG.md). Merging it tags
  `vx.y.z`, publishes the GitHub release, the images (`ghcr.io/pwnera/artbucket`) and the CLI.
- Versions are not roadmap milestones. A roadmap item ships in whatever release it lands in, and
  its release notes say so.
- The latest minor gets fixes; security fixes also go to the previous minor for three months
  ([SECURITY.md](SECURITY.md)), from a `release/x.y` branch.

## Changing this document

Like any decision: a pull request, said in the open. If Artbucket gains maintainers, this page says
who they are and how they decide together before anything else changes.
