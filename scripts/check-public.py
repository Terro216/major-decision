#!/usr/bin/env python3
"""Check public files without embedding the private identifiers being blocked."""
import argparse
import hashlib
from pathlib import Path
import re
import subprocess
import sys

BLOCKED = set(['a3b561658ebca7af85b60e4a471c0ac2f43486a11ed50441be4abffe6a2b1de8', 'c74d9ac271b61d9c9e3ca34f1ac7c1b669e66866a79c73a2df63878cff2c6e5e', 'ea28bad6c18f51acbde13df1791ce683427640a365f98bae61ff6780a5e6d34f', '7925d4736a89a863a11855f72acef38fcc388e684d386cca367a275156196416'])
PERSONAL_PATH = re.compile(rb'/(?:home|Users)/[a-zA-Z0-9_.-]+/')
TOKENS = re.compile(rb'[A-Za-z0-9][A-Za-z0-9_.-]*')
PRIVATE_KEY = re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----')


def violations(name, data):
    issues = []
    path = Path(name)
    if '.local' in path.parts or (path.name.startswith('.env') and path.name != '.env.example'):
        issues.append('private configuration is tracked')
    if b'\0' in data:
        return issues
    if PERSONAL_PATH.search(data):
        issues.append('personal absolute path')
    if PRIVATE_KEY.search(data):
        issues.append('private key')
    if any(hashlib.sha256(token).hexdigest() in BLOCKED for token in TOKENS.findall(data)):
        issues.append('private infrastructure identifier')
    return issues


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--staged', action='store_true', help='Inspect the index instead of working files')
    args = parser.parse_args()
    names = subprocess.check_output(['git', 'ls-files', '-z']).decode().split('\0')
    failures = []
    checked = 0
    for name in filter(None, names):
        if args.staged:
            data = subprocess.check_output(['git', 'show', ':' + name])
        else:
            path = Path(name)
            if not path.is_file():
                continue
            data = path.read_bytes()
        checked += 1
        for issue in violations(name, data):
            failures.append(f'{name}: {issue}')
    if failures:
        print('Public repository check failed:\n' + '\n'.join(failures), file=sys.stderr)
        return 1
    print(f'Public repository check passed ({checked} tracked files).')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
