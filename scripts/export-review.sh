#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "$(docker info --format '{{.Name}}')" == big-one ]] || { echo 'Use the Docker SSH shim targeting big-one.' >&2; exit 1; }
artifact_owner="$(node -e 'console.log(process.getuid() + ":" + process.getgid())')"
docker run --rm --init --name major-decision-review-export \
  --cpus=2 --memory=1536m --shm-size=256m --pids-limit=256 \
  --security-opt no-new-privileges:true --network=host \
  --mount "type=bind,src=$PWD,dst=/repo,readonly" \
  --mount "type=bind,src=$PWD/.review,dst=/artifacts" \
  -e MD_REVIEW_DIR=/artifacts -e "MD_ARTIFACT_OWNER=$artifact_owner" \
  -e "MD_REVIEW_FPS=${MD_REVIEW_FPS:-24}" \
  -e "MD_PREVIEW_URL=${MD_PREVIEW_URL:-http://127.0.0.1:4175}" \
  -e NODE_OPTIONS=--max-old-space-size=768 -w /work \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  bash -c '
    set -euo pipefail
    trap '\''for directory in /artifacts/export /artifacts/recordings /artifacts/randomness; do [[ ! -d "$directory" ]] || chown -R "$MD_ARTIFACT_OWNER" "$directory"; done; for f in /artifacts/playback-*-slow-raw.webm; do [[ ! -f "$f" ]] || chown "$MD_ARTIFACT_OWNER" "$f"; done'\'' EXIT
    cp /repo/package.json /repo/package-lock.json .
    mkdir scripts
    cp /repo/scripts/export-review.mjs scripts/
    cp -r /repo/src .
    npm ci --no-audit --no-fund >/tmp/major-decision-export-install.log 2>&1
    node scripts/export-review.mjs "$@" 2>&1 | tee /artifacts/export${1:+-cross}.log
  ' export "$@"
