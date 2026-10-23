#!/usr/bin/env python3
"""Rectify the filmed monitor once per clip, preserving the 30 fps source clock.

Run on big-one. Calibration is ordinary versioned JSON; copyrighted film and
derived videos remain in ignored references/review, outside public and builds.
"""
import argparse
import hashlib
import json
import socket
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / 'references/film-calibration.json'


def homography(source, destination):
    rows = []
    for (x, y), (u, v) in zip(source, destination):
        rows += [[x, y, 1, 0, 0, 0, -u*x, -u*y, u],
                 [0, 0, 0, x, y, 1, -v*x, -v*y, v]]
    for col in range(8):
        pivot = max(range(col, 8), key=lambda row: abs(rows[row][col]))
        rows[col], rows[pivot] = rows[pivot], rows[col]
        divisor = rows[col][col]
        assert abs(divisor) > 1e-12, 'Degenerate monitor coordinates'
        rows[col] = [v/divisor for v in rows[col]]
        for row in range(8):
            if row != col:
                factor = rows[row][col]
                rows[row] = [a-factor*b for a, b in zip(rows[row], rows[col])]
    return [rows[i][-1] for i in range(8)] + [1]


def transform(matrix, point):
    x, y = point
    denominator = matrix[6]*x + matrix[7]*y + matrix[8]
    return [(matrix[i]*x + matrix[i+1]*y + matrix[i+2])/denominator for i in (0, 3)]


def mapping(config, branch):
    x, y, w, h = config['stageRect']
    stage = [[x,y], [x+w,y], [x,y+h], [x+w,y+h]]
    inverse = homography(stage, branch['sourceStageCorners'])
    width, height = config['machineSize']
    corners = [transform(inverse, p) for p in [[0,0], [width,0], [0,height], [width,height]]]
    forward = homography(branch['sourceStageCorners'], stage)
    error = max(abs(v-e) for p, q in zip(branch['sourceStageCorners'], stage)
                for v, e in zip(transform(forward, p), q))
    assert error < 1e-8
    return corners, forward, inverse


def ffmpeg(arguments):
    subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error',
                    '-threads', '2', '-filter_threads', '2', '-filter_complex_threads', '2',
                    *map(str, arguments)], check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='references/review/2026-10-21-perceptual')
    parser.add_argument('--duration', type=float, default=7.4)
    args = parser.parse_args()
    if socket.gethostname() != 'big-one':
        raise SystemExit('Video processing must run on big-one.')
    output = (ROOT / args.output).resolve()
    assert output.is_relative_to(ROOT / 'references/review')
    output.mkdir(parents=True, exist_ok=True)
    config = json.loads(CONFIG.read_text())
    report = {'calibrationSha256': hashlib.sha256(CONFIG.read_bytes()).hexdigest(),
              'timeScale': 1, 'outputSize': [1280, 736], 'branches': {}}
    for name, branch in config['branches'].items():
        target = output / f'film-{name}.mp4'
        if target.exists():
            raise SystemExit(f'Preserve completed evidence: {target}')
        corners, forward, inverse = mapping(config, branch)
        perspective = ':'.join(f'{axis}{i}={value:.10f}' for i, point in enumerate(corners)
                               for axis, value in zip('xy', point))
        start = branch['firstAnimationFrame'] / config['sourceFps']
        # Padding preserves the observed edge: uncovered screen areas remain
        # black. It does not extrapolate the missing bottom of the monitor.
        vf = f'pad=1920:1200:0:0:black,perspective={perspective}:sense=source:interpolation=cubic,scale=1280:736,setsar=1'
        ffmpeg(['-ss', str(start), '-i', ROOT/'references/film'/branch['file'],
                '-t', str(args.duration), '-vf', vf, '-an', '-c:v', 'libx264',
                '-threads', '2', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart', '-n', target])
        events = {key: {**event, 'sourceSeconds': event['frame']/30,
                       'timelineSeconds': (event['frame']-branch['firstAnimationFrame'])/30}
                  for key, event in branch['events'].items()}
        report['branches'][name] = {'sourceStart': start, 'sourceMachineCorners': corners,
            'sourceToMachine': forward, 'machineToSource': inverse, 'events': events,
            'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}
    (output/'calibration.json').write_text(json.dumps(report, indent=2)+'\n')
    print(f'Calibrated both sequences at 1x: {output}')


if __name__ == '__main__':
    main()
