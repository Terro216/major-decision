# Major Decision

This public repository recreates the website seen in Interstate 60.
Read docs/PLAN.md, docs/HANDOFF.md, docs/REFERENCE.md, docs/VISUAL_REVIEW.md
and docs/PERCEPTUAL_REVIEW.md before changing the application.

## Public repository boundary

Keep documentation portable and focused on the product. Never commit private
service addresses, machine names, personal filesystem paths, infrastructure
inventories, credentials or operational journals. Environment-specific notes
and configuration belong in ignored .local/ and environment files.
Run python3 scripts/check-public.py --staged --history before committing.

## Product decisions

- Preserve the film design and English labels; support Cyrillic questions.
- HOROSCOPE, ROMANCE and CAREER remain visible and disabled.
- Keep the eight-ray star, orange ball, colored pins, spiral, separate alternating
  indicator and green YES / red NO outcomes.
- Movie and Freestyle are live 3D modes. Movie selects an authored trajectory;
  Freestyle uses a new seeded collision simulation. Select the answer independently
  and withhold answer colors until the target. Preserve the same-answer fallback.
- Questions stay in browser memory. No accounts or question storage.
- Keep the interface clear and the full lower oval visible.
- Film references stay in ignored references/film/, outside public/ and the build.
  Preserve original media and verify references/manifest.json.

## Development

Use React, TypeScript, Vite, native SVG/CSS and Three.js. Keep the stage replaceable.
Use the owner's configured remote build host for builds, previews, browser checks
and media processing; do not run them on a lightweight development machine.
Check command routing and .local/host-name before running host-dependent scripts.
Local parent instructions and private operational notes still apply.
Use Docker/Caddy for hosting; do not introduce a Sites dependency.
Update docs/HANDOFF.md with concise verification and remaining work, without
publishing operational details. Preserve useful visual evidence privately before
cleaning reproducible scratch files. Do not equate passing tests with visual acceptance.
Documentation changes alone do not authorize commits, pushes or deployments.
