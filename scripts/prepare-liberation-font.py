#!/usr/bin/env python3
"""Compress the unmodified Liberation font on build-host with fontTools/Brotli."""
import argparse
from pathlib import Path

from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=root / 'public/fonts/LiberationSerif-Bold.woff2')
args = parser.parse_args()
source = root / 'tools/fonts/LiberationSerif-Bold.ttf'
font = TTFont(source, recalcTimestamp=False)
font.flavor = 'woff2'
font.save(args.output)

# Compression changes the container, not the character set, outlines or layout.
original, built = TTFont(source), TTFont(args.output)
assert original.getBestCmap() == built.getBestCmap()
assert original['hmtx'].metrics == built['hmtx'].metrics
for table in ['GPOS', 'GSUB', 'kern', 'name']:
    assert (table in original) == (table in built), table
    if table in original:
        assert original.getTableData(table) == built.getTableData(table), table
before, after = original.getGlyphSet(), built.getGlyphSet()
assert list(before) == list(after)
for name in before:
    a, b = RecordingPen(), RecordingPen()
    before[name].draw(a)
    after[name].draw(b)
    assert a.value == b.value, name
print(f'Verified {len(before)} unchanged glyphs, cmap, metrics, layout and names; {args.output.stat().st_size} bytes')
