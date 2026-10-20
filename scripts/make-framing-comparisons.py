#!/usr/bin/env python3
"""Film / previous geometry-safe version / current framing. Run on build-host."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / '.review'
OUT = REVIEW / 'framing/comparisons'
OUT.mkdir(parents=True, exist_ok=True)
frames = json.loads((REVIEW / 'frames/index.json').read_text())

def ff(args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-threads', '2', '-filter_threads', '2', *args], check=True)

for branch, moments in [('yes', [4.95, 5.20, 5.45, 5.70, 5.80, 6.50]), ('no', [5.15, 5.40, 5.65, 5.90, 6.15, 6.55])]:
    crop = '1630:920:145:160' if branch == 'yes' else '1623:915:154:163'
    comparisons = []
    for time in moments:
        frame = next(f for f in frames if f['outcome'] == branch and f['time'] == time)
        inputs = [ROOT / 'references/film/screens' / frame['film'], REVIEW / 'before-framing' / frame['app'], REVIEW / frame['app']]
        filters = []
        for i, caption in enumerate(['FILM', 'BEFORE FRAMING', 'CURRENT']):
            prefix = f'crop={crop},' if i == 0 else ''
            filters.append(f"[{i}:v]{prefix}scale=640:368,pad=640:400:0:32:color=0x101726,drawtext=text='{caption}  {branch.upper()}  {time:.2f}s':x=12:y=7:fontcolor=white:fontsize=18[v{i}]")
        filters.append('[v0][v1][v2]hstack=inputs=3')
        output = OUT / f'{branch}-{time:.2f}.png'
        ff([*[arg for f in inputs for arg in ['-i', str(f)]], '-filter_complex_threads', '2', '-filter_complex', ';'.join(filters), '-frames:v', '1', '-threads', '2', '-y', str(output)])
        comparisons.append(output)
    filters = ';'.join(f'[{i}:v]scale=1440:300[v{i}]' for i in range(len(comparisons))) + ';' + ''.join(f'[v{i}]' for i in range(len(comparisons))) + f'vstack=inputs={len(comparisons)}'
    ff([*[arg for f in comparisons for arg in ['-i', str(f)]], '-filter_complex_threads', '2', '-filter_complex', filters, '-frames:v', '1', '-threads', '2', '-y', str(OUT / f'{branch}-contact-sheet.png')])
    inputs = [REVIEW / 'film' / f'{branch}-excerpt.mp4', REVIEW / 'before-framing' / f'playback-{branch}.mp4', REVIEW / f'playback-{branch}.mp4']
    filters = ';'.join(f"[{i}:v]fps=24,scale=640:368,setsar=1,pad=640:400:0:32:color=0x101726,drawtext=text='{caption} - {branch.upper()}':x=12:y=7:fontcolor=white:fontsize=18[v{i}]" for i, caption in enumerate(['FILM', 'BEFORE FRAMING - 24fps', 'CURRENT - 24fps'])) + ';[v0][v1][v2]hstack=inputs=3'
    ff([*[arg for f in inputs for arg in ['-i', str(f)]], '-filter_complex_threads', '2', '-filter_complex', filters, '-t', '7.3', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-threads', '2', '-y', str(OUT / f'{branch}-full.mp4')])

print('Saved twelve framing comparisons and two complete three-column videos.')
