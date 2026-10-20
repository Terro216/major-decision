#!/usr/bin/env python3
"""Encode both cross combinations on big-one after export-review.sh --cross."""
import hashlib,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
R=ROOT/'.review/randomness'
(R/'sequence').mkdir(exist_ok=True)
index=json.loads((R/'export/index.json').read_text())
probes={}
def ff(args):
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-threads','2','-filter_threads','2',*args[:-1],'-threads','2','-y',args[-1]],check=True)
for key,frames in index['outcomes'].items():
    assert len(frames)==167
    source=str(R/'export'/key/'frame-%03d.png')
    ff(['-framerate','24','-i',source,'-vf','scale=360:207,drawtext=text=%{pts}:fontcolor=white:fontsize=18:box=1:boxcolor=black,tile=6x5',str(R/'sequence'/f'{key}-%02d.png')])
    video=R/f'playback-{key}.mp4'
    ff(['-framerate','24','-i',source,'-t',str(len(frames)/24+.5),'-vf','scale=1240:-2,tpad=stop_mode=clone:stop_duration=0.5','-an','-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',str(video)])
    ff(['-i',str(video),'-an','-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','6','-crf','32','-b:v','0',str(video.with_suffix('.webm'))])
    ff(['-i',str(video),'-vf','fps=4,scale=360:207,drawtext=text=%{pts}:fontcolor=white:fontsize=18:box=1:boxcolor=black,tile=6x5','-frames:v','1',str(R/f'decoded-{key}.png')])
    probes[key]=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(video)],text=True))
files=[*R.glob('playback-*'),*R.glob('decoded-*.png'),*(R/'sequence').glob('*.png')]
(R/'media.json').write_text(json.dumps({'build':index['build'],'files':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}},indent=2)+'\n')
(R/'video-probes.json').write_text(json.dumps(probes,indent=2)+'\n')
print('Prepared both cross combinations: 334 frames, 12 sheets, two MP4 and WebM.')
