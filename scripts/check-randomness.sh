#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "$(docker info --format '{{.Name}}')" == build-host ]] || exit 1
artifact_owner="$(node -e 'console.log(process.getuid()+":"+process.getgid())')"
docker run --rm --init --name major-decision-randomness-check --network=host \
  --cpus=2 --memory=1024m --shm-size=256m --pids-limit=256 --security-opt no-new-privileges:true \
  --mount "type=bind,src=$PWD,dst=/repo,readonly" --mount "type=bind,src=$PWD/.review,dst=/artifacts" \
  -e "MD_ARTIFACT_OWNER=$artifact_owner" -e NODE_OPTIONS=--max-old-space-size=512 \
  -w /work mcr.microsoft.com/playwright:v1.63.0-noble bash -c '
    set -euo pipefail
    trap '\''chown -R "$MD_ARTIFACT_OWNER" /artifacts/randomness'\'' EXIT
    cp /repo/package.json /repo/package-lock.json /repo/scripts/check-randomness.mjs .
    npm ci --no-audit --no-fund >/tmp/randomness-install.txt 2>&1
    node check-randomness.mjs 2>&1 | tee /artifacts/randomness/smoke.txt
  '
