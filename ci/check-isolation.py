#!/usr/bin/env python3
import json
import os
import subprocess
from pathlib import Path

proxy = os.environ['https_proxy']
checks = []
for url, allowed in [('https://api.github.com/meta', True), ('https://registry.npmjs.org/react/latest', True),
                     ('https://example.com/', False), ('https://10.0.0.1/', False), ('https://169.254.169.254/', False)]:
    result = subprocess.run(['curl', '--proxy', proxy, '--noproxy', '', '--connect-timeout', '3', '--max-time', '15',
                             '--silent', '--show-error', '--output', '/dev/null', '--write-out', '%{http_code}', url], capture_output=True, text=True)
    status = result.stdout.strip()
    if allowed:
        assert result.returncode == 0 and status == '200', (url, result.stderr)
    else:
        assert result.returncode != 0 and '403' in result.stderr, (url, status, result.stderr)
    checks.append({'url': url, 'allowed': allowed, 'confirmed': True})
for url in ['https://api.github.com/meta', 'http://172.17.0.1:2375/']:
    result = subprocess.run(['curl', '--noproxy', '*', '--connect-timeout', '3', '--max-time', '4', '--silent', '--output', '/dev/null', url])
    assert result.returncode != 0, 'Direct access escaped the isolated network.'
    checks.append({'url': url, 'directAccess': False, 'confirmed': True})
assert os.getuid() == 1001
assert not Path('/var/run/docker.sock').exists()
assert not Path('/repo').exists()
assert not Path('/workspace').exists()
capabilities = next(line.split()[1] for line in Path('/proc/self/status').read_text().splitlines() if line.startswith('CapEff:'))
assert int(capabilities, 16) == 0
print(json.dumps({'uid': os.getuid(), 'effectiveCapabilities': capabilities, 'dockerSocket': False,
                  'productionCheckout': False, 'checks': checks}, indent=2))
