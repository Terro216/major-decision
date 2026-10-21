#!/usr/bin/env python3
"""Prepare the current release comparisons on big-one without overwriting old evidence."""
import argparse
import hashlib
import importlib.util
import json
import shutil
import socket
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.review'
parser = argparse.ArgumentParser()
parser.add_argument('phase', choices=['before', 'after', 'cross', 'comparisons'])
parser.add_argument('--review-dir', default='references/review/2026-10-21-release')
parser.add_argument('--baseline-dir', help='Use a previous review after-video as the before-video.')
args = parser.parse_args()
phase = args.phase
OUT = (ROOT / args.review_dir).resolve()
assert OUT.is_relative_to(ROOT / 'references/review'), 'Review media stays in ignored references/review.'
if socket.gethostname() != 'big-one':
    raise SystemExit('Run media preparation on big-one.')
spec = importlib.util.spec_from_file_location('media', ROOT / 'scripts/prepare-motion-review.py')
media = importlib.util.module_from_spec(spec)
spec.loader.exec_module(media)
media.OUT = OUT
media.WORK = WORK
OUT.mkdir(parents=True, exist_ok=True)
(WORK / 'inspection').mkdir(parents=True, exist_ok=True)

if phase in ['before', 'after', 'cross']:
    source = WORK / {'before':'before/export', 'after':'export', 'cross':'randomness/export'}[phase]
    index = json.loads((source / 'index.json').read_text())
    manifest = OUT / f'{phase}-export.json'
    if manifest.exists():
        raise SystemExit(f'Preserve completed evidence: {manifest}. Remove only an explicitly rejected attempt before regenerating.')
    for key, frames in index['outcomes'].items():
        assert len(frames) == 167 and frames[-1]['time'] == 6.9
        prefix = 'before' if phase == 'before' else 'after'
        movie = OUT / f'{prefix}-{key}.mp4'
        media.encode_frames(source / key, movie, index['fps'])
        media.sheets(movie, f'{prefix}-{key}')
    manifest.write_text(json.dumps(index, indent=2) + '\n')
else:
    if args.baseline_dir:
        baseline = (ROOT / args.baseline_dir).resolve()
        assert baseline != OUT and baseline.is_relative_to(ROOT / 'references/review')
        for branch in ['yes','no']:
            destination=OUT/f'before-{branch}.mp4'
            if destination.exists():
                assert destination.read_bytes()==(baseline/f'after-{branch}.mp4').read_bytes()
            else:
                shutil.copy2(baseline/f'after-{branch}.mp4',destination)
    for branch, clip, start, crop in [('yes','06m36s-06m50s.mp4',5.7,'1630:920:145:160'),('no','08m35s-08m50s.mp4',6.2,'1623:915:154:163')]:
        media.run(['-ss',str(start),'-i',str(ROOT/'references/film'/clip),'-t','7.46','-vf',f'crop={crop},scale=1240:700,setsar=1',*media.ENCODE,OUT/f'film-{branch}.mp4'])
        media.compare(branch)
    inputs, filters = [], []
    for i,(view,branch) in enumerate((v,b) for v in ['top','mouth','side'] for b in ['yes','no']):
        inputs.extend(['-i',str(WORK/'motion/after'/f'{branch}-{view}.png')])
        filters.append(f'[{i}:v]scale=640:368:force_original_aspect_ratio=decrease,pad=640:400:(ow-iw)/2:32:color=0x101726,setsar=1,drawtext=text={branch.upper()} {view.upper()} OPAQUE:x=12:y=5:fontcolor=white:fontsize=20[v{i}]')
    filters.append('[v0][v1][v2][v3][v4][v5]xstack=inputs=6:layout=0_0|640_0|0_400|640_400|0_800|640_800[out]')
    media.run([*inputs,'-filter_complex',';'.join(filters),'-map','[out]','-frames:v','1',OUT/'opaque-diagnostics.png'])
    for name in ['geometry-check.json','continuity-check.json','camera-check.json','framing-check.json','early-camera-check.json','build-inputs.json','check-result.json','webgl-resources.json']:
        if (WORK/name).exists(): shutil.copy2(WORK/name,OUT/name)
    for name in ['usability','audio']:
        shutil.copytree(WORK/name,OUT/name,dirs_exist_ok=True)
    for name in ['layout-framing-check.json','early-framing-check.json','visual-regression-check.json']:
        if (WORK/name).exists(): shutil.copy2(WORK/name,OUT/name)
    for name in ['build','check']:
        shutil.copy2(WORK/f'{name}.log',OUT/f'{name}.txt')
    probes={}
    for movie in sorted(OUT.glob('*.mp4')):
        probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','stream=codec_name,codec_type,width,height,duration,nb_frames:format=duration','-of','json',str(movie)],text=True))
        assert len(probe['streams'])==1 and probe['streams'][0]['codec_type']=='video'
        probe['sha256']=hashlib.sha256(movie.read_bytes()).hexdigest()
        probes[movie.name]=probe
    (OUT/'video-probes.json').write_text(json.dumps(probes,indent=2)+'\n')
print(f'Prepared {phase}: {OUT}')
