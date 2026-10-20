#!/usr/bin/env python3
"""Collect compact evidence, then verify it without keeping disposable .review.

Run locally, where the Git index is authoritative. --collect requires the full
big-one cycle and an explicitly written visual-review.json after actual viewing.
The default verifies retained evidence and current sources without rendering.
"""
import argparse
import hashlib
import json
import re
import subprocess
import tarfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.review'
OUT = ROOT / 'references/review/2026-10-20-motion'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read(path):
    return json.loads(path.read_text())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--collect', action='store_true')
    args = parser.parse_args()
    if args.collect:
        names = ['build-inputs.json', 'check-result.json', 'preview-check.json',
                 'geometry-check.json', 'continuity-check.json', 'change-measurement.json', 'camera-check.json',
                 'framing-check.json', 'early-framing-check.json', 'layout-framing-check.json',
                 'motion/seek-check.json', 'randomness/camera-independence.json',
                 'randomness/live-api.json', 'randomness/playback-check.json', 'media-check.json']
        checks = {name: read(WORK / name) for name in names}
        checks['before'] = {name: read(WORK / 'before' / name) for name in
                            ['build-inputs.json', 'check-result.json', 'preview-check.json', 'geometry-check.json', 'camera-check.json']}
        assert (WORK / 'seek-first.png').read_bytes() == (WORK / 'seek-return.png').read_bytes()
        checks['singleSeekByteIdentical'] = True
        checks['collectedAt'] = datetime.now(timezone.utc).isoformat()
        checks['reviewTools'] = {name: sha((ROOT / name).read_bytes()) for name in
                                ['scripts/check-remote.sh', 'scripts/check-preview.mjs', 'scripts/export-review.sh', 'scripts/export-review.mjs',
                                 'scripts/prepare-motion-review.py', 'scripts/check-review-media.sh',
                                 'scripts/check-review-media.mjs', 'scripts/check-randomness.sh',
                                 'scripts/check-randomness.mjs', 'scripts/verify-motion-review.py',
                                 'docs/visual-comparison.html', 'docs/camera-scenarios.html']}
        checks['rawFrames'] = {str(p.relative_to(WORK)): sha(p.read_bytes())
                              for directory in [WORK / 'export', WORK / 'randomness/export']
                              for p in sorted(directory.glob('*/frame-*.png'))}
        assert len(checks['rawFrames']) == 668
        # dist is deliberately excluded from workstation synchronization.
        # check-preview.mjs hashes the actual index and every served asset on
        # big-one; keep its independent report beside the build result.
        assert checks['preview-check.json']['indexSha256'] == checks['check-result.json']['indexSha256']
        (OUT / 'verification.json').write_text(json.dumps(checks, indent=2) + '\n')

    checks = read(OUT / 'verification.json')
    for name, digest in checks['reviewTools'].items():
        assert sha((ROOT / name).read_bytes()) == digest, f'Changed review tool: {name}'
    inputs = checks['build-inputs.json']
    current_inputs = {'package.json', 'package-lock.json', 'index.html', 'tsconfig.json', 'vite.config.ts', 'playwright.config.ts'}
    current_inputs.update(str(p.relative_to(ROOT)) for directory in ['src', 'public', 'tests']
                          for p in (ROOT / directory).rglob('*') if p.is_file())
    assert current_inputs == set(inputs['files']), 'The build input inventory changed'
    for name, digest in inputs['files'].items():
        assert sha((ROOT / name).read_bytes()) == digest, f'Changed build input: {name}'
    result = checks['check-result.json']
    assert result['testExit'] == 0 and result['selection'] == ['all']
    assert re.search(r'\b31 passed\b', (OUT / 'validation.txt').read_text())
    assert result['sourceSha256'] == inputs['sourceSha256']
    assert checks['preview-check.json']['indexSha256'] == result['indexSha256']
    assert not checks['preview-check.json']['referenceMediaInBuild']
    assert checks['singleSeekByteIdentical']
    seeks = checks['motion/seek-check.json']
    assert len(seeks) == 16 and all(s['byteIdentical'] for s in seeks)
    pairs = checks['randomness/camera-independence.json']
    assert {p['scenario'] for p in pairs} == {'left', 'right'}
    assert all(p['identicalCameraAndIndicator'] and len(p['times']) == len(p['matrices']) == 22 for p in pairs)
    media = checks['media-check.json']['result']
    assert len(media) == 3 and all(p['quarterSpeedPlayed'] for p in media)
    live = checks['randomness/live-api.json']
    assert live['build'] == result['indexSha256'] and len(live['responses']) == 2
    assert all(r['status'] == 200 and r['cors'] == '*' for r in live['responses'])
    assert not live['questionInRequest'] and not live['cookiesOrReferer']
    for phase, expected in [('after', {'yes', 'no'}), ('cross', {'left-no', 'right-yes'})]:
        export = read(OUT / f'{phase}-export.json')
        assert export['build'] == result['indexSha256'] and export['fps'] == 24
        assert export['exporterSha256'] == sha((ROOT / 'scripts/export-review.mjs').read_bytes())
        assert set(export['outcomes']) == expected
        for frames in export['outcomes'].values():
            assert len(frames) == 167 and frames[-1]['time'] == 6.9
            assert all(abs(f['time'] - min(i / 24, 6.9)) < 1e-12 and
                       abs(f['displayedTime'] - f['time']) <= .00051 for i, f in enumerate(frames))
        prefix = 'export' if phase == 'after' else 'randomness/export'
        for key, frames in export['outcomes'].items():
            assert all(f"{prefix}/{key}/{f['file']}" in checks['rawFrames'] for f in frames)

    before = read(OUT / 'before-export.json')
    assert before['build'] == checks['before']['check-result.json']['indexSha256']
    baseline = read(OUT / 'baseline.json')
    archive = OUT / 'before-source.tar.gz'
    assert sha(archive.read_bytes()) == baseline['archiveSha256']
    with tarfile.open(archive) as saved:
        archived = {m.name.removeprefix('./'): sha(saved.extractfile(m).read()) for m in saved.getmembers() if m.isfile()}
    assert archived == baseline['files']
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    assert head == baseline['head']
    parent_index = subprocess.check_output(['git', 'diff', '--cached', '--binary'], cwd=ROOT.parents[1])
    assert sha(parent_index) == baseline['parentStagedSha256']
    subprocess.run(['python3', 'scripts/check-references.py'], cwd=ROOT, check=True)

    viewed = read(OUT / 'visual-review.json')
    assert viewed['build'] == result['indexSha256']
    assert viewed['exportedFramesViewed'] == 668 and viewed['sequenceSheetsViewed'] == 24
    for name, digest in viewed['retainedFiles'].items():
        assert sha((OUT / name).read_bytes()) == digest, f'Changed viewed artifact: {name}'
    probes = read(OUT / 'video-probes.json')
    assert len(probes) == 10
    for name, probe in probes.items():
        assert sha((OUT / name).read_bytes()) == probe['sha256']
        assert len(probe['streams']) == 1 and probe['streams'][0]['codec_type'] == 'video'
    if args.collect:
        files = {str(p.relative_to(OUT)): sha(p.read_bytes()) for p in sorted(OUT.rglob('*'))
                 if p.is_file() and p.name != 'retained-manifest.json'}
        (OUT / 'retained-manifest.json').write_text(json.dumps(files, indent=2) + '\n')
    else:
        files = read(OUT / 'retained-manifest.json')
        actual = {str(p.relative_to(OUT)) for p in OUT.rglob('*') if p.is_file() and p.name != 'retained-manifest.json'}
        assert actual == set(files), 'The retained evidence inventory changed'
        for name, digest in files.items():
            assert sha((OUT / name).read_bytes()) == digest, f'Changed retained file: {name}'
    print(json.dumps(dict(inputFiles=len(inputs['files']), movies=len(probes), retainedFiles=len(files),
                          exportedFrames=668, exactSeekPairs=21, independentCameraPairs=44,
                          sourceSha256=inputs['sourceSha256'], indexSha256=result['indexSha256'],
                          beforeArchiveUnchanged=True, parentIndexUnchanged=True, head=head), indent=2))


if __name__ == '__main__':
    main()
