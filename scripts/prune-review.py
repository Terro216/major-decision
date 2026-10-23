#!/usr/bin/env python3
"""Prune reproducible scratch media only after validating its retained iteration.

Dry run by default. Keep the two newest retained iterations unless --keep is
given. Never remove references, measurements, JSON evidence or full contact
sheets. Older RGB detail pairs can be rebuilt from the preserved control PNGs.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--review-root', type=Path, default=root / '.review')
    parser.add_argument('--archive-root', type=Path,
                        default=root / 'references/review/2026-10-21-perceptual/iterations')
    parser.add_argument('--keep', action='append', default=[])
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    review = args.review_root.resolve() / 'perceptual'
    archives = args.archive_root.resolve()
    candidates = sorted((p for p in archives.iterdir()
                         if p.is_dir() and re.fullmatch(r'\d+[a-z]?', p.name)),
                        key=lambda p: (int(re.match(r'\d+', p.name)[0]), p.name))
    keep = set(args.keep or [p.name for p in candidates[-2:]])
    planned = []
    detail_pairs = 0
    verified = 0
    skipped = []
    for archive in candidates:
        if archive.name in keep:
            continue
        scratch = review / f'iteration-{archive.name}'
        media = review / f'iteration-{archive.name}-media'
        if not scratch.exists() and not media.exists():
            continue
        manifest = json.loads((archive / 'manifest.json').read_text())
        required = {'after-yes.mp4', 'after-no.mp4', 'compare-yes.mp4',
                    'compare-no.mp4', 'check-result.json', 'media-playback.json'}
        if not required.issubset(manifest):
            skipped.append(dict(iteration=archive.name, reason='older evidence format'))
            continue
        for name, expected in manifest.items():
            file = archive / name
            if file.is_symlink() or file.resolve().parent != archive.resolve():
                raise RuntimeError(f'Unexpected archive path: {file}')
            if sha256(file) != expected:
                raise RuntimeError(f'Retained hash mismatch: {file}')
        verified += 1
        paths = []
        index_file = scratch / 'export/index.json'
        if index_file.is_file():
            index = json.loads(index_file.read_text())
            result = json.loads((archive / 'check-result.json').read_text())
            if index.get('build') != result.get('indexSha256'):
                raise RuntimeError(f'Export/build mismatch: {archive.name}')
            for branch in ['yes', 'no']:
                paths.extend((scratch / 'export' / branch).glob('frame-*.png'))
        for name in sorted(required & manifest.keys()):
            if not name.endswith('.mp4'):
                continue
            file = media / name
            if file.is_file():
                if sha256(file) != manifest[name]:
                    raise RuntimeError(f'Scratch video differs from retained file: {file}')
                paths.append(file)
        for file in paths:
            if file.is_symlink() or not file.resolve().is_relative_to(review):
                raise RuntimeError(f'Unexpected scratch path: {file}')
        planned.extend(paths)
    # Detail comparisons duplicate a source control PNG beside an unchanged
    # film frame. Even superseded partial trials can be rebuilt from those
    # sources; keep both originals and all measurements. Newer active trials
    # remain outside this cleanup window.
    def iteration_key(name):
        return int(re.match(r'\d+', name)[0]), name
    if keep:
        oldest_kept = min(map(iteration_key, keep))
        for directory in review.glob('iteration-*-rgb'):
            match = re.fullmatch(r'iteration-(\d+[a-z]?)-rgb', directory.name)
            if not match or iteration_key(match[1]) >= oldest_kept:
                continue
            scratch = review / f'iteration-{match[1]}'
            if not (scratch / 'capture.json').is_file():
                continue
            for file in directory.glob('*.png'):
                if not re.fullmatch(r'(yes|no)-\d+\.\d+\.png', file.name):
                    continue
                source = scratch / file.name
                if not source.is_file() or source.is_symlink():
                    continue
                if directory.is_symlink() or file.is_symlink() or not file.resolve().is_relative_to(review):
                    raise RuntimeError(f'Unexpected detail path: {file}')
                planned.append(file)
                detail_pairs += 1
    # All retained evidence is verified before the first deletion.
    total = sum(file.stat().st_size for file in planned)
    report = dict(apply=args.apply, verifiedArchives=verified, kept=sorted(keep),
                  files=len(planned), detailPairs=detail_pairs, bytes=total, gibibytes=round(total / 2**30, 3),
                  skipped=skipped)
    if args.apply:
        for file in planned:
            file.unlink(missing_ok=True)
    print(json.dumps(report))


if __name__ == '__main__':
    main()
