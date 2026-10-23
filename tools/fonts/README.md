# Wordmark source

Alfa Slab One Regular is the open-source starting point for the hand-adjusted,
oval-warped SVG lettering. Source: Google Fonts `ofl/alfaslabone`, fetched
2026-10-17. Its OFL license is included. The film's exact lettering has not been
identified; this is a reconstruction, not a recovered original logo file.

Run `node scripts/make-wordmark.mjs` on big-one to regenerate
`src/assets/wordmark.svg` after changing its projection. The TTF is a development
source and does not enter the public bundle.

The question display uses locally served Liberation Serif Bold with Cyrillic
coverage. It was selected by comparing six font candidates against the film;
the original film font has not been identified. The unmodified TTF comes from
the preview image's `fonts-liberation` package. Its SIL OFL license is in
`public/fonts/Liberation-LICENSE.txt`.

Run `python3 scripts/prepare-liberation-font.py` on big-one with fontTools and
Brotli to rebuild the public WOFF2. It preserves all 2602 glyphs, character
coverage, advances, layout and font names, and verifies them after compression.
The 370196-byte TTF remains a development source; the 141228-byte WOFF2 is
served locally. Neither font requests a third-party service.

PT Serif Bold (Google Fonts `ofl/ptserif/PT_Serif-Web-Bold.ttf`) remains the
local fallback. Its license is in `public/fonts/OFL.txt`; its existing
`scripts/prepare-question-font.py` recipe is separate.
