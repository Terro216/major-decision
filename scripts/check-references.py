"""Verify the local film reference copies without modifying them."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "references"
manifest = json.loads((root / "manifest.json").read_text())
failures = []
for entry in manifest["files"]:
    path = root / "film" / entry["path"]
    if not path.is_file():
        failures.append(f"Missing: {entry['path']}")
    elif path.stat().st_size != entry["bytes"] or hashlib.sha256(
        path.read_bytes()
    ).hexdigest() != entry["sha256"]:
        failures.append(f"Changed: {entry['path']}")
if failures:
    raise SystemExit("\n".join(failures))
print(f"Verified {len(manifest['files'])} reference files.")
