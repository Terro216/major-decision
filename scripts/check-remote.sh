#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(docker info --format '{{.Name}}')" != build-host ]]; then
  echo 'Use the Docker SSH shim targeting build-host.' >&2
  exit 1
fi
# Source is mounted read-only. Dependencies and compilation stay in this bounded
# disposable container; only review artifacts are written back to the checkout.
artifact_owner="$(node -e 'require("node:fs").mkdirSync(".review", { recursive: true }); console.log(process.getuid() + ":" + process.getgid())')"
docker run --rm --init --name major-decision-shell-check \
  --cpus=2 --memory=1536m --shm-size=256m --pids-limit=256 \
  --security-opt no-new-privileges:true \
  --mount "type=bind,src=$PWD,dst=/repo,readonly" \
  --mount "type=bind,src=$PWD/.review,dst=/artifacts" \
  -e MD_REVIEW_DIR=/artifacts -e MD_REFERENCE_ROOT=/repo -e "MD_ARTIFACT_OWNER=$artifact_owner" \
  -e NODE_OPTIONS=--max-old-space-size=768 -w /work \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  bash -c '
    set -euo pipefail
    trap '\''chown -R "$MD_ARTIFACT_OWNER" /artifacts'\'' EXIT
    # Firefox needs an audio backend to resolve a real AudioContext.resume().
    # A null sink stays inside this disposable container; no host device is used.
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends pulseaudio >/tmp/major-decision-audio-install.log 2>&1
    pulseaudio --start --exit-idle-time=-1 --load="module-null-sink sink_name=major_decision_qa"
    cp /repo/package.json /repo/package-lock.json /repo/tsconfig.json /repo/index.html /repo/vite.config.ts /repo/playwright.config.ts .
    cp -r /repo/src /repo/public /repo/tests .
    npm ci --no-audit --no-fund
    npm run build 2>&1 | tee /artifacts/build.log
    node /repo/scripts/build-metadata.mjs inputs /work /artifacts
    test_status=0
    npm run test:e2e -- --output=/artifacts/test-results "$@" 2>&1 | tee /artifacts/check.log || test_status=$?
    node /repo/scripts/build-metadata.mjs result /work /artifacts "$test_status" "$@"
    if [[ "$test_status" == 0 ]]; then
      rm -rf /artifacts/dist
      cp -r dist /artifacts/
    fi
    echo "Build and browser artifacts: .review (test exit $test_status)"
    exit "$test_status"
  ' check "$@"
