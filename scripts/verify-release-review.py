#!/usr/bin/env python3
"""Verify retained release evidence, including after .review has been removed."""
import argparse
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--collect', action='store_true')
parser.add_argument('--normal-speed', action='store_true', help='Require complete 1x playback of both triples and all four route/answer videos.')
parser.add_argument('--review-dir', default='references/review/2026-10-21-release')
args = parser.parse_args()
OUT = (ROOT / args.review_dir).resolve()
assert OUT.is_relative_to(ROOT / 'references/review')
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda name: json.loads((OUT / name).read_text())
check = read('check-result.json')
assert check['testExit'] == 0 and check['selection'] == ['all'], 'Require a successful full run.'
inputs = read('build-inputs.json')
assert inputs['sourceSha256'] == check['sourceSha256']
for name, expected in inputs['files'].items():
    assert digest(ROOT / name) == expected, f'Checked source changed: {name}'
for phase, keys in [('after', ['yes', 'no']), ('cross', ['left-no', 'right-yes'])]:
    export = read(f'{phase}-export.json')
    assert export['build'] == check['indexSha256']
    fps = export['fps']
    assert fps in (24, 30)
    assert sorted(export['outcomes']) == sorted(keys)
    for key, frames in export['outcomes'].items():
        assert len(frames) == math.ceil(6.9 * fps) + 1 and frames[0]['time'] == 0 and frames[-1]['time'] == 6.9
        for i, frame in enumerate(frames):
            assert abs(frame['time'] - min(i / fps, 6.9)) < 1e-10
            assert abs(frame['displayedTime'] - frame['time']) < .00051
            assert frame['bounds'] == frames[0]['bounds']
            assert not any(value for pair in frame['scroll'] for value in pair)
baseline = read('baseline.json')
# The original source archive and earlier completed reviews are immutable.
if 'archiveSha256' in baseline:
    assert digest(OUT / 'before-source.tar.gz') == baseline['archiveSha256']
for name, expected in baseline.get('priorReview',{}).items():
    assert digest(ROOT / 'references/review/2026-10-20-motion' / name) == expected, f'Previous evidence changed: {name}'
for name, expected in baseline.get('previousReleaseFiles',{}).items():
    assert digest(ROOT/name)==expected, f'Previous release evidence changed: {name}'
for name, expected in baseline.get('previousArtifacts',{}).items():
    assert digest(ROOT / name) == expected, f'Previous evidence changed: {name}'
if 'filmManifestSha256' in baseline:
    film_manifest = ROOT / 'references/manifest.json'
    assert digest(film_manifest) == baseline['filmManifestSha256'], 'Original film inventory changed.'
    for original in json.loads(film_manifest.read_text())['files']:
        source = ROOT / 'references/film' / original['path']
        assert source.stat().st_size == original['bytes'] and digest(source) == original['sha256'], f'Original film changed: {original["path"]}'
probes = read('video-probes.json')
assert len(probes) == 10
for name, probe in probes.items():
    assert digest(OUT / name) == probe['sha256']
    assert len(probe['streams']) == 1 and probe['streams'][0]['codec_type'] == 'video'
    assert float(probe['format']['duration']) >= 6.9
viewed = read('visual-inspection.json')
assert viewed['completed'] and len(viewed['completeAfterSequences']) == 4
media = read('media-check.json')
assert len(media['result']) == 3 and all(r['quarterSpeedPlayed'] for r in media['result'])
if args.normal_speed:
    assert all(r.get('normalSpeedPlayed') for r in media['result'])
    for group, count in zip(media['result'], [3, 3, 4]):
        playback = group['normalSpeedPlayback']
        assert playback['wallSeconds'] >= 6.7 and len(playback['videos']) == count
        for video in playback['videos']:
            assert video['rate'] == 1 and video['ended'] and not video['error']
            assert video['duration'] >= 6.9 and abs(video['time']-video['duration']) < .03
            assert any(start < .05 and end >= video['duration']-.05 for start, end in video['played'])
production = read('production-smoke.json')
assert production['base'] == 'https://decision.ilyamedve.dev'
assert len(production['runs']) == 4 and all(not r['errors'] and not r['questionInStorage'] for r in production['runs'])
assert production['expected']['sourceSha256'] == check['sourceSha256']
manifest_path = OUT / 'retained-files.json'
files = {str(p.relative_to(OUT)): digest(p) for p in sorted(OUT.rglob('*')) if p.is_file() and p != manifest_path}
if args.collect:
    manifest_path.write_text(json.dumps(files, indent=2) + '\n')
else:
    assert read('retained-files.json') == files, 'Retained artifact inventory changed.'
print(f'Verified {len(files)} retained files, complete four-pair export, checked source and production smoke.')
