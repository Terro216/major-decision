#!/usr/bin/env bash
set -euo pipefail
/usr/local/bin/major-decision-runner save
# Only this container's disposable checkouts and downloads are removed.
find /runner/_work -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
find /runner/_diag -maxdepth 1 -type f -mtime +7 -delete
