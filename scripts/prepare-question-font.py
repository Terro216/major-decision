#!/usr/bin/env python3
"""Build the local webfont on build-host using fontTools (no glyph subsetting)."""
import argparse
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=root / 'public/fonts/DecisionQuestion-Bold.woff2')
args = parser.parse_args()
source = root / 'tools/fonts/PTSerif-Bold.ttf'
font = TTFont(source, recalcTimestamp=False)
# Its 126482-byte format-0 kern subtable exceeds the 16-bit length field.
# Browsers already use the intact GPOS table; Firefox rejects the legacy one.
assert 'GPOS' in font and 'kern' in font
del font['kern']
if 'DSIG' in font:
    del font['DSIG']
names = {1:'Decision Question',2:'Bold',3:'MajorDecision:DecisionQuestion-Bold:1.0',4:'Decision Question Bold',6:'DecisionQuestion-Bold',16:'Decision Question',17:'Bold',21:'Decision Question',22:'Bold'}
for entry in font['name'].names:
    if entry.nameID in names:
        entry.string = names[entry.nameID].encode(entry.getEncoding())
font.flavor = 'woff2'
font.save(args.output)

# Verify all outlines, character coverage, advances and OpenType layout survive.
original, built = TTFont(source), TTFont(args.output)
assert original.getBestCmap() == built.getBestCmap()
assert original['hmtx'].metrics == built['hmtx'].metrics
assert original.getTableData('GPOS') == built.getTableData('GPOS')
assert original.getTableData('GSUB') == built.getTableData('GSUB')
before, after = original.getGlyphSet(), built.getGlyphSet()
assert list(before) == list(after)
for name in before:
    a, b = RecordingPen(), RecordingPen()
    before[name].draw(a); after[name].draw(b)
    assert a.value == b.value, name
print(f'Verified {len(before)} unchanged glyphs, cmap, hmtx, GPOS and GSUB; {args.output.stat().st_size} bytes')
