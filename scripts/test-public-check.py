#!/usr/bin/env python3
"""Regression checks for accidental disclosure and historical reintroduction."""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('check-public.py').resolve()
spec = importlib.util.spec_from_file_location('public_check', SCRIPT)
public_check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(public_check)


class PublicCheckTests(unittest.TestCase):
    def test_private_filenames_and_public_examples(self):
        for name in ['.env', '.env.local', '.local/notes.txt', 'ci/.state/.secrets']:
            self.assertTrue(public_check.violations(name, b''), name)
        self.assertFalse(public_check.violations('.env.example', b'VITE_METRICS_SCRIPT_URL='))
        self.assertFalse(public_check.violations('README.md', b'https://decision.ilyamedve.dev'))

    def test_private_paths_and_keys(self):
        for data in [b'/' + b'home/' + b'sample/private/file', b'-----BEGIN ' + b'OPENSSH PRIVATE KEY-----']:
            self.assertTrue(public_check.violations('notes.txt', data))

    def test_removed_disclosure_still_fails_history_check(self):
        with tempfile.TemporaryDirectory() as directory:
            env = {**os.environ, 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': os.devnull,
                   'GIT_AUTHOR_NAME': 'Test', 'GIT_AUTHOR_EMAIL': 'test@example.invalid',
                   'GIT_COMMITTER_NAME': 'Test', 'GIT_COMMITTER_EMAIL': 'test@example.invalid'}
            def git(*args):
                subprocess.run(['git', *args], cwd=directory, env=env, check=True,
                               stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            git('init', '--quiet')
            file = Path(directory) / 'README.md'
            file.write_text('/' + 'home/' + 'sample/private/file\n')
            git('add', 'README.md'); git('commit', '--quiet', '-m', 'Fixture')
            file.write_text('Public documentation\n')
            git('add', 'README.md'); git('commit', '--quiet', '-m', 'Remove fixture')
            tree = subprocess.run(['python3', str(SCRIPT)], cwd=directory, env=env, capture_output=True)
            history = subprocess.run(['python3', str(SCRIPT), '--history'], cwd=directory, env=env, capture_output=True)
            self.assertEqual(tree.returncode, 0, tree.stderr)
            self.assertEqual(history.returncode, 1, history.stderr)
            self.assertIn(b'personal absolute path', history.stderr)
            self.assertNotIn(b'/' + b'home/' + b'sample/private/file', history.stderr)


if __name__ == '__main__':
    unittest.main()
