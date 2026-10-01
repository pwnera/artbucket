#!/bin/sh
# The image is the app and its CLI:
#   docker run ghcr.io/pwnera/artbucket                        the server (CMD)
#   docker run ghcr.io/pwnera/artbucket login app.artbucket.io the CLI
# A program (node, sh, a path) runs as given, as in any image.
case "$1" in
  node | npm | npx | sh | ash | bash | env | */*) exec "$@" ;;
esac
# The CLI works on the folder mounted at /work, and keeps the key login saves in /config.
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-/config}"
[ "$PWD" = /app ] && cd /work
exec artbucket "$@"
