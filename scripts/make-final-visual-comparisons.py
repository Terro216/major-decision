#!/usr/bin/env python3
"""All original stills and complete movies / preserved baseline / current.

Run on the configured build host, after the full checks and deterministic export. No image from
the film is ever copied into the application or its production build.
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
R = ROOT / '.review'
OUT = R / 'final-visual/comparisons'
OUT.mkdir(parents=True, exist_ok=True)
frames = json.loads((R / 'frames/index.json').read_text())
states = [
    dict(outcome='start', time=0, film='01_tie_02_00-02-150.png', app='machine-start.png'),
    dict(outcome='yes', time=6.9, film='01_tie_20_00-12-650.png', app='machine-yes.png'),
    dict(outcome='no', time=6.9, film='02_competition_19_00-13-500.png', app='machine-no.png'),
    *frames,
]

def ff(args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-threads', '2', '-filter_threads', '2', '-filter_complex_threads', '2', *args], check=True)

def stack(inputs, output, width=1440):
    filters = ';'.join(f'[{i}:v]scale={width}:{int(width*400/1920)}[v{i}]' for i in range(len(inputs)))
    filters += ';' + ''.join(f'[v{i}]' for i in range(len(inputs))) + f'vstack=inputs={len(inputs)}'
    ff([*[arg for f in inputs for arg in ['-i', str(f)]], '-filter_complex', filters, '-frames:v', '1', '-threads', '2', '-y', str(output)])

for state in states:
    branch, time = state['outcome'], state['time']
    crop = '1630:920:145:160' if branch != 'no' else '1623:915:154:163'
    inputs = [ROOT / 'references/film/screens' / state['film'], R / 'before-final-visual' / state['app'], R / state['app']]
    filters = []
    for i, caption in enumerate(['FILM', 'BEFORE FINAL PASS', 'CURRENT']):
        prefix = f'crop={crop},' if i == 0 else ''
        filters.append(f"[{i}:v]{prefix}scale=640:368,pad=640:400:0:32:color=0x101726,drawtext=text='{caption}  {branch.upper()}  {time:.2f}s':x=12:y=7:fontcolor=white:fontsize=18[v{i}]")
    filters.append('[v0][v1][v2]hstack=inputs=3')
    ff([*[arg for f in inputs for arg in ['-i', str(f)]], '-filter_complex', ';'.join(filters), '-frames:v', '1', '-threads', '2', '-y', str(OUT / f'{branch}-{time:.2f}.png')])

stack([OUT/'start-0.00.png', OUT/'yes-6.90.png', OUT/'no-6.90.png'], OUT/'shell.png')
for branch, moments in [('yes',[.4,.95,1.65,2.9,4.15,4.7,5.45,5.95,6.9]), ('no',[.4,.95,1.7,2.9,4.15,4.65,5.4,6.15,6.9])]:
    images = [OUT/f'{branch}-{time:.2f}.png' for time in moments]
    stack(images, OUT/f'{branch}-contact-sheet.png')
    for i, name in enumerate(['early', 'coil', 'ending']):
        stack(images[3*i:3*i+3], OUT/f'{branch}-{name}.png', 1920)
    inputs = [R/'film'/f'{branch}-excerpt.mp4', R/'before-final-visual'/f'playback-{branch}.mp4', R/f'playback-{branch}.mp4']
    filters = ';'.join(f"[{i}:v]fps=24,scale=640:368,setsar=1,pad=640:400:0:32:color=0x101726,drawtext=text='{caption} - {branch.upper()}':x=12:y=7:fontcolor=white:fontsize=18[v{i}]" for i, caption in enumerate(['FILM', 'BEFORE FINAL PASS - 24fps', 'CURRENT - 24fps'])) + ';[v0][v1][v2]hstack=inputs=3'
    ff([*[arg for f in inputs for arg in ['-i', str(f)]], '-filter_complex', filters, '-t', '7.3', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-threads', '2', '-y', str(OUT/f'{branch}-full.mp4')])
print('Saved 36 final-pass comparisons, seven detailed sheets and both complete triptychs.')
