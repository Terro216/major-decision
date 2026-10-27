#!/usr/bin/env python3
"""Film / before early-camera refinement / current, using ffmpeg on the configured build host."""
import argparse
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--stills-only', action='store_true')
args = parser.parse_args()
ROOT = Path(__file__).resolve().parents[1]
R = ROOT / '.review'
OUT = R / 'early-camera/comparisons'
OUT.mkdir(parents=True, exist_ok=True)
frames = json.loads((R / 'frames/index.json').read_text())

def ff(args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-threads', '2', '-filter_threads', '2', *args], check=True)

for branch, moments, final in [
    ('yes', [.95, 1.65, 2.9, 3.65, 4.15, 5.45], '01_tie_20_00-12-650.png'),
    ('no', [.95, 1.7, 2.9, 3.7, 4.15, 5.4], '02_competition_19_00-13-500.png'),
]:
    crop = '1630:920:145:160' if branch == 'yes' else '1623:915:154:163'
    comparisons = []
    for time in moments:
        frame = {'film': final, 'app': f'machine-{branch}.png'} if time == 6.9 else next(f for f in frames if f['outcome'] == branch and f['time'] == time)
        inputs = [ROOT / 'references/film/screens' / frame['film'], R / 'before-early-camera' / frame['app'], R / frame['app']]
        filters = []
        for i, caption in enumerate(['FILM', 'BEFORE EARLY CAMERA', 'CURRENT']):
            prefix = f'crop={crop},' if i == 0 else ''
            filters.append(f"[{i}:v]{prefix}scale=640:368,pad=640:400:0:32:color=0x101726,drawtext=text='{caption}  {branch.upper()}  {time:.2f}s':x=12:y=7:fontcolor=white:fontsize=18[v{i}]")
        filters.append('[v0][v1][v2]hstack=inputs=3')
        output = OUT / f'{branch}-{time:.2f}.png'
        ff([*[arg for f in inputs for arg in ['-i', str(f)]], '-filter_complex_threads', '2', '-filter_complex', ';'.join(filters), '-frames:v', '1', '-threads', '2', '-y', str(output)])
        comparisons.append(output)
    filters = ';'.join(f'[{i}:v]scale=1440:300[v{i}]' for i in range(len(comparisons))) + ';' + ''.join(f'[v{i}]' for i in range(len(comparisons))) + f'vstack=inputs={len(comparisons)}'
    ff([*[arg for f in comparisons for arg in ['-i', str(f)]], '-filter_complex_threads', '2', '-filter_complex', filters, '-frames:v', '1', '-threads', '2', '-y', str(OUT / f'{branch}-contact-sheet.png')])
    if args.stills_only:
        continue
    inputs = [R / 'film' / f'{branch}-excerpt.mp4', R / 'before-early-camera' / f'playback-{branch}.mp4', R / f'playback-{branch}.mp4']
    filters = ';'.join(f"[{i}:v]fps=24,scale=640:368,setsar=1,pad=640:400:0:32:color=0x101726,drawtext=text='{caption} - {branch.upper()}':x=12:y=7:fontcolor=white:fontsize=18[v{i}]" for i, caption in enumerate(['FILM', 'BEFORE EARLY CAMERA - 24fps', 'CURRENT - 24fps'])) + ';[v0][v1][v2]hstack=inputs=3'
    ff([*[arg for f in inputs for arg in ['-i', str(f)]], '-filter_complex_threads', '2', '-filter_complex', filters, '-t', '7.3', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-threads', '2', '-y', str(OUT / f'{branch}-full.mp4')])

print('Saved early-camera comparisons' + (' (stills only).' if args.stills_only else ' and both complete videos.'))
