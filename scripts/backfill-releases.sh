#!/usr/bin/env bash
# One-off: tags every version released before release-please (release-please.yml) and gives each a
# GitHub release with its CHANGELOG.md section, so the Releases page and compare links have the
# whole history. Prints what it would do; --apply does it. Needs git and gh, signed in with write
# access. Idempotent: tags and releases that exist are left alone.
#
# The tags go up in one push: GitHub starts no workflow for a push of more than three tags, so no
# image or CLI is published for an old version (release.yml would not move latest anyway).
set -euo pipefail
cd "$(dirname "$0")/.."

apply=false; [ "${1:-}" = --apply ] && apply=true
run() { if $apply; then "$@"; else printf '  %q' "$@"; echo; fi; }

# The commit each version was set at on main (package.json's version), oldest first.
versions="
0.1.0 d28a070
0.2.1 cf536b1
0.4.0 a69d650
0.5.0 50a7b67
0.6.0 a48480e
0.7.0 e937477
0.7.5 d15c2fa
0.7.6 cbc34f8
0.8.0 3db1085
0.9.0 0c59202
1.0.0 fca3387
1.1.0 3cb1be3
1.2.0 4106175
1.2.1 b114aa2
1.2.2 85c5578
1.3.0 a5912a4
1.3.1 534a8c8
1.4.0 4a73c84
1.5.0 8b8e4a0
1.5.1 90c4858
1.5.2 72f834b
1.6.0 33a4db4
1.6.1 3a76038
1.7.0 9b1165c
"

git fetch -q --tags origin
new=()
echo "Tags:"
while read -r v sha; do
  [ -z "$v" ] && continue
  if git rev-parse -q --verify "refs/tags/v$v" >/dev/null; then echo "  v$v exists"; continue; fi
  [ "$(git show "$sha:package.json" | sed -n 's/.*"version": "\(.*\)".*/\1/p')" = "$v" ] || { echo "  $sha is not $v" >&2; exit 1; }
  run git tag -a "v$v" "$sha" -m "v$v"
  new+=("v$v")
done <<<"$versions"
if [ "${#new[@]}" -gt 0 ]; then
  [ "${#new[@]}" -gt 3 ] || { echo "Fewer than four new tags: push them by hand, one at a time, if you want release.yml to run." >&2; exit 1; }
  run git push origin "${new[@]}"
fi

echo "Releases:"
newest=$(awk '/^[0-9]/{v=$1} END{print v}' <<<"$versions")
while read -r v _; do
  [ -z "$v" ] && continue
  if gh release view "v$v" >/dev/null 2>&1; then echo "  v$v exists"; continue; fi
  notes=$(awk -v h="## $v " 'index($0, h) == 1 {on=1; next} /^## / {on=0} on' CHANGELOG.md)
  latest=false; [ "$v" = "$newest" ] && latest=true
  run gh release create "v$v" --verify-tag --title "v$v" --notes "$notes" --latest="$latest"
done <<<"$versions"

$apply || echo "Dry run. Run again with --apply to do it."
