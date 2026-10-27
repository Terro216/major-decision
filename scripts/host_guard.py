"""Require an explicitly configured host before resource-intensive processing."""
import os
from pathlib import Path
import socket


def require_host():
    expected = os.environ.get('MD_EXPECTED_HOST', '')
    config = Path(__file__).resolve().parents[1] / '.local/host-name'
    if not expected and config.is_file():
        expected = config.read_text().strip()
    if not expected or socket.gethostname() != expected:
        raise SystemExit('Run on the host selected by MD_EXPECTED_HOST or .local/host-name.')
