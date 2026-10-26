#!/bin/sh
# Standalone image build. publish.yml is the canonical path; both
# derive BUN_VERSION from packageManager via scripts/bun-version.ts.
set -eu
ROOT="$(dirname "$0")/.."
BUN_VERSION="$(bun "$ROOT/scripts/bun-version.ts")"
exec docker build --build-arg "BUN_VERSION=$BUN_VERSION" \
  -f "$ROOT/apps/web/Dockerfile" "$ROOT" "$@"
