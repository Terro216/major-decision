#!/usr/bin/env python3
"""Encode deterministic review frames and matching reference excerpts on big-one."""
import json
import subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / '.review'
(REVIEW / 'film').mkdir(exist_ok=True)
export = json.loads((REVIEW / 'export/index.json').read_text())

def run(args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-threads', '2', '-filter_threads', '2', '-filter_complex_threads', '2', *args[:-1], '-threads', '2', '-y', args[-1]], check=True)

for outcome, clip, start in [('yes', '06m36s-06m50s.mp4', 5.7), ('no', '08m35s-08m50s.mp4', 6.2)]:
    common = ['-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']
    total_duration = len(export['outcomes'][outcome]) / export['fps'] + .5
    run(['-framerate', str(export['fps']), '-i', str(REVIEW / 'export' / outcome / 'frame-%03d.png'), '-t', str(total_duration), '-vf', 'scale=1240:-2,tpad=stop_mode=clone:stop_duration=0.5', '-r', '24', *common, str(REVIEW / f'playback-{outcome}.mp4')])
    film_crop = '1630:920:145:160' if outcome == 'yes' else '1623:915:154:163'
    run(['-ss', str(start), '-i', str(ROOT / 'references/film' / clip), '-t', '7.3', '-vf', f'crop={film_crop},scale=1240:700', *common, str(REVIEW / 'film' / f'{outcome}-excerpt.mp4')])
    duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(REVIEW / f'playback-{outcome}.mp4')], text=True))
    run(['-i', str(REVIEW / f'playback-{outcome}.mp4'), '-vf', f'fps={24/duration},scale=492:282,drawtext=text=%{{pts}}:fontcolor=white:fontsize=20:box=1:boxcolor=black,tile=4x6', '-frames:v', '1', str(REVIEW / f'playback-{outcome}-contact.png')])
    for source in [REVIEW / f'playback-{outcome}.mp4', REVIEW / 'film' / f'{outcome}-excerpt.mp4']:
        run(['-i', str(source), '-an', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '6', '-crf', '32', '-b:v', '0', str(source.with_suffix('.webm'))])
(REVIEW / 'playback-export.json').write_text(json.dumps({'kind': 'deterministic-review-export', 'fps': export['fps'], 'build': export['build'], 'duration': export['duration'], 'finalHold': .5}, indent=2))
print('Prepared two deterministic review videos, reference excerpts and playback contact sheets.')
