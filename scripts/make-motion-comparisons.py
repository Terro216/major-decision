#!/usr/bin/env python3
"""Film / preserved before / after. Run with ffmpeg on the configured build host only."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
R = ROOT / '.review'
OUT = R / 'motion/comparisons'
OUT.mkdir(parents=True, exist_ok=True)
frames = json.loads((R / 'frames/index.json').read_text())
before_export = json.loads((R / 'before-motion/export/index.json').read_text())

def ff(args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-threads', '2', *args], check=True)

for branch, clip, start, moments in [
    ('yes', '06m36s-06m50s.mp4', 5.7, [.6, 3.25, 4.15, 4.45, 4.95, 5.8]),
    ('no', '08m35s-08m50s.mp4', 6.2, [.6, 3.25, 4.15, 4.65, 5.15, 5.9]),
]:
    crop = '1630:920:145:160' if branch == 'yes' else '1623:915:154:163'
    comparisons = []
    for time, label in zip(moments, ['opening', 'pins', 'inlet', 'bore', 'outlet', 'target']):
        before_time = time
        if label in ['opening', 'pins']:
            film = R / 'motion/film' / f'{branch}-{label}.png'
            ff(['-ss', str(start + time), '-i', str(ROOT / 'references/film' / clip), '-frames:v', '1', '-threads', '2', '-y', str(film)])
            before_frame = min(before_export['outcomes'][branch], key=lambda f: abs(f['time'] - time))
            before_time = before_frame['time']
            before = R / 'before-motion/export' / branch / before_frame['file']
            after = R / 'motion/after' / f'{branch}-{time:.2f}.png'
        else:
            frame = next(f for f in frames if f['outcome'] == branch and f['time'] == time)
            film = ROOT / 'references/film/screens' / frame['film']
            before = R / 'before-motion' / frame['app']
            after = R / frame['app']
        filters = []
        for i, caption in enumerate(['FILM', 'BEFORE', 'AFTER']):
            prefix = f'crop={crop},' if i == 0 else ''
            stamp = before_time if i == 1 else time
            filters.append(f"[{i}:v]{prefix}scale=640:368,pad=640:402:0:34:color=0x101726,drawtext=text='{caption}  {branch.upper()}  {stamp:.2f}s  {label}':x=12:y=8:fontcolor=white:fontsize=18[v{i}]")
        filters.append('[v0][v1][v2]hstack=inputs=3')
        output = OUT / f'{branch}-{label}.png'
        ff(['-i', str(film), '-i', str(before), '-i', str(after), '-filter_complex_threads', '2', '-filter_complex', ';'.join(filters), '-frames:v', '1', '-threads', '2', '-y', str(output)])
        comparisons.append(output)
    inputs = [arg for f in comparisons for arg in ['-i', str(f)]]
    count = len(comparisons)
    filters = ';'.join(f'[{i}:v]scale=1260:264[v{i}]' for i in range(count)) + ';' + ''.join(f'[v{i}]' for i in range(count)) + f'vstack=inputs={count}'
    ff([*inputs, '-filter_complex_threads', '2', '-filter_complex', filters, '-frames:v', '1', '-threads', '2', '-y', str(OUT / f'{branch}-contact-sheet.png')])

    # Three complete, synchronized sequences; no film audio is copied.
    inputs = [R / 'film' / f'{branch}-excerpt.mp4', R / 'before-motion' / f'playback-{branch}.mp4', R / f'playback-{branch}.mp4']
    filters = ';'.join(f"[{i}:v]fps=24,scale=640:368,setsar=1,pad=640:400:0:32:color=0x101726,drawtext=text='{caption} - {branch.upper()}':x=12:y=7:fontcolor=white:fontsize=18[v{i}]" for i, caption in enumerate(['FILM','BEFORE - 12fps','AFTER - 24fps'])) + ';[v0][v1][v2]hstack=inputs=3'
    ff([*[arg for f in inputs for arg in ['-i', str(f)]], '-filter_complex_threads', '2', '-filter_complex', filters, '-t', '7.3', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-threads', '2', '-y', str(OUT / f'{branch}-full.mp4')])
    # Inspect every exported frame, not only the old reference checkpoints.
    sheets = R / 'motion/sequence'
    sheets.mkdir(exist_ok=True)
    ff(['-framerate', '24', '-i', str(R / 'export' / branch / 'frame-%03d.png'), '-vf', 'scale=360:207,drawtext=text=%{pts}:fontcolor=white:fontsize=18:box=1:boxcolor=black,tile=6x5', '-threads', '2', '-y', str(sheets / f'{branch}-%02d.png')])
print('Saved film / before / after for twelve problem moments, both full videos and every exported frame.')
