#!/usr/bin/env python3
"""Probe final videos and decode inspection sheets on big-one.

This creates evidence to inspect; it does not mark images as visually reviewed.
"""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
R = ROOT / '.review'
OUT = R / 'final-visual'
DECODED = OUT / 'decoded'
DECODED.mkdir(parents=True, exist_ok=True)
movies = [R / f'playback-{branch}.mp4' for branch in ['yes', 'no']]
movies += [R / area / 'comparisons' / f'{branch}-full.mp4'
           for area in ['motion', 'framing', 'materials', 'early-camera', 'layout', 'final-visual']
           for branch in ['yes', 'no']]
probes = {}
for movie in movies:
    probe = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_entries',
        'stream=codec_name,codec_type,width,height,duration,nb_frames:format=duration',
        '-of', 'json', str(movie)
    ], text=True))
    probe['sha256'] = hashlib.sha256(movie.read_bytes()).hexdigest()
    assert len(probe['streams']) == 1 and probe['streams'][0]['codec_type'] == 'video'
    probes[str(movie.relative_to(ROOT))] = probe
(OUT / 'video-probes.json').write_text(json.dumps(probes, indent=2) + '\n')

for branch in ['yes', 'no']:
    for kind, source, layout in [
        ('single', R / f'playback-{branch}.mp4', 'scale=384:220,pad=384:244:0:24:color=0x101726,drawtext=text=%{pts}:x=8:y=3:fontcolor=white:fontsize=16,tile=5x6'),
        ('triple', OUT / 'comparisons' / f'{branch}-full.mp4', 'scale=1440:300,pad=1440:324:0:24:color=0x101726,drawtext=text=%{pts}:x=8:y=3:fontcolor=white:fontsize=16,tile=1x10'),
    ]:
        subprocess.run([
            'ffmpeg', '-hide_banner', '-loglevel', 'error', '-threads', '2',
            '-filter_threads', '2', '-filter_complex_threads', '2',
            '-i', str(source), '-vf', 'fps=4,' + layout, '-threads', '2',
            '-y', str(DECODED / f'{branch}-{kind}-%02d.png')
        ], check=True)
print('Probed 14 MP4s; decoded both complete single and final-pass triptych movies at 4 fps.')
