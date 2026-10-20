#!/usr/bin/env python3
"""Verify the already-reviewed phase-2 evidence; does not render or approve it.

Run in the local Git checkout after big-one checks/export/media preparation and
manual image review. The visual-review manifest must be written after viewing.
"""
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
R = ROOT / '.review'
OUT = R / 'final-visual'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def read(path):
    return json.loads(path.read_text())

inputs = read(R / 'build-inputs.json')
for name, digest in inputs['files'].items():
    assert sha((ROOT / name).read_bytes()) == digest, f'Changed build input: {name}'
result = read(R / 'check-result.json')
assert result['testExit'] == 0 and result['selection'] == ['all'], 'A complete successful test run is required'
assert result['sourceSha256'] == inputs['sourceSha256']
index_sha = sha((R / 'dist/index.html').read_bytes())
assert result['indexSha256'] == index_sha
assert read(R / 'preview-check.json')['indexSha256'] == index_sha
export = read(R / 'export/index.json')
assert export['build'] == index_sha and export['fps'] == 24
assert [len(export['outcomes'][b]) for b in ['yes', 'no']] == [167, 167]
assert all(export['outcomes'][b][-1]['time'] == 6.9 for b in ['yes', 'no'])
assert read(R / 'playback-export.json')['build'] == index_sha
seek = read(R / 'motion/seek-check.json')
assert len(seek) == 14 and all(c['byteIdentical'] for c in seek)
assert (R / 'seek-first.png').read_bytes() == (R / 'seek-return.png').read_bytes()
media = read(R / 'media-check.json')['result']
assert len(media) == 12 and all(c['quarterSpeedPlayed'] for c in media)

viewed = read(OUT / 'visual-review.json')
assert viewed['build'] == index_sha and viewed['exportedFramesViewed'] == 334
assert viewed['sequenceSheetsViewed'] == 12
for name, digest in viewed['files'].items():
    assert sha((ROOT / name).read_bytes()) == digest, f'Changed reviewed artifact: {name}'
for name, digest in viewed['browserAndLiveMedia'].items():
    assert sha((ROOT / name).read_bytes()) == digest, f'Changed playback artifact: {name}'
probes = read(OUT / 'video-probes.json')
assert len(probes) == 14
for name, probe in probes.items():
    assert sha((ROOT / name).read_bytes()) == probe['sha256'], f'Changed reviewed movie: {name}'
    assert len(probe['streams']) == 1 and probe['streams'][0]['codec_type'] == 'video'

# The independent route/answer change adds two complete cross combinations.
randomness = R / 'randomness'
cross_export = read(randomness / 'export/index.json')
assert cross_export['build'] == index_sha and cross_export['fps'] == 24
assert cross_export['exporterSha256'] == export['exporterSha256'] == sha((ROOT / 'scripts/export-review.mjs').read_bytes())
assert set(cross_export['outcomes']) == {'left-no', 'right-yes'}
assert all(len(frames) == 167 and frames[-1]['time'] == 6.9 for frames in cross_export['outcomes'].values())
cross_viewed = read(randomness / 'visual-review.json')
assert cross_viewed['build'] == index_sha and cross_viewed['sourceSha256'] == inputs['sourceSha256']
assert cross_viewed['exportedFramesViewed'] == 334 and cross_viewed['sequenceSheetsViewed'] == 12
for name, digest in cross_viewed['files'].items():
    assert sha((ROOT / name).read_bytes()) == digest, f'Changed cross-route artifact: {name}'
cross_media = read(randomness / 'media.json')
assert cross_media['build'] == index_sha
for name, digest in cross_media['files'].items():
    assert sha((ROOT / name).read_bytes()) == digest
camera_pairs = read(randomness / 'camera-independence.json')
assert {r['scenario'] for r in camera_pairs} == {'left', 'right'}
assert all(r['identicalCameraAndIndicator'] and len(r['times']) == len(r['matrices']) == 22 for r in camera_pairs)
live_api = read(randomness / 'live-api.json')
assert live_api['build'] == index_sha and len(live_api['responses']) == 2
assert all(r['status'] == 200 and r['cors'] == '*' for r in live_api['responses'])
assert not live_api['questionInRequest'] and not live_api['cookiesOrReferer']
cross_playback = read(randomness / 'playback-check.json')
assert cross_playback['build'] == index_sha and cross_playback['quarterSpeedPlayed']
assert len(cross_playback['seeks']) == 3 and all(len(states) == 4 for states in cross_playback['seeks'])
for name, digest in cross_playback['hashes'].items():
    assert sha((randomness / name).read_bytes()) == digest

snapshots = {}
for manifest in R.glob('before-*/snapshot.json'):
    files = read(manifest)['files']
    for name, digest in files.items():
        assert sha((manifest.parent / name).read_bytes()) == digest, f'Changed baseline: {manifest.parent.name}/{name}'
    snapshots[manifest.parent.name] = len(files)
baseline = read(R / 'before-final-visual/snapshot.json')
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
assert head == baseline['head']
parent_index = subprocess.check_output(['git', 'diff', '--cached', '--binary'], cwd=ROOT.parents[1])
assert sha(parent_index) == baseline['parentIndexSHA256']
report = dict(checkedAt=datetime.now(timezone.utc).isoformat(), sourceSha256=inputs['sourceSha256'], indexSha256=index_sha,
              inputFiles=len(inputs['files']), viewedFiles=len(viewed['files']), preservedSnapshots=snapshots,
              parentIndexUnchanged=True, head=head, mediaCombinations=len(media), exactWebglSeekPairs=15,
              exportedFrames=334, sequenceSheets=12, movies=len(probes))
report.update(crossExportedFrames=334, crossSequenceSheets=12, crossViewedFiles=len(cross_viewed['files']),
              independentCameraPairs=44, extraExactWebglSeekPairs=4, cameraAnswerCombinations=4,
              crossMovies=2, liveExternalAPI=True)
(OUT / 'final-consistency.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
