#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "${MD_EXECUTION_HOST:-}" == big-one ]] || { echo 'CI builds and browsers belong on big-one.' >&2; exit 1; }
mkdir -p .review
export MD_REVIEW_DIR="$PWD/.review"
# The dedicated runner image provides Playwright browsers and PulseAudio.
# No host sound device, production checkout or Docker socket is required.
pulseaudio --start --exit-idle-time=-1 --load="module-null-sink sink_name=major_decision_ci"
npm ci --no-audit --no-fund
npm run build 2>&1 | tee .review/build.log
node scripts/build-metadata.mjs inputs "$PWD" "$MD_REVIEW_DIR"
test_status=0
npm run test:e2e -- --output=.review/test-results 2>&1 | tee .review/check.log || test_status=$?
node scripts/build-metadata.mjs result "$PWD" "$MD_REVIEW_DIR" "$test_status"
exit "$test_status"
