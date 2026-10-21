#!/usr/bin/env python3
"""Record only container identity/health and compare persistent release neighbours."""
import argparse
import hashlib
import json
import socket
import subprocess
from datetime import datetime, timezone
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('operation', choices=['capture', 'compare'])
parser.add_argument('file', type=Path)
parser.add_argument('--allow', action='append', default=[])
args = parser.parse_args()
assert socket.gethostname() == 'big-one', 'Read production state on big-one.'
ids = subprocess.check_output(['docker', 'ps', '-aq'], text=True).split()
containers = json.loads(subprocess.check_output(['docker', 'inspect', *ids]))
state = {}
for container in containers:
    name = container['Name'].removeprefix('/')
    if name.startswith('buildx_buildkit_major-decision-build'):
        continue
    if container['HostConfig']['RestartPolicy']['Name'] not in ['always', 'unless-stopped']:
        continue
    state[name] = {
        'id': container['Id'], 'image': container['Image'],
        'startedAt': container['State']['StartedAt'],
        'restarts': container['RestartCount'], 'status': container['State']['Status'],
        'health': container['State'].get('Health', {}).get('Status'),
    }
    if name == 'server-homepage':
        # Record equality without ever writing or printing credentials.
        auth = sorted(x for x in container['Config']['Env'] if x.startswith(('OWNER_HTPASSWD_ENTRY=', 'ATLAS_')))
        state[name]['authSha256'] = hashlib.sha256(json.dumps(auth).encode()).hexdigest()
if args.operation == 'capture':
    args.file.write_text(json.dumps({'at': datetime.now(timezone.utc).isoformat(), 'containers': state}, indent=2)+'\n')
    print(f'Recorded {len(state)} persistent container identities; no environment values retained.')
else:
    before = json.loads(args.file.read_text())['containers']
    changed = []
    for name, old in before.items():
        if name in args.allow:
            continue
        current = state.get(name)
        if current is None or any(current[k] != old[k] for k in ['id', 'image', 'startedAt', 'restarts']):
            changed.append(name)
    if 'server-homepage' in before and 'server-homepage' in state:
        assert before['server-homepage']['authSha256'] == state['server-homepage']['authSha256'], 'Portal authentication changed.'
    result = {'at': datetime.now(timezone.utc).isoformat(), 'unchanged': len(before)-len(args.allow)-len(changed), 'allowed': args.allow, 'unexpectedChanges': changed}
    args.file.with_name('neighbour-check.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))
    assert not changed, 'Unexpected neighbour identity/restart change.'
