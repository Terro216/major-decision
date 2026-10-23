# Major Decision

Parent `/home/me/server/AGENTS.md` applies. This is a standalone Git repository
and a submodule of `server`. It recreates the website seen in Interstate 60.

## Start here

Read `docs/PLAN.md`, `docs/HANDOFF.md`, and the relevant parts of
`docs/REFERENCE.md` before changing the application. Also read
`docs/VISUAL_REVIEW.md` and `docs/PERCEPTUAL_REVIEW.md` for the current visual
verdict, historical differences, and limits of verification.
`docs/NEXT_CHAT_PROMPT.md` contains the ready-to-use continuation task. Use the supplied film frames
as the visual authority. Do not replace the design with a contemporary dashboard.

## Accepted decisions

- Project/repository: `major-decision`; intended host: `decision.ilyamedve.dev`.
- Keep HOROSCOPE, ROMANCE, CAREER visible and genuinely disabled.
- Preserve the English film labels; support Cyrillic questions.
- The reference has an eight-ray star, an orange ball, colored pins, a spiral,
  a separate alternating indicator, and green YES / red NO outcomes.
- Reference media stays in ignored `references/film/`, outside `public/` and
  the production build. `references/manifest.json` records original hashes.
- No account or question storage is needed. Questions stay in browser memory.

## Development

- Vite + React + TypeScript. Native SVG/CSS for the shell; Three.js drives both animation branches through one deterministic timeline. Keep the stage replaceable independently.
- Build, preview and browser checks run on **big-one**, not DE. Verify shims.
  `scripts/check-remote.sh` uses a bounded, isolated browser container.
- Do not add a Sites hosting dependency: this project uses the user's own
  Docker/Caddy infrastructure. Use the scoped release procedure in docs/DEPLOYMENT.md.
- Update HANDOFF with actual verification, remaining work, and accepted visual
  changes at the end of a phase. Keep assumptions distinct from film evidence.
- Periodically clean reproducible `.review` duplicates on both DE and big-one.
  First retain useful evidence under ignored `references/review/` and verify
  its hashes. Preserve originals, previous comparisons, and active check output.
- No automatic commits or pushes are implied by a documentation update.

## Scope

The user expanded the authorized scope on 2026-10-21 to all PLAN phases,
including mobile, original opt-in sound, accessibility, Docker/Caddy, CI and
release at decision.ilyamedve.dev. Preserve deterministic playback, independent
route/answer selection and same-answer fallback. Builds and browsers stay on
big-one. A documentation update alone does not imply a commit or deployment.
