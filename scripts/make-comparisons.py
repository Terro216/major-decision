#!/usr/bin/env python3
"""Run on build-host after check-remote. Uses only stdlib and the host's ffmpeg.
Writes review artifacts; never writes original references or public assets.
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / '.review'
OUT = REVIEW / 'comparisons'
OUT.mkdir(exist_ok=True)
frames = json.loads((REVIEW / 'frames/index.json').read_text())
static = [
    dict(outcome='start', time=0, film='01_tie_02_00-02-150.png', app='machine-start.png'),
    dict(outcome='yes', time=6.9, film='01_tie_20_00-12-650.png', app='machine-yes.png'),
    dict(outcome='no', time=6.9, film='02_competition_19_00-13-500.png', app='machine-no.png'),
]

def ffmpeg(args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-threads', '2', *args], check=True)

for item in static + frames:
    film = ROOT / 'references/film/screens' / item['film']
    app = REVIEW / item['app']
    name = item['outcome'] if item in static else f"{item['outcome']}-{item['time']:.2f}"
    crop = '1630:920:145:160' if item['outcome'] != 'no' else '1623:915:154:163'
    filters = f"[0:v]crop={crop},scale=800:460,pad=800:494:0:34:color=0x101726,drawtext=text='FILM - {item['film'][:21]}':x=12:y=7:fontcolor=white:fontsize=17[f];[1:v]scale=800:460,pad=800:494:0:34:color=0x101726,drawtext=text='APP - {item['outcome'].upper()}  {item['time']:.2f}s':x=12:y=7:fontcolor=white:fontsize=17[a];[f][a]hstack"
    ffmpeg(['-i', str(film), '-i', str(app), '-filter_complex_threads', '2', '-filter_complex', filters, '-frames:v', '1', '-threads', '2', '-y', str(OUT / f'{name}.png')])

for outcome, moments in [('yes', [.4,1.9,3.65,4.15,4.45,5.45,5.8,5.95]), ('no', [.4,1.95,3.7,4.15,4.65,5.4,5.9,6.15])]:
    inputs = []
    for t in moments: inputs += ['-i', str(OUT / f'{outcome}-{t:.2f}.png')]
    filters = ';'.join(f'[{i}:v]scale=800:247[p{i}]' for i in range(8))
    filters += ';' + ''.join(f'[p{i}]' for i in range(8)) + 'xstack=inputs=8:layout=0_0|800_0|0_247|800_247|0_494|800_494|0_741|800_741'
    ffmpeg([*inputs, '-filter_complex_threads', '2', '-filter_complex', filters, '-frames:v', '1', '-threads', '2', '-y', str(OUT / f'{outcome}-contact-sheet.png')])
print(f'Created {len(static) + len(frames)} comparison pairs and two contact sheets in {OUT}')

ffmpeg(["-i", str(OUT / "start.png"), "-i", str(OUT / "yes.png"), "-i", str(OUT / "no.png"), "-filter_complex_threads", "2", "-filter_complex", "[0:v][1:v][2:v]vstack=inputs=3", "-frames:v", "1", "-threads", "2", "-y", str(OUT / "static-overview.png")])
