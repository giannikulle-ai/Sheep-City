#!/usr/bin/env bash
# Deploy the built web app to The Garage tile `sheep-city` (issue #12).
#
# Usage:  GARAGE_TOKEN=... tools/deploy/deploy.sh [--dry-run]
#
# Source, in order of preference:
#   1. apps/web/dist/                              the real web app build (once it exists)
#   2. prototype/luna-farm/build/farm_sim.html     uploaded as index.html until then
#
# Environment:
#   GARAGE_TOKEN          required. Bearer token for The Garage. Never printed.
#   GARAGE_URL            default https://lab.sheepcliff.com
#   GARAGE_TILE           default sheep-city
#   GARAGE_UPLOAD         git (default) or files. See docs/DEPLOY.md.
#   GARAGE_BRANCH         branch to push in git mode; default: the tile repo's HEAD, else main
#   GARAGE_AFTER          optional comma list of "deploy","restart": tile actions to call after upload
#   DEPLOY_SOURCE         force a source directory (with index.html) or a single .html file
#   GARAGE_SKIP_PREFLIGHT set to 1 to skip the GET /api/tiles/<tile> check (local testing only)
#
# Every call below is one the Garage's OpenAPI spec lists (observed by
# .github/workflows/garage-discover.yml, written down in docs/DEPLOY.md):
#   GET  /api/tiles/{name}                 tile exists / token works
#   git push {url}/git/{name}.git          "Push triggers deploy" (spec description)
#   PUT  /api/tiles/{name}/files           {"path": ..., "content": ...}   (files mode)
#   POST /api/tiles/{name}/deploy|restart  (only when GARAGE_AFTER asks)
# Do not change them from memory; re-run discovery and update docs/DEPLOY.md first.
set -euo pipefail

GARAGE_URL="${GARAGE_URL:-https://lab.sheepcliff.com}"
GARAGE_URL="${GARAGE_URL%/}"
GARAGE_TILE="${GARAGE_TILE:-sheep-city}"
GARAGE_UPLOAD="${GARAGE_UPLOAD:-git}"
GARAGE_AFTER="${GARAGE_AFTER:-}"
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '2,27p' "$0"; exit 0 ;;
    *) echo "deploy.sh: unknown argument '$arg'" >&2; exit 2 ;;
  esac
done

log() { printf '%s\n' "deploy: $*"; }
die() { printf '%s\n' "deploy: ERROR: $*" >&2; exit 1; }

# 1. The token. Fail loudly and early; never echo it.
if [ -z "${GARAGE_TOKEN:-}" ]; then
  cat >&2 <<'MSG'
deploy: ERROR: GARAGE_TOKEN is not set.
  The Garage needs a bearer token on every request. In GitHub Actions it comes
  from the GARAGE_TOKEN repository secret (Settings > Secrets and variables >
  Actions). Locally, export it in your shell; never put it in a file in this repo.
MSG
  exit 1
fi
if [ -n "${GITHUB_ACTIONS:-}" ]; then
  echo "::add-mask::${GARAGE_TOKEN}"
fi
case "$GARAGE_UPLOAD" in git|files) ;; *) die "GARAGE_UPLOAD must be 'git' or 'files', not '$GARAGE_UPLOAD'";; esac

# Print text with the token value replaced, in case a response ever echoes it.
redact() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import os,sys; t=os.environ["GARAGE_TOKEN"]; sys.stdout.write(sys.stdin.read().replace(t, "[REDACTED]"))'
  else
    cat
  fi
}

# 2. Pick the source and stage it so the upload always sees a directory with index.html.
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
STAGE="$WORK/site"
mkdir -p "$STAGE"

SOURCE="${DEPLOY_SOURCE:-}"
if [ -z "$SOURCE" ]; then
  if [ -f apps/web/dist/index.html ]; then
    SOURCE=apps/web/dist
  elif [ -f prototype/luna-farm/build/farm_sim.html ]; then
    SOURCE=prototype/luna-farm/build/farm_sim.html
  else
    die "nothing to deploy: neither apps/web/dist/index.html nor prototype/luna-farm/build/farm_sim.html exists"
  fi
