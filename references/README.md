# Film reference material

The user supplied two 1080p/30 fps clips and 39 annotated PNG frames on
2026-10-16. Copies are preserved in `film/`, intentionally ignored by Git and
outside the app's public assets. This folder travels with the project locally
and through the existing Mutagen working-tree synchronization.

`manifest.json` contains paths, sizes and SHA-256 hashes for all 41 original
files plus the source archive hash. Run `npm run references:check` (or the
Python script directly) to verify the media. A new clone needs a copy of
`references/film/` from the existing development checkout.

The source archive was provided at
`/home/me/.cache/codex-files/file.LTi9aGQY/clips.tar.gz`.
The persistent media copies, not this cache path or `/tmp`, are the handoff source.

See `docs/REFERENCE.md` for the film observations and animation timings.

`review/2026-10-20-motion/` keeps the compact film / before / after package:
complete movies, comparison images, the initial source archive, and validation
manifests. It is ignored by Git and excluded from the application build, just
like the original film media. Disposable render frames belong in `.review/`
only while a review is running; they are removed after the retained evidence
has been checked. Open `docs/visual-comparison.html` for the review controls.
