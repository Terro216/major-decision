#!/usr/bin/env python3
"""Bounded ffmpeg inspection on the configured build host; approximate screen-space evidence only."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.review/framing/film'
OUT.mkdir(parents=True, exist_ok=True)
WIDTH, HEIGHT = 620, 344
report = {}

for outcome, clip, start, crop in [
    ('yes', '06m36s-06m50s.mp4', 5.7, '1226:676:486:354'),
    ('no', '08m35s-08m50s.mp4', 6.2, '1226:676:500:354'),
]:
    frames = []
    for time in [4.94, 5.0, 5.15, 5.2, 5.35, 5.4, 5.45, 5.5, 5.6, 5.65, 5.7, 5.75, 5.8]:
        prefix = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-threads', '2', '-filter_threads', '2', '-ss', str(start + time), '-i', str(ROOT / 'references/film' / clip)]
        rgb = subprocess.check_output([*prefix, '-vf', f'crop={crop},scale={WIDTH}:{HEIGHT}', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-threads', '2', '-'])
        # Orange in this shot is the ball. Connected components separate it
        # from small colored pins; thresholds are not a general image metric.
        candidates = set()
        for i in range(WIDTH * HEIGHT):
            r, g, b = rgb[3*i:3*i+3]
            if r > 95 and g > 45 and r > 1.18*g and g > 1.25*b:
                candidates.add(i)
        largest = []
        while candidates:
            seed = candidates.pop()
            component, queue = [seed], [seed]
            while queue:
                p = queue.pop()
                for q in [p-WIDTH, p+WIDTH, p-1, p+1]:
                    if q in candidates:
                        candidates.remove(q)
                        queue.append(q)
                        component.append(q)
            if len(component) > len(largest):
                largest = component
        xs, ys = [p % WIDTH for p in largest], [p // WIDTH for p in largest]
        bounds = [min(xs), min(ys), max(xs), max(ys)]
        frames.append({'time': time, 'center': [(bounds[0]+bounds[2])/2/WIDTH, (bounds[1]+bounds[3])/2/HEIGHT], 'diameterY': (bounds[3]-bounds[1]+1)/HEIGHT, 'bounds': bounds})
    # Dense motion and indicator strips are decoded from the original MP4s.
    for label, region, scale in [('flight', crop, '372:206'), ('indicator', '414:172:186:908' if outcome == 'yes' else '414:172:200:908', '240:100')]:
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-threads', '2', '-filter_threads', '2', '-ss', str(start + (4.9 if label == 'flight' else 1)), '-t', '1.1' if label == 'flight' else '5.6', '-i', str(ROOT / 'references/film' / clip), '-vf', f'fps=24,crop={region},scale={scale},drawtext=text=%{{pts}}:fontcolor=white:fontsize=14:box=1:boxcolor=black,tile=6x5', '-threads', '2', '-y', str(OUT / f'{outcome}-{label}-%02d.png')], check=True)
    report[outcome] = {'clip': clip, 'timelineOrigin': start, 'stageCrop': crop, 'frames': frames}
(OUT / 'measurements.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
