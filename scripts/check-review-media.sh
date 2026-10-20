#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "$(docker info --format '{{.Name}}')" == build-host ]] || { echo 'Use the Docker SSH shim targeting build-host.' >&2; exit 1; }
artifact_owner="$(node -e 'console.log(process.getuid() + ":" + process.getgid())')"
docker run --rm --init --name major-decision-review-media-check \
  --cpus=2 --memory=1024m --shm-size=256m --pids-limit=256 \
  --security-opt no-new-privileges:true \
  --mount "type=bind,src=$PWD,dst=/repo,readonly" \
  --mount "type=bind,src=$PWD/.review,dst=/artifacts" \
  -e "MD_ARTIFACT_OWNER=$artifact_owner" -e NODE_OPTIONS=--max-old-space-size=512 \
  -w /work mcr.microsoft.com/playwright:v1.63.0-noble \
  bash -c '
    set -euo pipefail
    trap '\''[[ ! -f /artifacts/media-check.json ]] || chown "$MD_ARTIFACT_OWNER" /artifacts/media-check.json'\'' EXIT
    cp /repo/package.json /repo/package-lock.json /repo/scripts/check-review-media.mjs .
    npm ci --no-audit --no-fund >/tmp/major-decision-media-install.log 2>&1
    node check-review-media.mjs 2>&1 | tee /artifacts/media-check.log
  '
