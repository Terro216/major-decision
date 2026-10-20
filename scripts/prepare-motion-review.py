#!/usr/bin/env python3
"""Compact film/before/after evidence. Run on build-host; retain movies, not raw frames."""
import argparse
import hashlib
import json
import shutil
import socket
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.review'
OUT = ROOT / 'references/review/2026-10-20-motion'
BASE = ['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-threads', '2', '-filter_threads', '2', '-filter_complex_threads', '2']
ENCODE = ['-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']

def run(args):
    bounded = []
    for arg in args[:-1]:
        if arg == '-i':
            bounded.extend(['-threads', '2'])
        bounded.append(arg)
    subprocess.run(BASE + bounded + ['-threads', '2', '-y', str(args[-1])], check=True)

def encode_frames(source, destination, fps):
    run(['-framerate', str(fps), '-i', str(source / 'frame-%03d.png'),
         '-vf', 'scale=1240:-2,setsar=1,tpad=stop_mode=clone:stop_duration=0.5',
         *ENCODE, destination])

def sheets(movie, name):
    run(['-i', str(movie), '-vf', 'fps=24,scale=384:220,pad=384:244:0:24:color=0x101726,drawtext=text=%{pts}:x=8:y=3:fontcolor=white:fontsize=16,tile=5x6',
         '-q:v', '2', WORK / 'inspection' / f'{name}-%02d.jpg'])

def compare(branch):
    movies = [OUT / f'{kind}-{branch}.mp4' for kind in ['film', 'before', 'after']]
    filters = []
    for i, title in enumerate(['FILM', 'BEFORE', 'AFTER']):
        filters.append(f'[{i}:v]fps=24,scale=640:368:force_original_aspect_ratio=decrease,pad=640:400:(ow-iw)/2:32:color=0x101726,setsar=1,drawtext=text={title}:x=12:y=5:fontcolor=white:fontsize=20[v{i}]')
    filters.append('[v0][v1][v2]hstack=inputs=3:shortest=1[out]')
    args = sum((['-i', str(movie)] for movie in movies), [])
    run([*args, '-filter_complex', ';'.join(filters), '-map', '[out]', *ENCODE, OUT / f'compare-{branch}.mp4'])
    # Large triples at both mouths, in the helix, and at the actual target.
    # 5.83 selects the first 24 fps frame after the 5.80 impact; rounding 5.80
    # itself would select 5.7917 and show an approach instead of actual contact.
    windows = {'entry': [4.15, 4.30, 4.40, 4.45], 'coil': [4.50, 4.65, 4.80, 4.94], 'exit': [5.10, 5.45, 5.83, 5.95]}
    if branch == 'no':
        windows['entry'] = [4.15, 4.30, 4.40, 4.50]
    for area, times in windows.items():
        frames = sorted(set(round(t * 24) for t in times))
        select = '+'.join(f'eq(n\\,{frame})' for frame in frames)
        run(['-i', str(OUT / f'compare-{branch}.mp4'), '-vf', f"select='{select}',drawtext=text=%{{pts}}:x=520:y=5:fontcolor=white:fontsize=20,tile=1x4", '-frames:v', '1', OUT / f'{branch}-{area}.png'])
    run(['-i', str(OUT / f'compare-{branch}.mp4'), '-vf', 'fps=4,scale=1440:300,pad=1440:324:0:24:color=0x101726,drawtext=text=%{pts}:x=8:y=3:fontcolor=white:fontsize=16,tile=1x10',
         '-q:v', '2', WORK / 'inspection' / f'comparison-{branch}-%02d.jpg'])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('phase', choices=['before', 'after', 'cross', 'comparisons'])
    args = parser.parse_args()
    if socket.gethostname() != 'build-host':
        raise SystemExit('Run media preparation on build-host.')
    OUT.mkdir(parents=True, exist_ok=True)
    if args.phase == 'before' and (OUT / 'before-export.json').exists():
        raise SystemExit('The saved before export is immutable; start a new dated review for another baseline.')
    (WORK / 'inspection').mkdir(parents=True, exist_ok=True)
    if args.phase in ['before', 'after', 'cross']:
        source = WORK / ('randomness' if args.phase == 'cross' else '') / 'export'
        index = json.loads((source / 'index.json').read_text())
        for key in index['outcomes']:
            prefix = 'after' if args.phase == 'cross' else args.phase
            movie = OUT / f'{prefix}-{key}.mp4'
            encode_frames(source / key, movie, index['fps'])
            sheets(movie, f'{prefix}-{key}')
        (OUT / f'{args.phase}-export.json').write_text(json.dumps(index, indent=2) + '\n')
        if args.phase == 'after':
            (OUT / 'validation.txt').write_text((WORK / 'build.log').read_text() + '\n' + (WORK / 'check.log').read_text())
        if args.phase == 'before':
            saved = WORK / 'before'
            saved.mkdir(exist_ok=True)
            shutil.move(str(source), saved / 'export')
            shutil.move(str(WORK / 'motion'), saved / 'motion')
            for name in ['geometry-check.json', 'camera-check.json', 'check-result.json', 'build-inputs.json', 'preview-check.json']:
                shutil.copy2(WORK / name, saved / name)
    else:
        for branch, clip, start, crop in [('yes', '06m36s-06m50s.mp4', 5.7, '1630:920:145:160'), ('no', '08m35s-08m50s.mp4', 6.2, '1623:915:154:163')]:
            run(['-ss', str(start), '-i', str(ROOT / 'references/film' / clip), '-t', '7.46', '-vf', f'crop={crop},scale=1240:700,setsar=1', *ENCODE, OUT / f'film-{branch}.mp4'])
            compare(branch)
        diagnostic_inputs, diagnostic_filters = [], []
        for i, (view, branch) in enumerate((v, b) for v in ['top', 'mouth', 'side'] for b in ['yes', 'no']):
            diagnostic_inputs.extend(['-i', str(WORK / 'motion/after' / f'{branch}-{view}.png')])
            diagnostic_filters.append(f'[{i}:v]scale=640:368:force_original_aspect_ratio=decrease,pad=640:400:(ow-iw)/2:32:color=0x101726,setsar=1,drawtext=text={branch.upper()} {view.upper()} OPAQUE:x=12:y=5:fontcolor=white:fontsize=20[v{i}]')
        diagnostic_filters.append('[v0][v1][v2][v3][v4][v5]xstack=inputs=6:layout=0_0|640_0|0_400|640_400|0_800|640_800[out]')
        run([*diagnostic_inputs, '-filter_complex', ';'.join(diagnostic_filters), '-map', '[out]', '-frames:v', '1', OUT / 'opaque-diagnostics.png'])
        probes = {}
        for movie in sorted(OUT.glob('*.mp4')):
            probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_name,codec_type,width,height,duration,nb_frames:format=duration', '-of', 'json', str(movie)], text=True))
            assert len(probe['streams']) == 1 and probe['streams'][0]['codec_type'] == 'video'
            probe['sha256'] = hashlib.sha256(movie.read_bytes()).hexdigest()
            probes[movie.name] = probe
        (OUT / 'video-probes.json').write_text(json.dumps(probes, indent=2) + '\n')
    print(f'Prepared {args.phase}: {OUT}')

if __name__ == '__main__':
    main()
