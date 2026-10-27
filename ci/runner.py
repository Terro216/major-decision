#!/usr/bin/env python3
"""Runner credentials stay in one owner-only recovery-allowlisted .secrets file."""
import json
import os
import signal
import subprocess
import sys
from pathlib import Path

os.umask(0o077)
os.chdir('/runner')
bundle = Path('/state/.secrets')
names = ['.runner', '.credentials', '.credentials_rsaparams']

def save():
    data = {name: Path(name).read_text() for name in names}
    temporary = bundle.with_name('.secrets.tmp')
    temporary.write_text(json.dumps(data))
    temporary.chmod(0o600)
    temporary.replace(bundle)

operation = sys.argv[1] if len(sys.argv) > 1 else 'run'
if operation == 'save':
    save()
elif operation == 'register':
    if bundle.exists():
        raise SystemExit('Existing runner registration is preserved; remove/revoke it explicitly before replacing.')
    token = sys.stdin.read().strip()
    if not token or not token.isalnum():
        raise SystemExit('A repository registration token is required on stdin.')
    result = subprocess.run(['./config.sh', '--unattended', '--url', 'https://github.com/Terro216/major-decision', '--token', token,
                             '--name', 'major-decision-ci', '--labels', 'major-decision', '--work', '_work'], capture_output=True, text=True)
    if result.returncode:
        print((result.stdout+result.stderr).replace(token, '[REDACTED]'), file=sys.stderr)
        raise SystemExit(result.returncode)
    save()
    print('Registered major-decision-ci; credentials saved privately.')
elif operation == 'run':
    data = json.loads(bundle.read_text())
    assert sorted(data) == sorted(names)
    for name in names:
        Path(name).write_text(data[name]); Path(name).chmod(0o600)
    child = subprocess.Popen(['./run.sh'])
    def stop(signum, frame):
        child.send_signal(signal.SIGINT)
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        code = child.wait()
    finally:
        save()
    raise SystemExit(code)
else:
    raise SystemExit('Use register, run or save.')
