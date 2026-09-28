## What and why

<!-- What changes, and what problem it solves. Link the issue if there is one. -->

## Checklist

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass
- [ ] Business logic lives in `src/lib/core/`, not in a route handler
- [ ] The web UI still calls `/api/v1` only - no private endpoints added
- [ ] Non-trivial logic has a test that fails without the change
- [ ] Any deliberate shortcut carries a `ponytail:` comment naming its ceiling
- [ ] New migration committed (if the schema changed)
- [ ] I agree to the [contributor terms](https://github.com/pwnera/artbucket/blob/main/CONTRIBUTING.md#contributor-terms)
