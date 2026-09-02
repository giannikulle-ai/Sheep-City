#!/usr/bin/env bash
# Deploy the static web build to The Garage, tile `sheep-city`.
# See docs/DEPLOY.md. The real upload call is not wired yet (issue #2 scope);
# this script validates the environment and the build, then stops.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIST="$ROOT/apps/web/dist"
TILE="${GARAGE_TILE:-sheep-city}"

if [[ -z "${GARAGE_TOKEN:-}" ]]; then
  echo "deploy: GARAGE_TOKEN is not set." >&2
  echo "deploy: export the Garage bearer token in the environment (never in the repo) and retry." >&2
  exit 1
fi

if [[ ! -f "$DIST/index.html" ]]; then
  echo "deploy: no build at $DIST. Run 'npm run build' first." >&2
  exit 1
fi

echo "deploy: tile '$TILE', build $(du -sh "$DIST" | cut -f1) at $DIST"
echo "deploy: upload to The Garage is not implemented yet; see docs/DEPLOY.md."
exit 2