fi
if [ -d "$SOURCE" ]; then
  [ -f "$SOURCE/index.html" ] || die "source directory $SOURCE has no index.html"
  cp -R "$SOURCE"/. "$STAGE"/
  rm -rf "$STAGE/.git"
elif [ -f "$SOURCE" ]; then
  cp "$SOURCE" "$STAGE/index.html"
else
  die "source $SOURCE does not exist"
fi
FILE_COUNT="$(find "$STAGE" -type f | wc -l | tr -d ' ')"
log "source: $SOURCE"
log "staged $FILE_COUNT file(s), $(du -sh "$STAGE" | cut -f1) total, upload mode: $GARAGE_UPLOAD, tile: $GARAGE_TILE at $GARAGE_URL"

if [ "$DRY_RUN" = 1 ]; then
  log "dry run: files that would be uploaded:"
  (cd "$STAGE" && find . -type f | sort | sed 's|^\./|  |')
  exit 0
fi

# Auth for curl goes through a header file (mode 600, deleted on exit), not argv.
HDR="$WORK/auth-header"
umask 077
printf 'Authorization: Bearer %s\n' "$GARAGE_TOKEN" > "$HDR"
umask 022
api() {  # api METHOD PATH [curl args...]  -> sets API_STATUS and API_BODY (token-redacted)
  local method="$1" path="$2"; shift 2
  local out="$WORK/resp.$$"
  API_STATUS="$(curl -sS -o "$out" -w '%{http_code}' -X "$method" -H @"$HDR" --max-time 120 "$@" "${GARAGE_URL}${path}")" || API_STATUS=000
  API_BODY="$(redact < "$out")"; rm -f "$out"
}

# 3. Preflight: does the token work and does the tile exist?
if [ "${GARAGE_SKIP_PREFLIGHT:-0}" != 1 ]; then
  api GET "/api/tiles/${GARAGE_TILE}"
  case "$API_STATUS" in
    200) log "tile '${GARAGE_TILE}' found: $(printf '%s' "$API_BODY" | head -c 2000)" ;;
    401|403) die "The Garage rejected the token (HTTP $API_STATUS): $API_BODY" ;;
    404)
      # The tile does not exist yet. The spec's claim call is POST /api/tiles
      # with ClaimBody {name, note}; it answers 201. GARAGE_CLAIM=no disables this.
      if [ "${GARAGE_CLAIM:-auto}" = no ]; then
        die "tile '${GARAGE_TILE}' does not exist on The Garage (HTTP 404) and GARAGE_CLAIM=no. See docs/DEPLOY.md."
      fi
      log "tile '${GARAGE_TILE}' does not exist (HTTP 404); claiming it via POST /api/tiles"
      api POST /api/tiles -H 'Content-Type: application/json' \
        --data "{\"name\":\"${GARAGE_TILE}\",\"note\":\"Sheepcliff dev build, deployed from GitHub Actions\"}"
      case "$API_STATUS" in
        200|201) log "claimed tile '${GARAGE_TILE}': $(printf '%s' "$API_BODY" | head -c 2000)" ;;
        *) die "claim of tile '${GARAGE_TILE}' failed (HTTP $API_STATUS): $API_BODY" ;;
      esac
      api GET "/api/tiles/${GARAGE_TILE}"
      [ "$API_STATUS" = 200 ] || die "tile '${GARAGE_TILE}' still not readable after claim (HTTP $API_STATUS): $API_BODY"
      log "tile '${GARAGE_TILE}' ready: $(printf '%s' "$API_BODY" | head -c 2000)"
      ;;
    000) die "could not reach ${GARAGE_URL} (curl failed)" ;;
    *)   die "unexpected HTTP $API_STATUS from GET /api/tiles/${GARAGE_TILE}: $API_BODY" ;;
  esac
fi

