#!/bin/sh
set -eu
case "${1-}" in
  api) DOCKERFILE="apps/server/Dockerfile" ;;
  web) DOCKERFILE="apps/web/Dockerfile" ;;
  *) echo "usage: $0 <api|web>" >&2; exit 1 ;;
esac
shift
ROOT="$(dirname "$0")/.."
BUN_VERSION="$(bun "$ROOT/scripts/bun-version.ts")"
exec docker build --build-arg "BUN_VERSION=$BUN_VERSION" \
  -f "$ROOT/$DOCKERFILE" "$ROOT" "$@"