# 4. Upload.
export GIT_TERMINAL_PROMPT=0
if [ "$GARAGE_UPLOAD" = git ]; then
  # The spec documents /git/{name}.git as the tile's bare repo served by git
  # http-backend, and says "Push triggers deploy". The bearer token travels as
  # an extra HTTP header configured through the environment, not on argv.
  REMOTE="${GARAGE_URL}/git/${GARAGE_TILE}.git"
  export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.extraHeader GIT_CONFIG_VALUE_0="Authorization: Bearer ${GARAGE_TOKEN}"
  export GIT_AUTHOR_NAME="sheepcliff-deploy" GIT_AUTHOR_EMAIL="deploy@sheepcliff.invalid"
  export GIT_COMMITTER_NAME="sheepcliff-deploy" GIT_COMMITTER_EMAIL="deploy@sheepcliff.invalid"

  BRANCH="${GARAGE_BRANCH:-}"
  if [ -z "$BRANCH" ]; then
    refs="$(git ls-remote --symref "$REMOTE" HEAD 2>&1 | redact)" || die "git ls-remote against ${REMOTE} failed: $refs"
    BRANCH="$(printf '%s\n' "$refs" | sed -n 's|^ref: refs/heads/\([^[:space:]]*\)[[:space:]]*HEAD$|\1|p' | head -n1)"
    [ -n "$BRANCH" ] || BRANCH=main
  fi
  log "git mode: pushing to ${REMOTE} branch ${BRANCH}"

  REPO="$WORK/repo"
  git init -q -b "$BRANCH" "$REPO"
  cd "$REPO"
  if git fetch -q --depth 1 "$REMOTE" "refs/heads/${BRANCH}" 2>/dev/null; then
    git reset -q --soft FETCH_HEAD     # continue the tile's history, index still holds its files
    log "tile repo has an existing '${BRANCH}' branch; committing on top of it"
  else
    log "tile repo has no '${BRANCH}' branch yet; first commit"
  fi
  cp -R "$STAGE"/. "$REPO"/
  git add -A
  MSG="deploy ${GITHUB_REPOSITORY:-sheep-city}@${GITHUB_SHA:-$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo local)}"
  git commit -q --allow-empty -m "$MSG"
  if ! out="$(git push -q "$REMOTE" "HEAD:refs/heads/${BRANCH}" 2>&1)"; then
    printf '%s\n' "$out" | redact >&2
    die "git push to ${REMOTE} failed"
  fi
  [ -z "$out" ] || printf '%s\n' "$out" | redact
  log "pushed $(git rev-parse --short HEAD) (${FILE_COUNT} files) to ${REMOTE} ${BRANCH}; the Garage deploys on push"
  cd "$REPO_ROOT"
else
  # files mode: one PUT per file. The write API takes JSON {"path","content"}
  # with content as a string, so only valid UTF-8 text files can go this way.
  command -v jq >/dev/null 2>&1 || die "files mode needs jq"
  bad=""
  while IFS= read -r f; do
    iconv -f UTF-8 -t UTF-8 "$f" >/dev/null 2>&1 || bad="$bad ${f#"$STAGE"/}"
  done < <(find "$STAGE" -type f)
  [ -z "$bad" ] || die "files mode can only send UTF-8 text; binary files:$bad. Use GARAGE_UPLOAD=git."
  while IFS= read -r f; do
    rel="${f#"$STAGE"/}"
    jq -n --arg p "$rel" --rawfile c "$f" '{path:$p, content:$c}' > "$WORK/payload.json"
    api PUT "/api/tiles/${GARAGE_TILE}/files" -H 'Content-Type: application/json' --data-binary @"$WORK/payload.json"
    [ "$API_STATUS" = 200 ] || die "PUT /api/tiles/${GARAGE_TILE}/files for ${rel} returned HTTP $API_STATUS: $API_BODY"
    log "wrote ${rel} ($(wc -c < "$f" | tr -d ' ') bytes): $(printf '%s' "$API_BODY" | head -c 200)"
  done < <(find "$STAGE" -type f | sort)
fi

# 5. Optional follow-up actions on the tile.
IFS=',' read -r -a actions <<< "$GARAGE_AFTER"
for action in "${actions[@]}"; do
  action="$(printf '%s' "$action" | tr -d '[:space:]')"
  [ -n "$action" ] || continue
  case "$action" in
    deploy|restart) ;;
    *) die "GARAGE_AFTER accepts 'deploy' and 'restart', not '$action'" ;;
  esac
  api POST "/api/tiles/${GARAGE_TILE}/${action}"
  [ "$API_STATUS" = 200 ] || die "POST /api/tiles/${GARAGE_TILE}/${action} returned HTTP $API_STATUS: $API_BODY"
  log "${action}: $(printf '%s' "$API_BODY" | head -c 400)"
done

log "done"
